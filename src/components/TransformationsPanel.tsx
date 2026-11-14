import { portionBalance, proposePortions, equivalentTotal } from '../../server/src/lib/portion-math';
import { NumericInput } from './NumericInput';
import { inventoryButton, inventoryPrimary } from '../lib/inventoryUi';
import React, { useEffect, useState } from 'react';
import { usePOS } from '../context/POSContext';
import { usePermission } from '../lib/usePermission';
import { useDialogFocus } from '../lib/useDialogFocus';
import { apiClient, ApiError } from '../lib/api';

type Ingredient = { id:string; name:string; unit:string; currentStock:number; costPerUnit:number };
type Output = { insumoId:string; portions:number; equivalentQuantity:number; equivalentUnit:string };
const definition=(value:string)=>JSON.parse(value);
const isLegacy=(value:string)=>definition(value).version!==3;
const parseDefinition=(value:string):Output[]=>{const d=definition(value);return d.version===3?d.outputs:(Array.isArray(d)?d:d.outputs).map((o:{insumoId:string})=>({insumoId:o.insumoId,portions:0,equivalentQuantity:0,equivalentUnit:'g'}));};
const physical=['kg','g','L','ml'];
const unitsFor=(unit:string)=>['L','ml'].includes(unit)?['L','ml']:['kg','g'];
const balanceOf=(quantity:string|number,unit:string,outputs:{quantity:string|number;equivalentQuantity:string|number;equivalentUnit:string}[],waste?:{quantity:string|number;unit:string})=>{try{return portionBalance(quantity,unit,outputs,waste)}catch{return null}};
type Template = { id:string; name:string; sourceId:string; active:boolean; version:number; definition:string };
type Request = {id:string;templateId:string;quantity:number;outputs:{insumoId:string;quantity:number;equivalentQuantity?:number;equivalentUnit?:string}[];definitionVersion?:3;waste?:{quantity:number;unit:string};previewHash?:string};
type Preview = {previewHash:string;templateName:string;source:{name:string;unit:string;quantity:number;unitCost:number;stockBefore:number;stockAfter:number};definitionVersion?:number;usefulQuantity?:number;calculatedWaste?:number;wasteEdited?:boolean;declaredWaste?:{quantity:number;unit:string}|null;totalCost:number;wasteQuantity:number;yieldPct:number;outputs:{insumoId:string;name:string;quantity:number;unit:string;unitCost:number;totalCost:number;averageUnitCost:number;stockAfter:number;yieldPct:number;equivalentQuantity?:number;equivalentUnit?:string;equivalentTotal?:number;proposedQuantity?:number;referenceEquivalentQuantity?:number;referenceEquivalentUnit?:string}[];actorUserId?:string;deviceId?:string;createdAt?:string};
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
  const blank=()=>({id:crypto.randomUUID(),name:'',sourceId:'',active:true,expectedVersion:0,referenceQuantity:1,outputs:[] as Output[]});
  const [form,setForm]=useState(blank),[templateId,setTemplateId]=useState(''),[quantity,setQuantity]=useState(''),[quantities,setQuantities]=useState<Record<string,string>>({}),[edited,setEdited]=useState(false),[deleting,setDeleting]=useState<Template|null>(null);
  const [equivalents,setEquivalents]=useState<Record<string,string>>({}),[equivalentUnits,setEquivalentUnits]=useState<Record<string,string>>({});
  const [waste,setWaste]=useState<{quantity:string;unit:string}|null>(null);
  const [replacement,setReplacement]=useState<{id:string;quantity:string}|null>(null);
  const [inputRevision,setInputRevision]=useState(0);
  const replacementRef=useDialogFocus(!!replacement);
  const deleteDialogRef=useDialogFocus(!!deleting);
  const [preview,setPreview]=useState<Preview|null>(null),[request,setRequest]=useState<Request|null>(null),[detail,setDetail]=useState<Preview|null>(null);
  const [pending,setPending]=useState<Request|null>(null),[skip,setSkip]=useState(0),[confirmedAbsent,setConfirmedAbsent]=useState(false);
  const selected=templates.find(t=>t.id===templateId);
  const outputs:Output[]=selected?parseDefinition(selected.definition):[];
  const formSource=ingredients.find(i=>i.id===form.sourceId);
  const formBalance=balanceOf(form.referenceQuantity,formSource?.unit??'kg',form.outputs.map(o=>({...o,quantity:o.portions})));
  const source=ingredients.find(i=>i.id===selected?.sourceId);
  const stockInsufficient=!!source && (Number(source.currentStock)<=0 || (!!quantity && Number(quantity)>Number(source.currentStock)));
  const executionOutputs=outputs.map(o=>({insumoId:o.insumoId,quantity:quantities[o.insumoId]??'',equivalentQuantity:equivalents[o.insumoId]??'',equivalentUnit:equivalentUnits[o.insumoId]??o.equivalentUnit}));
  const balance=balanceOf(quantity,source?.unit??'kg',executionOutputs,waste??undefined);
  const invalidBalance=!balance||balance.difference!==0||balance.calculatedWaste<0||balance.usefulQuantity<=0;
  function replaceProposal(id:string,value:string){
    const t=templates.find(t=>t.id===id);const next:Record<string,string>={};
    const eq:Record<string,string>={};const units:Record<string,string>={};
    if(t&&!isLegacy(t.definition))for(const o of parseDefinition(t.definition)){
      try{next[o.insumoId]=value?String(proposePortions(value,definition(t.definition).referenceQuantity,o.portions)):''}catch{next[o.insumoId]=''}
      eq[o.insumoId]=String(o.equivalentQuantity);units[o.insumoId]=o.equivalentUnit;
    }
    setTemplateId(id);setQuantity(value);setQuantities(next);setEquivalents(eq);setEquivalentUnits(units);setWaste(null);setEdited(false);setReplacement(null);invalidate();
  }
  function changeProposal(id:string,value:string){if(edited||waste){setReplacement({id,quantity:value});setInputRevision(v=>v+1)}else replaceProposal(id,value)}
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
  function edit(t:Template){setForm({id:t.id,name:t.name,sourceId:t.sourceId,active:t.active,expectedVersion:t.version,referenceQuantity:definition(t.definition).referenceQuantity??1,outputs:parseDefinition(t.definition)});setMode('templates')}
  const [refreshFailed,setRefreshFailed]=useState(false);
  async function reloadConfirmedInventory(){
    const results=await Promise.allSettled([load(),refreshInventory()]);
    setRefreshFailed(results.some(r=>r.status==='rejected'));
  }
  async function accepted(row:Execution){
    localStorage.removeItem(storageKey);localStorage.removeItem(storageKey+':draft');setPending(null);setConfirmedAbsent(false);setPreview(null);setRequest(null);setQuantity('');setQuantities({});setEquivalents({});setEquivalentUnits({});setWaste(null);setEdited(false);setDetail(JSON.parse(row.snapshot));setNotice('Transformación confirmada. Stock, costos y kardex registrados.');await reloadConfirmedInventory();
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
  const choices=(exclude:string[]=[],portion=false)=><><option value="">Seleccionar insumo</option>{ingredients.filter(i=>!exclude.includes(i.id)&&(portion?i.unit==='Porción':physical.includes(i.unit))).map(i=><option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}</>;
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
      <form className={card} onSubmit={e=>{e.preventDefault();run(async()=>{const saved=await apiClient.post<Template>(base+'/templates'+scope,{...form,definitionVersion:3,outputs:form.outputs});edit(saved);await load();setNotice('Ficha guardada. Las ejecuciones anteriores no cambian.')})}}>
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">{form.expectedVersion?'Editar ficha':'Nueva ficha'}</h3>{form.expectedVersion>0&&<button type="button" className={button+' text-ink-danger-2'} disabled={disabled} onClick={()=>setDeleting(templates.find(t=>t.id===form.id)??null)}>Eliminar ficha</button>}</div>{templates.find(t=>t.id===form.id&&isLegacy(t.definition))&&<p className="rounded-lg bg-panel-19 p-3 text-ink-warning">Esta ficha requiere conversión a porciones. Define el lote de referencia y selecciona resultados con unidad Porción. Los insumos y registros anteriores se conservan.</p>}
        <label className="block">Nombre<input required maxLength={150} className={field} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
        <label className="block">Insumo base<select required className={field} value={form.sourceId} onChange={e=>setForm({...form,sourceId:e.target.value,outputs:form.outputs.map(o=>({...o,equivalentUnit:unitsFor(ingredients.find(i=>i.id===e.target.value)?.unit??'kg')[1]}))})}>{choices()}</select></label>
        <label className="block">Consumo de referencia ({formSource?.unit??'unidad base'})<NumericInput required className={field} min="0.0001" step="0.0001" value={form.referenceQuantity} onChange={e=>setForm({...form,referenceQuantity:Number(e.target.value)})}/></label>
        <p className="text-sm text-ink-muted-3">Crea los resultados desde «Nuevo Insumo» con unidad Porción. Cada equivalencia representa el peso o volumen de una porción.</p>
        {form.outputs.map((o,index)=><div className="rounded-xl border border-edge-outline-2 bg-panel-19 p-3 space-y-2" key={index}>
          <label className="block">Resultado {index+1}<select aria-label={`Resultado ${index+1}`} required className={field} value={o.insumoId} onChange={e=>setForm({...form,outputs:form.outputs.map((r,n)=>n===index?{...r,insumoId:e.target.value}:r)})}>{choices([form.sourceId,...form.outputs.filter((_,n)=>n!==index).map(r=>r.insumoId)],true)}{o.insumoId&&ingredients.find(i=>i.id===o.insumoId)?.unit!=='Porción'&&<option value={o.insumoId} disabled>Selecciona un insumo en Porción</option>}</select></label>
          <div className="grid gap-3 sm:grid-cols-3">
          <label>Porciones<NumericInput required aria-label={`Porciones ${index+1}`} className={field} min="0" step="0.0001" value={o.portions} onChange={e=>setForm({...form,outputs:form.outputs.map((r,n)=>n===index?{...r,portions:Number(e.target.value)}:r)})}/></label>
          <label>Equivalencia por porción<NumericInput required aria-label={`Equivalencia ${index+1}`} className={field} min="0.0001" step="0.0001" value={o.equivalentQuantity} onChange={e=>setForm({...form,outputs:form.outputs.map((r,n)=>n===index?{...r,equivalentQuantity:Number(e.target.value)}:r)})}/></label>
          <label>Unidad<select aria-label={`Unidad equivalente ${index+1}`} className={field} value={o.equivalentUnit} onChange={e=>setForm({...form,outputs:form.outputs.map((r,n)=>n===index?{...r,equivalentUnit:e.target.value}:r)})}>{unitsFor(formSource?.unit??'kg').map(u=><option key={u}>{u}</option>)}</select></label></div>
          <div className="flex flex-wrap justify-between items-center gap-2"><p className="text-ink-muted-3">{o.portions} porciones × {o.equivalentQuantity} {o.equivalentUnit} = {formBalance?.totals[index]??'—'} {formSource?.unit}</p><button type="button" className={button} onClick={()=>setForm({...form,outputs:form.outputs.filter((_,n)=>n!==index)})} aria-label={`Quitar resultado ${index+1}`}>Quitar</button></div>
        </div>)}
        <button type="button" className={button} disabled={disabled||form.outputs.length>=100} onClick={()=>setForm({...form,outputs:[...form.outputs,{insumoId:'',portions:0,equivalentQuantity:0,equivalentUnit:unitsFor(formSource?.unit??'kg')[1]}]})}>Añadir resultado</button>
        <p className="text-ink-muted-3">Cantidad útil: {formBalance?.usefulQuantity??'—'} {formSource?.unit} · Merma prevista: {formBalance?.calculatedWaste??'—'} {formSource?.unit}</p>
        {formBalance&&formBalance.calculatedWaste<0&&<p role="alert" className="text-ink-danger-2">Los resultados superan el consumo de referencia.</p>}
        <label className="flex gap-2 items-center min-h-11"><input type="checkbox" checked={form.active} onChange={e=>setForm({...form,active:e.target.checked})}/>Ficha activa</label>
        <button className={primary} disabled={disabled||!formBalance||formBalance.usefulQuantity<=0||formBalance.calculatedWaste<0||form.outputs.some(o=>!o.insumoId||o.equivalentQuantity<=0||ingredients.find(i=>i.id===o.insumoId)?.unit!=='Porción')}>Guardar ficha</button>
      </form>
    </div>}
    {replacement&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-scrim p-4"><section ref={replacementRef} role="alertdialog" aria-modal="true" aria-labelledby="replace-title" className={card+" w-full max-w-md shadow-xl"} onKeyDown={e=>{if(e.key==='Escape')setReplacement(null)}}><h3 id="replace-title" className="font-bold">Recalcular propuestas</h3><p>Se reemplazarán las porciones, equivalencias y merma que ajustaste por las propuestas de la ficha.</p><div className="flex gap-2"><button className={button} onClick={()=>setReplacement(null)}>Conservar ajustes</button><button className={primary} onClick={()=>replaceProposal(replacement.id,replacement.quantity)}>Recalcular propuestas</button></div></section></div>}
    {deleting&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-scrim p-4"><section ref={deleteDialogRef} role="alertdialog" aria-modal="true" aria-labelledby="delete-template-title" className={card+" w-full max-w-md shadow-xl"} onKeyDown={e=>{if(e.key==='Escape'&&!busy)setDeleting(null)}}><h3 id="delete-template-title" className="font-bold">Eliminar ficha</h3><p>¿Eliminar «{deleting.name}»? Su historial y movimientos se conservarán.</p><div className="flex flex-wrap gap-2"><button className={button} onClick={()=>setDeleting(null)}>Cancelar</button><button className={button+' text-ink-danger-2'} disabled={busy||!online||!manage} onClick={()=>run(async()=>{await apiClient.post(base+'/templates/'+deleting.id+'/delete'+scope,{expectedVersion:deleting.version});if(templateId===deleting.id){setTemplateId('');setQuantities({});invalidate()}setForm(blank());setDeleting(null);await load();setNotice('Ficha eliminada. El historial se conserva.')})}>Eliminar ficha</button></div></section></div>}
    {loaded&&mode==='execute'&&<div className="grid gap-4 lg:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.1fr)]"><div className={card}><h3 className="font-bold flex items-center gap-2"><span aria-hidden="true" className="material-symbols-outlined text-ink-brand">input</span>Insumo consumido</h3>
      <label className="block">Ficha<select aria-label="Ficha" className={field} disabled={disabled} value={templateId} onChange={e=>changeProposal(e.target.value,quantity)}><option value="">Seleccionar ficha</option>{templates.filter(t=>t.active&&!isLegacy(t.definition)).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      {!templates.some(t=>t.active&&!isLegacy(t.definition))&&<p className="text-sm">Primero crea una ficha en la sección Fichas.</p>}
      {source&&<><p className="text-sm text-ink-muted-3">{source.name} · Disponible: {Number(source.currentStock)} {source.unit} · Costo: {money(Number(source.costPerUnit))}/{source.unit}</p><label className="block">Cantidad consumida ({source.unit})<NumericInput key={inputRevision} className={field} disabled={disabled} type="number" min="0.0001" step="0.0001" value={quantity} onChange={e=>changeProposal(templateId,e.target.value)}/></label></>}
      {stockInsufficient&&<p role="alert" className="rounded-lg border border-edge-danger-6 p-3 text-ink-danger-2">Stock insuficiente. Revisa la cantidad consumida o actualiza las existencias.</p>}{outputs.length>0&&<h3 className="font-bold border-t border-edge-outline-2 pt-4">Resultados obtenidos</h3>}{outputs.map((o,index)=>{const i=ingredients.find(i=>i.id===o.insumoId);const actual=executionOutputs[index];return <div className="rounded-lg border border-edge-outline-2 p-3 space-y-2" key={o.insumoId}><h4 className="font-semibold break-words">{i?.name??'Insumo no disponible'}</h4><div className="grid gap-2 sm:grid-cols-3">
      <label>Porciones obtenidas<NumericInput aria-label={`${i?.name} · porciones obtenidas`} className={field} disabled={disabled} min="0" step="0.0001" value={actual.quantity} onChange={e=>{setQuantities({...quantities,[o.insumoId]:e.target.value});setEdited(true);invalidate()}}/></label>
      <label>Por cada porción<NumericInput aria-label={`${i?.name} · equivalencia por porción`} className={field} disabled={disabled} min="0.0001" step="0.0001" value={actual.equivalentQuantity} onChange={e=>{setEquivalents({...equivalents,[o.insumoId]:e.target.value});setEdited(true);invalidate()}}/></label>
      <label>Unidad<select aria-label={`${i?.name} · unidad equivalente`} className={field} disabled={disabled} value={actual.equivalentUnit} onChange={e=>{setEquivalentUnits({...equivalentUnits,[o.insumoId]:e.target.value});setEdited(true);invalidate()}}>{unitsFor(source?.unit??'kg').map(u=><option key={u}>{u}</option>)}</select></label></div>
      <p className="text-ink-muted-3">Total equivalente: {balance?.totals[index]??'—'} {source?.unit} · Referencia: {o.equivalentQuantity} {o.equivalentUnit}/porción</p></div>})}
      {source&&<div className="rounded-lg border border-edge-outline-2 p-3 space-y-2"><h3 className="font-bold">Merma {waste?'editada':'calculada'}</h3><div className="grid gap-2 sm:grid-cols-2"><label>Merma<NumericInput aria-label="Merma" disabled={disabled} className={field} min="0" step="0.0001" value={waste?.quantity??(balance?.calculatedWaste??'')} onChange={e=>{setWaste({quantity:e.target.value,unit:waste?.unit??source.unit});invalidate()}}/></label><label>Unidad de merma<select aria-label="Unidad de merma" disabled={disabled} className={field} value={waste?.unit??source.unit} onChange={e=>{const old=waste??{quantity:String(balance?.calculatedWaste??0),unit:source.unit};try{setWaste({quantity:String(equivalentTotal(1,old.quantity,old.unit,e.target.value)),unit:e.target.value})}catch{setWaste({quantity:'',unit:e.target.value})}invalidate()}}>{unitsFor(source.unit).map(u=><option key={u}>{u}</option>)}</select></label></div>
      {waste&&<button className={button} disabled={disabled} onClick={()=>{setWaste(null);invalidate()}}>Restablecer merma calculada</button>}
      <p className="text-ink-muted-3">Útil: {balance?.usefulQuantity??'—'} {source.unit} · Diferencia de balance: {balance?.difference??'—'} {source.unit}</p>
      {quantity&&invalidBalance&&<p role="alert" className="text-ink-danger-2">Revisa las cantidades: el consumo debe coincidir con los resultados y la merma, con al menos un resultado útil.</p>}</div>}
      {edited&&<p className="text-ink-muted-3">Cantidades ajustadas manualmente respecto a la propuesta.</p>}<button className={primary} disabled={disabled||!selected||!quantity||Number(quantity)<=0||stockInsufficient||invalidBalance} onClick={()=>run(async()=>{const executionId=localStorage.getItem(storageKey+':draft')||crypto.randomUUID();localStorage.setItem(storageKey+':draft',executionId);const r:Request={id:executionId,templateId,quantity:Number(quantity),definitionVersion:3,outputs:executionOutputs.map(o=>({...o,quantity:Number(o.quantity),equivalentQuantity:Number(o.equivalentQuantity)})),...(waste?{waste:{quantity:Number(waste.quantity),unit:waste.unit}}:{})};const p=await apiClient.post<Preview>(base+'/preview'+scope,r);setPreview(p);setRequest({...r,previewHash:p.previewHash})})}>Calcular rendimiento y costo</button>
    </div><div className={card}><h3 className="font-bold">Revisión antes de confirmar</h3>{preview?<><Summary value={preview}/><p className="text-sm text-ink-muted-3">La merma queda absorbida en el costo de los resultados. Confirmar modifica existencias y registra el kardex de forma definitiva.</p><button className={primary} disabled={disabled||!request} onClick={()=>run(()=>send(request!))}>Confirmar transformación</button></>:<p className="rounded-lg bg-panel-19 p-3 text-ink-muted-3">Completa las cantidades y calcula para revisar merma, rendimiento y costo promedio resultante.</p>}</div></div>}
    {loaded&&mode==='history'&&<div className={card}><h3 className="font-bold">Ejecuciones confirmadas</h3>{!history.length&&<p>No hay ejecuciones en esta página.</p>}{history.map(h=>{const s=JSON.parse(h.snapshot) as Preview;return <button key={h.id} className={`${button} w-full text-left grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] ${detail?.createdAt===s.createdAt ? "bg-panel-19 ring-2 ring-edge-brand" : ""}`} onClick={()=>setDetail(s)}><span className="min-w-0 break-words">{s.templateName}<small className="block">{new Date(h.createdAt).toLocaleString('es-PE',{timeZone:'America/Lima'})}</small></span><span className="tabular-nums"><span className="block">{s.source.quantity} {s.source.unit} consumidos</span><span className="block text-ink-muted-3">Rendimiento {s.yieldPct}%</span><strong>{money(s.totalCost)}</strong></span></button>})}<div className="flex gap-2"><button className={button} disabled={skip===0||busy} onClick={()=>setSkip(Math.max(0,skip-50))}>Anterior</button><button className={button} disabled={history.length<50||busy} onClick={()=>setSkip(skip+50)}>Siguiente</button></div></div>}
    {detail&&<div className={card}><div className="flex flex-wrap justify-between gap-3"><h3 className="font-bold">Detalle confirmado · {detail.templateName}</h3><button className={button} onClick={()=>setDetail(null)}>Cerrar detalle</button></div><Summary value={detail}/><p className="text-xs text-ink-muted-3 break-all">{detail.createdAt&&new Date(detail.createdAt).toLocaleString('es-PE',{timeZone:'America/Lima'})} · Usuario: {detail.actorUserId} · Terminal: {detail.deviceId}</p></div>}
  </section>;
}
function Summary({value:p}:{value:Preview}){
  return <div className="space-y-3">
    <p className="text-[13px] text-ink-muted-3">{p.source.name} · {p.source.quantity} {p.source.unit} consumidos</p>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {[['Costo consumido',money(p.totalCost)],['Rendimiento',`${p.yieldPct}%`],['Merma',`${p.wasteQuantity} ${p.source.unit}`]].map(([label,value])=><div key={label} className="rounded-xl border border-edge-outline-2 bg-panel-19 p-3 min-w-0"><p className="text-xs text-ink-muted-3">{label}</p><strong className="block text-base mt-1 tabular-nums break-words">{value}</strong></div>)}
    </div>
    {p.definitionVersion===3&&<div className="rounded-lg border border-edge-outline-2 p-3 space-y-2"><p>Cantidad útil: {p.usefulQuantity} {p.source.unit} · Merma {p.wasteEdited?'editada':'automática'}: {p.wasteQuantity} {p.source.unit}</p>{p.declaredWaste&&<p>Declarada: {p.declaredWaste.quantity} {p.declaredWaste.unit} · Calculada: {p.calculatedWaste} {p.source.unit}</p>}{p.outputs.map(o=><div key={o.insumoId} className="border-t border-edge-outline-2 pt-2"><strong>{o.name}</strong><p>{o.quantity} porciones × {o.equivalentQuantity} {o.equivalentUnit} = {o.equivalentTotal} {p.source.unit}</p><p className="text-xs text-ink-muted-3">Propuesta: {o.proposedQuantity} porciones · Referencia: {o.referenceEquivalentQuantity} {o.referenceEquivalentUnit}/porción</p></div>)}</div>}
    <div className="hidden 2xl:block overflow-x-auto rounded-xl border border-edge-outline-2">
      <table className="w-full text-sm text-left"><caption className="sr-only">Costos y existencias de los resultados</caption><thead className="bg-panel-19 text-xs text-ink-muted-3"><tr>{['Resultado','Obtenido','Asignado','Costo obtenido / unidad','Promedio final / unidad','Stock final'].map(h=><th key={h} scope="col" className="p-3">{h}</th>)}</tr></thead><tbody>{p.outputs.map(o=><tr key={o.insumoId} className="border-t border-edge-outline-2"><th scope="row" className="p-3 font-semibold">{o.name}<small className="block text-ink-muted-3">Rendimiento {o.yieldPct}%</small></th>{[`${o.quantity} ${o.unit}`,money(o.totalCost),`S/ ${o.unitCost.toFixed(4)}`,`S/ ${o.averageUnitCost.toFixed(4)}`,`${o.stockAfter} ${o.unit}`].map((v,i)=><td key={i} className="p-3 tabular-nums whitespace-nowrap">{v}</td>)}</tr>)}</tbody></table>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 2xl:hidden">{p.outputs.map(o=><div key={o.insumoId} className="rounded-xl border border-edge-outline-2 p-3"><strong className="break-words">{o.name}</strong><p className="text-xs text-ink-muted-3 mt-1">Obtenido: {o.quantity} {o.unit} · Rendimiento {o.yieldPct}%</p><dl className="mt-3 space-y-2 text-sm">{[['Costo asignado',money(o.totalCost)],['Costo obtenido',`S/ ${o.unitCost.toFixed(4)}/${o.unit}`],['Promedio final',`S/ ${o.averageUnitCost.toFixed(4)}/${o.unit}`],['Stock final',`${o.stockAfter} ${o.unit}`]].map(([label,value])=><div key={label} className="flex flex-wrap justify-between gap-x-3 gap-y-1"><dt className="text-ink-muted-3">{label}</dt><dd className="font-semibold tabular-nums">{value}</dd></div>)}</dl></div>)}</div>
  </div>;
}
