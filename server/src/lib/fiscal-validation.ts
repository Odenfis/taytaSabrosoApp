import {validateSupportedFiscalRules} from './fiscal-catalogs.js';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { DOMParser } from '@xmldom/xmldom';
/** Trusted, vendored schemas only; never resolve external schema locations from input. */
export async function validateFiscalXml(xml:string):Promise<void> {
  if(Buffer.byteLength(xml)>2*1024*1024||/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('XML no permitido.');
  const doc=new DOMParser({onError:()=>{throw new Error('XML mal formado.')}}).parseFromString(xml,'text/xml');
  const root=doc.documentElement?.localName??'';
  if(!['Invoice','CreditNote','DebitNote'].includes(root)||doc.documentElement?.namespaceURI!==`urn:oasis:names:specification:ubl:schema:xsd:${root}-2`)throw new Error('Tipo UBL no soportado.');
  const cbc='urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2';
  const one=(name:string)=>{const nodes=doc.getElementsByTagNameNS(cbc,name);if(nodes.length!==1)throw new Error('Campo fiscal ausente o ambiguo.');return nodes[0].textContent;};
  if(one('UBLVersionID')!=='2.1'||one('CustomizationID')!=='2.0'||(root==='Invoice'&&!['01','03'].includes(one('InvoiceTypeCode')??''))||one('DocumentCurrencyCode')!=='PEN')throw new Error('Versión, tipo o moneda no soportados.');
  validateSupportedFiscalRules(doc);
  const dev=fileURLToPath(new URL(`../../resources/ubl21/xsd/maindoc/UBL-${root}-2.1.xsd`,import.meta.url));
  const built=fileURLToPath(new URL(`../resources/ubl21/xsd/maindoc/UBL-${root}-2.1.xsd`,import.meta.url));
  const schema=existsSync(dev)?dev:built;
  await new Promise<void>((resolve,reject)=>{
    const child=spawn('xmllint',['--nonet','--noout','--schema',schema,'-'],{stdio:['pipe','ignore','pipe'],timeout:10000});
    let error='';child.stderr.on('data',chunk=>{if(error.length<6000)error+=String(chunk)});
    child.on('error',()=>reject(new Error('Validador XSD no disponible. Instale libxml2-utils.')));
    child.on('exit',code=>code===0?resolve():reject(new Error('XML no cumple UBL 2.1: '+error.slice(0,1200))));
    child.stdin.on('error',()=>{});child.stdin.end(xml);
  });
}
