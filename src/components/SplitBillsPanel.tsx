import React, { useEffect, useMemo, useState } from 'react';
import { usePOS } from '../context/POSContext';
import { apiClient, ApiError } from '../lib/api';
import { loadQueue, saveQueue } from '../lib/offlineQueue';
import type { Order, Table } from '../types';
import { DinerReceiptModal } from './DinerReceiptModal';

type BillItem = { orderItemId: string; quantity: number; orderItem?: { name: string; price: number } };
type BillTransaction = { id: string; amount: number; amountReceived?: number | null; change?: number | null; paymentMethod: string; referenceNumber?: string | null; contributorName?: string | null; timestamp?: string };
type Bill = { id: string; orderId: string; ticketNumber: string; label: string; documentType: 'ticket' | 'boleta' | 'factura'; recipientName?: string | null; recipientId?: string | null; total: number; status: string; items: BillItem[]; transactions: BillTransaction[] };
type Draft = { id: string; label: string; documentType: Bill['documentType']; recipientName: string; recipientId: string; items: BillItem[] };
const uuid = () => crypto.randomUUID();
const cents = (n: number) => Math.round(n * 100);
const amount = (n: number) => (n / 100).toFixed(2);
const localKey = (id: string) => `ts_diner_bills_${id}`;
const queueDurably = (operation: Parameters<typeof saveQueue>[0][number]) => saveQueue([...loadQueue().filter((op) => op.clientOpId !== operation.clientOpId), operation], true);

