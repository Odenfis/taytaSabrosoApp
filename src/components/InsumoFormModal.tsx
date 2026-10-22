import React, { useEffect, useRef, useState } from 'react';
import { usePOS } from '../context/POSContext';
import type { Insumo } from '../types';
import { type InsumoDraft, insumoIsSending, insumoPending, insumoIdOf } from '../lib/insumoCatalog';
import { uuid } from '../lib/productCatalog';

export function InsumoFormModal({ original, onClose, onSaved }: { original?: Insumo; onClose: () => void; onSaved: (message: string) => void }) {
  const { activeCompanyId, companies, saveInsumo } = usePOS();
  const [id] = useState(() => original?.id ?? uuid());
  const [draft, setDraft] = useState<InsumoDraft>(() => original ? { ...original } : {
    companyId: activeCompanyId === 'todas' ? 'ambas' : activeCompanyId, name: '', category: 'Carnes & Aves', unit: 'kg', currentStock: 0, minStock: 5, costPerUnit: 0,
  });
  const initial = useRef(JSON.stringify(draft));
  const [error, setError] = useState(''); const [saving, setSaving] = useState(false); const [discard, setDiscard] = useState(false);
  const canEditBase = !original || original.canEditBase === true;
  const close = () => { if (saving) return; if (initial.current !== JSON.stringify(draft)) setDiscard(true); else onClose(); };
  useEffect(() => { const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); close(); } }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, [draft, saving]);
  const set = (key: keyof InsumoDraft, value: string | number) => setDraft((prev) => ({ ...prev, [key]: value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setSaving(true);
    try { const result = await saveInsumo(draft, original, id); onSaved(result === 'saved' ? 'Insumo guardado.' : 'Cambio guardado en este equipo. Pendiente de sincronizar.'); onClose(); }
    catch (err) {
      const retained = insumoPending().some((op) => insumoIdOf(op) === id && op.error);
      if (retained) initial.current = JSON.stringify(draft);
      setError((err as Error).message + (retained ? ' El cambio se conserva; cierre este formulario y use Revisar en la lista.' : ''));
    } finally { setSaving(false); }
  };
  const input = 'w-full bg-panel-12 border border-edge-outline-2 rounded-xl px-3 py-2 text-sm text-ink-strong disabled:opacity-50';
  return <div className="fixed inset-0 bg-surface-scrim backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <section role="dialog" aria-modal="true" aria-label={original ? 'Editar insumo' : 'Nuevo insumo'} className="bg-panel-14 border border-edge-outline rounded-2xl w-full max-w-lg p-5 shadow-2xl max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-bold text-ink-brand">{original ? 'Editar insumo' : 'Nuevo insumo'}</h3><button type="button" onClick={close} aria-label="Cerrar formulario" disabled={saving}>✕</button></div>
      <form onSubmit={submit}><fieldset disabled={saving} className="space-y-4">
        <div><label htmlFor="ins-name">Nombre del insumo</label><input id="ins-name" autoFocus required maxLength={150} value={draft.name} onChange={(e) => set('name', e.target.value)} className={input}/></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label htmlFor="ins-company">Empresa</label><select id="ins-company" disabled={!!original} value={draft.companyId} onChange={(e) => set('companyId', e.target.value)} className={input}>{companies.map((c) => <option key={c.id} value={c.id}>{c.tradeName}</option>)}<option value="ambas">Ambas (compartido)</option></select></div>
          <div><label htmlFor="ins-category">Categoría</label><select id="ins-category" value={draft.category} onChange={(e) => set('category', e.target.value)} className={input}>{['Carnes & Aves', 'Pescados & Mariscos', 'Verduras & Frutas', 'Abarrotes & Especias', 'Bebidas & Licores', 'Lácteos & Huevos'].map((c) => <option key={c}>{c}</option>)}</select></div>
        </div>
        {original && <p className="text-xs text-ink-muted-2">Código: {original.code} · Última compra: {original.lastPurchaseDate || 'Sin compras'}</p>}
        <div className="grid grid-cols-2 gap-3">
          <div><label htmlFor="ins-unit">Unidad de medida</label><select id="ins-unit" disabled={!canEditBase} value={draft.unit} onChange={(e) => set('unit', e.target.value)} className={input}>{['kg', 'g', 'L', 'ml', 'un', 'bot'].map((u) => <option key={u}>{u}</option>)}</select></div>
          <div><label htmlFor="ins-cost">{original ? 'Costo por unidad (S/)' : 'Costo inicial por unidad (S/)'}</label><input id="ins-cost" type="number" min="0" max="99999999.9999" step="0.0001" required disabled={!canEditBase} value={Number.isFinite(draft.costPerUnit) ? draft.costPerUnit : ''} onChange={(e) => set('costPerUnit', e.target.value === '' ? NaN : Number(e.target.value))} className={input}/></div>
          <div><label htmlFor="ins-stock">{original ? 'Stock actual (solo lectura)' : 'Stock inicial'}</label><input id="ins-stock" type="number" min="0" max="99999999.9999" step="0.0001" required disabled={!!original} value={Number.isFinite(draft.currentStock) ? draft.currentStock : ''} onChange={(e) => set('currentStock', e.target.value === '' ? NaN : Number(e.target.value))} className={input}/></div>
          <div><label htmlFor="ins-min">Stock mínimo</label><input id="ins-min" type="number" min="0" max="99999999.9999" step="0.0001" required value={Number.isFinite(draft.minStock) ? draft.minStock : ''} onChange={(e) => set('minStock', e.target.value === '' ? NaN : Number(e.target.value))} className={input}/></div>
        </div>
        {original && <p className="text-xs text-ink-muted-2">Las existencias se modifican mediante compras, despachos y Ajuste / Merma.{!canEditBase && ' Unidad y costo inicial están protegidos porque el insumo tiene stock o referencias.'}</p>}
        {error && <p role="alert" className="text-sm text-ink-danger-2">{error}</p>}
        <div className="flex justify-end gap-3 border-t border-edge-outline pt-3"><button type="button" onClick={close} disabled={saving}>Cancelar</button><button type="submit" disabled={saving || insumoIsSending(id)} className="px-4 py-2 rounded-xl bg-surface-brand-solid text-ink-on-brand disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar insumo'}</button></div>
      </fieldset></form>
      {discard && <div role="alertdialog" aria-label="Descartar cambios" className="mt-4 p-4 border border-edge-warning rounded-xl"><p>Hay cambios sin guardar. ¿Desea descartarlos?</p><div className="flex gap-4 mt-3"><button onClick={() => setDiscard(false)}>Seguir editando</button><button onClick={onClose}>Descartar</button></div></div>}
    </section>
  </div>;
}
