import { NumericInput } from './NumericInput';
import { inventoryButton, inventoryPrimary } from '../lib/inventoryUi';
import React, { useEffect, useState } from 'react';
import { usePOS } from '../context/POSContext';
import { usePermission } from '../lib/usePermission';
import { useDialogFocus } from '../lib/useDialogFocus';
import { apiClient, ApiError } from '../lib/api';

type Ingredient = { id:string; name:string; unit:string; currentStock:number; costPerUnit:number };
type Output = { insumoId:string; percentage:number; unit?:string };
const parseDefinition=(definition:string):Output[]=>{const parsed=JSON.parse(definition);return Array.isArray(parsed)?parsed.map((o:{insumoId:string;unit?:string})=>({insumoId:o.insumoId,unit:o.unit,percentage:0})):parsed.outputs};
const isLegacy=(definition:string)=>Array.isArray(JSON.parse(definition));
const factor=(unit:string)=>({kg:1000,g:1,L:1000,ml:1}[unit]??1);
type Template = { id:string; name:string; sourceId:string; active:boolean; version:number; definition:string };
type Request = {id:string;templateId:string;quantity:number;outputs:{insumoId:string;quantity:number}[];previewHash?:string};
type Preview = {previewHash:string;templateName:string;source:{name:string;unit:string;quantity:number;unitCost:number;stockBefore:number;stockAfter:number};totalCost:number;wasteQuantity:number;yieldPct:number;outputs:{insumoId:string;name:string;quantity:number;unit:string;unitCost:number;totalCost:number;averageUnitCost:number;stockAfter:number;yieldPct:number}[];actorUserId?:string;deviceId?:string;createdAt?:string};
type Execution = { id:string; snapshot:string;createdAt:string };
const money=(n:number)=>`S/ ${n.toFixed(2)}`;
const field='inventory-field mt-1 w-full min-h-11 rounded-lg border border-edge-outline-2 bg-panel-14 px-3 py-2 text-[13px] text-ink-strong';
const button=inventoryButton + ' !rounded-lg !px-3 !text-[13px]';
const primary=inventoryPrimary + ' !rounded-lg !px-3 !text-[13px]';
const card='rounded-xl border border-edge-outline-2 bg-panel-23 p-4 space-y-3 min-w-0';

