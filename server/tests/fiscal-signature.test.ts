import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {signFiscalTestXml} from '../src/lib/fiscal-signature.js';
test('firma de prueba con certificado efímero; rechaza vencimiento y XML con entidades',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'tayta-fiscal-sign-'));
 try{
 const key=join(dir,'key.pem'),cert=join(dir,'cert.pem');
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=PRUEBA SIN VALIDEZ'],{stdio:'ignore'});
 const [k,c]=await Promise.all([readFile(key,'utf8'),readFile(cert,'utf8')]);
 const xml='<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"><ExtensionContent/><Amount>3.00</Amount></Invoice>';
 assert.match(signFiscalTestXml(xml,k,c),/SignatureValue/);
 assert.throws(()=>signFiscalTestXml(xml,k,c,new Date('2100-01-01')));
 assert.throws(()=>signFiscalTestXml('<!DOCTYPE bad>'+xml,k,c));
 }finally{await rm(dir,{recursive:true,force:true})}
});
