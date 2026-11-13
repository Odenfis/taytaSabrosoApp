import type {Document,Element} from '@xmldom/xmldom';
const CBC='urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2';
const CAC='urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2';
function children(node:Element,ns:string,name:string){return Array.from(node.childNodes).filter((n):n is Element=>n.nodeType===1&&(n as Element).namespaceURI===ns&&(n as Element).localName===name)}
function one(node:Element,ns:string,name:string){const nodes=children(node,ns,name);if(nodes.length!==1)throw new Error(`Campo fiscal ambiguo o ausente: ${name}`);return nodes[0];}
function cents(node:Element){if(node.getAttribute('currencyID')!=='PEN'||!/^\d+\.\d{2}$/.test(node.textContent??''))throw new Error('Importe o moneda fiscal inválidos.');return BigInt(node.textContent!.replace('.',''));}
/** Supported subset only: PEN, taxable goods, NIU, cash invoices and test note causes. */
export function validateSupportedFiscalRules(doc:Document){
 const root=doc.documentElement!;
 const id=one(root,CBC,'ID').textContent??'';
 if(!/^[FB][A-Z0-9]{3}-[1-9]\d{0,7}$/.test(id))throw new Error('Serie/correlativo no admitidos.');
 const kind=root.localName;
 const type=kind==='Invoice'?one(root,CBC,'InvoiceTypeCode').textContent:one(one(one(root,CAC,'BillingReference'),CAC,'InvoiceDocumentReference'),CBC,'DocumentTypeCode').textContent;
 if(!['01','03'].includes(type??'')||!id.startsWith(type==='01'?'F':'B'))throw new Error('Serie incompatible con el tipo de documento.');
 if(kind!=='Invoice'){
  const discrepancy=one(root,CAC,'DiscrepancyResponse');
  if(one(discrepancy,CBC,'ResponseCode').textContent!==(kind==='CreditNote'?'01':'02'))throw new Error('Causal de nota no habilitada en pruebas.');
  const original=one(one(root,CAC,'BillingReference'),CAC,'InvoiceDocumentReference');
  if(one(discrepancy,CBC,'ReferenceID').textContent!==one(original,CBC,'ID').textContent)throw new Error('Referencias de la nota inconsistentes.');
 }
 const supplier=one(one(root,CAC,'AccountingSupplierParty'),CAC,'Party');
 const supplierId=one(one(supplier,CAC,'PartyIdentification'),CBC,'ID');
 if(supplierId.getAttribute('schemeID')!=='6'||!/^\d{11}$/.test(supplierId.textContent??''))throw new Error('Emisor requiere RUC.');
 const customer=one(one(root,CAC,'AccountingCustomerParty'),CAC,'Party');
 const customerId=one(one(customer,CAC,'PartyIdentification'),CBC,'ID');
 const receiver=customerId.textContent??'';
 if(!/^(\d{8}|\d{11})$/.test(receiver)||customerId.getAttribute('schemeID')!==(receiver.length===11?'6':'1')||(type==='01'&&receiver.length!==11))throw new Error('Documento del receptor incompatible.');
 const lines=children(root,CAC,kind==='Invoice'?'InvoiceLine':kind+'Line');
 if(!lines.length)throw new Error('Documento sin líneas.');
 let base=0n,taxes=0n;let rate:string|undefined;
 for(const line of lines){
  const qty=one(line,CBC,kind==='Invoice'?'InvoicedQuantity':kind==='CreditNote'?'CreditedQuantity':'DebitedQuantity');
  if(qty.getAttribute('unitCode')!=='NIU'||! /^(?:[1-9]\d*)$/.test(qty.textContent??''))throw new Error('Unidad o cantidad no admitidas.');
  const lineBase=cents(one(line,CBC,'LineExtensionAmount'));
  const tax=one(line,CAC,'TaxTotal'),subtotal=one(tax,CAC,'TaxSubtotal');
  const category=one(subtotal,CAC,'TaxCategory');
  const percent=one(category,CBC,'Percent').textContent??'';
  if(!/^\d{1,3}\.\d{2}$/.test(percent)||Number(percent)<=0||Number(percent)>100||(rate!==undefined&&rate!==percent))throw new Error('Tasa gravada inválida o inconsistente.');rate=percent;
  if(one(category,CBC,'TaxExemptionReasonCode').textContent!=='10'||one(one(category,CAC,'TaxScheme'),CBC,'ID').textContent!=='1000')throw new Error('Tributo o afectación no soportados.');
  const taxAmount=cents(one(tax,CBC,'TaxAmount'));
  if(lineBase!==cents(one(subtotal,CBC,'TaxableAmount'))||taxAmount!==cents(one(subtotal,CBC,'TaxAmount')))throw new Error('Desglose tributario de línea inconsistente.');
  const price=one(one(line,CAC,'PricingReference'),CAC,'AlternativeConditionPrice');
  if(one(price,CBC,'PriceTypeCode').textContent!=='01'||cents(one(price,CBC,'PriceAmount'))*BigInt(qty.textContent!)!==lineBase+taxAmount)throw new Error('Precio incluido no coincide con el desglose.');
  const divisor=10000n+BigInt(Math.round(Number(percent)*100));
  if(((lineBase+taxAmount)*10000n+divisor/2n)/divisor!==lineBase)throw new Error('Tasa y redondeo no coinciden con los importes.');
  base+=lineBase;taxes+=taxAmount;
 }
 const total=one(root,CAC,kind==='DebitNote'?'RequestedMonetaryTotal':'LegalMonetaryTotal');
 if(cents(one(total,CBC,'LineExtensionAmount'))!==base||cents(one(root,CAC,'TaxTotal').getElementsByTagNameNS(CBC,'TaxAmount')[0])!==taxes||cents(one(total,CBC,'PayableAmount'))!==base+taxes||cents(one(total,CBC,'TaxInclusiveAmount'))!==base+taxes)throw new Error('Totales del documento inconsistentes.');
}
