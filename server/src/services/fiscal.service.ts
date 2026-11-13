import { randomUUID, createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AppError, plain } from '../lib/utils.js';
import { calculateFiscalLines, fiscalCents } from '../lib/fiscal-document.js';
import { auditOperation, type OperationActor } from '../lib/operation-audit.js';

export const fiscalProfileSchema = z.object({
  mode: z.literal('test'), ruc: z.string().regex(/^\d{11}$/), name: z.string().trim().min(1).max(200),
  address: z.string().trim().min(1).max(200), ubigeo: z.string().regex(/^\d{6}$/), establishment: z.string().regex(/^\d{4}$/),
  invoiceSeries: z.string().regex(/^F[A-Z0-9]{3}$/), receiptSeries: z.string().regex(/^B[A-Z0-9]{3}$/),
  rateBasisPoints: z.number().int().min(1).max(10000), effectiveFrom: z.string().date(), effectiveTo: z.string().date(),
}).strict().refine(p => p.effectiveTo >= p.effectiveFrom, 'Vigencia inválida.');
export const fiscalPrepareSchema = z.object({
  orderId: z.string().min(1).max(36), billId: z.string().min(1).max(36).optional(), requestKey: z.string().uuid(),
  documentType: z.enum(['01','03']), recipientName: z.string().trim().min(1).max(200),
  recipientId: z.string().regex(/^\d{8}$|^\d{11}$/), recipientAddress: z.string().max(200).default(''),
  testOnly: z.literal(true),
}).strict().refine(p => p.documentType !== '01' || p.recipientId.length === 11, 'Factura requiere RUC de 11 dígitos.');
export type FiscalProfileInput = z.infer<typeof fiscalProfileSchema>;
export type FiscalPrepareInput = z.infer<typeof fiscalPrepareSchema>;
export function requireFiscalTestMode() {
  if (process.env.FISCAL_TEST_ENABLED !== 'true') throw new AppError('Preparación fiscal de prueba deshabilitada en este servidor.', 409, 'FISCAL_DISABLED');
}
export async function saveFiscalProfile(companyId: string, input: FiscalProfileInput, expectedVersion: number, actor: OperationActor) {
  requireFiscalTestMode();
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM empresas WITH (UPDLOCK,HOLDLOCK) WHERE id=${companyId}`;
    if (!await tx.company.findUnique({where:{id:companyId}})) throw new AppError('Empresa no encontrada.',404,'NOT_FOUND');
    const old = await tx.fiscalProfile.findUnique({where:{companyId}});
    if ((old?.version ?? 0) !== expectedVersion) throw new AppError('La configuración cambió. Actualice.',409,'VERSION_CONFLICT');
    const result = await tx.fiscalProfile.upsert({where:{companyId},create:{companyId,configuration:JSON.stringify(input)},update:{configuration:JSON.stringify(input),version:{increment:1}}});
    await auditOperation(tx,actor,companyId,'configurar_fiscal_prueba',companyId);
    return { ...input, version:result.version };
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
}
export async function prepareFiscalDocument(companyId: string, input: FiscalPrepareInput, actor: OperationActor) {
  requireFiscalTestMode();
  return plain(await prisma.$transaction(async tx => {
    // Serialización por empresa: configuración, asignación y numeración coherentes.
    await tx.$queryRaw`SELECT id FROM empresas WITH (UPDLOCK,HOLDLOCK) WHERE id=${companyId}`;
    const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const existing = await tx.fiscalTestDocument.findUnique({where:{requestKey:input.requestKey}});
    if (existing) {
      if (existing.companyId !== companyId || existing.requestHash !== hash) throw new AppError('Reintento con contenido diferente.',409,'FISCAL_REQUEST_CONFLICT');
      return existing;
    }
    const profile = await tx.fiscalProfile.findUnique({where:{companyId}});
    if (!profile) throw new AppError('Configure el emisor de prueba.',409,'FISCAL_PROFILE_REQUIRED');
    const config = fiscalProfileSchema.parse(JSON.parse(profile.configuration));
    const date = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    if (date < config.effectiveFrom || date > config.effectiveTo) throw new AppError('Configuración fuera de vigencia.',409,'FISCAL_PROFILE_EXPIRED');
    const order = await tx.order.findUnique({where:{id:input.orderId},include:{items:true,dinerBills:true}});
    if (!order || order.companyId !== companyId || order.isDeleted) throw new AppError('Comanda no disponible.',404,'NOT_FOUND');
    let lines = order.items.map(i=>({description:i.name,quantity:Number(i.quantity),unitPriceCents:fiscalCents(Number(i.price))}));
    let total = Number(order.total);
    if (input.billId) {
      const bill = await tx.dinerBill.findUnique({where:{id:input.billId},include:{items:{include:{orderItem:true}}}});
      if (!bill || bill.companyId !== companyId || bill.orderId !== order.id || bill.status !== 'pagada') throw new AppError('La cuenta debe estar saldada y pertenecer a la comanda.',409,'FISCAL_SOURCE_INVALID');
      lines = bill.items.map(i=>({description:i.orderItem.name,quantity:Number(i.quantity),unitPriceCents:fiscalCents(Number(i.orderItem.price))})); total=Number(bill.total);
    } else if (order.status !== 'cobrado' || order.dinerBills.length) throw new AppError('Seleccione una venta cobrada sin reparto o una cuenta saldada.',409,'FISCAL_SOURCE_INVALID');
    const sourceKey = input.billId ? `bill:${input.billId}` : `order:${order.id}`;
    if (await tx.fiscalTestDocument.findUnique({where:{sourceKey}})) throw new AppError('Ya existe un documento de prueba para esta venta o cuenta.',409,'FISCAL_SOURCE_EXISTS');
    const calculation = calculateFiscalLines(lines, config.rateBasisPoints);
    if (calculation.totalCents !== fiscalCents(total)) throw new AppError('Importes históricos requieren revisión antes de preparar el documento.',409,'FISCAL_TOTAL_MISMATCH');
    const series = input.documentType === '01' ? config.invoiceSeries : config.receiptSeries;
    const sequence = await tx.numberingSequence.upsert({where:{companyId_entity:{companyId,entity:`fiscal-test:${series}`}},create:{companyId,entity:`fiscal-test:${series}`,lastNumber:1},update:{lastNumber:{increment:1}}});
    const number = `${series}-${sequence.lastNumber}`;
    const snapshot = { mode:'test', date, number, documentType:input.documentType, profileVersion:profile.version, emitter:config, recipient:{name:input.recipientName,id:input.recipientId,address:input.recipientAddress}, calculation, source:{orderId:order.id,billId:input.billId ?? null,ticketNumber:order.ticketNumber} };
    const doc = await tx.fiscalTestDocument.create({data:{id:randomUUID(),companyId,orderId:order.id,billId:input.billId,sourceKey,requestKey:input.requestKey,requestHash:hash,number,documentType:input.documentType,snapshot:JSON.stringify(snapshot)}});
    await auditOperation(tx,actor,companyId,'preparar_fiscal_prueba',doc.id);
    return doc;
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:30000}));
}

export async function signPreparedTestDocument(companyId:string, id:string, actor:OperationActor) {
  requireFiscalTestMode();
  const directory=process.env.FISCAL_TEST_KEYS_DIR;
  if(!directory||!/^[-a-zA-Z0-9]{1,36}$/.test(companyId)) throw new AppError('Configure un certificado exclusivo de prueba fuera del repositorio.',409,'FISCAL_TEST_CERTIFICATE_REQUIRED');
  const {readFile}=await import('node:fs/promises');const {join}=await import('node:path');
  const {signFiscalTestXml}=await import('../lib/fiscal-signature.js');
  const {fiscalUnsignedXml}=await import('../lib/fiscal-artifacts.js');
  let key:string,cert:string;
  try{[key,cert]=await Promise.all([readFile(join(directory,companyId+'.key.pem'),'utf8'),readFile(join(directory,companyId+'.cert.pem'),'utf8')]);}
  catch{throw new AppError('No se pudo leer el certificado exclusivo de prueba.',409,'FISCAL_TEST_CERTIFICATE_REQUIRED')}
  return prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM empresas WITH (UPDLOCK,HOLDLOCK) WHERE id=${companyId}`;
    const row=await tx.fiscalTestDocument.findFirst({where:{id,companyId}});
    if(!row)throw new AppError('Documento no encontrado.',404,'NOT_FOUND');
    if(row.signedXml)return {id,signed:true};
    if(row.state!=='prepared')throw new AppError('El documento no puede firmarse en su estado actual.',409,'FISCAL_STATE_CONFLICT');
    let signed:string;
    try{signed=signFiscalTestXml(fiscalUnsignedXml(JSON.parse(row.snapshot)),key,cert)}catch{throw new AppError('Firma de prueba no válida. Verifique vigencia, formato y coincidencia de clave y certificado.',409,'FISCAL_SIGNATURE_INVALID')}
    const {validateFiscalXml}=await import('../lib/fiscal-validation.js');
    try { await validateFiscalXml(signed); } catch { throw new AppError('El XML no supera la validación UBL 2.1 o el validador no está disponible.',409,'FISCAL_XSD_INVALID'); }
    await tx.fiscalTestDocument.update({where:{id},data:{signedXml:signed}});
    await auditOperation(tx,actor,companyId,'firmar_fiscal_prueba',id);
    return {id,signed:true};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:30000});
}

