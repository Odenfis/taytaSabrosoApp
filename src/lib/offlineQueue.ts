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

export function saveQueue(queue: PendingOp[], strict = false): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    if (strict && localStorage.getItem(QUEUE_KEY) !== JSON.stringify(queue)) throw new Error('Storage unavailable');
  } catch {
    if (strict) throw new Error('No se pudo guardar el cambio en este equipo. Revise el almacenamiento del navegador y vuelva a intentar.');
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

 // Fase E5: ids temporales de catálogos (creados offline, aún no reconciliados con el
 // server) que la cola referencia vía `payload.tempId`. loadCatalogs los preserva para
 // no perder altas de catálogos al recargar con red recuperada.
 export function getPendingCatalogTmpIds(): Set<string> {
   const ids = new Set<string>();
   for (const op of loadQueue()) {
     if (op.entity !== 'catalog') continue;
     const payload = (op.payload ?? {}) as Record<string, unknown>;
     if (typeof payload.tempId === 'string' && payload.tempId.length > 0) {
       ids.add(payload.tempId);
     }
   }
   return ids;
 }

 // Fase E5: parchea el payload de una op encolada (p.ej. editar un catálogo temporal
 // antes de sincronizar → el create encolado lleva los últimos valores).
 export function updateQueuedPayload(clientOpId: string, patch: Record<string, unknown>): boolean {
   const queue = loadQueue();
   const idx = queue.findIndex((q) => q.clientOpId === clientOpId);
   if (idx === -1) return false;
   queue[idx] = {
     ...queue[idx],
     payload: { ...(queue[idx].payload as Record<string, unknown>), ...patch },
   };
   saveQueue(queue);
   return true;
 }
