import React, {useEffect,useState} from 'react';
import {apiClient} from '../lib/api';
interface Summary {scope:string;updatedAt:string;rows:{id:string;companyId:string;companyName:string;name:string;icon:string;historical:boolean;amount:number}[]}
export function PaymentSummary({companyId,online,revision}:{key?:string;companyId:string;online:boolean;revision:unknown}) {
  const [data,setData]=useState<Summary|null>(null);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    if(!online) return;
    let active=true, busy=false;
    const refresh=async()=>{
      if(busy) return; busy=true; setLoading(true);
      try {const result=await apiClient.get<Summary>('/operations/payment-summary'+(companyId==='todas'?'':'?companyId='+encodeURIComponent(companyId)));if(active){setData(result);setError('');}}
      catch {if(active)setError('No se pudo actualizar el resumen.');}
      finally {busy=false;if(active)setLoading(false);}
    };
    void refresh(); const timer=window.setInterval(refresh,15000);
    return()=>{active=false;window.clearInterval(timer);};
  },[companyId,online,revision,retry]);
  return <section aria-label="Cobros por medio de pago" className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h2 className="text-[15px] font-bold text-ink-strong">Cobros por medio de pago</h2><p className="text-[12px] text-ink-muted">{data?.scope==='accumulated'?'Cobros acumulados':'Cobros del turno'} · Pagos y abonos de ventas</p></div>
      {data && <span className="text-[11px] text-ink-muted tabular-nums inline-block w-44 shrink-0">Actualizado: {new Date(data.updatedAt).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})}</span>}
    </div>
    <div role="status" className="text-[12px] text-ink-muted">{!online?'Sin conexión: actualización pendiente.':error || (!data && loading?'Cargando resumen…':'')}
      {error && online && <button type="button" onClick={()=>setRetry(v=>v+1)} className="ml-3 underline">Reintentar</button>}
    </div>
    {!data && !loading && <p className="text-[12px] text-ink-muted">No hay un resumen confirmado disponible.</p>}
    {data && !data.rows.length && <p className="text-[12px] text-ink-muted">No hay medios de pago distintos de efectivo para mostrar.</p>}
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {data?.rows.map(row=><article key={row.companyId+':'+row.id} className="min-w-0 bg-panel border border-edge-outline-2 rounded-xl p-3 shadow-sm">
        <div className="flex gap-2 items-start"><span aria-hidden="true" className="material-symbols-outlined text-ink-muted">{row.icon||'payments'}</span><div className="min-w-0"><h3 className="text-[13px] font-semibold text-ink-strong break-words">{row.name}</h3>{companyId==='todas'&&<p className="text-[11px] text-ink-muted">{row.companyName}</p>}</div></div>
        <p className="mt-2 text-[22px] font-black text-ink-strong">S/ {row.amount.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2})}</p>
        {row.historical&&<span className="text-[11px] text-ink-muted">Histórico</span>}
      </article>)}
    </div>
  </section>;
}
