export type FiscalFile={filename:string;mime:string;base64:string};
export function fiscalBlob(file:FiscalFile):File {
 return new File([Uint8Array.from(atob(file.base64),c=>c.charCodeAt(0))],file.filename,{type:file.mime});
}
export function downloadFiscalFile(file:FiscalFile){
 const url=URL.createObjectURL(fiscalBlob(file));const a=document.createElement('a');a.href=url;a.download=file.filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export async function shareFiscalFile(file:FiscalFile){
 const files=[fiscalBlob(file)];
 if(navigator.canShare?.({files})&&navigator.share){await navigator.share({files,title:'Documento de prueba — sin validez tributaria'});return 'Archivo compartido.';}
 downloadFiscalFile(file);return 'Este navegador no permite compartir archivos. Se descargó el PDF para compartirlo manualmente.';
}
/** Open synchronously from the click, then load the PDF to preserve popup permission. */
export function fiscalPrintWindow(){
 const win=window.open('','_blank');
 if(!win)throw new Error('Permite abrir la vista PDF para imprimir. También puedes descargarlo.');
 win.opener=null;win.document.title='Documento de prueba';win.document.body.textContent='Cargando PDF de prueba…';
 return {load(file:FiscalFile){const url=URL.createObjectURL(fiscalBlob(file));win.location.replace(url);setTimeout(()=>URL.revokeObjectURL(url),60000);},close(){win.close()}};
}