export function TransformationsPanel(){
  const {activeCompanyId,currentUser,sessionDeviceId,offlineState,refreshInventory}=usePOS();
  const can=usePermission();
  if(activeCompanyId==='todas')return <p className="p-5 text-ink-muted-2">Selecciona una empresa para gestionar sus transformaciones.</p>;
  return <Panel key={`${activeCompanyId}:${currentUser?.id}:${sessionDeviceId}`} companyId={activeCompanyId} userId={currentUser?.id??''} deviceId={sessionDeviceId??''} online={offlineState.isOnline&&!offlineState.isSimulatedOffline} manage={can('inventory.manage')} refreshInventory={refreshInventory}/>;
}
function Panel({companyId,userId,deviceId,online,manage,refreshInventory}:{key?:string;companyId:string;userId:string;deviceId:string;online:boolean;manage:boolean;refreshInventory:()=>Promise<void>}){
  const base=`/transformations`;
  const scope=`?companyId=${encodeURIComponent(companyId)}`;
  const storageKey=`transformation-pending:${location.origin}:${userId}:${deviceId}:${companyId}`;
  const [templates,setTemplates]=useState<Template[]>([]),[ingredients,setIngredients]=useState<Ingredient[]>([]),[history,setHistory]=useState<Execution[]>([]);
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[loading,setLoading]=useState(online),[loadError,setLoadError]=useState(''),[storageBlocked,setStorageBlocked]=useState(false);
  const [mode,setMode]=useState<'execute'|'templates'|'history'>('execute');
  const blank=()=>({id:crypto.randomUUID(),name:'',sourceId:'',active:true,expectedVersion:0,outputs:[] as Output[]});
  const [form,setForm]=useState(blank),[templateId,setTemplateId]=useState(''),[quantity,setQuantity]=useState(''),[quantities,setQuantities]=useState<Record<string,string>>({}),[edited,setEdited]=useState(false),[deleting,setDeleting]=useState<Template|null>(null);
  const deleteDialogRef=useDialogFocus(!!deleting);
  const [preview,setPreview]=useState<Preview|null>(null),[request,setRequest]=useState<Request|null>(null),[detail,setDetail]=useState<Preview|null>(null);
  const [pending,setPending]=useState<Request|null>(null),[skip,setSkip]=useState(0),[confirmedAbsent,setConfirmedAbsent]=useState(false);
  const selected=templates.find(t=>t.id===templateId);
  const outputs:Output[]=selected?parseDefinition(selected.definition):[];
  const totalPercentage=form.outputs.reduce((sum,o)=>sum+Number(o.percentage||0),0);
  const source=ingredients.find(i=>i.id===selected?.sourceId);
  const stockInsufficient=!!source && (Number(source.currentStock)<=0 || (!!quantity && Number(quantity)>Number(source.currentStock)));
  function propose(t:Template|undefined, value:string){
    const base=ingredients.find(i=>i.id===t?.sourceId);
    if(!t||!base||isLegacy(t.definition)||!value||Number(value)<=0)return {};
    return Object.fromEntries(parseDefinition(t.definition).map(o=>{const item=ingredients.find(i=>i.id===o.insumoId);const q=BigInt(Math.round(Number(value)*10000));const p=BigInt(Math.round(o.percentage*10000));const units=q*BigInt(factor(base.unit))*p/(1000000n*BigInt(factor(item?.unit??base.unit)));return [o.insumoId,String(Number(units)/10000)]}));
  }
  function allowReplace(){return !edited||window.confirm('Se reemplazarán las cantidades que modificaste por las propuestas de la ficha. ¿Continuar?');}
  useEffect(()=>{try{const raw=localStorage.getItem(storageKey);if(raw)setPending(JSON.parse(raw));}catch{setStorageBlocked(true);setError('No se pudo recuperar la solicitud pendiente. Revisa el historial antes de confirmar otra ejecución.');}},[storageKey]);
  async function load(){
    setLoading(true);setLoadError('');
    try {
    const [t,i,h]=await Promise.all([apiClient.get<Template[]>(base+'/templates'+scope),apiClient.get<Ingredient[]>('/catalogs/insumos'+scope),apiClient.get<Execution[]>(base+'/executions'+scope+`&skip=${skip}`)]);
    setTemplates(t);setIngredients(i);setHistory(h);setLoaded(true);
    } catch(e) {setLoadError(e instanceof Error?e.message:"No se pudieron cargar los datos.");throw e;} finally {setLoading(false)}
  }
  useEffect(()=>{let alive=true;if(online){load().catch(()=>undefined);}return()=>{alive=false}},[companyId,online,skip]);
  async function run(action:()=>Promise<void>){if(busy)return;setBusy(true);setError('');setNotice('');try{await action()}catch(e){setError(e instanceof Error?e.message:'No se pudo completar la operación.')}finally{setBusy(false)}}
  function invalidate(){setPreview(null);setRequest(null)}
  function edit(t:Template){setForm({id:t.id,name:t.name,sourceId:t.sourceId,active:t.active,expectedVersion:t.version,outputs:parseDefinition(t.definition)});setMode('templates')}
  const [refreshFailed,setRefreshFailed]=useState(false);
  async function reloadConfirmedInventory(){
    const results=await Promise.allSettled([load(),refreshInventory()]);
    setRefreshFailed(results.some(r=>r.status==='rejected'));
  }
  async function accepted(row:Execution){
    localStorage.removeItem(storageKey);localStorage.removeItem(storageKey+':draft');setPending(null);setConfirmedAbsent(false);setPreview(null);setRequest(null);setQuantity('');setQuantities({});setEdited(false);setDetail(JSON.parse(row.snapshot));setNotice('Transformación confirmada. Stock, costos y kardex registrados.');await reloadConfirmedInventory();
  }
  async function recover(){
    if(!pending)return;
    try{await accepted(await apiClient.get<Execution>(base+'/executions/'+pending.id+scope));}
    catch(e){if(e instanceof ApiError&&e.status===404){setConfirmedAbsent(true);setNotice('No se encontró una ejecución confirmada. Puedes reenviar la misma solicitud; no se generará otro identificador.')}else throw e;}
  }
  async function send(body:Request){
    // Persistir ANTES de enviar: una respuesta perdida o recarga conserva la misma identidad.
    localStorage.setItem(storageKey+':draft',body.id);localStorage.setItem(storageKey,JSON.stringify(body));setPending(body);setConfirmedAbsent(false);
    try{await accepted(await apiClient.post<Execution>(base+'/executions'+scope,body));}
    catch(e){
      if(e instanceof ApiError&&[400,403,409].includes(e.status)){
        // La API rechazó la transacción; consultar antes de permitir descartar o recalcular.
        setError(e.message+' Consulta el resultado antes de preparar otra ejecución.');
      }else throw e;
    }
  }
  const choices=(exclude:string[]=[])=><><option value="">Seleccionar insumo</option>{ingredients.filter(i=>!exclude.includes(i.id)&&['kg','g','L','ml'].includes(i.unit)).map(i=><option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}</>;
  const disabled=!loaded||busy||!online||!manage||!!pending||storageBlocked;
  return <section className="space-y-3 text-[13px] leading-5 text-ink-strong" aria-label="Transformaciones de insumos">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-bold leading-6">Transformación y despiece</h2><p className="text-[13px] text-ink-muted-3">Convierte un insumo en cortes o preparaciones. Cada ejecución conserva su rendimiento y costo.</p></div><button className={button} disabled={busy||!online} onClick={()=>run(load)}>Actualizar</button></div>
    <div className="inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-edge-outline-2 bg-panel-14 p-1" role="group" aria-label="Secciones de transformación">{([['execute','Ejecutar','conversion_path'],['templates','Fichas','description'],['history','Historial','history']] as const).map(([key,label,icon])=><button key={key} aria-pressed={mode===key} className={`min-h-10 rounded-lg px-3 py-1.5 text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-edge-brand ${mode===key ? "bg-surface-brand-solid text-ink-on-brand" : "text-ink-muted-3 hover:bg-panel-19 hover:text-ink-strong"}`} onClick={()=>{setMode(key);setDetail(null)}}><span aria-hidden="true" className="material-symbols-outlined align-middle !text-[18px] mr-1.5">{icon}</span>{label}</button>)}</div>
    {!online&&<p role="status" className="text-ink-warning">Sin conexión. Las transformaciones requieren confirmación del servidor; no se envían a la cola offline.</p>}
    {(error||loadError)&&<p role="alert" className="rounded-xl border border-edge-danger-6 p-3 text-ink-danger-2">{error||loadError}</p>}
    {refreshFailed&&<div role="alert" className="rounded-xl border border-edge-outline-2 p-3 text-ink-warning">La transformación está confirmada, pero falta actualizar las existencias y costos en pantalla. No vuelvas a ejecutarla.<button className={button+" ml-2"} disabled={busy||!online} onClick={()=>run(reloadConfirmedInventory)}>Reintentar actualización</button></div>}
    {notice&&<p role="status" className="text-ink-success-2">{notice}</p>}
    {!loaded&&loading&&<p role="status">Cargando fichas e insumos…</p>}
    {!loaded&&!loading&&<p className="rounded-xl bg-panel-19 p-4 text-sm text-ink-muted-3">{online?"No se pudieron cargar los datos. Usa Actualizar para reintentar.":"Conéctate para consultar las fichas e insumos."}</p>}
    {pending&&<div className={card}><h3 className="font-bold">Confirmación pendiente</h3><p className="text-sm break-all">Solicitud {pending.id}. Consulta el resultado antes de realizar otra transformación.</p><div className="flex flex-wrap gap-2"><button className={primary} disabled={busy||!online} onClick={()=>run(recover)}>Consultar resultado</button>{confirmedAbsent&&<><button className={button} disabled={busy||!online||!manage} onClick={()=>run(()=>send(pending))}>Reenviar misma solicitud</button><button className={button} disabled={busy||!online} onClick={()=>run(async()=>{
      // Un 404 no garantiza que otra terminal no esté enviando. Mantener la clave para reintentos;
      // el abandono solo se permite si el servidor confirma el rechazo de esta solicitud.
      try{await accepted(await apiClient.post<Execution>(base+'/executions'+scope,pending));}catch(e){if(e instanceof ApiError&&e.status===409&&e.code==='TRANSFORMATION_CONFLICT'){localStorage.removeItem(storageKey);setPending(null);setConfirmedAbsent(false);invalidate();setNotice('Solicitud rechazada. Puedes revisar las cantidades y calcular nuevamente con el mismo identificador.')}else throw e;}
    })}>Reintentar y revisar si fue rechazada</button></>}</div></div>}
    {loaded&&mode==='templates'&&<div className="grid gap-4 lg:grid-cols-[minmax(240px,1fr)_2fr]">
      <div className={card}><h3 className="font-bold">Fichas reutilizables</h3><button className={primary} disabled={disabled} onClick={()=>setForm(blank())}>Nueva ficha</button>{!templates.length&&<p className="text-sm">Crea la primera ficha de transformación.</p>}{templates.map(t=><button key={t.id} className={`${button} w-full text-left ${form.id===t.id?'bg-panel-19 ring-2 ring-edge-brand':''}`} aria-pressed={form.id===t.id} onClick={()=>edit(t)}><span className="block font-bold break-words">{t.name}</span><span className="block text-sm text-ink-muted-3 mt-1">{ingredients.find(i=>i.id===t.sourceId)?.name??"Insumo no disponible"} · {parseDefinition(t.definition).length} resultados</span><span className="block text-xs text-ink-muted-3">Versión {t.version} · {t.active?'Activa':'Inactiva'}{isLegacy(t.definition)?' · Requiere conversión':''}</span></button>)}</div>
      <form className={card} onSubmit={e=>{e.preventDefault();run(async()=>{const saved=await apiClient.post<Template>(base+'/templates'+scope,{...form,definitionVersion:2,outputs:form.outputs.map(({insumoId,percentage})=>({insumoId,percentage:Number(percentage)}))});edit(saved);await load();setNotice('Ficha guardada. Las ejecuciones anteriores no cambian.')})}}>
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">{form.expectedVersion?'Editar ficha':'Nueva ficha'}</h3>{form.expectedVersion>0&&<button type="button" className={button+' text-ink-danger-2'} disabled={disabled} onClick={()=>setDeleting(templates.find(t=>t.id===form.id)??null)}>Eliminar ficha</button>}</div>{templates.find(t=>t.id===form.id&&isLegacy(t.definition))&&<p className="rounded-lg bg-panel-19 p-3 text-ink-warning">Esta ficha necesita porcentajes antes de volver a ejecutarse. Define y guarda los porcentajes de cada resultado.</p>}
        <label className="block">Nombre<input required maxLength={150} className={field} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
        <label className="block">Insumo base<select required className={field} value={form.sourceId} onChange={e=>setForm({...form,sourceId:e.target.value})}>{choices()}</select></label>
        <p className="text-sm text-ink-muted-3">Crea primero los cortes con «Nuevo Insumo» y su unidad correspondiente. Selecciona aquí esos insumos. Indica qué porcentaje del insumo base corresponde a cada resultado; lo no asignado será merma prevista.</p>
        {form.outputs.map((o,index)=><div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_140px_auto] items-end rounded-xl border border-edge-outline-2 bg-panel-19 p-3" key={index}><label>Resultado {index+1}<select aria-label={`Resultado ${index+1}`} required className={field} value={o.insumoId} onChange={e=>setForm({...form,outputs:form.outputs.map((r,n)=>n===index?{...r,insumoId:e.target.value}:r)})}>{choices([form.sourceId,...form.outputs.filter((_,n)=>n!==index).map(r=>r.insumoId)])}</select></label><label>Porcentaje (%)<NumericInput required aria-label={`Porcentaje ${index+1}`} className={field} type="number" min="0" max="100" step="0.0001" value={o.percentage} onChange={e=>setForm({...form,outputs:form.outputs.map((r,n)=>n===index?{...r,percentage:Number(e.target.value)}:r)})}/></label><button type="button" className={button} onClick={()=>setForm({...form,outputs:form.outputs.filter((_,n)=>n!==index)})} aria-label={`Quitar resultado ${index+1}`}>Quitar</button></div>)}
        <button type="button" className={button} disabled={form.outputs.length>=100} onClick={()=>setForm({...form,outputs:[...form.outputs,{insumoId:'',percentage:Math.max(0,Math.round((100-totalPercentage)*10000)/10000)}]})}>Añadir resultado</button>
        <p className={totalPercentage>100.00000001?"text-ink-danger-2":"text-ink-muted-3"}>Asignado: {Number(totalPercentage.toFixed(4))}% · Merma prevista: {Number(Math.max(0,100-totalPercentage).toFixed(4))}% {totalPercentage>100.00000001&&"· La suma no puede superar 100 %."}</p><label className="flex gap-2 items-center min-h-11"><input type="checkbox" checked={form.active} onChange={e=>setForm({...form,active:e.target.checked})}/>Ficha activa</label>
        <button className={primary} disabled={disabled||!form.outputs.length||totalPercentage<=0||totalPercentage>100.00000001}>Guardar ficha</button>
      </form>
    </div>}
    {deleting&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-scrim p-4"><section ref={deleteDialogRef} role="alertdialog" aria-modal="true" aria-labelledby="delete-template-title" className={card+" w-full max-w-md shadow-xl"} onKeyDown={e=>{if(e.key==='Escape'&&!busy)setDeleting(null)}}><h3 id="delete-template-title" className="font-bold">Eliminar ficha</h3><p>¿Eliminar «{deleting.name}»? Su historial y movimientos se conservarán.</p><div className="flex flex-wrap gap-2"><button className={button} onClick={()=>setDeleting(null)}>Cancelar</button><button className={button+' text-ink-danger-2'} disabled={busy||!online||!manage} onClick={()=>run(async()=>{await apiClient.post(base+'/templates/'+deleting.id+'/delete'+scope,{expectedVersion:deleting.version});if(templateId===deleting.id){setTemplateId('');setQuantities({});invalidate()}setForm(blank());setDeleting(null);await load();setNotice('Ficha eliminada. El historial se conserva.')})}>Eliminar ficha</button></div></section></div>}
    {loaded&&mode==='execute'&&<div className="grid gap-4 lg:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.1fr)]"><div className={card}><h3 className="font-bold flex items-center gap-2"><span aria-hidden="true" className="material-symbols-outlined text-ink-brand">input</span>Insumo consumido</h3>
      <label className="block">Ficha<select aria-label="Ficha" className={field} disabled={disabled} value={templateId} onChange={e=>{if(!allowReplace())return;const t=templates.find(t=>t.id===e.target.value);setTemplateId(e.target.value);setQuantities(propose(t,quantity));setEdited(false);invalidate()}}><option value="">Seleccionar ficha</option>{templates.filter(t=>t.active&&!isLegacy(t.definition)).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      {!templates.some(t=>t.active&&!isLegacy(t.definition))&&<p className="text-sm">Primero crea una ficha en la sección Fichas.</p>}
      {source&&<><p className="text-sm text-ink-muted-3">{source.name} · Disponible: {Number(source.currentStock)} {source.unit} · Costo: {money(Number(source.costPerUnit))}/{source.unit}</p><label className="block">Cantidad consumida ({source.unit})<NumericInput className={field} disabled={disabled} type="number" min="0.0001" step="0.0001" value={quantity} onChange={e=>{if(!allowReplace())return;setQuantity(e.target.value);setQuantities(propose(selected,e.target.value));setEdited(false);invalidate()}}/></label></>}
      {stockInsufficient&&<p role="alert" className="rounded-lg border border-edge-danger-6 p-3 text-ink-danger-2">Stock insuficiente. Revisa la cantidad consumida o actualiza las existencias.</p>}{outputs.length>0&&<h3 className="font-bold border-t border-edge-outline-2 pt-4">Resultados obtenidos</h3>}{outputs.map(o=>{const i=ingredients.find(i=>i.id===o.insumoId);return <label className="grid items-center gap-1 rounded-lg border border-edge-outline-2 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_minmax(120px,160px)] sm:gap-3" key={o.insumoId}><span className="min-w-0 break-words font-medium">{i?.name??'Insumo no disponible'} <span className="font-normal text-ink-muted-3">· obtenido ({i?.unit})</span></span><NumericInput className={field+" sm:mt-0"} disabled={disabled} type="number" min="0" step="0.0001" value={quantities[o.insumoId]??''} onChange={e=>{setQuantities({...quantities,[o.insumoId]:e.target.value});setEdited(true);invalidate()}}/></label>})}
      {edited&&<p className="text-ink-muted-3">Cantidades ajustadas manualmente respecto a la propuesta.</p>}<button className={primary} disabled={disabled||!selected||!quantity||Number(quantity)<=0||stockInsufficient} onClick={()=>run(async()=>{const executionId=localStorage.getItem(storageKey+':draft')||crypto.randomUUID();localStorage.setItem(storageKey+':draft',executionId);const r={id:executionId,templateId,quantity:Number(quantity),outputs:outputs.map(o=>({insumoId:o.insumoId,quantity:Number(quantities[o.insumoId]??0)}))};const p=await apiClient.post<Preview>(base+'/preview'+scope,r);setPreview(p);setRequest({...r,previewHash:p.previewHash})})}>Calcular rendimiento y costo</button>
    </div><div className={card}><h3 className="font-bold">Revisión antes de confirmar</h3>{preview?<><Summary value={preview}/><p className="text-sm text-ink-muted-3">La merma queda absorbida en el costo de los resultados. Confirmar modifica existencias y registra el kardex de forma definitiva.</p><button className={primary} disabled={disabled||!request} onClick={()=>run(()=>send(request!))}>Confirmar transformación</button></>:<p className="rounded-lg bg-panel-19 p-3 text-ink-muted-3">Completa las cantidades y calcula para revisar merma, rendimiento y costo promedio resultante.</p>}</div></div>}
    {loaded&&mode==='history'&&<div className={card}><h3 className="font-bold">Ejecuciones confirmadas</h3>{!history.length&&<p>No hay ejecuciones en esta página.</p>}{history.map(h=>{const s=JSON.parse(h.snapshot) as Preview;return <button key={h.id} className={`${button} w-full text-left grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] ${detail?.createdAt===s.createdAt ? "bg-panel-19 ring-2 ring-edge-brand" : ""}`} onClick={()=>setDetail(s)}><span className="min-w-0 break-words">{s.templateName}<small className="block">{new Date(h.createdAt).toLocaleString('es-PE')}</small></span><span className="tabular-nums"><span className="block">{s.source.quantity} {s.source.unit} consumidos</span><span className="block text-ink-muted-3">Rendimiento {s.yieldPct}%</span><strong>{money(s.totalCost)}</strong></span></button>})}<div className="flex gap-2"><button className={button} disabled={skip===0||busy} onClick={()=>setSkip(Math.max(0,skip-50))}>Anterior</button><button className={button} disabled={history.length<50||busy} onClick={()=>setSkip(skip+50)}>Siguiente</button></div></div>}
    {detail&&<div className={card}><div className="flex flex-wrap justify-between gap-3"><h3 className="font-bold">Detalle confirmado · {detail.templateName}</h3><button className={button} onClick={()=>setDetail(null)}>Cerrar detalle</button></div><Summary value={detail}/><p className="text-xs text-ink-muted-3 break-all">{detail.createdAt&&new Date(detail.createdAt).toLocaleString('es-PE')} · Usuario: {detail.actorUserId} · Terminal: {detail.deviceId}</p></div>}
  </section>;
}
function Summary({value:p}:{value:Preview}){
  return <div className="space-y-3">
    <p className="text-[13px] text-ink-muted-3">{p.source.name} · {p.source.quantity} {p.source.unit} consumidos</p>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {[['Costo consumido',money(p.totalCost)],['Rendimiento',`${p.yieldPct}%`],['Merma',`${p.wasteQuantity} ${p.source.unit}`]].map(([label,value])=><div key={label} className="rounded-xl border border-edge-outline-2 bg-panel-19 p-3 min-w-0"><p className="text-xs text-ink-muted-3">{label}</p><strong className="block text-base mt-1 tabular-nums break-words">{value}</strong></div>)}
    </div>
    <div className="hidden 2xl:block overflow-x-auto rounded-xl border border-edge-outline-2">
      <table className="w-full text-sm text-left"><caption className="sr-only">Costos y existencias de los resultados</caption><thead className="bg-panel-19 text-xs text-ink-muted-3"><tr>{['Resultado','Obtenido','Asignado','Costo obtenido / unidad','Promedio final / unidad','Stock final'].map(h=><th key={h} scope="col" className="p-3">{h}</th>)}</tr></thead><tbody>{p.outputs.map(o=><tr key={o.insumoId} className="border-t border-edge-outline-2"><th scope="row" className="p-3 font-semibold">{o.name}<small className="block text-ink-muted-3">Rendimiento {o.yieldPct}%</small></th>{[`${o.quantity} ${o.unit}`,money(o.totalCost),`S/ ${o.unitCost.toFixed(4)}`,`S/ ${o.averageUnitCost.toFixed(4)}`,`${o.stockAfter} ${o.unit}`].map((v,i)=><td key={i} className="p-3 tabular-nums whitespace-nowrap">{v}</td>)}</tr>)}</tbody></table>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 2xl:hidden">{p.outputs.map(o=><div key={o.insumoId} className="rounded-xl border border-edge-outline-2 p-3"><strong className="break-words">{o.name}</strong><p className="text-xs text-ink-muted-3 mt-1">Obtenido: {o.quantity} {o.unit} · Rendimiento {o.yieldPct}%</p><dl className="mt-3 space-y-2 text-sm">{[['Costo asignado',money(o.totalCost)],['Costo obtenido',`S/ ${o.unitCost.toFixed(4)}/${o.unit}`],['Promedio final',`S/ ${o.averageUnitCost.toFixed(4)}/${o.unit}`],['Stock final',`${o.stockAfter} ${o.unit}`]].map(([label,value])=><div key={label} className="flex flex-wrap justify-between gap-x-3 gap-y-1"><dt className="text-ink-muted-3">{label}</dt><dd className="font-semibold tabular-nums">{value}</dd></div>)}</dl></div>)}</div>
  </div>;
}
