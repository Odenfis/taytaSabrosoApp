import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import {
  apiClient, ApiError, AUTH_REQUIRED_EVENT, getAuthToken,
  requireAuthentication, storeAuthToken,
} from '../src/lib/api';
import { getTerminalIdentity } from '../src/lib/terminal';
import { enqueue, loadQueue } from '../src/lib/offlineQueue';
import { replayCall } from '../src/lib/replayQueue';
import type { PendingOp } from '../src/types';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.get(key) ?? null; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) { this.data.set(key, value); }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true });
  Object.defineProperty(globalThis, 'window', { value: new EventTarget(), configurable: true });
});
afterEach(() => mock.restoreAll());

const auth = (token: string) => ({ token, expiresAt: new Date(Date.now() + 60000).toISOString() });

test('terminal estable entre llamadas y sesiones; otra instalación recibe otro código', () => {
  const first = getTerminalIdentity();
  storeAuthToken(auth('first'));
  requireAuthentication('first', 'expired');
  assert.deepEqual(getTerminalIdentity(), first);
  assert.match(first.deviceCode, /^TERM-[A-F0-9]{24}$/);
  assert.ok(first.deviceCode.length <= 30);
  localStorage.clear(); // otro perfil/origen
  assert.notEqual(getTerminalIdentity().deviceCode, first.deviceCode);
});

test('no se inicia con identidad efímera si no se puede persistir', () => {
  mock.method(localStorage, 'setItem', () => { throw new Error('QuotaExceeded'); });
  assert.throws(getTerminalIdentity, (err) => err instanceof ApiError && err.code === 'TERMINAL_STORAGE_UNAVAILABLE');
});

test('401 durante replay conserva la operación y solicita autenticación una sola vez', async () => {
  const op: PendingOp = {
    clientOpId: 'queued-id', entity: 'order', op: 'openOrder',
    payload: { tableId: 'table-1' }, createdAt: new Date().toISOString(),
  };
  enqueue(op);
  const serialized = localStorage.getItem('ts_pending_queue_v2');
  storeAuthToken(auth('expired-session'));
  let notices = 0;
  window.addEventListener(AUTH_REQUIRED_EVENT, () => notices++);
  mock.method(globalThis, 'fetch', async () => new Response(
    JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Sesión revocada' } }), { status: 401 }
  ));
  const result = await replayCall(op, op.payload as Record<string, unknown>);
  assert.equal(result.disposition, 'retry');
  assert.equal(result.unauthorized, true);
  assert.equal(result.network, false);
  assert.equal(notices, 1);
  assert.equal(getAuthToken(), null);
  assert.equal(localStorage.getItem('ts_pending_queue_v2'), serialized);
  assert.deepEqual(loadQueue(), [op]);

  storeAuthToken(auth('new-session'));
  mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ id: 'order-1' }), { status: 200 }));
  assert.equal((await replayCall(op, op.payload as Record<string, unknown>)).disposition, 'ok');
});

test('una respuesta 401 tardía no invalida la nueva sesión', async () => {
  storeAuthToken(auth('old-session'));
  let resolveResponse!: (response: Response) => void;
  mock.method(globalThis, 'fetch', () => new Promise<Response>((resolve) => { resolveResponse = resolve; }));
  const pending = apiClient.get('/auth/me');
  storeAuthToken(auth('new-session'));
  resolveResponse(new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED' } }), { status: 401 }));
  await assert.rejects(pending, (err) => err instanceof ApiError && err.status === 401);
  assert.equal(getAuthToken()?.token, 'new-session');
});

test('errores de infraestructura y PIN incorrecto conservan la sesión almacenada', async () => {
  storeAuthToken(auth('current-session'));
  mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 500 }));
  await assert.rejects(apiClient.get('/auth/me'));
  assert.equal(getAuthToken()?.token, 'current-session');
  mock.method(globalThis, 'fetch', async (_url: unknown, options?: RequestInit) => {
    assert.equal((options?.headers as Record<string, string>).Authorization, undefined);
    return new Response(JSON.stringify({ error: { code: 'INVALID_CREDENTIALS' } }), { status: 401 });
  });
  await assert.rejects(apiClient.post('/auth/login', { pin: 'wrong' }));
  assert.equal(getAuthToken()?.token, 'current-session');
});

test('login puede ejecutarse aunque exista un token local vencido', async () => {
  storeAuthToken({ token: 'expired', expiresAt: new Date(0).toISOString() });
  mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ token: 'fresh' })));
  assert.deepEqual(await apiClient.post('/auth/login', { pin: '1234' }), { token: 'fresh' });
});

test('expiración local pide autenticación sin enviar la operación ni borrar la cola', async () => {
  storeAuthToken({ token: 'expired', expiresAt: new Date(0).toISOString() });
  localStorage.setItem('ts_pending_queue_v2', '[{"clientOpId":"pending"}]');
  const fetchMock = mock.method(globalThis, 'fetch', async () => new Response('{}'));
  let notices = 0;
  window.addEventListener(AUTH_REQUIRED_EVENT, () => notices++);
  await assert.rejects(apiClient.get('/auth/me'), (err) => err instanceof ApiError && err.status === 401);
  assert.equal(fetchMock.mock.callCount(), 0);
  assert.equal(notices, 1);
  assert.equal(loadQueue().length, 1);
});
