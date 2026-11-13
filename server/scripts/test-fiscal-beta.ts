// Synthetic documents only; no DB access, no production endpoint.
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fiscalUnsignedXml,type FiscalSnapshot} from '../src/lib/fiscal-artifacts.js';
import {calculateFiscalLines} from '../src/lib/fiscal-document.js';
import {signFiscalTestXml} from '../src/lib/fiscal-signature.js';
import {validateFiscalXml} from '../src/lib/fiscal-validation.js';
import {betaEnvelope,sendBeta} from '../src/lib/fiscal-beta.js';
if(process.env.FISCAL_BETA_LIVE!=='true')throw new Error('Requiere FISCAL_BETA_LIVE=true.');
const rucs=(process.env.FISCAL_BETA_TEST_RUCS??'').split(',');
if(rucs.length!==2||rucs.some(r=>!/^\d{11}$/.test(r)))throw new Error('Indique dos RUC en FISCAL_BETA_TEST_RUCS.');
const dir=await mkdtemp(join(tmpdir(),'tayta-beta-'));
try{
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(dir,'key.pem'),'-out',join(dir,'cert.pem'),'-days','1','-subj','/CN=EMISOR DE PRUEBA'],{stdio:'ignore'});
 const [key,cert]=await Promise.all([readFile(join(dir,'key.pem'),'utf8'),readFile(join(dir,'cert.pem'),'utf8')]);
 const results=[];
 const types=process.env.FISCAL_BETA_NOTES==='true'?['07','08'] as const:['01','03'] as const;
 for(const ruc of rucs)for(const type of types){
  const date=new Date().toISOString().slice(0,10),number=(type==='01'?'FT99':type==='03'?'BT99':type==='07'?'FC99':'FD99')+'-1';
  const snapshot:FiscalSnapshot={mode:'test',date,number,documentType:type,...(['07','08'].includes(type)?{reference:{id:'synthetic-original',number:'FT99-1',documentType:'01' as const,reasonCode:type==='07'?'01':'02',reason:'ENSAYO DE PRUEBA'}}:{}),profileVersion:1,emitter:{mode:'test',ruc,name:'EMISOR DE PRUEBA',address:'DIRECCION DE PRUEBA',ubigeo:'200501',establishment:'0000',invoiceSeries:'FT99',receiptSeries:'BT99',rateBasisPoints:1050,effectiveFrom:date,effectiveTo:date},recipient:{name:'CLIENTE DE PRUEBA',id:type==='03'?'00000000':'20000000001',address:'DIRECCION DE PRUEBA'},calculation:calculateFiscalLines([{description:'PRODUCTO DE PRUEBA',quantity:1,unitPriceCents:5900}],1050),source:{orderId:'synthetic',billId:null,ticketNumber:'PRUEBA'}};
  const xml=signFiscalTestXml(fiscalUnsignedXml(snapshot),key,cert);await validateFiscalXml(xml);
  await writeFile(join(dir,`${ruc}-${type}-${number}.xml`),xml);
  try{const result=await sendBeta(betaEnvelope(ruc,type,number,xml),{ruc,type,number},body=>writeFile(join(dir,`${ruc}-${type}-response.xml`),body));if(result.cdr)await writeFile(join(dir,`R-${ruc}-${type}-${number}.zip`),result.cdr);results.push({ruc,type,number,state:result.state,code:result.code,message:result.message});}
  catch(error){results.push({ruc,type,number,state:'outcome_unknown',message:error instanceof Error?error.message:'Respuesta incierta'});}
 }
 await writeFile(join(dir,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({artifacts:dir,results},null,2));
 if(results.some(r=>r.state!=='accepted'))process.exitCode=1;
}finally{await rm(join(dir,'key.pem'),{force:true});}
