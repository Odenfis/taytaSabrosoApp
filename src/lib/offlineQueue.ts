import type { PendingOp } from '../types';

// Cola de operaciones pendientes de sync (write-through fallido u offline simulado).
// Base para E4 / Fase C: cada op guarda su clientOpId + endpoint + payload para replay.

const QUEUE_KEY = 'ts_pending_queue_v2';

export function loadQueue(): PendingOp[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PendingOp[]) : [];
  } catch {
    return [];
  }
}

export function saveQueue(queue: PendingOp[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Cuota llena u otro error de storage: no romper la app.
  }
}

export function enqueue(op: PendingOp): PendingOp[] {
  const queue = loadQueue();
  const next = [...queue.filter((q) => q.clientOpId !== op.clientOpId), op];
  saveQueue(next);
  return next;
}

export function removeByClientOpId(clientOpId: string): PendingOp[] {
  const next = loadQueue().filter((q) => q.clientOpId !== clientOpId);
  saveQueue(next);
  return next;
}

export function clearQueue(): PendingOp[] {
  saveQueue([]);
  return [];
}

export function queueCount(): number {
  return loadQueue().length;
}

// Fase E4-b: ids de entidades temporales (ordenes order-tmp-* / mesas t-express-*)
// que la cola AUN referencia. Se usan en loadOperations/loadCatalogs para no sobrescribir
// estado local pendiente de sincronizar al recargar la app con red recuperada.
export function getPendingTmpIds(): { orderTmpIds: Set<string>; tmpTableIds: Set<string> } {
  const orderTmpIds = new Set<string>();
  const tmpTableIds = new Set<string>();
  for (const op of loadQueue()) {
    const payload = (op.payload ?? {}) as Record<string, unknown>;
    for (const value of Object.values(payload)) {
      if (typeof value !== 'string') continue;
      if (value.startsWith('order-tmp-')) orderTmpIds.add(value);
      if (value.startsWith('t-express-')) tmpTableIds.add(value);
    }
  }
  return { orderTmpIds, tmpTableIds };
}