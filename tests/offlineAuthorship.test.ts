import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { storeAuthToken } from '../src/lib/api';
import {
  ensureOfflineProof,
  ensureOfflineProofs,
  offlineSigningPublicKeyForTests,
  resetOfflineSigningForTests,
  seedOfflineSigningForTests,
} from '../src/lib/offlineSigning';
import {
  applyResolvedReferences,
  loadQueue,
  saveQueue,
  setQueueIdentity,
  updateQueuedPayload,
} from '../src/lib/offlineQueue';
import { clearResolution, recordResolution } from '../src/lib/offlineResolution';
import { offlineProofMatches } from '../src/lib/offlineSigning';
import { replayCall } from '../src/lib/replayQueue';
import { signReplay } from './replayFixtures';
import { verifyOfflineProof } from '../server/src/lib/offline-proof';
import type { PendingOp } from '../src/types';

const USER = 'author-user';
const DEVICE = 'author-device';
const COMPANY = 'el-tayta';

test('una resolución temporal no se confirma si falla el almacenamiento', () => {
  const previous = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null, setItem: () => { throw new Error('cuota'); } } });
  try {
    assert.throws(() => recordResolution('order-tmp-test', { openingClientOpId: 'apertura', orderId: 'real' }), /No se pudo guardar/);
  } finally {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: previous });
  }
});

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.get(key) ?? null; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) { this.data.set(key, value); }
}

const operation = (id = '4c9f8a3e-1d2b-4c5d-8e7f-a1b2c3d4e5f6'): PendingOp => ({
  clientOpId: id,
  entity: 'transaction',
  op: 'manualTransaction',
  payload: { companyId: COMPANY, type: 'INGRESO', description: 'Venta', amount: 10, isIncome: true },
  createdAt: new Date().toISOString(),
});

async function waitForProof(clientOpId: string): Promise<PendingOp> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const found = loadQueue().find((op) => op.clientOpId === clientOpId);
    // La prueba sirve solo si cubre el contenido actual de la operación.
    if (found && (found.proofs ?? []).some((proof) => offlineProofMatches(found, proof))) return found;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('La cola no firmó la operación a tiempo.');
}

beforeEach(() => {
  resetOfflineSigningForTests();
  Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true });
  Object.defineProperty(globalThis, 'window', { value: new EventTarget(), configurable: true });
  storeAuthToken({ token: 'test', expiresAt: new Date(Date.now() + 60_000).toISOString() });
});
afterEach(() => mock.restoreAll());

test('encolar firma con la clave no exportable de la terminal del autor', async () => {
  await seedOfflineSigningForTests(USER, DEVICE);
  setQueueIdentity({ authorId: USER, deviceId: DEVICE, companyFor: () => COMPANY });
  saveQueue([operation()], true);

  const signed = await waitForProof(operation().clientOpId);
  assert.equal(signed.authorId, USER);
  assert.equal(signed.deviceId, DEVICE);
  assert.equal(signed.proofs?.length, 1);
  assert.equal(signed.proofs?.[0].action, 'cash.manual');
  assert.equal(signed.proofs?.[0].signature.length, 86);
  const document = JSON.parse(signed.proofs![0].document);
  assert.equal(document.version, 2);
  assert.equal(document.authorId, USER);
  assert.equal(document.deviceId, DEVICE);
  assert.equal(document.companyId, COMPANY);
  assert.equal(document.action, 'cash.manual');
  assert.equal(document.method, 'POST');
  assert.equal(document.path, '/transactions');
  assert.equal(document.body.amount, 10);
  assert.equal(document.body.clientOpId, operation().clientOpId);
  const publicKey = await offlineSigningPublicKeyForTests(USER, DEVICE);
  assert.ok(publicKey);
  assert.ok(verifyOfflineProof(signed.proofs![0].document, signed.proofs![0].signature, publicKey));
  // Cualquier cambio posterior invalida la firma.
  assert.equal(verifyOfflineProof(signed.proofs![0].document.replace('"amount":10', '"amount":11'), signed.proofs![0].signature, publicKey), null);
});

