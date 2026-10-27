import assert from 'node:assert/strict';
import { beforeEach, afterEach, mock, test } from 'node:test';
import { storeAuthToken } from '../src/lib/api';
import { releaseOrderTable, settleOpening, stageOrderOperation } from '../src/lib/orderLifecycle';
import { replayCall } from '../src/lib/replayQueue';
import { loadQueue, saveQueue } from '../src/lib/offlineQueue';
import type { OrderItem, PendingOp, Table } from '../src/types';
class MemoryStorage {
  data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
}
beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true });
  Object.defineProperty(globalThis, 'window', { value: new EventTarget(), configurable: true });
  storeAuthToken({ token: 'test', expiresAt: new Date(Date.now() + 60000).toISOString() });
});
afterEach(() => mock.restoreAll());
const item = { id: 'local', productId: 'water', quantity: 1, notes: '', status: 'agregado' } as OrderItem;
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
test('liberación tardía de un pedido anterior conserva mesa reabierta', () => {
  const table = { id: 't', status: 'ocupada', currentOrderId: 'new' } as Table;
  assert.equal(releaseOrderTable(table, 'old'), table);
  assert.equal(releaseOrderTable(table, 'new').status, 'libre');
  assert.equal(releaseOrderTable(table, 'new').currentOrderId, undefined);
});
test('replay de Delivery conserva ambiente e identificador de apertura', async () => {
  let request: { url: string; body: Record<string, unknown> } | null = null;
  mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    request = { url, body: JSON.parse(init.body as string) };
    return response({ id: 'order', tableNumber: '36' });
  });
  const op: PendingOp = { clientOpId: 'delivery-opening', entity: 'order', op: 'quickOrder',
    payload: { companyId: 'el-tayta', zone: 'Delivery', waiter: 'Prueba', clientOpId: 'delivery-opening' }, createdAt: new Date().toISOString() };
  assert.equal((await replayCall(op, op.payload as Record<string, unknown>)).disposition, 'ok');
  assert.deepEqual(request, { url: '/api/operations/orders/quick-bar',
    body: { companyId: 'el-tayta', zone: 'Delivery', waiter: 'Prueba', clientOpId: 'delivery-opening' } });
});
test('borrador retirado durante apertura llama cancelación, sin flush de productos', async () => {
  const calls: string[] = [];
  mock.method(globalThis, 'fetch', async (url: string) => { calls.push(url); return response({ id: 'order', isDeleted: true, status: 'anulado', items: [] }); });
  const result = await settleOpening('opening', () => []);
  assert.equal(result.cancelled, true); assert.equal(result.order?.isDeleted, true);
  assert.deepEqual(calls, ['/api/operations/orders/cancel-opening']);
});
test('retirar el último producto durante flush cancela después de recibir respuesta', async () => {
  let desired = [item]; const calls: string[] = [];
  mock.method(globalThis, 'fetch', async (url: string) => {
    calls.push(url);
    if (url.endsWith('opening-items')) { desired = []; return response({ id: 'order', items: [{ ...item, id: 'server' }] }); }
    return response({ id: 'order', isDeleted: true, status: 'anulado', items: [] });
  });
  const result = await settleOpening('opening', () => desired);
  assert.equal(result.cancelled, true);
  assert.deepEqual(calls, ['/api/operations/orders/opening-items', '/api/operations/orders/cancel-opening']);
});
test('cambios de cantidad durante apertura se reconcilian con el último borrador', async () => {
  let desired = [item]; const quantities: number[] = [];
  mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string); quantities.push(body.items[0].quantity);
    if (quantities.length === 1) desired = [{ ...item, quantity: 3 }];
    return response({ id: 'order', items: body.items });
  });
  const result = await settleOpening('opening', () => desired);
  assert.equal(result.cancelled, false); assert.deepEqual(quantities, [1, 3]); assert.equal(result.order?.items[0].quantity, 3);
});
test('cancelación concurrente confirmada por servidor no resucita pedido local', async () => {
  mock.method(globalThis, 'fetch', async () => response({ error: { code: 'ORDER_CANCELLED', message: 'Anulada' } }, 409));
  assert.deepEqual(await settleOpening('opening', () => [item]), { cancelled: true, order: null });
});
test('replay tras recarga conserva cancelación pendiente ante 401 y reintenta la misma apertura', async () => {
  const op: PendingOp = { clientOpId: 'cancel', entity: 'order', op: 'cancelOpening', payload: { openingClientOpId: 'opening' }, createdAt: new Date().toISOString() };
  saveQueue([op], true);
  mock.method(globalThis, 'fetch', async () => response({ error: { code: 'UNAUTHORIZED', message: 'Reingresa' } }, 401));
  const restored = loadQueue()[0];
  const failed = await replayCall(restored, restored.payload as Record<string, unknown>);
  assert.equal(failed.disposition, 'retry'); assert.equal(failed.unauthorized, true); assert.deepEqual(loadQueue(), [op]);
  storeAuthToken({ token: 'new', expiresAt: new Date(Date.now() + 60000).toISOString() });
  mock.restoreAll();
  mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(url, '/api/operations/orders/cancel-opening'); assert.equal(JSON.parse(init.body as string).openingClientOpId, 'opening');
    return response({ cancelled: true });
  });
  assert.equal((await replayCall(loadQueue()[0], op.payload as Record<string, unknown>)).disposition, 'ok');
});
test('DELETE y reducción en replay transmiten el identificador estable del reintento', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => { calls.push({ url, init }); return response({ isDeleted: true }); });
  const base = { clientOpId: 'stable', entity: 'orderItem', createdAt: new Date().toISOString() } as PendingOp;
  await replayCall({ ...base, op: 'removeItem' }, { orderId: 'order', itemId: 'item' });
  await replayCall({ ...base, op: 'updateItemQuantity' }, { orderId: 'order', itemId: 'item', delta: -1 });
  assert.ok(calls[0].url.endsWith('?clientOpId=stable'));
  assert.equal(JSON.parse(calls[1].init.body as string).clientOpId, 'stable');
});

test('cancelación durable reemplaza apertura y fallo de almacenamiento conserva el pendiente anterior', () => {
  const opening: PendingOp = { clientOpId: 'opening', entity: 'order', op: 'openOrder', payload: { tmpOrderId: 'order-tmp-1' }, createdAt: new Date().toISOString() };
  const cancellation: PendingOp = { ...opening, clientOpId: 'cancel', op: 'cancelOpening', payload: { openingClientOpId: 'opening' } };
  stageOrderOperation(opening);
  mock.method(localStorage, 'setItem', () => { throw new Error('Storage full'); });
  assert.throws(() => stageOrderOperation(cancellation, opening.clientOpId));
  assert.deepEqual(loadQueue(), [opening]);
  mock.restoreAll(); stageOrderOperation(cancellation, opening.clientOpId);
  assert.deepEqual(loadQueue(), [cancellation]);
});
