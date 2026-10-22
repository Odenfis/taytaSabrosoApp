import type { Insumo, PendingOp } from '../types';
import { loadQueue, saveQueue } from './offlineQueue';
import { uuid } from './productCatalog';

export type InsumoDraft = Pick<Insumo, 'companyId' | 'name' | 'category' | 'unit' | 'currentStock' | 'minStock' | 'costPerUnit'>;
export const INSUMO_QUEUE_EVENT = 'pos:insumo-queue';
export const isInsumoOp = (op: PendingOp) => ['createInsumo', 'updateInsumo', 'deleteInsumo'].includes(op.op);
export const insumoIdOf = (op: PendingOp) => String((op.payload as Record<string, unknown>)?.id ?? '');
export const isInventoryDependencyIssue = (op: PendingOp) => !!op.conflict && (['createPurchase', 'saveRecipe', 'createRecipe', 'updateRecipe', 'kardexAdjustment', 'sendToKitchen'].includes(op.op) || (isInsumoOp(op) && !insumoIdOf(op)));
export const insumoPending = () => loadQueue().filter(isInsumoOp);
export const signalInsumoQueue = () => window.dispatchEvent(new Event(INSUMO_QUEUE_EVENT));
export function persistInsumoQueue(queue: PendingOp[]) { saveQueue(queue, true); signalInsumoQueue(); }
const requests = new Map<string, Promise<any>>();
const sending = new Set<string>();
export const insumoIsSending = (id: string) => sending.has(id);
export function runInsumoRequest<T>(op: PendingOp, run: () => Promise<T>): Promise<T> {
  const prior = requests.get(op.clientOpId); if (prior) return prior;
  const id = insumoIdOf(op); sending.add(id);
  const request = run().finally(() => { requests.delete(op.clientOpId); sending.delete(id); signalInsumoQueue(); });
  requests.set(op.clientOpId, request); signalInsumoQueue(); return request;
}
export function validateInsumo(draft: InsumoDraft): InsumoDraft {
  const result = { ...draft, name: draft.name.trim() };
  if (!result.name || result.name.length > 150) throw new Error('Ingrese un nombre de hasta 150 caracteres.');
  for (const key of ['currentStock', 'minStock', 'costPerUnit'] as const) {
    const value = result[key];
    if (!Number.isFinite(value) || value < 0 || value > 99999999.9999 || Math.abs(value * 10000 - Math.round(value * 10000)) > 1e-5) throw new Error('Stock y costo deben ser valores no negativos con hasta cuatro decimales.');
  }
  return result;
}
export function stageInsumo(draft: InsumoDraft, original?: Insumo, stableId?: string): PendingOp {
  const data = validateInsumo(draft); const id = stableId ?? original?.id ?? uuid();
  const queue = loadQueue(); const index = queue.findIndex((op) => isInsumoOp(op) && insumoIdOf(op) === id);
  const prior = queue[index];
  if (prior?.conflict) throw new Error('Revise el conflicto pendiente antes de editar.');
  if (prior?.op === 'deleteInsumo') throw new Error('La eliminación está pendiente.');
  const create = prior?.op === 'createInsumo' || !original;
  const fields = create ? data : Object.fromEntries(['name', 'category', 'unit', 'minStock', 'costPerUnit'].filter((key) => data[key as keyof InsumoDraft] !== original[key as keyof Insumo]).map((key) => [key, data[key as keyof InsumoDraft]]));
  const op: PendingOp = { clientOpId: uuid(), entity: 'catalog', op: create ? 'createInsumo' : 'updateInsumo',
    payload: { ...(prior?.payload as object), ...fields, id, companyId: data.companyId === 'ambas' ? null : data.companyId,
      expectedVersion: (prior?.payload as any)?.expectedVersion ?? original?.version }, createdAt: prior?.createdAt ?? new Date().toISOString() };
  if (index >= 0) queue[index] = op; else queue.push(op);
  persistInsumoQueue(queue); return op;
}
export function stageInsumoDelete(insumo: Insumo): PendingOp {
  const queue = loadQueue();
  if (queue.some((op) => isInsumoOp(op) && insumoIdOf(op) === insumo.id && op.op !== 'createInsumo')) throw new Error('Resuelva primero los cambios pendientes del insumo.');
  const op: PendingOp = { clientOpId: uuid(), entity: 'catalog', op: 'deleteInsumo', payload: { id: insumo.id, expectedVersion: insumo.version ?? 1 }, createdAt: new Date().toISOString() };
  queue.push(op); persistInsumoQueue(queue); return op;
}
export function markInsumoIssue(op: PendingOp, error: string) {
  persistInsumoQueue(loadQueue().map((item) => item.clientOpId === op.clientOpId ? { ...item, error, conflict: true } : item));
}
export function overlayInsumos(server: Insumo[], local: Insumo[], queue = loadQueue()): Insumo[] {
  const items = new Map(server.filter((i) => !i.isDeleted).map((row) => {
    const previous = local.find((i) => i.id === row.id);
    return [row.id, previous && (previous.version ?? 0) > (row.version ?? 0) ? previous : row];
  }));
  for (const op of queue.filter(isInsumoOp)) {
    const data = op.payload as any; const id = insumoIdOf(op);
    const base = items.get(id) ?? local.find((i) => i.id === id);
    if (op.op === 'deleteInsumo') { if (base) items.set(id, base); continue; }
    items.set(id, { code: base?.code ?? 'Pendiente', lastPurchaseDate: base?.lastPurchaseDate ?? '', ...base, ...data,
      companyId: data.companyId ?? base?.companyId ?? 'ambas', id, version: base?.version } as Insumo);
  }
  return [...items.values()];
}
export function insumoSelectable(insumo: Insumo) { return !insumo.isDeleted && !insumoPending().some((op) => op.op === 'deleteInsumo' && insumoIdOf(op) === insumo.id); }
