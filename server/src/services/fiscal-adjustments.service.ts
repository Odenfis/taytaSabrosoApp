import {randomUUID,createHash} from 'node:crypto';
import {Prisma} from '@prisma/client';
import {z} from 'zod';
import {prisma} from '../lib/prisma.js';
import {AppError,plain} from '../lib/utils.js';
import {auditOperation,type OperationActor} from '../lib/operation-audit.js';
import {requireFiscalTestMode} from './fiscal.service.js';
import {calculateFiscalLines} from '../lib/fiscal-document.js';
import type {FiscalSnapshot} from '../lib/fiscal-artifacts.js';
/** Explicit laboratory scenarios. Other causes and all production use remain disabled. */
export const fiscalAdjustmentSchema=z.discriminatedUnion('documentType',[
 z.object({documentType:z.literal('07'),reasonCode:z.literal('01'),reason:z.string().trim().min(5).max(250),requestKey:z.string().uuid(),testOnly:z.literal(true)}).strict(),
 z.object({documentType:z.literal('08'),reasonCode:z.literal('02'),reason:z.string().trim().min(5).max(250),amountCents:z.number().int().min(1).max(999999999),requestKey:z.string().uuid(),testOnly:z.literal(true)}).strict(),
]);
export async function prepareFiscalAdjustment(companyId:string,originalId:string,input:z.infer<typeof fiscalAdjustmentSchema>,actor:OperationActor){
 requireFiscalTestMode();
 return plain(await prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM empresas WITH (UPDLOCK,HOLDLOCK) WHERE id=${companyId}`;
  const hash=createHash('sha256').update(JSON.stringify({originalId,...input})).digest('hex');
  const existing=await tx.fiscalTestDocument.findUnique({where:{requestKey:input.requestKey}});
  if(existing){if(existing.companyId!==companyId||existing.requestHash!==hash)throw new AppError('Reintento distinto.',409,'FISCAL_REQUEST_CONFLICT');return existing;}
  const original=await tx.fiscalTestDocument.findFirst({where:{id:originalId,companyId}});
  if(!original||!['01','03'].includes(original.documentType)||original.state!=='accepted')throw new AppError('Seleccione una factura o boleta aceptada en beta de esta empresa.',409,'FISCAL_REFERENCE_INVALID');
  // One adjustment per source during this restricted test phase. No credit/debit chains.
  const sourceKey=`adjustment:${original.id}`;
  if(await tx.fiscalTestDocument.findUnique({where:{sourceKey}}))throw new AppError('El documento ya tiene una nota de prueba. No se permiten ajustes encadenados en esta fase.',409,'FISCAL_SOURCE_EXISTS');
  const source=JSON.parse(original.snapshot) as FiscalSnapshot;
  const series=(original.documentType==='01'?'F':'B')+(input.documentType==='07'?'C':'D')+'99';
  const sequence=await tx.numberingSequence.upsert({where:{companyId_entity:{companyId,entity:`fiscal-test:${series}`}},create:{companyId,entity:`fiscal-test:${series}`,lastNumber:1},update:{lastNumber:{increment:1}}});
  const number=`${series}-${sequence.lastNumber}`;
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const snapshot:FiscalSnapshot={...source,date,number,documentType:input.documentType,reference:{id:original.id,number:original.number,documentType:original.documentType as '01'|'03',reasonCode:input.reasonCode,reason:input.reason},calculation:input.documentType==='07'?source.calculation:calculateFiscalLines([{description:'AUMENTO DE VALOR DE PRUEBA',quantity:1,unitPriceCents:input.amountCents}],source.calculation.rateBasisPoints)};
  const row=await tx.fiscalTestDocument.create({data:{id:randomUUID(),companyId,orderId:original.orderId,billId:original.billId,sourceKey,requestKey:input.requestKey,requestHash:hash,number,documentType:input.documentType,snapshot:JSON.stringify(snapshot)}});
  await auditOperation(tx,actor,companyId,'preparar_nota_fiscal_prueba',row.id);
  return row;
 },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable}));
}

export const fiscalVoidRequestSchema=z.object({reason:z.string().trim().min(5).max(250),requestKey:z.string().uuid(),testOnly:z.literal(true)}).strict();
/** Review workflow only: this is not a SUNAT void nor an ordinary sale cancellation. */
export async function requestFiscalVoidReview(companyId:string,id:string,input:z.infer<typeof fiscalVoidRequestSchema>,actor:OperationActor){
 requireFiscalTestMode();
 return prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM empresas WITH (UPDLOCK,HOLDLOCK) WHERE id=${companyId}`;
  const row=await tx.fiscalTestDocument.findFirst({where:{id,companyId}});
  if(!row||!['01','03'].includes(row.documentType))throw new AppError('Documento no encontrado.',404,'NOT_FOUND');
  const sourceKey=`void:${id}`;
  const old=await tx.fiscalTestIntent.findUnique({where:{sourceKey}});
  if(old){const stored=JSON.parse(old.data);if(stored.requestKey===input.requestKey&&stored.reason===input.reason)return stored;throw new AppError('Ya existe una solicitud de revisión para este documento.',409,'FISCAL_SOURCE_EXISTS');}
  const data={kind:'void_review',state:'pending_rules',originalId:id,number:row.number,documentType:row.documentType,reason:input.reason,requestKey:input.requestKey,createdAt:new Date().toISOString(),message:'Solicitud interna de prueba. No comunica una baja a SUNAT ni anula la venta.'};
  await tx.fiscalTestIntent.create({data:{sourceKey,companyId,orderId:row.orderId,billId:row.billId,data:JSON.stringify(data)}});
  await auditOperation(tx,actor,companyId,'solicitar_revision_baja_prueba',id);
  return data;
 },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
}
