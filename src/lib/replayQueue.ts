import { isInsumoOp, runInsumoRequest } from './insumoCatalog';
import type { PendingOp } from '../types';
import { apiClient, ApiError } from './api';
import { isProductOp, productIdOf, signalProductQueue } from './productCatalog';

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

export type ReplayDisposition = 'ok' | 'already' | 'gone' | 'business' | 'retry' | 'conflict';

export interface ReplayCallResult {
  disposition: ReplayDisposition;
  data?: unknown;
  message?: string;
  /** true solo cuando el reintento se debe a red caída (status 0), no a error 5xx del server. */
  network?: boolean;
  unauthorized?: boolean;
}

type AnyPayload = Record<string, unknown>;

function pick(p: AnyPayload, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (p[k] !== undefined) out[k] = p[k];
  }
  return out;
}

const productRequests = new Map<string, Promise<ReplayCallResult>>();
const sendingProducts = new Set<string>();
export const productIsSending = (id: string) => sendingProducts.has(id);
export function replayCall(op: PendingOp, payload: AnyPayload): Promise<ReplayCallResult> {
  if (isInsumoOp(op)) return runInsumoRequest(op, () => replayOne(op, payload));
  if (!isProductOp(op)) return replayOne(op, payload);
  const existing = productRequests.get(op.clientOpId);
  if (existing) return existing;
  const id = productIdOf(op);
  sendingProducts.add(id);
  const request = replayOne(op, payload).finally(() => {
    productRequests.delete(op.clientOpId); sendingProducts.delete(id); signalProductQueue();
  });
  productRequests.set(op.clientOpId, request);
  signalProductQueue();
  return request;
}
async function replayOne(op: PendingOp, payload: AnyPayload): Promise<ReplayCallResult> {
  const tryRun = async (): Promise<unknown> => {
    switch (op.op) {
      case 'openOrder':
        return apiClient.post('/operations/orders/open', pick(payload, ['tableId', 'waiter', 'clientOpId']));
      case 'quickOrder':
        return apiClient.post('/operations/orders/quick-bar', pick(payload, ['companyId', 'waiter', 'clientOpId']));
      case 'cancelOpening':
        return apiClient.post('/operations/orders/cancel-opening', { openingClientOpId: payload.openingClientOpId });
      case 'addItem':
        return apiClient.post(`/operations/orders/${String(payload.orderId)}/items`, pick(payload, ['productId', 'quantity', 'notes']));
      case 'updateItemQuantity':
        return apiClient.patch(`/operations/orders/${String(payload.orderId)}/items/${String(payload.itemId)}/quantity`, { delta: payload.delta, clientOpId: op.clientOpId });
      case 'updateItemNotes':
        return apiClient.patch(`/operations/orders/${String(payload.orderId)}/items/${String(payload.itemId)}/notes`, { notes: payload.notes });
      case 'removeItem':
        return apiClient.del(`/operations/orders/${String(payload.orderId)}/items/${String(payload.itemId)}?clientOpId=${encodeURIComponent(op.clientOpId)}`);
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
        return apiClient.post(`/operations/purchases/${String(payload.purchaseId)}/regularize`, pick(payload, ['invoiceNumber', 'supplierRuc', 'notes', 'items', 'clientOpId']));
      case 'switchShift':
        return apiClient.post('/operations/shifts/switch', pick(payload, ['companyId', 'targetShift', 'reportedCash', 'initialCashForNext', 'notes', 'clientOpId']));
      case 'kardexAdjustment':
        return apiClient.post('/operations/kardex/adjustments', pick(payload, ['insumoId', 'quantity', 'type', 'reason', 'companyId', 'clientOpId']));
      // ---- Fase E5: mutaciones de catálogos (el payload lleva solo campos del server;
      // `tempId`/`clientOpId` se excluyen salvo que la ruta los acepte) ----
      case 'createProduct':
        return apiClient.post('/catalogs/products', { ...pick(payload, ['id', 'companyId', 'name', 'description', 'price', 'category', 'image', 'available']), clientOpId: op.clientOpId });
      case 'updateProduct':
        return apiClient.patch(`/catalogs/products/${String(payload.id)}`, { ...pick(payload, ['name', 'description', 'price', 'category', 'image', 'available', 'expectedVersion']), clientOpId: op.clientOpId });
      case 'createTable':
        return apiClient.post('/catalogs/tables', pick(payload, ['companyId', 'number', 'capacity', 'zone', 'notes']));
      case 'updateTable':
        return apiClient.patch(`/catalogs/tables/${String(payload.id)}`, pick(payload, ['number', 'capacity', 'zone', 'notes', 'status']));
      case 'deleteTable':
        return apiClient.del(`/catalogs/tables/${String(payload.id)}`);
      case 'createBankAccount':
        return apiClient.post('/catalogs/bank-accounts', pick(payload, ['companyId', 'bankName', 'accountNumber', 'cci', 'accountType', 'currency', 'holderName', 'alias', 'currentBalance', 'notes']));
      case 'updateBankAccount':
        return apiClient.patch(`/catalogs/bank-accounts/${String(payload.id)}`, pick(payload, ['bankName', 'accountNumber', 'cci', 'accountType', 'currency', 'holderName', 'alias', 'currentBalance', 'isActive', 'notes']));
      case 'deleteBankAccount':
        return apiClient.del(`/catalogs/bank-accounts/${String(payload.id)}`);
      case 'createPaymentMethod':
        return apiClient.post('/catalogs/payment-methods', pick(payload, ['companyId', 'name', 'category', 'bankAccountId', 'commissionPct', 'requiresReferenceNumber', 'icon']));
      case 'updatePaymentMethod':
        return apiClient.patch(`/catalogs/payment-methods/${String(payload.id)}`, pick(payload, ['companyId', 'name', 'category', 'bankAccountId', 'commissionPct', 'requiresReferenceNumber', 'icon', 'isActive']));
      case 'deletePaymentMethod':
        return apiClient.del(`/catalogs/payment-methods/${String(payload.id)}`);
      case 'createPrinter':
        return apiClient.post('/catalogs/printers', pick(payload, ['companyId', 'name', 'role', 'connectionType', 'ipAddress', 'port', 'paperWidth', 'autoCut', 'beepOnPrint', 'categories']));
      case 'updatePrinter':
        return apiClient.patch(`/catalogs/printers/${String(payload.id)}`, pick(payload, ['name', 'role', 'connectionType', 'ipAddress', 'port', 'paperWidth', 'autoCut', 'beepOnPrint', 'status', 'isEnabled', 'categories']));
      case 'deletePrinter':
        return apiClient.del(`/catalogs/printers/${String(payload.id)}`);
      case 'createRecipe':
        return apiClient.post('/catalogs/recipes', pick(payload, ['id', 'companyId', 'productId', 'productName', 'category', 'portions', 'salePrice', 'totalCost', 'theoreticalFoodCostPct', 'preparationNotes', 'ingredients']));
      case 'updateRecipe':
        return apiClient.patch(`/catalogs/recipes/${String(payload.id)}`, pick(payload, ['productId', 'productName', 'category', 'portions', 'salePrice', 'totalCost', 'theoreticalFoodCostPct', 'preparationNotes', 'ingredients']));
      case 'deleteRecipe':
        return apiClient.del(`/catalogs/recipes/${String(payload.id)}`);
      case 'createInsumo':
        return apiClient.post('/catalogs/insumos', { ...pick(payload, ['id', 'companyId', 'name', 'category', 'unit', 'currentStock', 'minStock', 'costPerUnit', 'lastPurchaseDate']), clientOpId: op.clientOpId });
      case 'updateInsumo':
        return apiClient.patch(`/catalogs/insumos/${String(payload.id)}`, { ...pick(payload, ['name', 'category', 'unit', 'minStock', 'costPerUnit', 'expectedVersion']), clientOpId: op.clientOpId });
      case 'deleteInsumo':
        return apiClient.del(`/catalogs/insumos/${String(payload.id)}${payload.expectedVersion ? `?expectedVersion=${Number(payload.expectedVersion)}` : ''}`);
      case 'saveRecipe': {
        // Upsert: intenta PATCH y si la receta no existe (404) la crea con POST.
        const id = String(payload.id);
        const body = pick(payload, ['productId', 'productName', 'category', 'portions', 'salePrice', 'totalCost', 'theoreticalFoodCostPct', 'preparationNotes', 'ingredients']);
        try {
          return await apiClient.patch(`/catalogs/recipes/${id}`, body);
        } catch (err) {
          if (err instanceof ApiError && err.status === 404) {
            return await apiClient.post('/catalogs/recipes', {
              ...pick(payload, ['id', 'companyId', 'productId', 'productName', 'category', 'portions', 'salePrice', 'totalCost', 'theoreticalFoodCostPct', 'preparationNotes', 'ingredients']),
            });
          }
          throw err;
        }
      }
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
      if (err.status === 401 || err.isUnauthorized) return { disposition: 'retry', network: false, unauthorized: true, message: err.message };
      if (err.status >= 500) return { disposition: 'retry', network: false, message: err.message };
      if (err.code.startsWith('INSUMO_')) return { disposition: 'conflict', message: err.message };
      if (isProductOp(op) && err.code === 'PRODUCT_VERSION_CONFLICT') return { disposition: 'conflict', message: err.message };
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
