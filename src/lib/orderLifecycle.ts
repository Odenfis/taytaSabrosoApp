import { apiClient, ApiError } from './api';
import type { OrderDTO } from './operationMapper';
import { assertQueueOwner, loadQueue, saveQueue, signQueuedOperation } from './offlineQueue';
import { offlineProofMatches } from './offlineSigning';
import { recordResolution } from './offlineResolution';
import { offlinePlanForAction } from './offlineRequest';
import type { OrderItem, PendingOp, Table } from '../types';

/** Identificadores temporales que todavía no existen en el servidor. */
export function isTemporaryReference(value: unknown): boolean {
  return typeof value === 'string' && (value.startsWith('order-tmp-') || value.startsWith('t-express-'));
}

/** Una referencia temporal sin resolución confirmada no debe enviarse al API. */
export function resolvePendingReferences(payload: Record<string, unknown>, orders: ReadonlyMap<string, string>, tables: ReadonlyMap<string, string>): Record<string, unknown> | null {
  const resolved = { ...payload };
  for (const [field, prefix, mapping] of [['orderId', 'order-tmp-', orders], ['tableId', 't-express-', tables]] as const) {
    const value = resolved[field];
    if (typeof value !== 'string' || !value.startsWith(prefix)) continue;
    const id = mapping.get(value);
    if (!id) return null;
    resolved[field] = id;
  }
  return resolved;
}

export function stageOrderOperation(op: PendingOp, replacedId?: string): void {
  const queue = loadQueue();
  for (const current of queue) if (current.clientOpId === replacedId || current.clientOpId === op.clientOpId) assertQueueOwner(current);
  const payload = (op.payload ?? {}) as Record<string, unknown>;
  const tmpOrderId = typeof payload.tmpOrderId === 'string' ? payload.tmpOrderId : undefined;
  if (tmpOrderId) {
    // La apertura queda registrada como origen de los identificadores
    // temporales: esa asociación sobrevive a una interrupción del replay.
    recordResolution(tmpOrderId, {
      openingClientOpId: op.clientOpId,
      tmpTableId: typeof payload.tmpTableId === 'string' ? payload.tmpTableId : undefined,
      companyId: op.companyId,
    });
  }
  saveQueue([...queue.filter((current) => current.clientOpId !== replacedId && current.clientOpId !== op.clientOpId), op], true);
}

export function releaseOrderTable(table: Table, orderId: string): Table {
  return table.currentOrderId === orderId
    ? { ...table, status: 'libre', currentOrderId: undefined, occupiedSince: undefined, minutesElapsed: undefined, waiter: undefined }
    : table;
}

/** Prueba vigente de la apertura para una acción concreta ('orders.openingItems'
 * o 'orders.cancelOpening'). */
function openingProof(op: PendingOp | undefined, action: string) {
  const proof = (op?.proofs ?? []).find((entry) => entry.action === action);
  if (!proof || !op || !offlineProofMatches(op, proof)) return undefined;
  return proof;
}

// Se consulta el borrador después de cada respuesta: retirar un producto mientras
// viaja la apertura o el flush debe cancelar también el trabajo del servidor.
//
// Cuando la apertura está en la cola (replay), el vaciado viaja con la prueba
// firmada por el autor: el servidor compara los ítems firmados con los
// recibidos y rechaza la escritura si no coinciden.
export async function settleOpening(openingClientOpId: string, desiredItems: () => OrderItem[], assume = false): Promise<{ cancelled: boolean; order: OrderDTO | null }> {
  const snapshot = () => desiredItems().map((item) => ({ productId: item.productId, quantity: item.quantity, notes: item.notes || undefined }));
  for (;;) {
    const desired = snapshot();
    const queued = loadQueue().find((op) => op.clientOpId === openingClientOpId);
    if (!desired.length) {
      const proof = openingProof(queued, 'orders.cancelOpening');
      if (queued && !proof) {
        throw new ApiError('La apertura no tiene una prueba firmada vigente para cancelar sus ítems.', 'OFFLINE_PROOF_REQUIRED', 403);
      }
      const result = await apiClient.post<OrderDTO | { cancelled: true }>(
        '/operations/orders/cancel-opening',
        { openingClientOpId },
        proof ? { proof: { document: proof.document, signature: proof.signature }, replay: true, assume } : undefined,
      );
      return { cancelled: true, order: 'id' in result ? result : null };
    }
    if (queued) {
      // Los ítems que se van a enviar pasan a la operación de apertura para que
      // la firma los cubra; si esta terminal es la del autor, se refirma.
      const payload = (queued.payload ?? {}) as Record<string, unknown>;
      const current = JSON.stringify(payload.items ?? null);
      if (current !== JSON.stringify(desired)) {
        try { updateOpeningItems(openingClientOpId, desired); } catch { /* la operación es de otro autor */ }
        await signQueuedOperation(openingClientOpId).catch(() => undefined);
      }
    }
    const refreshed = loadQueue().find((op) => op.clientOpId === openingClientOpId);
    const proof = openingProof(refreshed, 'orders.openingItems');
    if (refreshed && !proof) {
      throw new ApiError('Los ítems de la apertura no tienen una prueba firmada vigente.', 'OFFLINE_PROOF_REQUIRED', 403);
    }
    try {
      const order = await apiClient.post<OrderDTO>(
        '/operations/orders/opening-items',
        { openingClientOpId, items: desired },
        proof ? { proof: { document: proof.document, signature: proof.signature }, replay: true, assume } : undefined,
      );
      if (JSON.stringify(desired) === JSON.stringify(snapshot())) return { cancelled: false, order };
    } catch (error) {
      if (error instanceof ApiError && error.code === 'ORDER_CANCELLED') return { cancelled: true, order: null };
      throw error;
    }
  }
}

/** Guarda los ítems actuales dentro de la operación de apertura encolada.
 * Solo el equipo del autor puede cambiar su contenido firmado: una sesión que
 * asume la operación no puede reescribir lo que el autor firmó. */
export function updateOpeningItems(openingClientOpId: string, items: Array<{ productId: string; quantity: number; notes?: string }>): boolean {
  const queue = loadQueue();
  const index = queue.findIndex((op) => op.clientOpId === openingClientOpId);
  if (index === -1) return false;
  assertQueueOwner(queue[index]);
  const payload = (queue[index].payload ?? {}) as Record<string, unknown>;
  queue[index] = { ...queue[index], payload: { ...payload, items } };
  saveQueue(queue);
  return true;
}

/** Cuerpo que el contrato firma para el vaciado de la apertura (usado por las
 * pruebas y por el pre-vuelo del cliente). */
export function openingItemsPayload(op: PendingOp): Array<{ productId: string; quantity: number; notes?: string }> {
  const plan = offlinePlanForAction(op, (op.payload ?? {}) as Record<string, unknown>, 'orders.openingItems');
  const items = plan?.signed.body.items;
  return Array.isArray(items) ? items as Array<{ productId: string; quantity: number; notes?: string }> : [];
}
