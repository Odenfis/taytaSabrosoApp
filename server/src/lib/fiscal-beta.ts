import { DOMParser } from '@xmldom/xmldom';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { xmlEscape } from './fiscal-artifacts.js';

export const BETA_ENDPOINT = 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService';
const SOAP = 'http://schemas.xmlsoap.org/soap/envelope/';
const CBC = 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2';
const CAC = 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2';
const MAX_BYTES = 2 * 1024 * 1024;
export type BetaResult = { state: 'accepted'|'rejected'|'review_required'; code: string; message: string; cdr?: Buffer };
function parseXml(xml: string) {
  if (Buffer.byteLength(xml)>MAX_BYTES || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Respuesta XML no permitida.');
  return new DOMParser({onError:()=>{throw new Error('Respuesta XML mal formada.')}}).parseFromString(xml,'text/xml');
}
export function fiscalArchiveName(ruc:string,type:string,number:string) {
  if(!/^\d{11}$/.test(ruc)||! /^(01|03|07|08)$/.test(type)||! /^[FB][A-Z0-9]{3}-[1-9]\d{0,7}$/.test(number)) throw new Error('Identificador fiscal inválido.');
  if((type==='01'&&!number.startsWith('F'))||(type==='03'&&!number.startsWith('B')))throw new Error('Serie y tipo no coinciden.');
  return `${ruc}-${type}-${number}`;
}
export function betaEnvelope(ruc:string,type:string,number:string,xml:string) {
  const name=fiscalArchiveName(ruc,type,number);
  if(Buffer.byteLength(xml)>MAX_BYTES)throw new Error('Documento demasiado grande.');
  const zip=zipSync({[name+'.xml']:strToU8(xml)});
  return `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="${SOAP}" xmlns:ser="http://service.sunat.gob.pe" xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"><soap:Header><wsse:Security><wsse:UsernameToken><wsse:Username>${ruc}MODDATOS</wsse:Username><wsse:Password>MODDATOS</wsse:Password></wsse:UsernameToken></wsse:Security></soap:Header><soap:Body><ser:sendBill><fileName>${xmlEscape(name)}.zip</fileName><contentFile>${Buffer.from(zip).toString('base64')}</contentFile></ser:sendBill></soap:Body></soap:Envelope>`;
}
export function parseBetaResponse(xml:string, expected:{ruc:string;type:string;number:string}):BetaResult {
  const doc=parseXml(xml);
  if(doc.documentElement?.namespaceURI!==SOAP||doc.documentElement?.localName!=='Envelope')throw new Error('Respuesta SOAP inválida.');
  const faults=doc.getElementsByTagNameNS(SOAP,'Fault');
  if(faults.length) {
    // A SOAP fault may mean duplicate/temporary processing, not a definitive rejection.
    return {state:'review_required',code:'SOAP_FAULT',message:'SUNAT beta devolvió una falla SOAP; revisar antes de reenviar.'};
  }
  const bodies=doc.getElementsByTagNameNS(SOAP,'Body');
  if(bodies.length!==1)throw new Error('Cuerpo SOAP ambiguo.');
  const responses=bodies[0].getElementsByTagNameNS('*','applicationResponse');
  if(responses.length!==1)throw new Error('Respuesta sin una única CDR.');
  const base64=(responses[0].textContent??'').replace(/\s/g,'');
  if(!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)||base64.length>MAX_BYTES*1.4)throw new Error('CDR no válida.');
  const cdr=Buffer.from(base64,'base64');
  const name='R-'+fiscalArchiveName(expected.ruc,expected.type,expected.number)+'.xml';
  let entries=0,documents=0;
  const files=unzipSync(cdr,{filter:file=>{
    if(++entries>16)throw new Error('Demasiadas entradas CDR.');
    if(/^[A-Za-z0-9_-]+\/$/.test(file.name)&&file.originalSize===0)return false;
    if(++documents>1||file.name!==name||file.originalSize>MAX_BYTES)throw new Error('Archivo CDR inesperado.');
    return true;
  }});
  if(!files[name]||files[name].length>MAX_BYTES)throw new Error('CDR ausente o demasiado grande.');
  const response=parseXml(strFromU8(files[name]));
  if(response.documentElement?.localName!=='ApplicationResponse'||response.documentElement?.namespaceURI!=='urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2')throw new Error('Documento CDR inválido.');
  const references=response.getElementsByTagNameNS(CAC,'DocumentReference');
  if(references.length!==1)throw new Error('Referencia CDR ambigua.');
  const ids=references[0].getElementsByTagNameNS(CBC,'ID');
  if(ids.length!==1||ids[0].textContent!==expected.number)throw new Error('La CDR pertenece a otro documento.');
  const recipients=response.getElementsByTagNameNS(CAC,'ReceiverParty');
  if(recipients.length!==1||recipients[0].getElementsByTagNameNS(CBC,'ID').length!==1||recipients[0].getElementsByTagNameNS(CBC,'ID')[0]?.textContent!==expected.ruc)throw new Error('La CDR pertenece a otro emisor.');
  const codes=response.getElementsByTagNameNS(CBC,'ResponseCode');
  const descriptions=response.getElementsByTagNameNS(CBC,'Description');
  if(codes.length!==1||!/^\d{1,4}$/.test(codes[0].textContent??''))throw new Error('Código CDR inválido.');
  const code=codes[0].textContent!;
  return {state:code==='0'?'accepted':'rejected',code,message:(descriptions[0]?.textContent??'Respuesta beta').slice(0,1000),cdr};
}
export async function sendBeta(envelope:string, expected:{ruc:string;type:string;number:string},capture?:(body:string)=>Promise<void>):Promise<BetaResult> {
  const response=await fetch(BETA_ENDPOINT,{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{'Content-Type':'text/xml; charset=utf-8',SOAPAction:'urn:sendBill'},body:envelope});
  if(!response.body)throw new Error('Respuesta beta vacía.');
  const reader=response.body.getReader();let size=0;const chunks:Uint8Array[]=[];
  try {for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_BYTES)throw new Error('Respuesta beta demasiado grande.');chunks.push(value);}}finally{await reader.cancel();}
  const body=Buffer.concat(chunks).toString('utf8');
  if(capture)await capture(body);
  if(!response.ok&&!body.includes('Fault'))throw new Error(`SUNAT beta respondió HTTP ${response.status}; resultado sin confirmar.`);
  return parseBetaResponse(body,expected);
}
