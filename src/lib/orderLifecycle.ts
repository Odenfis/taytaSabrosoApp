import { apiClient, ApiError } from './api';
import type { OrderDTO } from './operationMapper';
import { loadQueue, saveQueue } from './offlineQueue';
import type { OrderItem, PendingOp, Table } from '../types';

export function stageOrderOperation(op: PendingOp, replacedId?: string): void {
  saveQueue([...loadQueue().filter((current) => current.clientOpId !== replacedId && current.clientOpId !== op.clientOpId), op], true);
}

export function releaseOrderTable(table: Table, orderId: string): Table {
  return table.currentOrderId === orderId
    ? { ...table, status: 'libre', currentOrderId: undefined, occupiedSince: undefined, minutesElapsed: undefined, waiter: undefined }
    : table;
}

// Se consulta el borrador después de cada respuesta: retirar un producto mientras
// viaja la apertura o el flush debe cancelar también el trabajo del servidor.
export async function settleOpening(openingClientOpId: string, desiredItems: () => OrderItem[]): Promise<{ cancelled: boolean; order: OrderDTO | null }> {
  const snapshot = () => desiredItems().map((item) => ({ productId: item.productId, quantity: item.quantity, notes: item.notes || undefined }));
  for (;;) {
    const desired = snapshot();
    if (!desired.length) {
      const result = await apiClient.post<OrderDTO | { cancelled: true }>('/operations/orders/cancel-opening', { openingClientOpId });
      return { cancelled: true, order: 'id' in result ? result : null };
    }
    try {
      const order = await apiClient.post<OrderDTO>('/operations/orders/opening-items', { openingClientOpId, items: desired });
      if (JSON.stringify(desired) === JSON.stringify(snapshot())) return { cancelled: false, order };
    } catch (error) {
      if (error instanceof ApiError && error.code === 'ORDER_CANCELLED') return { cancelled: true, order: null };
      throw error;
    }
  }
}