export const SplitBillsPanel: React.FC<{ order: Order; table: Table; onClose: () => void }> = ({ order, table, onClose }) => {
  const { paymentMethods, offlineState, lastSyncResult, refreshOperations, releasePaidTable, companies } = usePOS();
  const [drafts, setDrafts] = useState<Draft[]>(() => [{ id: uuid(), label: 'Comensal 1', documentType: 'ticket', recipientName: '', recipientId: '', items: order.items.map((i) => ({ orderItemId: i.id, quantity: i.quantity })) }, { id: uuid(), label: 'Comensal 2', documentType: 'ticket', recipientName: '', recipientId: '', items: [] }]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [selected, setSelected] = useState('');
  const [selectedDraft, setSelectedDraft] = useState('');
  const [methodId, setMethodId] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [cashReceived, setCashReceived] = useState('');
  const [reference, setReference] = useState('');
  const [contributorName, setContributorName] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<{ bill: Bill; payment?: BillTransaction } | null>(null);
  const [closedPendingRefresh, setClosedPendingRefresh] = useState(false);
  const methods = useMemo(() => paymentMethods.filter((m) => m.isActive && !m.isDeleted && (m.companyId === table.companyId || m.companyId === 'ambas') && m.category !== 'Crédito'), [paymentMethods, table.companyId]);
  const bill = bills.find((b) => b.id === selected) ?? bills[0];
  const paid = bill?.transactions.reduce((s, t) => s + cents(t.amount), 0) ?? 0;
  const balance = bill ? cents(bill.total) - paid : 0;
  const method = methods.find((m) => m.id === methodId);
  const pending = loadQueue().some((op) => (op.op === 'createDinerBills' || op.op === 'payDinerBill') && (op.payload as Record<string, unknown>).orderId === order.id);

  useEffect(() => {
    let active = true;
    try { const cached = localStorage.getItem(localKey(order.id)); if (cached) setBills(JSON.parse(cached) as Bill[]); } catch { /* ignore corrupt cache */ }
    if (!offlineState.isSimulatedOffline) apiClient.get<Bill[]>(`/operations/orders/${order.id}/bills`).then((rows) => { if (active && !loadQueue().some((op) => ['createDinerBills', 'payDinerBill'].includes(op.op) && (op.payload as Record<string, unknown>).orderId === order.id)) { setBills(rows); localStorage.setItem(localKey(order.id), JSON.stringify(rows)); } }).catch(() => undefined);
    return () => { active = false; };
  }, [order.id, offlineState.isSimulatedOffline, lastSyncResult?.ts]);
  useEffect(() => { if (bills.length && !bills.some((b) => b.id === selected)) setSelected(bills[0].id); }, [bills, selected]);
  useEffect(() => { if (!methodId && methods.length) setMethodId((methods.find((m) => m.category === 'Efectivo') ?? methods[0]).id); }, [methods, methodId]);
  useEffect(() => { setPayAmount(balance > 0 ? amount(balance) : ''); setCashReceived(''); setReference(''); setContributorName(''); }, [selected, balance]);

  const updateDraft = (id: string, patch: Partial<Draft>) => setDrafts((list) => list.map((d) => d.id === id ? { ...d, ...patch } : d));
  const reloadBills = async () => {
    if (loadQueue().some((op) => ['createDinerBills', 'payDinerBill'].includes(op.op) && (op.payload as Record<string, unknown>).orderId === order.id)) return;
    const rows = await apiClient.get<Bill[]>(`/operations/orders/${order.id}/bills`);
    setBills(rows); localStorage.setItem(localKey(order.id), JSON.stringify(rows));
  };
  const setQuantity = (draftId: string, itemId: string, next: number) => {
    const item = order.items.find((i) => i.id === itemId)!;
    const assignedElsewhere = drafts.filter((d) => d.id !== draftId).reduce((sum, d) => sum + (d.items.find((line) => line.orderItemId === itemId)?.quantity ?? 0), 0);
    if (next < 0 || next > item.quantity - assignedElsewhere || !Number.isInteger(next)) return;
    setDrafts((list) => list.map((d) => d.id === draftId ? { ...d, items: [...d.items.filter((i) => i.orderItemId !== itemId), ...(next ? [{ orderItemId: itemId, quantity: next }] : [])] } : d));
  };
  const saveBills = async () => {
    setMessage('');
    if (order.id.startsWith('order-tmp-')) { setMessage('Espere a que la comanda se sincronice para repartirla: aún no tiene identificadores definitivos de platos.'); return; }
    for (const item of order.items) if (drafts.reduce((s, d) => s + (d.items.find((i) => i.orderItemId === item.id)?.quantity ?? 0), 0) !== item.quantity) { setMessage(`Asigne todas las unidades de ${item.name}.`); return; }
    if (drafts.some((d) => !d.label.trim() || !d.items.length)) { setMessage('Cada comensal necesita nombre y al menos un plato.'); return; }
    if (drafts.some((d) => d.documentType === 'factura' && (!d.recipientName.trim() || !/^\d{11}$/.test(d.recipientId)))) { setMessage('Factura: ingrese razón social y RUC de 11 dígitos.'); return; }
    if (drafts.some((d) => d.documentType === 'boleta' && !d.recipientName.trim())) { setMessage('Boleta: ingrese nombre del receptor.'); return; }
    const operationId = uuid();
    const payload = { orderId: order.id, bills: drafts.map((d) => ({ ...d, items: d.items.filter((i) => i.quantity > 0) })), clientOpId: operationId };
    setBusy(true);
    try {
      if (offlineState.isSimulatedOffline) throw new ApiError('Sin conexión', 'NETWORK_ERROR', 0);
      const rows = await apiClient.post<Bill[]>(`/operations/orders/${order.id}/bills`, payload);
      setBills(rows); localStorage.setItem(localKey(order.id), JSON.stringify(rows));
    } catch (error) {
      if (error instanceof ApiError && error.status === 0) {
        const local = drafts.map((d, index) => ({ ...d, orderId: order.id, ticketNumber: `Pendiente ${index + 1}`, total: d.items.reduce((s, i) => s + (order.items.find((item) => item.id === i.orderItemId)?.price ?? 0) * i.quantity, 0), status: 'pendiente', transactions: [] }));
        try { queueDurably({ clientOpId: operationId, entity: 'order', op: 'createDinerBills', payload, createdAt: new Date().toISOString() }); }
        catch (storageError) { setMessage(storageError instanceof Error ? storageError.message : 'No se pudo guardar el reparto sin conexión.'); return; }
        setBills(local); localStorage.setItem(localKey(order.id), JSON.stringify(local));
        setMessage('Reparto guardado sin conexión. Los números definitivos llegarán al sincronizar.');
      } else { setMessage(error instanceof Error ? error.message : 'No se pudo guardar el reparto.'); void reloadBills().catch(() => undefined); }
    } finally { setBusy(false); }
  };
  const pay = async () => {
    if (!bill || !method) return;
    const value = Number(payAmount);
    const received = method.category === 'Efectivo' ? (cashReceived.trim() ? Number(cashReceived) : value) : value;
    if (!Number.isFinite(value) || cents(value) <= 0 || cents(value) > balance || !Number.isFinite(received) || cents(received) < cents(value)) { setMessage('El abono debe ser positivo, no exceder el saldo y estar cubierto por el efectivo recibido.'); return; }
    if (method.requiresReferenceNumber && !reference.trim()) { setMessage('Ingrese el número de operación.'); return; }
    const operationId = uuid();
    const payload = { orderId: order.id, billId: bill.id, amount: value, amountReceived: received, customPaymentMethodId: method.id, referenceNumber: reference.trim() || undefined, contributorName: contributorName.trim() || bill.label, clientOpId: operationId };
    setBusy(true); setMessage('');
    try {
      if (offlineState.isSimulatedOffline) throw new ApiError('Sin conexión', 'NETWORK_ERROR', 0);
      const response = await apiClient.post<{ bill: Bill; transaction: BillTransaction; orderClosed: boolean }>(`/operations/bills/${bill.id}/pay`, payload);
      const next = bills.map((b) => b.id === bill.id ? response.bill : b);
      setBills(next); localStorage.setItem(localKey(order.id), JSON.stringify(next));
      setReceipt({ bill: response.bill, payment: response.transaction });
      if (response.orderClosed) { releasePaidTable(table.id, order.id); setClosedPendingRefresh(true); }
      else await refreshOperations();
    } catch (error) {
      if (error instanceof ApiError && error.status === 0) {
        try { queueDurably({ clientOpId: operationId, entity: 'order', op: 'payDinerBill', payload, createdAt: new Date().toISOString() }); }
        catch (storageError) { setMessage(storageError instanceof Error ? storageError.message : 'No se pudo guardar el abono sin conexión.'); return; }
        const payment = { id: operationId, amount: value, amountReceived: received, change: received - value, paymentMethod: method.name, referenceNumber: reference.trim() || null, contributorName: contributorName.trim() || bill.label };
        const next = bills.map((b) => b.id === bill.id ? { ...b, transactions: [...b.transactions, payment], status: cents(b.total) === paid + cents(value) ? 'pagada' : b.status } : b);
        setBills(next); localStorage.setItem(localKey(order.id), JSON.stringify(next));
        setReceipt({ bill: next.find((b) => b.id === bill.id)!, payment });
        setMessage('Abono pendiente de sincronización. Conserve la constancia y verifique su aplicación al reconectar.');
      } else { setMessage(error instanceof Error ? error.message : 'No se pudo registrar el abono. Actualice la cuenta.'); void reloadBills().catch(() => undefined); }
    } finally { setBusy(false); }
  };
  const closeReceipt = () => {
    setReceipt(null);
    if (closedPendingRefresh) { setClosedPendingRefresh(false); void refreshOperations().then(onClose); }
  };

  const draft = drafts.find((d) => d.id === selectedDraft) ?? drafts[0];
  const assignedCount = (itemId: string) => drafts.reduce((sum, d) => sum + (d.items.find((line) => line.orderItemId === itemId)?.quantity ?? 0), 0);
  const draftTotal = draft?.items.reduce((sum, line) => sum + cents(order.items.find((item) => item.id === line.orderItemId)?.price ?? 0) * line.quantity, 0) ?? 0;
  const unassigned = order.items.reduce((sum, item) => sum + item.quantity - assignedCount(item.id), 0);
  const inputClass = 'w-full rounded-xl border border-edge-outline bg-panel-3 px-3 py-2.5 text-sm text-ink-body focus:border-edge-brand focus:outline-none';
  const received = cashReceived.trim() ? Number(cashReceived) : Number(payAmount);
  const change = Number.isFinite(received) && Number.isFinite(Number(payAmount)) ? Math.max(0, received - Number(payAmount)) : 0;

  return <div className="flex-1 flex flex-col min-h-0 bg-panel-4 text-ink-body">
    <header className="bg-panel-35 border-b border-edge-outline-2 px-4 md:px-6 py-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3"><button type="button" onClick={onClose} aria-label="Volver" className="w-10 h-10 rounded-full hover:bg-panel-3"><span className="material-symbols-outlined">arrow_back</span></button><div><h1 className="text-lg font-bold text-ink-brand">Cuentas por comensal · Mesa {table.number}</h1><p className="text-xs text-ink-muted-3">Comanda #{order.ticketNumber} · Un ticket interno por cuenta</p></div></div><div className="text-right"><span className="text-xs text-ink-muted-3 block">Total de la mesa</span><strong className="text-xl text-ink-gold">S/ {order.total.toFixed(2)}</strong></div>
    </header>
    <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
    {message && <p role="status" className="p-3 rounded-xl border border-edge-outline bg-panel-13 text-ink-body text-sm">{message}</p>}
    {!bills.length && draft ? <div className="grid lg:grid-cols-[minmax(240px,0.8fr)_minmax(0,1.6fr)] gap-4">
      <section className="bg-panel-35 border border-edge-outline rounded-2xl p-4 space-y-3"><div className="flex items-center justify-between"><h2 className="font-bold">Comensales</h2><span className="text-xs text-ink-muted-3">{drafts.length} cuentas</span></div>
        {drafts.map((d, index) => { const sum = d.items.reduce((n, line) => n + cents(order.items.find((i) => i.id === line.orderItemId)?.price ?? 0) * line.quantity, 0); return <button type="button" key={d.id} onClick={() => setSelectedDraft(d.id)} aria-pressed={draft.id === d.id} className={`w-full text-left p-4 rounded-xl border flex items-center justify-between gap-2 ${draft.id === d.id ? 'border-edge-brand bg-panel-13' : 'border-edge-outline bg-panel'}`}><span><strong className="block">{d.label || `Comensal ${index + 1}`}</strong><span className="text-xs text-ink-muted-3">{d.items.reduce((n, i) => n + i.quantity, 0)} unidades asignadas</span></span><strong className="text-ink-gold">S/ {amount(sum)}</strong></button>; })}
        <button type="button" onClick={() => { const id = uuid(); setDrafts((list) => [...list, { id, label: `Comensal ${list.length + 1}`, documentType: 'ticket', recipientName: '', recipientId: '', items: [] }]); setSelectedDraft(id); }} className="w-full rounded-xl border border-edge-brand text-ink-brand font-bold p-3 flex justify-center gap-2"><span className="material-symbols-outlined">person_add</span>Añadir comensal</button>
        <div className="rounded-xl bg-panel-13 p-4 text-sm"><div className="flex justify-between"><span>Por asignar</span><strong>{unassigned} unidades</strong></div><p className="text-xs text-ink-muted-3 mt-1">Cada plato debe asignarse una sola vez.</p></div>
        <button type="button" disabled={busy || unassigned !== 0} onClick={() => void saveBills()} className="w-full rounded-xl bg-surface-brand-solid text-ink-on-brand p-3 font-bold disabled:opacity-50">Confirmar reparto</button>
      </section>
      <section className="bg-panel-35 border border-edge-outline rounded-2xl p-4 md:p-5 space-y-5"><div className="flex justify-between items-center gap-2"><div><h2 className="font-bold text-lg">Detalle del comensal</h2><p className="text-xs text-ink-muted-3">Seleccione los platos que incluirá su ticket</p></div>{drafts.length > 1 && <button type="button" onClick={() => { setDrafts((list) => list.filter((d) => d.id !== draft.id)); setSelectedDraft(''); }} className="text-ink-danger text-sm px-2 py-2">Quitar</button>}</div>
        <div className="grid sm:grid-cols-2 gap-3"><label className="text-xs font-bold text-ink-muted-2">Nombre de la cuenta<input aria-label="Nombre del comensal" value={draft.label} onChange={(e) => updateDraft(draft.id, { label: e.target.value })} className={`${inputClass} mt-1`} /></label><label className="text-xs font-bold text-ink-muted-2">Documento solicitado<select value={draft.documentType} onChange={(e) => updateDraft(draft.id, { documentType: e.target.value as Draft['documentType'] })} className={`${inputClass} mt-1`}><option value="ticket">Ticket interno</option><option value="boleta">Boleta futura</option><option value="factura">Factura futura</option></select></label><label className="text-xs font-bold text-ink-muted-2">{draft.documentType === 'factura' ? 'Razón social' : 'Nombre del receptor'}<input value={draft.recipientName} onChange={(e) => updateDraft(draft.id, { recipientName: e.target.value })} className={`${inputClass} mt-1`} /></label><label className="text-xs font-bold text-ink-muted-2">{draft.documentType === 'factura' ? 'RUC' : 'DNI u otra identificación'}<input value={draft.recipientId} onChange={(e) => updateDraft(draft.id, { recipientId: e.target.value })} className={`${inputClass} mt-1`} /></label></div>
        <div className="space-y-2"><h3 className="font-bold">Platos de la comanda</h3>{order.items.map((item) => { const qty = draft.items.find((line) => line.orderItemId === item.id)?.quantity ?? 0; const available = item.quantity - assignedCount(item.id); return <div key={item.id} className="rounded-xl border border-edge-outline bg-panel p-3 flex items-center justify-between gap-3"><div className="min-w-0"><strong className="block text-sm">{item.name}</strong><span className="text-xs text-ink-muted-3">S/ {item.price.toFixed(2)} c/u · {available} disponibles de {item.quantity}</span></div><div className="flex items-center gap-2 shrink-0"><button type="button" aria-label={`Quitar una unidad de ${item.name}`} disabled={qty === 0} onClick={() => setQuantity(draft.id, item.id, qty - 1)} className="w-10 h-10 rounded-lg bg-panel-3 text-lg font-bold disabled:opacity-40">−</button><span className="w-6 text-center font-bold">{qty}</span><button type="button" aria-label={`Añadir una unidad de ${item.name}`} disabled={available <= 0} onClick={() => setQuantity(draft.id, item.id, qty + 1)} className="w-10 h-10 rounded-lg bg-panel-3 text-lg font-bold disabled:opacity-40">+</button></div></div>; })}</div>
        <div className="border-t border-edge-outline pt-4 flex justify-between font-bold"><span>Total de {draft.label}</span><span className="text-lg text-ink-gold">S/ {amount(draftTotal)}</span></div>
      </section>
    </div> : <div className="grid lg:grid-cols-2 gap-4">
      <section className="bg-panel-35 border border-edge-outline rounded-2xl p-4 space-y-3"><h2 className="font-bold flex items-center gap-2"><span className="material-symbols-outlined text-ink-brand">groups</span>Cuentas de la mesa</h2>{bills.map((b) => { const remaining = cents(b.total) - b.transactions.reduce((sum, t) => sum + cents(t.amount), 0); return <button type="button" key={b.id} onClick={() => setSelected(b.id)} aria-pressed={bill?.id === b.id} className={`block w-full text-left p-4 rounded-xl border ${bill?.id === b.id ? 'border-edge-brand bg-panel-13' : 'border-edge-outline bg-panel'}`}><div className="flex justify-between gap-2"><strong>{b.label}</strong><span className={`text-xs font-bold ${remaining <= 0 ? 'text-ink-success' : 'text-ink-gold'}`}>{remaining <= 0 ? 'PAGADA' : 'PENDIENTE'}</span></div><div className="flex justify-between mt-2 text-sm"><span className="text-ink-muted-3">Ticket #{b.ticketNumber} · Total S/ {b.total.toFixed(2)}</span><strong>Saldo S/ {amount(remaining)}</strong></div></button>; })}</section>
      {bill && <section className="bg-panel-35 border border-edge-outline rounded-2xl p-4 md:p-5 space-y-4"><div className="flex justify-between gap-2 items-start"><div><h2 className="font-bold text-lg">{bill.label}</h2><p className="text-xs text-ink-muted-3">Ticket interno #{bill.ticketNumber} · {bill.recipientName || 'Sin identificar'} {bill.recipientId || ''}</p></div><div className="text-right"><span className="text-xs text-ink-muted-3 block">Saldo pendiente</span><strong className="text-xl text-ink-gold">S/ {amount(balance)}</strong></div></div>
        <div className="bg-panel rounded-xl border border-edge-outline p-3 space-y-2">{bill.items.map((line) => <div key={line.orderItemId} className="flex justify-between text-sm"><span>{line.quantity} × {line.orderItem?.name ?? order.items.find((i) => i.id === line.orderItemId)?.name}</span><span>S/ {((line.orderItem?.price ?? order.items.find((i) => i.id === line.orderItemId)?.price ?? 0) * line.quantity).toFixed(2)}</span></div>)}</div>
        {bill.transactions.length > 0 && <div className="space-y-1"><h3 className="text-sm font-bold">Abonos registrados</h3>{bill.transactions.map((t) => <p key={t.id} className="text-xs text-ink-muted-2">S/ {t.amount.toFixed(2)} · {t.paymentMethod} · {t.contributorName || bill.label} {t.referenceNumber ? `· Ref. ${t.referenceNumber}` : ''}</p>)}</div>}
        <button type="button" onClick={() => setReceipt({ bill })} className="text-sm font-bold text-ink-brand flex items-center gap-1"><span className="material-symbols-outlined text-lg">receipt_long</span>Ver ticket interno</button>
        {balance > 0 && <div className="space-y-3 border-t border-edge-outline pt-4"><h3 className="font-bold">Registrar abono</h3><label className="block text-xs font-bold text-ink-muted-2">Quién aporta<input placeholder="Por defecto, el titular" value={contributorName} onChange={(e) => setContributorName(e.target.value)} className={`${inputClass} mt-1`} /></label><label className="block text-xs font-bold text-ink-muted-2">Importe del abono<input type="number" min="0.01" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className={`${inputClass} mt-1`} /></label><div><p className="text-xs font-bold text-ink-muted-2 mb-2">Medio de pago</p><div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{methods.map((m) => <button type="button" key={m.id} onClick={() => { setMethodId(m.id); setReference(''); }} aria-pressed={methodId === m.id} className={`rounded-xl p-3 border text-sm font-semibold flex flex-col items-center gap-1 ${methodId === m.id ? 'bg-surface-brand-solid text-ink-on-brand border-edge-brand' : 'bg-panel border-edge-outline'}`}><span className="material-symbols-outlined">{m.icon || 'payments'}</span>{m.name}</button>)}</div></div>{method?.category === 'Efectivo' && <div className="space-y-2"><label className="block text-xs font-bold text-ink-muted-2">Efectivo recibido<input type="number" min="0" step="0.01" placeholder="Vacío = importe exacto" value={cashReceived} onChange={(e) => setCashReceived(e.target.value)} className={`${inputClass} mt-1`} /></label><div className="flex justify-between text-sm bg-panel-13 rounded-xl p-3"><span>Vuelto a entregar</span><strong className="text-ink-info">S/ {change.toFixed(2)}</strong></div></div>}{method?.requiresReferenceNumber && <label className="block text-xs font-bold text-ink-muted-2">Número de operación<input value={reference} onChange={(e) => setReference(e.target.value)} className={`${inputClass} mt-1`} /></label>}<button type="button" disabled={busy || !method} onClick={() => void pay()} className="w-full rounded-xl bg-surface-brand-solid text-ink-on-brand p-4 font-bold disabled:opacity-50">Registrar abono · S/ {Number.isFinite(Number(payAmount)) ? Number(payAmount).toFixed(2) : '0.00'}</button></div>}
        {pending && <p className="text-sm text-ink-info">Hay operaciones pendientes de sincronización para esta mesa.</p>}
      </section>}
    </div>}
    </main>
    {receipt && <DinerReceiptModal bill={{ ...receipt.bill, items: receipt.bill.items.map((line) => ({ ...line, orderItem: line.orderItem ?? order.items.find((item) => item.id === line.orderItemId) })) }} company={companies.find((c) => c.id === order.companyId)} tableNumber={table.number} orderNumber={order.ticketNumber} syncPending={pending} onClose={closeReceipt} />}

  </div>;
};
