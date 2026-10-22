import React, { useEffect, useMemo, useState, useRef } from 'react';
import { usePOS } from '../context/POSContext';
import type { CompanyId, Product, ProductCategory, PendingOp } from '../types';
import { PRODUCT_CATEGORIES, type ProductDraft, productIdOf, uuid, validateProduct } from '../lib/productCatalog';
import { apiClient } from '../lib/api';
import { isBackdropClick, type BackdropPress } from '../lib/modalGesture';
import { loadQueue } from '../lib/offlineQueue';
import { mapProduct, type ProductDTO } from '../lib/catalogMapper';

const inputStyle = 'w-full rounded-xl border border-edge-outline-2 bg-panel-12 px-3 py-2.5 text-sm text-ink-body outline-none focus:border-edge-brand disabled:opacity-60';
const emptyDraft = (companyId: CompanyId): ProductDraft => ({ companyId, name: '', category: 'platos', price: 0, description: '', image: '', available: true });
function ProductImage({ product }: { product: Pick<Product, 'name' | 'image'> }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [product.image]);
  return <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-edge-outline-5 bg-panel-59 flex items-center justify-center">
    {product.image && !failed ? <img src={product.image} alt={product.name} onError={() => setFailed(true)} className="h-full w-full object-cover" />
      : <span className="material-symbols-outlined text-ink-muted-4">restaurant_menu</span>}
  </div>;
}

