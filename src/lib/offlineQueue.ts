import { markOperationCreatedHere, canAcquireFirstProof } from './offlineProvenance';
import type { PendingOp, PendingOpProof } from '../types';
import { offlineProofMatches, signPendingOperation } from './offlineSigning';
import { offlineLogicalFingerprint, offlinePlansForOp } from './offlineRequest';
import { resolveTemporaryReferences } from './offlineResolution';

// Cola de operaciones pendientes de sync (write-through fallido u offline simulado).
// Base para E4 / Fase C: cada op guarda su clientOpId + endpoint + payload para replay.

const QUEUE_KEY = 'ts_pending_queue_v2';
// Only operations created in this runtime may acquire their first signature.
// Historic declared identities (including inferred terminals) are not evidence.

export const QUEUE_PROOF_EVENT = 'pos:queue-proof-updated';
let identity: {
  authorId: string;
  deviceId?: string;
  companyFor: (op: PendingOp) => string | undefined;
} | null = null;

/** Identidad orientativa de la sesión actual; el servidor sigue siendo autoridad. */
export function setQueueIdentity(value: typeof identity): void { identity = value; }
export function assertQueueOwner(op: PendingOp): void {
  if (identity && (!op.authorId || op.authorId !== identity.authorId)) throw new Error('La operación pendiente pertenece a otro usuario o requiere revisión.');
}

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

function persistQueue(queue: PendingOp[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Cuota llena u otro error de storage: no romper la app.
  }
}

export function saveQueue(queue: PendingOp[], strict = false): void {
  try {
    const previous = new Map(loadQueue().map((op) => [op.clientOpId, op]));
    const enriched = queue.map((op) => {
      const old = previous.get(op.clientOpId);
      if (old) {
        return {
          ...op,
          authorId: old.authorId,
          companyId: old.companyId,
          // La terminal de una operación antigua no puede deducirse de la
          // sesión actual: conservarla sin asignar para revisión.
          deviceId: old.deviceId,
        };
      }
      markOperationCreatedHere(op.clientOpId);
      return identity
        ? {
            ...op,
            authorId: op.authorId ?? identity.authorId,
            companyId: op.companyId ?? identity.companyFor(op),
            deviceId: op.deviceId ?? identity.deviceId,
          }
        : op;
    });
    const serialized = JSON.stringify(enriched);
    localStorage.setItem(QUEUE_KEY, serialized);
    if (strict && localStorage.getItem(QUEUE_KEY) !== serialized) throw new Error('Storage unavailable');
    scheduleOfflineProofs();
  } catch {
    if (strict) throw new Error('No se pudo guardar el cambio en este equipo. Revise el almacenamiento del navegador y vuelva a intentar.');
    // Cuota llena u otro error de storage: no romper la app.
  }
}

let proofRun: Promise<void> | null = null;
let proofScheduled = false;
let proofRequested = false;

/** Firma en segundo plano las operaciones encoladas que aún no tienen una
 * prueba válida. La firma ocurre en el equipo del autor; si no hay clave
 * disponible, la operación queda sin prueba y el replay la rechazará. */
export function scheduleOfflineProofs(): void {
  proofRequested = true;
  if (proofScheduled || proofRun) return;
  proofScheduled = true;
  queueMicrotask(() => {
    proofScheduled = false;
    if (proofRun) return;
    proofRequested = false;
    proofRun = signMissingProofs()
      .catch(() => undefined)
      .finally(() => {
        proofRun = null;
        // Llegaron operaciones nuevas mientras se firmaba la tanda anterior.
        if (proofRequested) scheduleOfflineProofs();
      });
  });
}

async function signMissingProofs(): Promise<void> {
  for (let pass = 0; pass < 3; pass += 1) {
    let changed = false;
    for (const op of loadQueue()) {
      if (!op.authorId || !op.companyId || !op.deviceId) continue;
      if (!canAcquireFirstProof(op.clientOpId) && !op.proofs?.length) continue;
      const payload = (op.payload ?? {}) as Record<string, unknown>;
      const proofs = op.proofs ?? [];
      const pending = offlinePlansForOp(op, payload).some((plan) => !proofs.some((proof) =>
        proof.action === plan.action.id && proof.variant === plan.variantIndex && offlineProofMatches(op, proof)));
      if (!pending) continue;
      let signed: PendingOpProof[];
      try {
        signed = await signPendingOperation(op);
      } catch {
        continue;
      }
      if (!signed.length) continue;
      // Relee la cola: mientras se firmaba pudo cambiar el payload o retirarse.
      const current = loadQueue();
      const index = current.findIndex((entry) => entry.clientOpId === op.clientOpId);
      if (index === -1) continue;
      const target = current[index];
      if (target.authorId !== op.authorId || target.companyId !== op.companyId || target.deviceId !== op.deviceId) continue;
      // El contenido lógico no debe haber cambiado mientras se firmaba.
      if (offlineLogicalFingerprint(target) !== offlineLogicalFingerprint(op)) continue;
      const merged = [...(target.proofs ?? [])];
      let touched = false;
      for (const proof of signed) {
        const position = merged.findIndex((entry) => entry.action === proof.action && entry.variant === proof.variant);
        if (position >= 0) {
          if (merged[position].signature === proof.signature) continue;
          merged[position] = proof;
        } else {
          merged.push(proof);
        }
        touched = true;
      }
      if (!touched) continue;
      current[index] = { ...target, proofs: merged };
      persistQueue(current);
      changed = true;
    }
    if (!changed) break;
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(QUEUE_PROOF_EVENT));
}

