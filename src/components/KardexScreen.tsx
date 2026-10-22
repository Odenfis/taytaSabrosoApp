import { loadQueue } from '../lib/offlineQueue';
import type { PendingOp } from '../types';
import { InsumoFormModal } from './InsumoFormModal';
import { isInventoryDependencyIssue, insumoPending, insumoIdOf, insumoIsSending, insumoSelectable, INSUMO_QUEUE_EVENT } from '../lib/insumoCatalog';
import { apiClient } from '../lib/api';
import { type InsumoDTO, mapInsumo } from '../lib/catalogMapper';
import React, { useState, useMemo, useEffect, useLayoutEffect, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import { usePOS } from '../context/POSContext';
import { Insumo, KardexMovementType, CompanyId } from '../types';

type ActionMenuItem = { label: string; icon: string; disabled?: boolean; danger?: boolean; run: () => void };

function InsumoActionsMenu({ id, anchor, name, items, onClose, focusLast }: {
  id: string; anchor: HTMLButtonElement; name: string; items: ActionMenuItem[];
  onClose: () => void; focusLast: boolean;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  useLayoutEffect(() => {
    const menu = menuRef.current!;
    const rect = anchor.getBoundingClientRect();
    const { width, height } = menu.getBoundingClientRect();
    const below = rect.bottom + 6;
    setPosition({
      left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(below + height <= window.innerHeight - 8 ? below : rect.top - height - 6, window.innerHeight - height - 8)),
    });
    const buttons = menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
    buttons[focusLast ? buttons.length - 1 : 0]?.focus({ preventScroll: true });
  }, [anchor, focusLast]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node) && !anchor.contains(event.target as Node)) onClose();
    };
    const scroll = (event: Event) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', onClose);
    };
  }, [anchor, onClose]);
  return createPortal(
    <div ref={menuRef} id={id} role="menu" aria-label={`Acciones de ${name}`}
      style={position}
      className="fixed z-40 w-52 max-w-[calc(100vw-16px)] max-h-[calc(100dvh-16px)] overflow-y-auto rounded-xl border border-edge-outline-2 bg-panel-18 p-1 shadow-xl text-[13px] text-ink-muted-2"
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node) && event.relatedTarget !== anchor) onClose(); }}
      onKeyDown={(event) => {
        const buttons = Array.from((event.currentTarget as HTMLDivElement).querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (event.key === 'Escape' || event.key === 'Tab') {
          if (event.key === 'Escape') event.preventDefault();
          anchor.focus({ preventScroll: true });
          onClose();
        } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
          buttons[next]?.focus();
        }
      }}>
      {items.map((item) => <React.Fragment key={item.label}>
        {item.danger && <div role="separator" className="mx-2 my-1 border-t border-edge-outline-3" />}
        <button type="button" role="menuitem" tabIndex={-1} disabled={item.disabled}
          onClick={() => { onClose(); item.run(); }}
          className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-panel-19 focus-visible:bg-panel-19 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-edge-brand-2 disabled:opacity-40 disabled:hover:bg-transparent ${item.danger ? 'text-ink-danger-2' : ''}`}>
          <span aria-hidden="true" className="material-symbols-outlined !text-[18px]">{item.icon}</span>{item.label}
        </button>
      </React.Fragment>)}
    </div>, document.body);
}

export const KardexScreen: React.FC = () => {
  const {
    insumos,
    kardexMovements,
    activeCompanyId,
    activeCompany,
    addKardexAdjustment,
    deleteInsumo,
    resolveInsumoConflict,
    discardInventoryDependency,
    setCurrentScreen,
  } = usePOS();

  const actionsMenuId = useId();
  const [actionsMenu, setActionsMenu] = useState<{ insumoId: string; anchor: HTMLButtonElement; focusLast: boolean } | null>(null);
  const closeActionsMenu = React.useCallback(() => setActionsMenu(null), []);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('todas');
  const [activeTab, setActiveTab] = useState<'stock' | 'movimientos'>('stock');
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [isAddInsumoModalOpen, setIsAddInsumoModalOpen] = useState(false);

  // Adjustment form state
  const [adjustInsumoId, setAdjustInsumoId] = useState('');
  const [adjustType, setAdjustType] = useState<'AJUSTE_MERMA' | 'ENTRADA_COMPRA'>('AJUSTE_MERMA');
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustReason, setAdjustReason] = useState('');

  const [editing, setEditing] = useState<Insumo | undefined>();
  const [deleting, setDeleting] = useState<Insumo | null>(null);
  const [actionError, setActionError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(insumoPending);
  const [dependencies, setDependencies] = useState(() => loadQueue().filter(isInventoryDependencyIssue));
  const [dependency, setDependency] = useState<PendingOp | null>(null);
  const [discardDependency, setDiscardDependency] = useState(false);
  const [review, setReview] = useState<{ local: Insumo; server?: Insumo } | null>(null);
  useEffect(() => { const update = () => { setPending(insumoPending()); setDependencies(loadQueue().filter(isInventoryDependencyIssue)); }; window.addEventListener(INSUMO_QUEUE_EVENT, update); return () => window.removeEventListener(INSUMO_QUEUE_EVENT, update); }, []);
  const reviewInsumo = async (insumo: Insumo) => {
    setActionError(''); setActionBusy(true);
    try { const rows = await apiClient.get<InsumoDTO[]>('/catalogs/insumos'); setReview({ local: insumo, server: rows.find((i) => i.id === insumo.id) ? mapInsumo(rows.find((i) => i.id === insumo.id)!) : undefined }); }
    catch (error) { setActionError((error as Error).message); } finally { setActionBusy(false); }
  };
  const resolve = async (choice: 'server' | 'local') => {
    if (!review) return; setActionBusy(true); setActionError('');
    try { await resolveInsumoConflict(review.local.id, choice); setReview(null); setNotice(choice === 'server' ? 'Cambio pendiente descartado; datos actuales recuperados.' : 'Cambio enviado para una nueva validación.'); }
    catch (error) { setActionError((error as Error).message); } finally { setActionBusy(false); }
  };
  const confirmDelete = async () => {
    if (!deleting) return; setActionBusy(true); setActionError('');
    try { const result = await deleteInsumo(deleting); setNotice(result === 'saved' ? 'Insumo eliminado del catálogo operativo. El historial se conserva.' : 'Eliminación pendiente de sincronizar y validar.'); setDeleting(null); }
    catch (error) { setActionError((error as Error).message); } finally { setActionBusy(false); }
  };

  // Filtered insumos by company and search
  const filteredInsumos = useMemo(() => {
    return insumos.filter((ins) => {
      const matchCompany =
        activeCompanyId === 'todas' ||
        ins.companyId === 'ambas' ||
        ins.companyId === activeCompanyId;

      const matchCategory =
        selectedCategory === 'todas' || ins.category === selectedCategory;

      const matchSearch =
        ins.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ins.code.toLowerCase().includes(searchTerm.toLowerCase());

      return matchCompany && matchCategory && matchSearch;
    });
  }, [insumos, activeCompanyId, selectedCategory, searchTerm]);

  useEffect(() => { setActionsMenu(null); }, [searchTerm, selectedCategory, activeCompanyId, activeTab]);
  const menuInsumo = actionsMenu ? filteredInsumos.find((ins) => ins.id === actionsMenu.insumoId) : undefined;
  useEffect(() => { if (!menuInsumo) setActionsMenu(null); }, [menuInsumo]);

  // Filtered Kardex movements
  const filteredMovements = useMemo(() => {
    return kardexMovements.filter((m) => {
      const matchCompany =
        activeCompanyId === 'todas' || m.companyId === activeCompanyId;
      const matchSearch =
        m.insumoName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.referenceDoc.toLowerCase().includes(searchTerm.toLowerCase());
      return matchCompany && matchSearch;
    });
  }, [kardexMovements, activeCompanyId, searchTerm]);

  // Valued stock totals
  const totalValuedStock = useMemo(() => {
    return filteredInsumos.reduce((acc, ins) => acc + ins.currentStock * ins.costPerUnit, 0);
  }, [filteredInsumos]);

  const lowStockCount = useMemo(() => {
    return filteredInsumos.filter((ins) => ins.currentStock <= ins.minStock).length;
  }, [filteredInsumos]);

  const handleSaveAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustInsumoId || !adjustQty || parseFloat(adjustQty) <= 0) return;
    addKardexAdjustment(
      adjustInsumoId,
      parseFloat(adjustQty),
      adjustType,
      adjustReason || 'Ajuste de inventario físico'
    );
    setIsAdjustModalOpen(false);
    setAdjustQty('');
    setAdjustReason('');
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-panel-20 text-ink-body overflow-hidden">
      {/* Header bar with metrics */}
      <div className="bg-panel-21 border-b border-edge-outline-2 p-4 md:px-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-ink-brand text-[26px]">
                inventory_2
              </span>
              <h2 className="text-[22px] font-black text-ink-brand tracking-tight">
                Kardex e Inventario de Insumos
              </h2>
              <span className="text-[12px] font-bold px-2 py-0.5 rounded-full bg-surface-tinted text-ink-gold border border-edge-gold-5">
                {activeCompany.tradeName}
              </span>
            </div>
            <p className="text-[13px] text-ink-muted-5 mt-0.5">
              Control de stock físico en tiempo real con descarga automática por recetas desde el POS.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setIsAdjustModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-panel-7 hover:bg-panel-8 text-ink-muted-2 hover:text-ink-strong border border-edge-outline-2 text-[13px] font-bold transition-all shadow-sm"
            >
              <span className="material-symbols-outlined text-[18px]">tune</span>
              <span>Ajuste / Merma</span>
            </button>

            <button
              onClick={() => { setEditing(undefined); setIsAddInsumoModalOpen(true); }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-brand-solid hover:bg-surface-brand-hover-bright text-ink-on-brand font-bold text-[13px] transition-all shadow-md"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              <span>Nuevo Insumo</span>
            </button>
          </div>
        </div>

        {/* Metrics Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <div className="bg-panel-9 p-3 rounded-xl border border-edge-outline-3">
            <p className="text-[11px] font-semibold text-ink-muted-3 uppercase">Insumos Registrados</p>
            <p className="text-[20px] font-black text-ink-strong mt-0.5">{filteredInsumos.length}</p>
          </div>

          <div className="bg-panel-9 p-3 rounded-xl border border-edge-outline-3">
            <p className="text-[11px] font-semibold text-ink-muted-3 uppercase">Stock Valorado Total</p>
            <p className="text-[20px] font-black text-ink-gold mt-0.5">
              S/ {totalValuedStock.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>

          <div className="bg-panel-9 p-3 rounded-xl border border-edge-outline-3">
            <p className="text-[11px] font-semibold text-ink-muted-3 uppercase">Insumos en Alerta</p>
            <p className={`text-[20px] font-black mt-0.5 ${lowStockCount > 0 ? 'text-ink-danger-3' : 'text-ink-success'}`}>
              {lowStockCount} {lowStockCount > 0 ? 'por reponer' : 'óptimo'}
            </p>
          </div>

          <div className="bg-panel-9 p-3 rounded-xl border border-edge-outline-3">
            <p className="text-[11px] font-semibold text-ink-muted-3 uppercase">Movimientos Hoy</p>
            <p className="text-[20px] font-black text-ink-info mt-0.5">{filteredMovements.length}</p>
          </div>
        </div>
      </div>

      {/* Tabs and filters */}
      <div className="p-4 md:px-6 flex flex-col md:flex-row gap-3 items-center justify-between border-b border-edge-outline-5 bg-panel-22">
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="bg-panel-14 p-1 rounded-xl border border-edge-outline-2 flex gap-1">
            <button
              onClick={() => setActiveTab('stock')}
              className={`px-3 py-1.5 rounded-lg text-[13px] font-bold transition-all ${
                activeTab === 'stock'
                  ? 'bg-surface-brand-solid text-ink-on-brand shadow'
                  : 'text-ink-muted-3 hover:text-ink-strong'
              }`}
            >
              Existencias Físicas ({filteredInsumos.length})
            </button>
            <button
              onClick={() => setActiveTab('movimientos')}
              className={`px-3 py-1.5 rounded-lg text-[13px] font-bold transition-all ${
                activeTab === 'movimientos'
                  ? 'bg-surface-brand-solid text-ink-on-brand shadow'
                  : 'text-ink-muted-3 hover:text-ink-strong'
              }`}
            >
              Movimientos Kardex ({filteredMovements.length})
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto flex-wrap">
          {/* Search bar */}
          <div className="relative flex-1 md:w-64">
            <span className="material-symbols-outlined absolute left-3 top-2.5 text-ink-muted text-[18px]">
              search
            </span>
            <input
              type="text"
              placeholder="Buscar insumo, código o guía..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-panel-14 border border-edge-outline-2 rounded-xl pl-9 pr-3 py-1.5 text-[13px] text-ink-strong focus:outline-none focus:border-edge-brand"
            />
          </div>

          {activeTab === 'stock' && (
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-panel-14 border border-edge-outline-2 rounded-xl px-3 py-1.5 text-[13px] text-ink-muted-2 focus:outline-none focus:border-edge-brand"
            >
              <option value="todas">Todas las categorías</option>
              <option value="Carnes & Aves">Carnes &amp; Aves</option>
              <option value="Pescados & Mariscos">Pescados &amp; Mariscos</option>
              <option value="Verduras & Frutas">Verduras &amp; Frutas</option>
              <option value="Abarrotes & Especias">Abarrotes &amp; Especias</option>
              <option value="Bebidas & Licores">Bebidas &amp; Licores</option>
              <option value="Lácteos & Huevos">Lácteos &amp; Huevos</option>
            </select>
          )}
        </div>
      </div>

      {notice && <p role="status" className="mx-6 my-2 text-sm text-ink-success-2">{notice}</p>}
      {actionError && !deleting && !review && <p role="alert" className="mx-6 my-2 text-sm text-ink-danger-2">{actionError}</p>}
      {pending.length > 0 && <p className="mx-6 my-2 text-sm text-ink-warning">{pending.length} cambio(s) de insumos pendiente(s). Las eliminaciones se vuelven a validar al sincronizar.</p>}
      {dependencies.map((op) => <div key={op.clientOpId} className="mx-6 my-2 text-sm text-ink-warning">Operación vinculada pendiente: {op.error} <button className="underline" onClick={() => { setDependency(op); setDiscardDependency(false); setActionError(''); }}>Revisar operación</button></div>)}
      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-4 md:px-6 custom-scrollbar">
        {activeTab === 'stock' ? (
          <div className="bg-panel-23 rounded-2xl border border-edge-outline-3 overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-panel-24 text-ink-muted-2 font-bold border-b border-edge-outline-2">
                  <tr>
                    <th className="p-3.5 pl-4">Código</th>
                    <th className="p-3.5">Insumo</th>
                    <th className="p-3.5">Categoría</th>
                    <th className="p-3.5">Empresa</th>
                    <th className="p-3.5 text-right">Stock Actual</th>
                    <th className="p-3.5 text-right">Stock Mínimo</th>
                    <th className="p-3.5 text-right">Costo Unit.</th>
                    <th className="p-3.5 text-right">Valorizado</th>
                    <th className="p-3.5 text-center">Estado</th>
                    <th className="p-3.5 pr-4 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge-outline-6 text-ink-body">
                  {filteredInsumos.length === 0 && <tr><td colSpan={10} className="p-6 text-center text-ink-muted-2">No hay insumos que coincidan con los filtros.</td></tr>}
                  {filteredInsumos.map((ins) => {
                    const isLow = ins.currentStock <= ins.minStock;
                    const isCritical = ins.currentStock <= ins.minStock * 0.5;
                    const valued = +(ins.currentStock * ins.costPerUnit).toFixed(2);

                    return (
                      <tr key={ins.id} className="hover:bg-panel-25 transition-colors">
                        <td className="p-3 pl-4 font-mono text-ink-muted-3">{ins.code}</td>
                        <td className="p-3 font-semibold text-ink-strong">
                          <div>{ins.name}</div>
                          <span className="text-[11px] text-ink-muted">
                            Últ. Compra: {ins.lastPurchaseDate}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded-lg bg-panel-26 text-ink-muted-2 text-[11px] font-medium border border-edge-outline-5">
                            {ins.category}
                          </span>
                        </td>
                        <td className="p-3">
                          <span
                            className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                              ins.companyId === 'el-tayta'
                                ? 'bg-surface-brand-solid-2 text-ink-heading-brand'
                                : ins.companyId === 'el-sabroso'
                                ? 'bg-surface-gold text-ink-gold'
                                : 'bg-panel-27 text-ink-strong'
                            }`}
                          >
                            {ins.companyId === 'el-tayta'
                              ? 'El Tayta'
                              : ins.companyId === 'el-sabroso'
                              ? 'El Sabroso'
                              : 'Ambas'}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-[14px]">
                          {ins.currentStock} {ins.unit}
                        </td>
                        <td className="p-3 text-right font-mono text-ink-muted-3">
                          {ins.minStock} {ins.unit}
                        </td>
                        <td className="p-3 text-right font-mono text-ink-muted-2">
                          S/ {ins.costPerUnit.toFixed(2)}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-ink-gold">
                          S/ {valued.toFixed(2)}
                        </td>
                        <td className="p-3 text-center">
                          {isCritical ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-danger-strong text-ink-danger-2 border border-edge-danger-5 text-[11px] font-black">
                              <span className="w-1.5 h-1.5 rounded-full bg-surface-danger-4 animate-pulse" />
                              Crítico
                            </span>
                          ) : isLow ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-warning-strong text-ink-warning-2 border border-edge-warning-2 text-[11px] font-bold">
                              <span className="w-1.5 h-1.5 rounded-full bg-surface-warning" />
                              Reponer
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-success-strong text-ink-success-2 border border-edge-success text-[11px] font-semibold">
                              <span className="w-1.5 h-1.5 rounded-full bg-surface-success" />
                              Óptimo
                            </span>
                          )}
                        </td>
                        <td className="p-3 pr-4 text-right">
                          <button type="button"
                            aria-label={`Acciones de ${ins.name}`} title={`Acciones de ${ins.name}`}
                            aria-haspopup="menu" aria-expanded={actionsMenu?.insumoId === ins.id}
                            aria-controls={actionsMenu?.insumoId === ins.id ? actionsMenuId : undefined}
                            onClick={(event) => setActionsMenu(actionsMenu?.insumoId === ins.id ? null : { insumoId: ins.id, anchor: event.currentTarget, focusLast: false })}
                            onKeyDown={(event) => {
                              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                                event.preventDefault();
                                setActionsMenu({ insumoId: ins.id, anchor: event.currentTarget, focusLast: event.key === 'ArrowUp' });
                              }
                            }}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg align-middle text-ink-muted-2 transition-colors hover:bg-panel-28 hover:text-ink-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-edge-brand-2 aria-expanded:bg-panel-28 aria-expanded:text-ink-brand">
                            <span aria-hidden="true" className="material-symbols-outlined !text-[20px]">more_horiz</span>
                          </button>
                          {pending.filter((p) => insumoIdOf(p) === ins.id).map((p) => <div key={p.clientOpId} className="text-xs text-ink-warning mt-1">
                            {p.error || (p.op === 'deleteInsumo' ? 'Eliminación pendiente' : 'Pendiente de sincronizar')}
                            {p.error && <button className="underline ml-2" disabled={actionBusy} onClick={() => void reviewInsumo(ins)}>Revisar</button>}
                          </div>)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-panel-23 rounded-2xl border border-edge-outline-3 overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-panel-24 text-ink-muted-2 font-bold border-b border-edge-outline-2">
                  <tr>
                    <th className="p-3.5 pl-4">Hora</th>
                    <th className="p-3.5">Insumo</th>
                    <th className="p-3.5">Tipo de Movimiento</th>
                    <th className="p-3.5">Referencia / Comanda</th>
                    <th className="p-3.5 text-right">Cantidad</th>
                    <th className="p-3.5 text-right">Costo Unit.</th>
                    <th className="p-3.5 text-right">Total</th>
                    <th className="p-3.5 text-right">Saldo Ant.</th>
                    <th className="p-3.5 pr-4 text-right">Nuevo Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge-outline-6 text-ink-body">
                  {filteredMovements.map((mov) => {
                    const isEntrada = mov.quantity > 0;
                    return (
                      <tr key={mov.id} className="hover:bg-panel-25 transition-colors">
                        <td className="p-3 pl-4 font-mono text-[12px] text-ink-muted-3">
                          {mov.time}
                        </td>
                        <td className="p-3 font-semibold text-ink-strong">{mov.insumoName}</td>
                        <td className="p-3">
                          <span
                            className={`text-[11px] font-bold px-2 py-0.5 rounded-md inline-flex items-center gap-1 ${
                              mov.type === 'ENTRADA_COMPRA'
                                ? 'bg-surface-success-strong-2 text-ink-success-2 border border-edge-success'
                                : mov.type === 'SALIDA_VENTA_POS'
                                ? 'bg-surface-info-strong text-ink-info-2 border border-edge-info-4'
                                : mov.type === 'AJUSTE_MERMA'
                                ? 'bg-surface-danger-strong-2 text-ink-danger-2 border border-edge-danger-6'
                                : 'bg-surface-neutral text-ink-neutral'
                            }`}
                          >
                            <span className="material-symbols-outlined text-[14px]">
                              {mov.type === 'ENTRADA_COMPRA'
                                ? 'arrow_downward'
                                : mov.type === 'SALIDA_VENTA_POS'
                                ? 'shopping_bag'
                                : 'warning'}
                            </span>
                            {mov.type === 'ENTRADA_COMPRA'
                              ? 'Entrada Compra'
                              : mov.type === 'SALIDA_VENTA_POS'
                              ? 'Salida Venta POS'
                              : mov.type === 'AJUSTE_MERMA'
                              ? 'Ajuste / Merma'
                              : 'Inventario Inicial'}
                          </span>
                        </td>
                        <td className="p-3 text-ink-muted-6 text-[12px] font-medium">
                          {mov.referenceDoc}
                        </td>
                        <td
                          className={`p-3 text-right font-mono font-bold ${
                            isEntrada ? 'text-ink-success' : 'text-ink-danger-3'
                          }`}
                        >
                          {isEntrada ? `+${mov.quantity}` : mov.quantity} {mov.unit}
                        </td>
                        <td className="p-3 text-right font-mono text-ink-muted-2">
                          S/ {mov.unitCost.toFixed(2)}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-ink-strong">
                          S/ {mov.totalCost.toFixed(2)}
                        </td>
                        <td className="p-3 text-right font-mono text-ink-muted-3">
                          {mov.stockBefore} {mov.unit}
                        </td>
                        <td className="p-3 pr-4 text-right font-mono font-bold text-ink-gold">
                          {mov.stockAfter} {mov.unit}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {actionsMenu && menuInsumo && <InsumoActionsMenu
        id={actionsMenuId} anchor={actionsMenu.anchor} name={menuInsumo.name}
        focusLast={actionsMenu.focusLast} onClose={closeActionsMenu}
        items={[
          { label: 'Ajuste / Merma', icon: 'tune', run: () => { setAdjustInsumoId(menuInsumo.id); setIsAdjustModalOpen(true); } },
          { label: 'Editar insumo', icon: 'edit', disabled: insumoIsSending(menuInsumo.id) || pending.some((p) => insumoIdOf(p) === menuInsumo.id && (p.conflict || p.op === 'deleteInsumo')), run: () => { setEditing({ ...menuInsumo }); setIsAddInsumoModalOpen(true); } },
          { label: 'Eliminar insumo', icon: 'delete', danger: true, disabled: insumoIsSending(menuInsumo.id), run: () => { setDeleting({ ...menuInsumo }); setActionError(''); } },
        ]} />}

      {/* Modal: Ajuste / Merma */}
      {isAdjustModalOpen && (
        <div className="fixed inset-0 bg-surface-scrim backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-panel-14 border border-edge-outline rounded-2xl w-full max-w-md p-5 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-edge-outline-3">
              <h3 className="text-[17px] font-bold text-ink-brand flex items-center gap-2">
                <span className="material-symbols-outlined">tune</span>
                Ajuste Manual de Kardex / Merma
              </h3>
              <button
                onClick={() => setIsAdjustModalOpen(false)}
                className="text-ink-muted-2 hover:text-ink-strong p-1"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleSaveAdjustment} className="space-y-3.5 mt-4">
              <div>
                <label className="block text-[12px] font-bold text-ink-muted-2 mb-1">
                  Insumo a Ajustar
                </label>
                <select
                  autoFocus
                  aria-label="Insumo a ajustar"
                  value={adjustInsumoId}
                  onChange={(e) => setAdjustInsumoId(e.target.value)}
                  required
                  className="w-full bg-panel-12 border border-edge-outline-2 rounded-xl px-3 py-2 text-[13px] text-ink-strong focus:outline-none focus:border-edge-brand"
                >
                  <option value="">Seleccionar insumo...</option>
                  {insumos.filter(insumoSelectable).filter((i) => activeCompanyId === 'todas' || i.companyId === 'ambas' || i.companyId === activeCompanyId).map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} (Stock actual: {i.currentStock} {i.unit})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[12px] font-bold text-ink-muted-2 mb-1">
                    Tipo de Ajuste
                  </label>
                  <select
                    value={adjustType}
                    onChange={(e) => setAdjustType(e.target.value as any)}
                    className="w-full bg-panel-12 border border-edge-outline-2 rounded-xl px-3 py-2 text-[13px] text-ink-strong focus:outline-none focus:border-edge-brand"
                  >
                    <option value="AJUSTE_MERMA">Merma / Desecho (-)</option>
                    <option value="ENTRADA_COMPRA">Ajuste Físico (+)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[12px] font-bold text-ink-muted-2 mb-1">
                    Cantidad
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="Ej. 1.5"
                    value={adjustQty}
                    onChange={(e) => setAdjustQty(e.target.value)}
                    className="w-full bg-panel-12 border border-edge-outline-2 rounded-xl px-3 py-2 text-[13px] text-ink-strong focus:outline-none focus:border-edge-brand"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-bold text-ink-muted-2 mb-1">
                  Motivo / Observación
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Vencimiento, merma en corte o diferencia de inventario"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="w-full bg-panel-12 border border-edge-outline-2 rounded-xl px-3 py-2 text-[13px] text-ink-strong focus:outline-none focus:border-edge-brand"
                />
              </div>

              <div className="pt-3 flex gap-2 justify-end border-t border-edge-outline-5">
                <button
                  type="button"
                  onClick={() => setIsAdjustModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-[13px] text-ink-muted-2 hover:bg-panel-26"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-[13px] font-bold bg-surface-brand-solid hover:bg-surface-brand-hover-bright text-ink-on-brand"
                >
                  Confirmar Ajuste
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isAddInsumoModalOpen && <InsumoFormModal original={editing} onClose={() => setIsAddInsumoModalOpen(false)} onSaved={setNotice} />}
      {deleting && <div className="fixed inset-0 bg-surface-scrim z-50 flex items-center justify-center p-4"><section role="dialog" aria-modal="true" aria-label="Eliminar insumo" className="bg-panel-14 border border-edge-outline rounded-2xl p-5 w-full max-w-lg space-y-4">
        <h3 className="text-lg font-bold text-ink-brand">Eliminar {deleting.name}</h3>
        <p>Este insumo dejará de estar disponible para nuevas operaciones. Su historial se conservará.</p>
        <p>Stock actual: {deleting.currentStock} {deleting.unit}</p>
        {deleting.currentStock !== 0 && <p className="text-ink-warning">Debe registrar el ajuste correspondiente antes de eliminar.</p>}
        {!!deleting.activeRecipes?.length && <div className="text-ink-warning"><p>Está vinculado a fichas activas:</p><ul>{deleting.activeRecipes.map((r) => <li key={r.id}>{r.name}</li>)}</ul><button className="underline" onClick={() => { setDeleting(null); setCurrentScreen('recetas'); }}>Ir a Fichas & Recetas</button></div>}
        {actionError && <p role="alert" className="text-ink-danger-2">{actionError}</p>}
        <div className="flex flex-wrap justify-end gap-3"><button autoFocus disabled={actionBusy} onClick={() => setDeleting(null)}>Cancelar</button>
          {deleting.currentStock !== 0 && <button onClick={() => { setAdjustInsumoId(deleting.id); setDeleting(null); setIsAdjustModalOpen(true); }}>Ir a Ajuste / Merma</button>}
          <button disabled={actionBusy || deleting.currentStock !== 0 || !!deleting.activeRecipes?.length} className="bg-surface-danger-solid text-ink-on-danger-solid rounded-xl px-4 py-2 disabled:opacity-40" onClick={() => void confirmDelete()}>{actionBusy ? 'Validando…' : 'Eliminar insumo'}</button></div>
      </section></div>}
      {dependency && <div className="fixed inset-0 bg-surface-scrim z-50 flex items-center justify-center p-4"><section role="dialog" aria-modal="true" aria-label="Operación de inventario pendiente" className="bg-panel-14 p-5 rounded-2xl border border-edge-outline max-w-lg space-y-4">
        <h3 className="text-lg font-bold text-ink-brand">Operación pendiente de revisión</h3>
        <p>{dependency.error}</p>
        <p>{String((dependency.payload as any)?.supplierName ?? (dependency.payload as any)?.productName ?? 'Operación de inventario')}</p>
        <p>Los datos permanecen guardados en este equipo. Revise la compra, ficha o ajuste antes de volver a registrarlo.</p>
        {Array.isArray((dependency.payload as any)?.items) && <ul>{(dependency.payload as any).items.map((item: any, index: number) => <li key={index}>{item.quantity} {item.unit} · {item.insumoName}</li>)}</ul>}
        {discardDependency && <p className="text-ink-danger-2">Se descartará este cambio pendiente del equipo. Los registros ya confirmados en el servidor se conservarán. ¿Confirmar?</p>}
        {actionError && <p role="alert" className="text-ink-danger-2">{actionError}</p>}
        <div className="flex flex-wrap gap-4"><button disabled={actionBusy} onClick={() => setDependency(null)}>Conservar pendiente</button><button disabled={actionBusy} onClick={() => {
          if (!discardDependency) { setDiscardDependency(true); return; }
          setActionBusy(true); void discardInventoryDependency(dependency.clientOpId).then(() => setDependency(null)).catch((error) => setActionError(error.message)).finally(() => setActionBusy(false));
        }}>{discardDependency ? 'Confirmar descarte' : 'Descartar este pendiente'}</button></div>
      </section></div>}
      {review && <div className="fixed inset-0 bg-surface-scrim z-50 flex items-center justify-center p-4"><section role="dialog" aria-modal="true" aria-label="Revisar cambio de insumo" className="bg-panel-14 rounded-2xl border border-edge-outline p-5 max-w-xl space-y-4">
        <h3 className="text-lg font-bold text-ink-brand">Revisar cambio pendiente</h3>
        <div className="grid grid-cols-2 gap-4"><div><h4>En este equipo</h4><p>{review.local.name}</p><p>Mínimo: {review.local.minStock} {review.local.unit}</p><p>Costo: S/ {review.local.costPerUnit}</p></div><div><h4>Datos actuales</h4>{review.server ? <><p>{review.server.name}</p><p>Mínimo: {review.server.minStock} {review.server.unit}</p><p>Stock: {review.server.currentStock} {review.server.unit}</p><p>Costo: S/ {review.server.costPerUnit}</p></> : <p>El insumo fue eliminado.</p>}</div></div>
        <p className="text-xs text-ink-muted-2">Reintentar conserva solo los campos editados y vuelve a validar stock y referencias.</p>
        {actionError && <p role="alert" className="text-ink-danger-2">{actionError}</p>}
        <div className="flex flex-wrap gap-3"><button disabled={actionBusy} onClick={() => setReview(null)}>Cerrar</button><button disabled={actionBusy} onClick={() => void resolve('server')}>Descartar cambio pendiente</button><button disabled={actionBusy || !review.server} onClick={() => void resolve('local')}>Reintentar mis cambios</button></div>
      </section></div>}

    </div>
  );
};