test('editar el payload vuelve a firmar el contenido nuevo', async () => {
  await seedOfflineSigningForTests(USER, DEVICE);
  setQueueIdentity({ authorId: USER, deviceId: DEVICE, companyFor: () => COMPANY });
  const op = operation();
  saveQueue([op], true);
  const first = await waitForProof(op.clientOpId);

  assert.equal(updateQueuedPayload(op.clientOpId, { amount: 25 }), true);
  const resigned = await waitForProof(op.clientOpId);
  assert.notEqual(resigned.proofs![0].signature, first.proofs![0].signature);
  assert.equal(JSON.parse(resigned.proofs![0].document).body.amount, 25);
});

test('el replay envía la prueba en el cuerpo y las marcas de replay y asunción', async () => {
  await seedOfflineSigningForTests(USER, DEVICE);
  const op = await signReplay(operation(), COMPANY);
  const requests: Array<{ url: string; init: RequestInit }> = [];
  mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    requests.push({ url, init });
    return new Response(JSON.stringify({ id: 'tx-1' }));
  });

  const result = await replayCall(op, op.payload as Record<string, unknown>, { assume: true });
  assert.equal(result.disposition, 'ok');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/api/operations/transactions');
  const headers = requests[0].init.headers as Record<string, string>;
  assert.equal(headers['x-offline-replay'], '1');
  assert.equal(headers['x-offline-assume'], '1');
  const body = JSON.parse(requests[0].init.body as string);
  assert.equal(body.__proof.document, op.proofs![0].document);
  assert.equal(body.__proof.signature, op.proofs![0].signature);
  // El cuerpo enviado es exactamente el firmado (más la prueba).
  assert.equal(body.amount, 10);
  assert.equal(body.clientOpId, op.clientOpId);
});