/** Fuerza la firma inmediata de una operación concreta (usado antes del replay). */
export async function signQueuedOperation(clientOpId: string): Promise<PendingOp | null> {
  const op = loadQueue().find((item) => item.clientOpId === clientOpId);
  if (!op) return null;
  if (!canAcquireFirstProof(op.clientOpId) && !op.proofs?.length) return op;
  const payload = (op.payload ?? {}) as Record<string, unknown>;
  const pending = offlinePlansForOp(op, payload).some((plan) => !(op.proofs ?? []).some((proof) =>
    proof.action === plan.action.id && proof.variant === plan.variantIndex && offlineProofMatches(op, proof)));
  if (!pending) return op;
  const signed = await signPendingOperation(op);
  if (!signed.length) return op;
  const current = loadQueue();
  const index = current.findIndex((entry) => entry.clientOpId === clientOpId);
  if (index === -1) return null;
  const merged = [...(current[index].proofs ?? [])];
  for (const proof of signed) {
    const position = merged.findIndex((entry) => entry.action === proof.action && entry.variant === proof.variant);
    if (position >= 0) merged[position] = proof;
    else merged.push(proof);
  }
  current[index] = { ...current[index], proofs: merged };
  persistQueue(current);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(QUEUE_PROOF_EVENT));
  return current[index];
}

export function enqueue(op: PendingOp): PendingOp[] {
  const queue = loadQueue();
  const previous = queue.find((entry) => entry.clientOpId === op.clientOpId);
  if (previous) assertQueueOwner(previous);
  const next = [...queue.filter((q) => q.clientOpId !== op.clientOpId), op];
  saveQueue(next, true);
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
 // La prueba anterior se conserva: si el contenido firmado sigue vigente se
 // reutiliza y, si no, el firmador la reemplaza por una nueva.
 export function updateQueuedPayload(clientOpId: string, patch: Record<string, unknown>): boolean {
   const queue = loadQueue();
   const idx = queue.findIndex((q) => q.clientOpId === clientOpId);
   if (idx === -1) return false;
   assertQueueOwner(queue[idx]);
   queue[idx] = {
     ...queue[idx],
     payload: { ...(queue[idx].payload as Record<string, unknown>), ...patch },
   };
   saveQueue(queue);
   return true;
 }

 /** Sustituye en toda la cola los identificadores temporales que ya tienen una
  * resolución confirmada. La asociación se conserva entre ejecuciones: una
  * corrida interrumpida no deja operaciones huérfanas. */
 export function applyResolvedReferences(): boolean {
   const queue = loadQueue();
   let changed = false;
   const next = queue.map((op) => {
     const payload = (op.payload ?? {}) as Record<string, unknown>;
     const resolved = resolveTemporaryReferences(payload);
     if (JSON.stringify(resolved) === JSON.stringify(payload)) return op;
     changed = true;
     return { ...op, payload: resolved };
   });
   if (changed) saveQueue(next);
   return changed;
 }

 /** Aplica la resolución de una apertura a las operaciones que la dependían.
  * Es una sustitución mecánica (no una edición del usuario), por eso no exige
  * que la terminal sea la del autor. */
 export function applyResolutionToQueue(tmpOrderId: string, resolution: { orderId?: string; tableId?: string }): boolean {
   const queue = loadQueue();
   let changed = false;
   const next = queue.map((op) => {
     const payload = (op.payload ?? {}) as Record<string, unknown>;
     const patch: Record<string, unknown> = {};
     if (resolution.orderId && payload.orderId === tmpOrderId) patch.orderId = resolution.orderId;
     if (resolution.tableId && typeof payload.tableId === 'string' && payload.tmpTableId === payload.tableId) {
       patch.tableId = resolution.tableId;
     }
     if (!Object.keys(patch).length) return op;
     changed = true;
     return { ...op, payload: { ...payload, ...patch } };
   });
   if (changed) saveQueue(next);
   return changed;
 }