export const ProductsScreen: React.FC = () => {
  const { products, recipes, companies, activeCompanyId, productPendingOps, productIsSending,
    saveProduct, resolveProductConflict, offlineState, isCatalogsLoading, catalogTarget, setCatalogTarget, setCurrentScreen, setActiveCompanyId } = usePOS();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<ProductCategory | ''>('');
  const [availability, setAvailability] = useState('');
  const [editing, setEditing] = useState<{ id: string; existing: boolean; version?: number; draft: ProductDraft } | null>(null);
  const [discard, setDiscard] = useState(false);
  const initialForm = useRef('');
  const backdropPress = useRef<BackdropPress | null>(null);
  const [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [review, setReview] = useState<{ local: Product; server: Product } | null>(null);
  const [reviewLoading, setReviewLoading] = useState<string | null>(null);
  const pendingById = new Map<string, PendingOp>(productPendingOps.map((op) => [productIdOf(op), op]));
  for (const op of loadQueue()) {
    const payload = op.payload as { productId?: string };
    if (['saveRecipe', 'createRecipe', 'updateRecipe'].includes(op.op) && payload.productId && !pendingById.has(payload.productId)) {
      pendingById.set(payload.productId, op);
    }
  }
  const visible = useMemo(() => products.filter((p) => !p.isDeleted &&
    (activeCompanyId === 'todas' || p.companyId === activeCompanyId) &&
    p.name.toLocaleLowerCase('es').includes(search.trim().toLocaleLowerCase('es')) &&
    (!category || p.category === category) && (!availability || String(p.available) === availability)
  ).sort((a, b) => a.name.localeCompare(b.name, 'es')), [products, activeCompanyId, search, category, availability]);

  const requestClose = () => {
    if (saving) return;
    if (editing && JSON.stringify([editing.draft, price]) !== initialForm.current) { setDiscard(true); return; }
    setEditing(null); setError(''); setDiscard(false);
  };
  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || saving) return;
      if (discard) setDiscard(false);
      else if (editing) requestClose();
      else { setReview(null); setError(''); }
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [saving, editing, price, discard]);

  const open = (product?: Product) => {
    const draft = product ? { companyId: product.companyId, name: product.name, category: product.category,
      price: product.price, image: product.image, description: product.description, available: product.available }
      : emptyDraft(activeCompanyId === 'todas' ? (companies[0]?.id as CompanyId ?? 'el-tayta') : activeCompanyId);
    setEditing({ id: product?.id ?? uuid(), existing: !!product, version: product?.version, draft });
    initialForm.current = JSON.stringify([draft, product ? product.price.toFixed(2) : '']);
    setDiscard(false);
    setPrice(product ? product.price.toFixed(2) : ''); setError(product ? pendingById.get(product.id)?.error ?? '' : '');
  };
  useEffect(() => {
    if (catalogTarget?.action !== 'editProduct') return;
    const product = products.find((p) => p.id === catalogTarget.productId);
    if (product) open(product);
    else setError('El producto vinculado no está disponible.');
    setCatalogTarget(null);
  }, [catalogTarget]);
  const openRecipes = (product: Product, hasRecipe: boolean) => {
    setActiveCompanyId(product.companyId);
    setCatalogTarget({ productId: product.id, action: hasRecipe ? 'viewRecipe' : 'createRecipe' });
    setCurrentScreen('recetas');
  };
  const update = <K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) => {
    setEditing((prev) => prev ? { ...prev, draft: { ...prev.draft, [key]: value } } : null);
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing || saving || productIsSending(editing.id)) return;
    setError(''); setSaving(true);
    try {
      const outcome = await saveProduct(validateProduct({ ...editing.draft, price: Number(price) }), editing.id, editing.version);
      setNotice(outcome === 'saved' ? 'Producto guardado.' : 'Cambio guardado en este equipo. Pendiente de sincronización.');
      setEditing(null);
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar el producto.'); }
    finally { setSaving(false); }
  };
  const openReview = async (local: Product) => {
    setReviewLoading(local.id); setError('');
    try {
      if (offlineState.isSimulatedOffline) throw new Error('Restablezca la conexión para revisar el producto.');
      const data = await apiClient.get<ProductDTO[]>('/catalogs/products');
      const server = data.map(mapProduct).find((p) => p.id === local.id);
      if (!server) throw new Error('El producto no está disponible en el servidor.');
      setReview({ local, server });
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo consultar la versión actual.'); }
    finally { setReviewLoading(null); }
  };
  const resolve = async (choice: 'server' | 'local') => {
    if (!review || saving) return;
    setSaving(true); setError('');
    try {
      await resolveProductConflict(review.local.id, choice);
      setReview(null); setNotice(choice === 'server' ? 'Se conservó la versión del servidor.' : 'Sus cambios se enviarán sobre la versión actual.');
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo resolver el cambio.'); }
    finally { setSaving(false); }
  };

  return <div id="products-screen" className="flex-1 flex flex-col h-full overflow-hidden bg-panel-4 text-ink-body">
    <div className="border-b border-edge-outline-2 bg-panel-21 p-4 md:px-6 shrink-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="flex items-center gap-2 text-[22px] font-black tracking-tight text-ink-brand"><span className="material-symbols-outlined">restaurant_menu</span>Productos</h2>
          <p className="mt-1 text-[13px] text-ink-muted-3">Administra el menú y su disponibilidad.</p></div>
        <button id="btn-new-product" onClick={() => open()} className="flex items-center gap-1.5 rounded-xl bg-surface-brand-solid px-4 py-2.5 text-[13px] font-bold text-ink-on-brand hover:bg-surface-brand-hover-bright"><span className="material-symbols-outlined text-lg">add</span>Nuevo producto</button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <input aria-label="Buscar productos" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre…" className={`${inputStyle} flex-1 min-w-[150px]`} />
        <select aria-label="Categoría" value={category} onChange={(e) => setCategory(e.target.value as ProductCategory | '')} className={`${inputStyle} !w-auto`}><option value="">Todas las categorías</option>{Object.entries(PRODUCT_CATEGORIES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
        <select aria-label="Disponibilidad" value={availability} onChange={(e) => setAvailability(e.target.value)} className={`${inputStyle} !w-auto`}><option value="">Todos los estados</option><option value="true">Disponibles</option><option value="false">No disponibles</option></select>
      </div>
    </div>
    <div className="flex-1 overflow-auto p-4 md:p-6">
      {notice && <p role="status" className="mb-3 text-sm text-ink-success-2">{notice}</p>}
      {error && !editing && !review && <p role="alert" className="mb-3 text-sm text-ink-warning">{error}</p>}
      <div className="overflow-x-auto rounded-xl border border-edge-outline-3">
        <table className="w-full min-w-[690px] text-left text-[13px]"><thead className="bg-panel-41 text-[11px] uppercase tracking-wider text-ink-muted-3"><tr>
          <th className="p-3 font-semibold">Producto</th>{activeCompanyId === 'todas' && <th className="p-3 font-semibold">Empresa</th>}<th className="p-3 font-semibold">Categoría</th><th className="p-3 text-right font-semibold">Precio</th><th className="p-3 font-semibold">Estado</th><th className="p-3 font-semibold">Ficha</th><th className="p-3"><span className="sr-only">Acciones</span></th>
        </tr></thead><tbody className="divide-y divide-edge-outline-6">{visible.map((product) => {
          const pending = pendingById.get(product.id); const busy = productIsSending(product.id);
          const hasRecipe = recipes.some((r) => !r.isDeleted && r.productId === product.id && r.companyId === product.companyId);
          return <tr key={product.id} data-product-id={product.id} className="bg-panel-21 hover:bg-panel-60">
            <td className="p-3"><div className="flex items-center gap-3"><ProductImage product={product} /><div><p className="font-semibold">{product.name}</p><p className={`mt-0.5 text-[11px] ${pending ? 'text-ink-warning-2' : 'text-ink-muted-10'}`}>{busy ? 'Sincronizando…' : pending?.conflict ? 'Cambio en conflicto' : pending?.error ? 'No se pudo guardar' : pending ? 'Pendiente de sincronización' : 'Guardado'}</p></div></div></td>
            {activeCompanyId === 'todas' && <td className="p-3 text-ink-muted-5">{companies.find((c) => c.id === product.companyId)?.tradeName ?? product.companyId}</td>}
            <td className="p-3 text-ink-muted-5">{PRODUCT_CATEGORIES[product.category] ?? product.category}</td><td className="p-3 text-right tabular-nums">S/ {product.price.toFixed(2)}</td>
            <td className="p-3"><span className={`inline-flex rounded-full px-2 py-1 text-[11px] ${product.available ? 'bg-surface-success-strong-11 text-ink-success-2' : 'bg-panel-61 text-ink-muted-11'}`}>{product.available ? 'Disponible' : 'No disponible'}</span></td>
            <td className="p-3 text-[12px] text-ink-muted-11"><button onClick={() => openRecipes(product, hasRecipe)} className="text-ink-brand hover:underline text-left">{hasRecipe ? 'Ver ficha' : 'Crear ficha'}</button><span className="block text-[10px] text-ink-muted-10">{hasRecipe ? 'Con ficha' : 'Sin ficha'}</span></td><td className="p-3 text-right"><button disabled={busy || reviewLoading === product.id} onClick={() => pending?.conflict ? void openReview(product) : open(product)} className="rounded-lg px-3 py-2 font-semibold text-ink-brand hover:bg-surface-brand-solid-8 disabled:opacity-40">{pending?.conflict ? 'Revisar' : pending?.error ? 'Corregir' : 'Editar'}</button></td>
          </tr>;
        })}</tbody></table>
        {!visible.length && <div className="px-5 py-12 text-center text-sm text-ink-muted">{isCatalogsLoading ? 'Cargando productos…' : 'No hay productos para estos filtros.'}</div>}
      </div><p className="mt-3 text-[12px] text-ink-muted-4">{visible.length} {visible.length === 1 ? 'producto' : 'productos'}</p>
    </div>

    {editing && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-surface-scrim-2 p-4" onPointerDown={(e) => { backdropPress.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, onBackdrop: e.target === e.currentTarget && e.button === 0 }; }}
      onPointerCancel={() => { backdropPress.current = null; }}
      onPointerUp={(e) => { const start = backdropPress.current; backdropPress.current = null;
        if (isBackdropClick(start, { pointerId: e.pointerId, x: e.clientX, y: e.clientY, onBackdrop: e.target === e.currentTarget })) requestClose(); }}>
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="product-form-title" className="w-full max-w-xl max-h-[90dvh] overflow-y-auto rounded-2xl border border-edge-outline-2 bg-panel-45 p-5 shadow-2xl">
        <div className="mb-5 flex items-center justify-between"><h3 id="product-form-title" className="text-lg font-bold text-ink-brand">{editing.existing ? 'Editar producto' : 'Nuevo producto'}</h3><button type="button" aria-label="Cerrar formulario" disabled={saving} onClick={requestClose} className="p-1 text-ink-muted-2"><span className="material-symbols-outlined">close</span></button></div>
        {error && <p role="alert" className="mb-4 rounded-xl border border-edge-warning-10 bg-surface-warning-strong-2 p-3 text-sm text-ink-warning">{error}</p>}
        <fieldset disabled={saving} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="text-xs text-ink-muted-2">Empresa<select value={editing.draft.companyId} disabled={editing.existing} onChange={(e) => update('companyId', e.target.value as CompanyId)} className={`${inputStyle} mt-1`}>{companies.map((c) => <option key={c.id} value={c.id}>{c.tradeName}</option>)}</select></label>
          <label className="text-xs text-ink-muted-2">Categoría<select value={editing.draft.category} onChange={(e) => update('category', e.target.value as ProductCategory)} className={`${inputStyle} mt-1`}>{Object.entries(PRODUCT_CATEGORIES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
          <label className="text-xs text-ink-muted-2 sm:col-span-2">Nombre<input autoFocus required maxLength={150} value={editing.draft.name} onChange={(e) => update('name', e.target.value)} className={`${inputStyle} mt-1`} /></label>
          <label className="text-xs text-ink-muted-2">Precio de venta (S/)<input required type="number" inputMode="decimal" min="0.01" max="9999999999.99" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className={`${inputStyle} mt-1`} /></label>
          <label className="flex items-center gap-2 self-center pt-3 text-sm text-ink-muted-2"><input type="checkbox" checked={editing.draft.available} onChange={(e) => update('available', e.target.checked)} className="accent-accent-brand" />Disponible para venta</label>
          <label className="text-xs text-ink-muted-2 sm:col-span-2">Descripción <span className="text-ink-muted-8">(opcional)</span><textarea rows={2} maxLength={500} value={editing.draft.description} onChange={(e) => update('description', e.target.value)} className={`${inputStyle} mt-1 resize-none`} /></label>
          <label className="text-xs text-ink-muted-2 sm:col-span-2">URL de imagen <span className="text-ink-muted-8">(opcional)</span><input type="url" maxLength={1000} placeholder="https://…" value={editing.draft.image} onChange={(e) => update('image', e.target.value)} className={`${inputStyle} mt-1`} /></label>
        </fieldset>
        {recipes.some((r) => r.productId === editing.id && !r.isDeleted) && <p className="mt-4 text-xs leading-relaxed text-ink-muted">Nombre, categoría y precio se actualizarán también en sus fichas técnicas. Los ingredientes se conservan.</p>}
        <div className="mt-6 flex justify-end gap-2"><button type="button" disabled={saving} onClick={requestClose} className="rounded-xl px-4 py-2.5 text-sm text-ink-muted-2">Cancelar</button><button type="submit" disabled={saving || productIsSending(editing.id)} className="rounded-xl bg-surface-brand-solid px-5 py-2.5 text-sm font-bold text-ink-on-brand hover:bg-surface-brand-hover-bright disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar producto'}</button></div>
      </form>
    </div>}

    {discard && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-surface-scrim-4 p-4">
      <div role="alertdialog" aria-modal="true" aria-labelledby="discard-title" className="w-full max-w-sm rounded-2xl border border-edge-outline bg-panel-45 p-5">
        <h3 id="discard-title" className="font-bold text-ink-brand">¿Descartar los cambios?</h3>
        <p className="mt-2 text-sm text-ink-muted-2">Hay cambios sin guardar en este formulario.</p>
        <div className="mt-5 flex justify-end gap-2"><button autoFocus onClick={() => setDiscard(false)} className="rounded-xl px-3 py-2 text-sm">Seguir editando</button>
        <button onClick={() => { setDiscard(false); setEditing(null); setError(''); }} className="rounded-xl bg-surface-brand-solid px-3 py-2 text-sm">Descartar</button></div>
      </div>
    </div>}
    {review && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-surface-scrim-2 p-4"><div role="dialog" aria-modal="true" aria-labelledby="review-title" className="w-full max-w-xl max-h-[90dvh] overflow-y-auto rounded-2xl border border-edge-outline-2 bg-panel-45 p-5">
      <h3 id="review-title" className="text-lg font-bold text-ink-brand">Revisar cambios</h3><p className="mt-2 text-sm text-ink-muted-3">Otra terminal modificó este producto. Elige qué versión conservar.</p>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">{[['Mis cambios', review.local], ['Servidor', review.server]].map(([title, value]) => { const p = value as Product; return <div key={String(title)} className="rounded-xl border border-edge-outline-3 p-3"><h4 className="mb-2 text-xs uppercase text-ink-muted-4">{String(title)}</h4><p className="font-semibold">{p.name}</p><p className="mt-1">S/ {p.price.toFixed(2)} · {PRODUCT_CATEGORIES[p.category]}</p><p className="mt-1 text-xs text-ink-muted-3">{p.available ? 'Disponible' : 'No disponible'}</p><p className="mt-2 text-xs break-words text-ink-muted">{p.description || 'Sin descripción'}</p><p className="mt-1 text-xs break-all text-ink-muted-4">{p.image || 'Sin imagen'}</p></div>; })}</div>
      {error && <p role="alert" className="mt-3 text-sm text-ink-warning">{error}</p>}
      <div className="mt-5 flex flex-wrap justify-end gap-2"><button disabled={saving} onClick={() => { setReview(null); setError(''); }} className="rounded-xl px-3 py-2 text-sm text-ink-muted-2">Volver</button><button disabled={saving} onClick={() => void resolve('server')} className="rounded-xl border border-edge-outline px-3 py-2 text-sm text-ink-muted-2">Conservar servidor</button><button disabled={saving} onClick={() => void resolve('local')} className="rounded-xl bg-surface-brand-solid px-3 py-2 text-sm font-bold text-ink-on-brand">Aplicar mis cambios</button></div>
    </div></div>}
  </div>;
};
