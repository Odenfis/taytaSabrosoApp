import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fiscalUnsignedXml,type FiscalSnapshot} from '../src/lib/fiscal-artifacts.js';
import {calculateFiscalLines} from '../src/lib/fiscal-document.js';
import {signFiscalTestXml} from '../src/lib/fiscal-signature.js';
import {validateFiscalXml} from '../src/lib/fiscal-validation.js';
import {fiscalAdjustmentSchema} from '../src/services/fiscal-adjustments.service.js';
const source:FiscalSnapshot={mode:'test',documentType:'01',number:'FT99-1',date:'2026-11-03',profileVersion:1,emitter:{mode:'test',ruc:'20000000001',name:'EMISOR PRUEBA',address:'DIRECCION PRUEBA',ubigeo:'200501',establishment:'0000',invoiceSeries:'FT99',receiptSeries:'BT99',rateBasisPoints:1050,effectiveFrom:'2026-01-01',effectiveTo:'2026-12-31'},recipient:{name:'CLIENTE PRUEBA',id:'20000000002',address:''},calculation:calculateFiscalLines([{description:'PRODUCTO PRUEBA',quantity:1,unitPriceCents:5900}],1050),source:{orderId:'original',billId:null,ticketNumber:'TICKET-1'}};
test('credit and debit notes preserve reference and pass XSD with locally verified signature',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'tayta-notes-'));
 try{
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(dir,'key.pem'),'-out',join(dir,'cert.pem'),'-days','1','-subj','/CN=PRUEBA'],{stdio:'ignore'});
 const [key,cert]=await Promise.all([readFile(join(dir,'key.pem'),'utf8'),readFile(join(dir,'cert.pem'),'utf8')]);
 for(const documentType of ['07','08'] as const){const snapshot:FiscalSnapshot={...source,documentType,number:documentType==='07'?'FC99-1':'FD99-1',reference:{id:'original',number:source.number,documentType:'01',reasonCode:documentType==='07'?'01':'02',reason:'ENSAYO DE PRUEBA'}};
 const xml=signFiscalTestXml(fiscalUnsignedXml(snapshot),key,cert);await validateFiscalXml(xml);assert.match(xml,/<cac:InvoiceDocumentReference><cbc:ID>FT99-1/);assert.equal(source.number,'FT99-1');
 await assert.rejects(validateFiscalXml(xml.replace('TaxExemptionReasonCode>10','TaxExemptionReasonCode>20')));
 await assert.rejects(validateFiscalXml(xml.replace('unitCode="NIU"','unitCode="ZZZ"')));
 await assert.rejects(validateFiscalXml(xml.replace('Percent>10.50','Percent>18.00')));
 }
 }finally{await rm(dir,{recursive:true,force:true})}
});
test('unsupported note causes and arbitrary production fields are rejected',()=>{
 assert.equal(fiscalAdjustmentSchema.safeParse({documentType:'07',reasonCode:'99',reason:'ENSAYO',requestKey:crypto.randomUUID(),testOnly:true}).success,false);
 assert.equal(fiscalAdjustmentSchema.safeParse({documentType:'08',reasonCode:'02',amountCents:-1,reason:'ENSAYO',requestKey:crypto.randomUUID(),testOnly:true}).success,false);
});