test('sin prueba firmada el replay se rechaza antes de llamar al servidor', async () => {
  resetOfflineSigningForTests();
  const fetchMock = mock.method(globalThis, 'fetch', async () => new Response('{}'));
  const unsigned: PendingOp = { ...operation(), authorId: USER, companyId: COMPANY, deviceId: DEVICE };
  const result = await replayCall(unsigned, unsigned.payload as Record<string, unknown>);
  assert.equal(result.disposition, 'conflict');
  assert.match(result.message ?? '', /prueba de autoría/);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('la terminal no puede firmar una operación originada en otro equipo', async () => {
  await seedOfflineSigningForTests(USER, DEVICE);
  const foreign: PendingOp = { ...operation(), authorId: USER, companyId: COMPANY, deviceId: 'otra-terminal' };
  assert.equal(await ensureOfflineProof(foreign), null);
});

test('la prueba original se conserva para que un administrador pueda asumirla', async () => {
  const signed = await signReplay(operation());
  await seedOfflineSigningForTests('admin-user', DEVICE);
  const proofs = await ensureOfflineProofs(signed);
  assert.deepEqual(proofs, signed.proofs);
  assert.deepEqual(await ensureOfflineProof(signed), signed.proofs?.[0]);
});

test('una operación firmada por otro usuario tampoco se reutiliza en esta terminal', async () => {
  await seedOfflineSigningForTests(USER, DEVICE);
  const foreign: PendingOp = { ...operation(), authorId: 'otro-usuario', companyId: COMPANY, deviceId: DEVICE };
  assert.equal(await ensureOfflineProof(foreign), null);
});

test('la resolución de identificadores temporales sobrevive a la interrupción', () => {
  const opening: PendingOp = {
    clientOpId: '11111111-1111-4111-8111-111111111111',
    entity: 'order',
    op: 'openOrder',
    payload: { tableId: 'mesa-1', waiter: 'Cajero', clientOpId: '11111111-1111-4111-8111-111111111111', tmpOrderId: 'order-tmp-1' },
    createdAt: new Date().toISOString(),
  };
  const payment: PendingOp = {
    clientOpId: '22222222-2222-4222-8222-222222222222',
    entity: 'order',
    op: 'payOrder',
    payload: { orderId: 'order-tmp-1', tableId: 't-express-abc', paymentMethod: 'Efectivo', amountReceived: 10 },
    createdAt: new Date().toISOString(),
  };
  saveQueue([opening, payment], true);
  // La apertura se sincronizó y quedó registrada su resolución.
  recordResolution('order-tmp-1', {
    openingClientOpId: opening.clientOpId,
    orderId: 'pedido-real',
    tableId: 't-express-0123456789abcdef0123456789',
    tmpTableId: 't-express-abc',
  });

  assert.equal(applyResolvedReferences(), true);
  const stored = loadQueue().find((op) => op.clientOpId === payment.clientOpId);
  assert.equal((stored?.payload as Record<string, unknown>).orderId, 'pedido-real');
  assert.equal((stored?.payload as Record<string, unknown>).tableId, 't-express-0123456789abcdef0123456789');
});

test('una operación con referencia temporal sin resolver no se envía', async () => {
  await seedOfflineSigningForTests(USER, DEVICE);
  const op: PendingOp = {
    clientOpId: '33333333-3333-4333-8333-333333333333',
    entity: 'order',
    op: 'markForBilling',
    payload: { orderId: 'order-tmp-9', tableId: 't-express-sin-resolver' },
    createdAt: new Date().toISOString(),
  };
  recordResolution('order-tmp-9', {
    openingClientOpId: '44444444-4444-4444-8444-444444444444',
    orderId: 'pedido-real',
    tableId: 't-express-0123456789abcdef0123456789',
    tmpTableId: 't-express-sin-resolver',
  });
  const signed = await signReplay(op, COMPANY);
  // La apertura se pierde: la referencia temporal ya no se puede resolver.
  clearResolution('order-tmp-9');
  const fetchMock = mock.method(globalThis, 'fetch', async () => new Response('{}'));
  const result = await replayCall(signed, signed.payload as Record<string, unknown>);
  assert.equal(result.disposition, 'conflict');
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('la referencia temporal se firma como marcador y la prueba sobrevive a su sustitución', async () => {
  await seedOfflineSigningForTests(USER, DEVICE);
  const openingClientOpId = '66666666-6666-4666-8666-666666666666';
  const op: PendingOp = {
    clientOpId: '55555555-5555-4555-8555-555555555555',
    entity: 'order',
    op: 'payOrder',
    payload: { orderId: 'order-tmp-1', tableId: 't-express-abc', paymentMethod: 'Efectivo', amountReceived: 10 },
    createdAt: new Date().toISOString(),
  };
  recordResolution('order-tmp-1', {
    openingClientOpId,
    orderId: 'pedido-real',
    tableId: 't-express-0123456789abcdef0123456789',
    tmpTableId: 't-express-abc',
  });
  const signed = await signReplay(op, COMPANY);
  const document = JSON.parse(signed.proofs![0].document);
  // La mesa viaja como marcador lógico: el servidor la resuelve contra la apertura.
  assert.deepEqual(document.params.id, { tableRef: { openingClientOpId } });
  assert.equal(offlineProofMatches(signed, signed.proofs![0]), true);

  saveQueue([signed], true);
  assert.equal(applyResolvedReferences(), true);
  const stored = loadQueue().find((entry) => entry.clientOpId === op.clientOpId);
  assert.equal((stored?.payload as Record<string, unknown>).tableId, 't-express-0123456789abcdef0123456789');
  // El contenido firmado no cambió: la prueba sigue cubriendo la operación.
  assert.equal(offlineProofMatches(stored!, stored!.proofs![0]), true);
});

test('pendiente antiguo con terminal declarada no adquiere firma al iniciar sesión', async () => {
  await seedOfflineSigningForTests(USER, DEVICE);
  setQueueIdentity({ authorId: USER, deviceId: DEVICE, companyFor: () => COMPANY });
  const legacy = { ...operation(), clientOpId: 'legacy-inferred-device', authorId: USER, deviceId: DEVICE, companyId: COMPANY };
  localStorage.setItem('ts_pending_queue_v2', JSON.stringify([legacy]));
  saveQueue(loadQueue(), true);
  assert.equal(await ensureOfflineProofs(legacy), null);
  assert.deepEqual(loadQueue(), [legacy]);
});
