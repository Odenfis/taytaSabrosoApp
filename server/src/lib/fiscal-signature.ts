import { X509Certificate, createPrivateKey } from 'node:crypto';
import { SignedXml } from 'xml-crypto';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
/** Firma local de laboratorio. Su verificación no sustituye XSD ni SUNAT beta. */
export function signFiscalTestXml(xml:string, privateKeyPem:string, certificatePem:string, now=new Date()):string {
  const certificate=new X509Certificate(certificatePem);
  if (now.getTime()<Date.parse(certificate.validFrom)||now.getTime()>Date.parse(certificate.validTo)) throw new Error('Certificado de prueba fuera de vigencia.');
  const key=createPrivateKey(privateKeyPem);
  if (key.asymmetricKeyType!=='rsa'||!certificate.checkPrivateKey(key)) throw new Error('La clave y el certificado no coinciden o no son RSA.');
  if (xml.includes('<!DOCTYPE')||xml.includes('<!ENTITY')) throw new Error('XML no permitido.');
  const signature=new SignedXml({privateKey:privateKeyPem,publicCert:certificatePem,signatureAlgorithm:'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',canonicalizationAlgorithm:'http://www.w3.org/2001/10/xml-exc-c14n#'});
  signature.addReference({xpath:"/*[local-name()='Invoice' or local-name()='CreditNote' or local-name()='DebitNote']",transforms:['http://www.w3.org/2000/09/xmldsig#enveloped-signature','http://www.w3.org/2001/10/xml-exc-c14n#'],digestAlgorithm:'http://www.w3.org/2001/04/xmlenc#sha256',isEmptyUri:true});
  signature.computeSignature(xml,{prefix:'ds',location:{reference:"//*[local-name()='ExtensionContent']",action:'append'},attrs:{Id:'SignatureSP'}});
  const signed=signature.getSignedXml();
  const parsed=new DOMParser().parseFromString(signed,'text/xml');
  const nodes=parsed.getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#','Signature');
  if(nodes.length!==1)throw new Error('Firma XML inválida.');
  const verifier=new SignedXml({publicCert:certificatePem,getCertFromKeyInfo:()=>null});
  verifier.loadSignature(new XMLSerializer().serializeToString(nodes[0]));
  if(!verifier.checkSignature(signed))throw new Error('No se pudo verificar la firma generada.');
  return signed;
}