export const fiscalIntentSchema=z.object({orderId:z.string().min(1).max(36),billId:z.string().min(1).max(36).optional(),expectedVersion:z.number().int().nonnegative(),documentType:z.enum(['01','03']),recipientName:z.string().trim().min(1).max(200),recipientId:z.string().regex(/^\d{8}$|^\d{11}$/),recipientAddress:z.string().max(200).default('')}).strict().refine(p=>p.documentType!=='01'||p.recipientId.length===11,'Factura requiere RUC.');
export async function fiscalSource(companyId:string,orderId:string,billId?:string) {
 requireFiscalTestMode();
 const order=await prisma.order.findFirst({where:{id:orderId,companyId,isDeleted:false},select:{id:true,status:true}});
 if(!order)throw new AppError('Comanda no disponible.',404,'NOT_FOUND');
 const bill=billId?await prisma.dinerBill.findFirst({where:{id:billId,orderId,companyId},select:{status:true}}):null;
 if(billId&&!bill)throw new AppError('Cuenta no disponible.',404,'NOT_FOUND');
 const sourceKey=billId?`bill:${billId}`:`order:${orderId}`;
 const [intent,document]=await Promise.all([prisma.fiscalTestIntent.findUnique({where:{sourceKey}}),prisma.fiscalTestDocument.findUnique({where:{sourceKey},select:{id:true,number:true,state:true,responseCode:true,responseMessage:true}})]);
 return {paid:bill?bill.status==='pagada':order.status==='cobrado',intent:intent?{...JSON.parse(intent.data),version:intent.version}:null,document};
}
export async function saveFiscalIntent(companyId:string,input:z.infer<typeof fiscalIntentSchema>,actor:OperationActor) {
 requireFiscalTestMode();
 return prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM empresas WITH (UPDLOCK,HOLDLOCK) WHERE id=${companyId}`;
  const order=await tx.order.findFirst({where:{id:input.orderId,companyId,isDeleted:false},select:{status:true}});
  if(!order||order.status==='anulado')throw new AppError('Comanda no disponible.',409,'FISCAL_SOURCE_INVALID');
  if(input.billId&&!await tx.dinerBill.findFirst({where:{id:input.billId,orderId:input.orderId,companyId}}))throw new AppError('Cuenta no disponible.',404,'NOT_FOUND');
  const sourceKey=input.billId?`bill:${input.billId}`:`order:${input.orderId}`;
  if(await tx.fiscalTestDocument.findUnique({where:{sourceKey}}))throw new AppError('El documento ya conserva sus datos definitivos.',409,'FISCAL_SOURCE_EXISTS');
  const old=await tx.fiscalTestIntent.findUnique({where:{sourceKey}});
  if((old?.version??0)!==input.expectedVersion)throw new AppError('Los datos cambiaron en otra terminal. Recargue antes de guardar.',409,'VERSION_CONFLICT');
  const {expectedVersion,...fields}=input;
  const row=await tx.fiscalTestIntent.upsert({where:{sourceKey},create:{sourceKey,companyId,orderId:input.orderId,billId:input.billId,data:JSON.stringify(fields)},update:{data:JSON.stringify(fields),version:{increment:1}}});
  await auditOperation(tx,actor,companyId,'guardar_datos_fiscal_prueba',input.billId??input.orderId);
  return {...fields,version:row.version};
 },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
}
