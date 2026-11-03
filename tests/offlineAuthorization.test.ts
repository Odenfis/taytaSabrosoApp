import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canReplayAction, pendingAuthorization } from '../src/lib/offlineAuthorization';
import { assertQueueOwner, loadQueue, saveQueue, setQueueIdentity, updateQueuedPayload } from '../src/lib/offlineQueue';
import { offlineOpNames } from '../server/src/lib/offline-actions';
import type { PendingOp } from '../src/types';

test('operaciones pendientes requieren autor, empresa y permisos vigentes', () => {
  const actor = { userId: 'a', authorizedCompanyIds: ['tayta'], canPerformAction: true };
  assert.equal(pendingAuthorization({ authorId: 'a', companyId: 'tayta' }, actor), 'author');
  assert.equal(pendingAuthorization({ companyId: 'tayta' }, actor), 'missing_author');
  assert.equal(pendingAuthorization({ authorId: 'a' }, actor), 'missing_company');
  assert.equal(pendingAuthorization({ authorId: 'b', companyId: 'tayta' }, actor), 'different_user');
  assert.equal(pendingAuthorization({ authorId: 'a', companyId: 'sabroso' }, actor), 'company_forbidden');
  assert.equal(pendingAuthorization({ authorId: 'a', companyId: 'tayta' }, { ...actor, canPerformAction: false }), 'permission_revoked');
});

test('replay local conserva operaciones cuando el perfil pierde permiso', () => {
  assert.equal(canReplayAction('Mesero', 'openOrder'), true);
  assert.equal(canReplayAction('Mesero', 'payOrder'), false);
  assert.equal(canReplayAction('Cajero', 'payOrder'), true);
  assert.equal(canReplayAction('Cajero', 'createProduct'), false);
  assert.equal(canReplayAction('Administrador', 'operacionDesconocida'), false);
});

test('cada operación del despachador tiene un permiso explícito para administrador', () => {
  const operations = offlineOpNames();
  assert.ok(operations.length > 0);
  for (const operation of operations) assert.equal(canReplayAction('Administrador', operation), true, operation);
});

test('la coincidencia de datos locales no demuestra quién creó una operación', () => {
  const actor = { userId: 'a', authorizedCompanyIds: ['tayta'], canPerformAction: true };
  const pending = { authorId: 'b', companyId: 'tayta' };
  assert.equal(pendingAuthorization(pending, actor), 'different_user');
  // El almacenamiento local puede modificarse: esta comprobación no es una prueba de autoría.
  pending.authorId = 'a';
  assert.equal(pendingAuthorization(pending, actor), 'author');
});

test('cola conserva autor original y no atribuye pendientes antiguos al nuevo usuario', () => {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) } });
  const old: PendingOp = { clientOpId: 'old', entity: 'order', op: 'openOrder', payload: {}, createdAt: '2026-01-01' };
  setQueueIdentity(null); saveQueue([old], true);
  setQueueIdentity({ authorId: 'a', companyFor: () => 'tayta' });
  const fresh = { ...old, clientOpId: 'new' };
  saveQueue([old, fresh], true);
  assert.equal(loadQueue()[0].authorId, undefined);
  assert.equal(loadQueue()[1].authorId, 'a');
  setQueueIdentity({ authorId: 'b', companyFor: () => 'sabroso' });
  assert.throws(() => assertQueueOwner(loadQueue()[0]), /requiere revisión/);
  assert.throws(() => assertQueueOwner(loadQueue()[1]), /otro usuario/);
  assert.throws(() => updateQueuedPayload('new', { stolen: true }), /otro usuario/);
  saveQueue(loadQueue().map((op) => ({ ...op, payload: { changed: true }, authorId: 'b', companyId: 'sabroso' })), true);
  assert.equal(loadQueue()[0].authorId, undefined);
  assert.equal(loadQueue()[1].authorId, 'a');
  assert.equal(loadQueue()[1].companyId, 'tayta');
  setQueueIdentity({ authorId: 'a', deviceId: 'terminal-actual', companyFor: () => 'tayta' });
  saveQueue(loadQueue(), true);
  assert.equal(loadQueue()[1].deviceId, undefined, 'una operación anterior sin terminal no debe atribuirse a la terminal actual');
  setQueueIdentity(null);
});

test('otro usuario, otra terminal o conflicto impiden cobrar sin conciliar; la cola se conserva', async () => {
  const { orderNeedsOfflineReview } = await import('../src/lib/offlineAuthorization');
  const queue = [{ clientOpId: 'x', entity: 'order', op: 'payDinerBill', payload: { orderId: 'order' }, authorId: 'author', deviceId: 'terminal', companyId: 'tayta', createdAt: '' }] as PendingOp[];
  const before = JSON.stringify(queue);
  assert.equal(orderNeedsOfflineReview(queue, 'order', 'author', 'terminal'), false);
  assert.equal(orderNeedsOfflineReview(queue, 'order', 'other', 'terminal'), true);
  assert.equal(orderNeedsOfflineReview(queue, 'order', 'author', 'other'), true);
  assert.equal(orderNeedsOfflineReview([{ ...queue[0], conflict: true }], 'order', 'author', 'terminal'), true);
  assert.equal(orderNeedsOfflineReview(queue, 'unrelated', 'other', 'other'), false);
  assert.equal(JSON.stringify(queue), before);
});
