import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/utils.js';
import { auditOperation, type OperationActor } from '../lib/operation-audit.js';
import { betaEnvelope, sendBeta, type BetaResult } from '../lib/fiscal-beta.js';
import { validateFiscalXml } from '../lib/fiscal-validation.js';
import { requireFiscalTestMode } from './fiscal.service.js';
import type { FiscalSnapshot } from '../lib/fiscal-artifacts.js';

function requireIsolatedBeta() {
  requireFiscalTestMode();
  const db=/;database=([^;]+)/i.exec(process.env.DATABASE_URL??'')?.[1]??'';
  if(process.env.FISCAL_BETA_SEND_ENABLED!=='true'||!/^tayta_(users|fiscal)_test_[a-f0-9]{32}$/.test(db))throw new AppError('Envío beta permitido únicamente en una base temporal de pruebas habilitada.',409,'FISCAL_BETA_ISOLATION_REQUIRED');
}
/** Reserve before I/O. Never hold a SQL transaction across the network. */
export async function deliverFiscalTest(companyId:string,id:string,actor:OperationActor,transport:typeof sendBeta=sendBeta) {
  requireIsolatedBeta();
  const claim=await prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM empresas WITH (UPDLOCK,HOLDLOCK) WHERE id=${companyId}`;
    const row=await tx.fiscalTestDocument.findFirst({where:{id,companyId}});
    if(!row)throw new AppError('Documento no encontrado.',404,'NOT_FOUND');
    if(row.state==='accepted'||row.state==='rejected')return {row,send:false};
    if(row.state!=='prepared')throw new AppError('Resultado pendiente o incierto. Conciliar antes de otro envío.',409,'FISCAL_RECONCILIATION_REQUIRED');
    if(!row.signedXml)throw new AppError('Primero firme el documento de prueba.',409,'FISCAL_SIGNATURE_REQUIRED');
    const snapshot=JSON.parse(row.snapshot) as FiscalSnapshot;
    if(snapshot.mode!=='test'||!snapshot.emitter.name.includes('PRUEBA')||!snapshot.recipient.name.includes('PRUEBA'))throw new AppError('Beta requiere emisores y receptores ficticios.',409,'FISCAL_TEST_DATA_REQUIRED');
    await validateFiscalXml(row.signedXml);
    await tx.fiscalTestDocument.update({where:{id},data:{state:'sending',sendingAt:new Date(),responseCode:null,responseMessage:null}});
    await auditOperation(tx,actor,companyId,'enviar_fiscal_beta',id);
    return {row,send:true};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:30000});
  if(!claim.send)return {id,state:claim.row.state};
  const snapshot=JSON.parse(claim.row.snapshot) as FiscalSnapshot;
  let result:BetaResult|{state:'outcome_unknown';code:string;message:string};
  try {result=await transport(betaEnvelope(snapshot.emitter.ruc,snapshot.documentType,snapshot.number,claim.row.signedXml!),{ruc:snapshot.emitter.ruc,type:snapshot.documentType,number:snapshot.number});}
  catch {result={state:'outcome_unknown',code:'UNCERTAIN',message:'No se obtuvo una respuesta verificable. No reenviar: requiere conciliación.'};}
  // If SQL/audit fails here, persisted sending remains recoverable, without another send.
  return prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM empresas WITH (UPDLOCK,HOLDLOCK) WHERE id=${companyId}`;
    const row=await tx.fiscalTestDocument.findFirst({where:{id,companyId}});
    if(!row||!['sending','outcome_unknown'].includes(row.state))throw new AppError('El documento cambió durante el envío.',409,'FISCAL_STATE_CONFLICT');
    await tx.fiscalTestDocument.update({where:{id},data:{state:result.state,responseCode:result.code,responseMessage:result.message,...('cdr' in result&&result.cdr?{cdr:result.cdr}:{})}});
    await auditOperation(tx,actor,companyId,'respuesta_fiscal_beta',id);
    return {id,state:result.state,code:result.code,message:result.message};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
}
/** A process restart cannot tell whether SUNAT received the request. Do not resend. */
export async function recoverFiscalTest(companyId:string,id:string,actor:OperationActor) {
  requireFiscalTestMode();
  return prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM empresas WITH (UPDLOCK,HOLDLOCK) WHERE id=${companyId}`;
    const row=await tx.fiscalTestDocument.findFirst({where:{id,companyId}});
    if(!row)throw new AppError('Documento no encontrado.',404,'NOT_FOUND');
    if(row.state!=='sending')return {id,state:row.state};
    if(!row.sendingAt||Date.now()-row.sendingAt.getTime()<60000)throw new AppError('El envío aún puede estar en curso.',409,'FISCAL_SEND_IN_PROGRESS');
    await tx.fiscalTestDocument.update({where:{id},data:{state:'outcome_unknown',responseCode:'INTERRUPTED',responseMessage:'Envío interrumpido. Requiere conciliación; no se reenviará automáticamente.'}});
    await auditOperation(tx,actor,companyId,'recuperar_fiscal_beta',id);
    return {id,state:'outcome_unknown'};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
}

/** Explicit beta-only reconciliation by an administrator; never a production CDR attestation. */
export async function reconcileFiscalTest(companyId:string,id:string,response:string,actor:OperationActor) {
  requireIsolatedBeta();
  const {parseBetaResponse}=await import('../lib/fiscal-beta.js');
  return prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM empresas WITH (UPDLOCK,HOLDLOCK) WHERE id=${companyId}`;
    const row=await tx.fiscalTestDocument.findFirst({where:{id,companyId}});
    if(!row)throw new AppError('Documento no encontrado.',404,'NOT_FOUND');
    const snapshot=JSON.parse(row.snapshot) as FiscalSnapshot;
    let result:BetaResult;
    try{result=parseBetaResponse(response,{ruc:snapshot.emitter.ruc,type:snapshot.documentType,number:snapshot.number});}
    catch{throw new AppError('La respuesta no corresponde al documento y emisor o no contiene una CDR válida.',409,'FISCAL_CDR_INVALID');}
    if(!result.cdr)throw new AppError('La conciliación requiere una CDR con resultado.',409,'FISCAL_CDR_REQUIRED');
    if(row.cdr&&Buffer.from(row.cdr).equals(result.cdr))return {id,state:row.state};
    if(!['outcome_unknown','review_required'].includes(row.state))throw new AppError('Primero recupere el envío interrumpido; no se reemplazan resultados definitivos.',409,'FISCAL_STATE_CONFLICT');
    await tx.fiscalTestDocument.update({where:{id},data:{state:result.state,cdr:result.cdr,responseCode:result.code,responseMessage:('Conciliación manual de prueba: '+result.message).slice(0,1000)}});
    await auditOperation(tx,actor,companyId,'conciliar_fiscal_beta_manual',id);
    return {id,state:result.state};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
}
