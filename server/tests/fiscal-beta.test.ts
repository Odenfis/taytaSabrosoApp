import {test} from 'node:test';
import assert from 'node:assert/strict';
import {zipSync,strToU8,unzipSync,strFromU8} from 'fflate';
import {betaEnvelope,parseBetaResponse,fiscalArchiveName,BETA_ENDPOINT} from '../src/lib/fiscal-beta.js';
const expected={ruc:'20000000001',type:'03',number:'BT01-1'};
function response(code='0',number=expected.number,ruc=expected.ruc,extra='') {
 const xml=`<ApplicationResponse xmlns="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"><cac:ReceiverParty><cac:PartyIdentification><cbc:ID>${ruc}</cbc:ID></cac:PartyIdentification></cac:ReceiverParty><cac:DocumentResponse><cac:Response><cbc:ResponseCode>${code}</cbc:ResponseCode><cbc:Description>Prueba</cbc:Description></cac:Response><cac:DocumentReference><cbc:ID>${number}</cbc:ID></cac:DocumentReference></cac:DocumentResponse>${extra}</ApplicationResponse>`;
 const data=Buffer.from(zipSync({'dummy/':new Uint8Array(),['R-'+fiscalArchiveName(expected.ruc,expected.type,expected.number)+'.xml']:strToU8(xml)})).toString('base64');
 return `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><applicationResponse>${data}</applicationResponse></s:Body></s:Envelope>`;
}
test('beta sends only a correctly named ZIP to the fixed beta endpoint',()=>{
 assert.match(BETA_ENDPOINT,/^https:\/\/e-beta\.sunat\.gob\.pe\//);
 const envelope=betaEnvelope(expected.ruc,expected.type,expected.number,'<test/>');
 const data=/<contentFile>([^<]+)/.exec(envelope)![1];
 const archive=unzipSync(Buffer.from(data,'base64'));
 assert.deepEqual(Object.keys(archive),['20000000001-03-BT01-1.xml']);
 assert.equal(strFromU8(Object.values(archive)[0]),'<test/>');
 assert.throws(()=>fiscalArchiveName('../bad','03','BT01-1'));
});
test('CDR acceptance and rejection preserve bytes and real response code',()=>{
 const ok=parseBetaResponse(response(),expected);assert.equal(ok.state,'accepted');assert.ok(ok.cdr);
 const no=parseBetaResponse(response('2335'),expected);assert.equal(no.state,'rejected');assert.equal(no.code,'2335');
});
test('CDR identity, malformed XML, entities, duplicate code and missing response are rejected',()=>{
 assert.throws(()=>parseBetaResponse(response('0','BT01-2'),expected));
 assert.throws(()=>parseBetaResponse(response('0',expected.number,'20000000002'),expected));
 assert.throws(()=>parseBetaResponse(response('0',expected.number,expected.ruc,'<cbc:ResponseCode>0</cbc:ResponseCode>'),expected));
 assert.throws(()=>parseBetaResponse('<!DOCTYPE x><x/>',expected));
 assert.throws(()=>parseBetaResponse('<s:Envelope>',expected));
 assert.throws(()=>parseBetaResponse('<Envelope/>',expected));
});
test('SOAP faults require review instead of falsely recording rejection or acceptance',()=>{
 assert.equal(parseBetaResponse('<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><s:Fault><faultcode>1033</faultcode></s:Fault></s:Body></s:Envelope>',expected).state,'review_required');
});
