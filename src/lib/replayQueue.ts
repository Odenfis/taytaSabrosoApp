import type { PendingOp } from '../types';
import { apiClient, ApiError } from './api';

// Dispatcher de replay de la cola offline (Fase E4).
// Convierte una PendingOp guardada en localStorage en la llamada HTTP real del server,
// y clasifica el resultado para que el replay decida: quitar / omitir / reintentar.
//
// Disposiciones:
//   - 'ok'       → la operación se aplicó (o el server deduplicó por clientOpId).
//   - 'already'  → 409 ALREADY_* (ya aplicada en otro replay) → omitir en silencio.
//   - 'gone'     → 404 (entidad ya no existe, p.ej. orden liberada offline) → omitir.
//   - 'business' → otro 4xx de negocio → omitir con aviso al usuario.
//   - 'retry'    → red/5xx/401 → conservar en la cola y detener el replay (reintento posterior).

export type ReplayDisposition = 'ok' | 'already' | 'gone' | 'business' | 'retry';

export interface ReplayCallResult {
  disposition: ReplayDisposition;
  data?: unknown;
  message?: string;
  /** true solo cuando el reintento se debe a red caída (status 0), no a error 5xx del server. */
  network?: boolean;
}

type AnyPayload = Record<string, unknown>;

function pick(p: AnyPayload, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (p[k] !== undefined) out[k] = p[k];
  }
  return out;
}

export async function replayCall(op: PendingOp, payload: AnyPayload): Promise<ReplayCallResult> {
  const tryRun = (): Promise<unknown> => {
    switch (op.op) {
      case 'openOrder':
        return apiClient.post('/operations/orders/open', pick(payload, ['tableId', 'waiter', 'clientOpId']));
      case 'quickOrder':
        return apiClient.post('/operations/orders/quick-bar', pick(payload, ['companyId', 'waiter', 'clientOpId']));
      case 'addItem':
        return apiClient.post(`/operations/orders/${String(payload.orderId)}/items`, pick(payload, ['productId', 'quantity', 'notes']));
      case 'updateItemQuantity':
        return apiClient.patch(`/operations/orders/${String(payload.orderId)}/items/${String(payload.itemId)}/quantity`, { delta: payload.delta });
      case 'updateItemNotes':
        return apiClient.patch(`/operations/orders/${String(payload.orderId)}/items/${String(payload.itemId)}/notes`, { notes: payload.notes });
      case 'removeItem':
        return apiClient.del(`/operations/orders/${String(payload.orderId)}/items/${String(payload.itemId)}`);
      case 'sendToKitchen':
        return apiClient.post(`/operations/orders/${String(payload.orderId)}/send-to-kitchen`, pick(payload, ['clientOpId']));
      case 'markForBilling':
        return apiClient.post(`/operations/tables/${String(payload.tableId)}/por-cobrar`);
      case 'payOrder':
        return apiClient.post(`/operations/tables/${String(payload.tableId)}/pay`, pick(payload, ['paymentMethod', 'amountReceived', 'customPaymentMethodId', 'referenceNumber', 'clientOpId']));
      case 'manualTransaction':
        return apiClient.post('/operations/transactions', pick(payload, ['companyId', 'type', 'description', 'amount', 'isIncome', 'bankAccountId', 'customPaymentMethodId', 'referenceNumber', 'clientOpId']));
      case 'createPurchase':
        return apiClient.post('/operations/purchases', pick(payload, ['companyId', 'category', 'supplierName', 'supplierRuc', 'invoiceNumber', 'documentStatus', 'provisionalNoteNumber', 'notes', 'shift', 'subtotal', 'igv', 'total', 'paymentStatus', 'paidFromCash', 'bankAccountId', 'bankAccountAlias', 'items', 'clientOpId']));
      case 'regularizePurchase':
        return apiClient.post(`/operations/purchases/${String(payload.purchaseId)}/regularize`, pick(payload, ['invoiceNumber', 'supplierRuc', 'notes', 'clientOpId']));
      case 'switchShift':
        return apiClient.post('/operations/shifts/switch', pick(payload, ['companyId', 'targetShift', 'reportedCash', 'initialCashForNext', 'notes', 'clientOpId']));
      case 'kardexAdjustment':
        return apiClient.post('/operations/kardex/adjustments', pick(payload, ['insumoId', 'quantity', 'type', 'reason', 'companyId', 'clientOpId']));
      default:
        throw new ApiError(`Operación desconocida en la cola de sincronización: ${op.op}`, 'UNKNOWN_OP', 422);
    }
  };

  const isCreateOrder = op.op === 'openOrder' || op.op === 'quickOrder';

  try {
    const data = await tryRun();
    return { disposition: 'ok', data };
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 0) return { disposition: 'retry', network: true };
      if (err.status === 401 || err.isUnauthorized) return { disposition: 'retry', network: false, message: err.message };
      if (err.status >= 500) return { disposition: 'retry', network: false, message: err.message };
      // 4xx
      if (err.code === 'ALREADY_REGULARIZED' || err.code === 'ALREADY_PAID') {
        return { disposition: 'already', message: err.message };
      }
      if (err.status === 404 && !isCreateOrder) {
        return { disposition: 'gone', message: err.message };
      }
      return { disposition: 'business', message: err.message };
    }
    return { disposition: 'retry' };
  }
}