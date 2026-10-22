import assert from 'node:assert/strict';
import { beforeEach, afterEach, mock, test } from 'node:test';
import { stageInsumo, stageInsumoDelete, overlayInsumos, insumoPending, markInsumoIssue, insumoIsSending, type InsumoDraft } from '../src/lib/insumoCatalog';
import { loadQueue } from '../src/lib/offlineQueue';
import { replayCall } from '../src/lib/replayQueue';
import { storeAuthToken } from '../src/lib/api';
import type { Insumo } from '../src/types';
class MemoryStorage { data = new Map<string, string>(); getItem(key: string) { return this.data.get(key) ?? null; } setItem(key: string, value: string) { this.data.set(key, value); } removeItem(key: string) { this.data.delete(key); } }
beforeEach(() => { Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true }); Object.defineProperty(globalThis, 'window', { value: new EventTarget(), configurable: true }); storeAuthToken({ token: 'test', expiresAt: new Date(Date.now() + 60000).toISOString() }); });
afterEach(() => mock.restoreAll());
const draft: InsumoDraft = { companyId: 'el-tayta', name: 'Sal', category: 'Abarrotes & Especias', unit: 'kg', currentStock: 0, minStock: 5, costPerUnit: 2 };
const current: Insumo = { ...draft, id: 'ins-existing', code: 'INS-001', lastPurchaseDate: '', version: 3 };
test('alta durable con UUID, coalescencia y reconstrucción después de recargar', () => {
  const op = stageInsumo(draft); const id = String((op.payload as any).id);
  assert.match(id, /^[a-f0-9-]{36}$/);
  const restored = overlayInsumos([], [])[0]; assert.equal(restored.id, id);
  stageInsumo({ ...draft, name: 'Sal fina', minStock: 0 }, restored);
  assert.equal(loadQueue().length, 1); assert.equal(loadQueue()[0].op, 'createInsumo');
  assert.equal(overlayInsumos([], [])[0].minStock, 0); assert.equal(overlayInsumos([], [])[0].name, 'Sal fina');
});
test('fallo de storage no materializa cambios ni anuncia éxito', () => {
  mock.method(localStorage, 'setItem', () => { throw new Error('quota'); });
  assert.throws(() => stageInsumo(draft)); assert.deepEqual(loadQueue(), []);
});
test('edición conserva solo cambios explícitos y expectedVersion original', () => {
  stageInsumo({ ...draft, name: 'Sal nueva' }, current);
  assert.equal((loadQueue()[0].payload as any).costPerUnit, undefined);
  assert.equal((loadQueue()[0].payload as any).currentStock, undefined);
  stageInsumo({ ...draft, name: 'Sal nueva', minStock: 0 }, { ...current, name: 'Sal nueva', version: 9 });
  assert.equal((loadQueue()[0].payload as any).expectedVersion, 3);
  const server = { ...current, version: 10, currentStock: 8, costPerUnit: 7 };
  const visible = overlayInsumos([server], [current])[0]; assert.equal(visible.currentStock, 8); assert.equal(visible.costPerUnit, 7); assert.equal(visible.name, 'Sal nueva');
});
test('refresco antiguo no reemplaza código, mínimo o versión más recientes', () => {
  const local = { ...current, version: 5, code: 'INS-099', minStock: 0 };
  assert.deepEqual(overlayInsumos([current], [local]), [local]);
});
test('conflicto persistido impide sobrescritura y eliminación no omite edición pendiente', () => {
  const op = stageInsumo({ ...draft, name: 'Cambio' }, current); markInsumoIssue(op, 'Cambió');
  assert.equal(insumoPending()[0].conflict, true);
  assert.throws(() => stageInsumo(draft, current)); assert.throws(() => stageInsumoDelete(current));
});
test('eliminar alta offline conserva primero el alta y luego la baja para resolver respuestas perdidas', () => {
  const op = stageInsumo(draft); const created = overlayInsumos([], [])[0]; stageInsumoDelete(created);
  assert.deepEqual(loadQueue().map((p) => p.op), ['createInsumo', 'deleteInsumo']);
  assert.equal((loadQueue()[1].payload as any).id, (op.payload as any).id);
  assert.equal((loadQueue()[1].payload as any).expectedVersion, 1);
});
test('replay de edición usa delta y convierte errores de insumo en revisión', async () => {
  const op = stageInsumo({ ...draft, minStock: 0 }, current);
  mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string); assert.equal(body.minStock, 0); assert.equal(body.expectedVersion, 3); assert.equal(body.companyId, undefined); assert.equal(body.currentStock, undefined);
    return new Response(JSON.stringify({ error: { code: 'INSUMO_VERSION_CONFLICT', message: 'Cambió' } }), { status: 409 });
  });
  assert.equal((await replayCall(op, op.payload as any)).disposition, 'conflict'); assert.equal(loadQueue().length, 1);
});
test('replay dependiente de compra con insumo eliminado se conserva para revisión', async () => {
  mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ error: { code: 'INSUMO_DELETED', message: 'Eliminado' } }), { status: 409 }));
  assert.equal((await replayCall({ clientOpId: 'p', op: 'createPurchase', entity: 'purchase', payload: {}, createdAt: '' }, {})).disposition, 'conflict');
});
test('401 conserva el alta y doble envío comparte una sola petición', async () => {
  const op = stageInsumo(draft); let calls = 0;
  mock.method(globalThis, 'fetch', async () => { calls++; return new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Reingresa' } }), { status: 401 }); });
  const a = replayCall(op, op.payload as any); const b = replayCall(op, op.payload as any);
  assert.equal(insumoIsSending(String((op.payload as any).id)), true);
  assert.equal((await a).disposition, 'retry'); await b; assert.equal(calls, 1); assert.equal(loadQueue().length, 1);
});
