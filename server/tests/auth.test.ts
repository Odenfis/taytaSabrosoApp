import assert from 'node:assert/strict';
import { after, afterEach, beforeEach, mock, test } from 'node:test';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { generateKeyPairSync } from 'node:crypto';
import { io as connect, type Socket as ClientSocket } from 'socket.io-client';
import type { Server as SocketServer } from 'socket.io';
import { createApp } from '../src/app.js';
import { emitKardexChanged, initRealtime } from '../src/lib/realtime.js';
import { prisma } from '../src/lib/prisma.js';
import { authenticateAccessToken, hashToken, signAccessToken } from '../src/lib/auth.js';

// Integración HTTP + Socket.IO real; repositorio de sesiones en memoria.
// Estas pruebas nunca conectan ni modifican la BD del restaurante.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-secret-not-for-production';
process.env.CORS_ORIGIN = 'http://localhost:3000';

const user = {
  id: 'user-test', name: 'Usuario de prueba', role: 'Cajero',
  companyId: null as string | null, assignedCompanyId: null as string | null, isActive: true, isDeleted: false,
  pinHash: bcrypt.hashSync('1234', 4), passwordHash: 'private',
};
const device = { id: 'device-test', isActive: true, terminalCode: 'TERM-TEST' };
const claims = { sub: user.id, deviceId: device.id, role: user.role, name: user.name };
type TestSession = {
  userId: string; deviceId: string; tokenHash: string; expiresAt: Date;
  user: typeof user; device: typeof device;
};
let sessions: Map<string, TestSession>;
let databaseFailure: Error | null;
let http: HttpServer;
let realtime: SocketServer;
let url: string;
let clients: ClientSocket[];
let restoreRepository: Array<() => void> = [];

// Los delegates de Prisma son proxies, sin descriptors de métodos para mock.method.
function stubRepository(target: object, method: string, implementation: (...args: any[]) => unknown) {
  const delegate = target as Record<string, unknown>;
  const original = delegate[method];
  delegate[method] = implementation;
  restoreRepository.push(() => { delegate[method] = original; });
}

beforeEach(async () => {
  sessions = new Map();
  clients = [];
  databaseFailure = null;
  stubRepository(prisma.session, 'findUnique', async ({ where }: { where: { tokenHash: string } }) => {
    if (databaseFailure) throw databaseFailure;
    return sessions.get(where.tokenHash) ?? null;
  });
  stubRepository(prisma.session, 'create', async ({ data }: { data: TestSession }) => {
    const session = { ...data, user: { ...user }, device: { ...device } };
    sessions.set(data.tokenHash, session);
    return session;
  });
  stubRepository(prisma.session, 'deleteMany', async ({ where }: { where: { tokenHash: string } }) => {
    if (databaseFailure) throw databaseFailure;
    return { count: Number(sessions.delete(where.tokenHash)) };
  });
  stubRepository(prisma.user, 'findMany', async () => [user]);
  stubRepository(prisma.user, 'findFirst', async () => user);
  stubRepository(prisma.device, 'upsert', async () => device);
  stubRepository(prisma.device, 'update', async () => device);
  stubRepository(prisma.clientOp, 'upsert', async () => ({}));
  stubRepository(prisma.company, 'findMany', async ({ where }: { where?: { id?: string } } = {}) => (
    ['el-tayta', 'el-sabroso'].filter((id) => !where?.id || where.id === id).map((id) => ({ id }))
  ));
  stubRepository(prisma.companyShift, 'findMany', async () => []);
  mock.method(console, 'error', () => undefined);
  http = createServer(createApp());
  realtime = initRealtime(http);
  await new Promise<void>((resolve, reject) => {
    http.once('error', reject);
    http.listen(0, '127.0.0.1', resolve);
  });
  url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
});

afterEach(async () => {
  for (const client of clients) client.disconnect();
  http?.closeAllConnections();
  if (realtime && http.listening) await new Promise<void>((resolve) => realtime.close(() => resolve()));
  for (const restore of restoreRepository.reverse()) restore();
  restoreRepository = [];
  mock.restoreAll();
});

after(async () => {
  await prisma.$disconnect();
});

function sessionToken() {
  const token = signAccessToken(claims);
  sessions.set(hashToken(token), {
    ...claims, userId: user.id, tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + 60000),
    user: { ...user }, device: { ...device },
  });
  return token;
}

function getSession(token: string) { return sessions.get(hashToken(token))!; }

test('registro de clave usa identidad autenticada, impide reutilización ajena y respeta revocación', async () => {
  const token = sessionToken();
  const jwk = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).publicKey.export({ format: 'jwk' });
  const body = { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
  let key: any;
  stubRepository(prisma.offlineSigningKey, 'findUnique', async ({ where }: any) => key && (where.id === key.id || where.fingerprint === key.fingerprint) ? key : null);
  stubRepository(prisma.offlineSigningKey, 'create', async ({ data }: any) => (key = { ...data, revokedAt: null }));
  stubRepository(prisma.offlineSigningKey, 'updateMany', async ({ data }: any) => { Object.assign(key, data); return { count: 1 }; });
  stubRepository(prisma, '$transaction', async (run: any) => run(prisma));
  stubRepository(prisma.user, 'findUniqueOrThrow', async () => user);
  const audits: any[] = [];
  stubRepository(prisma.userAccessAudit, 'create', async ({ data }: any) => { audits.push(data); return data; });
  assert.equal((await request('/sync/signing-keys', undefined, body)).status, 401);
  assert.equal((await request('/sync/signing-keys', token, { ...body, userId: 'otro' })).status, 400);
  const created = await request('/sync/signing-keys', token, body);
  assert.equal(created.status, 201);
  assert.equal(key.userId, user.id);
  assert.equal(key.deviceId, device.id);
  assert.equal((await request('/sync/signing-keys', token, body)).status, 200);
  getSession(token).user.id = 'otro';
  assert.equal((await request('/sync/signing-keys', token, body)).status, 409);
  const remove = () => fetch(`${url}/api/sync/signing-keys/${key.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  assert.equal((await remove()).status, 404);
  getSession(token).user.id = user.id;
  assert.equal((await remove()).status, 200);
  assert.equal(key.revokedBy, user.id);
  assert.equal(audits[0].actorUserId, user.id);
  assert.equal(audits[0].deviceId, device.id);
  assert.equal(audits[0].action, 'revocar_clave_offline');
  assert.equal((await request('/sync/signing-keys', token, body)).status, 409);
});

test('informes financieros rechazan perfiles limitados y empresas ajenas mediante HTTP', async () => {
  const token = sessionToken();
  for (const role of ['Mesero', 'Cajero', 'Jefe de restaurante', 'Coordinador']) {
    getSession(token).user.role = role;
    assert.equal((await request('/reports/summary', token)).status, 403, role);
    assert.equal((await request('/reports/ratios', token)).status, 403, role);
  }
  getSession(token).user.role = 'Administrador';
  getSession(token).user.assignedCompanyId = 'el-tayta';
  assert.equal((await request('/reports/summary?companyId=el-sabroso', token)).status, 403);
  assert.equal((await request('/reports/ratios?companyId=el-sabroso', token)).status, 403);
});

test('informe de administrador limitado excluye movimientos sin empresa mediante HTTP', async () => {
  const token = sessionToken();
  getSession(token).user.role = 'Administrador';
  getSession(token).user.assignedCompanyId = 'el-tayta';
  let transactionWhere: unknown;
  stubRepository(prisma.transaction, 'findMany', async ({ where }: { where: unknown }) => { transactionWhere = where; return []; });
  stubRepository(prisma.order, 'findMany', async () => []);
  stubRepository(prisma.table, 'findMany', async () => []);
  stubRepository(prisma.shiftRecord, 'findMany', async () => []);
  stubRepository(prisma.companyShift, 'findUnique', async () => null);
  const response = await request('/reports/summary', token);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).companyId, 'el-tayta');
  assert.deepEqual(transactionWhere, { isDeleted: false, companyId: 'el-tayta' });
});

test('cuentas bancarias requieren administrador y respetan empresa en HTTP', async () => {
  const token = sessionToken();
  let writes = 0;
  stubRepository(prisma.bankAccount, 'findUnique', async () => ({ companyId: 'el-sabroso', isDeleted: false }));
  stubRepository(prisma.bankAccount, 'update', async () => { writes++; return {}; });
  for (const role of ['Mesero', 'Cajero', 'Jefe de restaurante']) {
    getSession(token).user.role = role;
    assert.equal((await request('/catalogs/bank-accounts', token)).status, 403, role);
    assert.equal((await request('/catalogs/bank-accounts', token, {})).status, 403, role);
  }
  getSession(token).user.role = 'Administrador';
  getSession(token).user.assignedCompanyId = 'el-tayta';
  assert.equal((await request('/catalogs/bank-accounts?companyId=el-sabroso', token)).status, 403);
  const response = await fetch(`${url}/api/catalogs/bank-accounts/other`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(response.status, 403);
  assert.equal(writes, 0);
});

test('medios de pago no revelan cuentas ni comisiones a cajero', async () => {
  const token = sessionToken();
  getSession(token).user.role = 'Cajero';
  getSession(token).user.assignedCompanyId = 'el-tayta';
  let receivedWhere: unknown;
  stubRepository(prisma.customPaymentMethod, 'findMany', async ({ where }: { where: unknown }) => {
    receivedWhere = where;
    return [{ id: 'method', name: 'Yape', companyId: 'el-tayta', bankAccountId: 'account', bankAccountAlias: 'privado', commissionPct: 2, bankAccount: { accountNumber: 'privado', currentBalance: 500 } }];
  });
  const response = await request('/catalogs/payment-methods', token);
  assert.equal(response.status, 200);
  const [method] = await response.json();
  assert.equal(method.name, 'Yape');
  assert.equal(method.bankAccount, undefined);
  assert.equal(method.bankAccountAlias, undefined);
  assert.equal(method.commissionPct, undefined);
  assert.deepEqual(receivedWhere, { isDeleted: false, OR: [{ companyId: 'el-tayta' }, { companyId: null }] });
  assert.equal((await request('/catalogs/payment-methods', token, {})).status, 403);
});

test('API rechaza acciones no permitidas aunque se invoquen directamente', async () => {
  const token = sessionToken();
  const forbidden = async (role: string, path: string, method = 'GET') => {
    getSession(token).user.role = role;
    const response = await fetch(`${url}/api${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(method === 'GET' ? {} : { body: '{}' }) });
    assert.equal(response.status, 403, `${role} ${method} ${path}`);
  };
  await forbidden('Mesero', '/operations/transactions');
  await forbidden('Mesero', '/operations/tables/t/pay', 'POST');
  await forbidden('Mesero', '/catalogs/insumos');
  await forbidden('Cajero', '/operations/orders/open', 'POST');
  await forbidden('Cajero', '/catalogs/products', 'POST');
  await forbidden('Jefe de restaurante', '/sync/client-ops');
  await forbidden('Coordinador', '/operations/orders/active');
});

test('catálogo de venta limita la consulta omitida o explícita a la empresa del usuario', async () => {
  const token = sessionToken();
  getSession(token).user.role = 'Mesero';
  getSession(token).user.assignedCompanyId = 'el-tayta';
  let receivedWhere: unknown;
  stubRepository(prisma.product, 'findMany', async ({ where }: { where: unknown }) => { receivedWhere = where; return []; });
  assert.equal((await request('/catalogs/products', token)).status, 200);
  assert.deepEqual(receivedWhere, { isDeleted: false, companyId: 'el-tayta' });
  assert.equal((await request('/catalogs/products?companyId=el-sabroso', token)).status, 403);
});

test('operaciones por identificador comprueban empresa del recurso en el servidor', async () => {
  const token = sessionToken();
  getSession(token).user.role = 'Mesero';
  getSession(token).user.assignedCompanyId = 'el-tayta';
  stubRepository(prisma.order, 'findUnique', async () => ({ companyId: 'el-sabroso' }));
  stubRepository(prisma.table, 'findUnique', async () => ({ companyId: 'el-sabroso' }));
  assert.equal((await request('/operations/orders/other', token)).status, 403);
  assert.equal((await request('/operations/orders/open', token, { tableId: 'other' })).status, 403);
  assert.equal((await request('/operations/orders/quick-bar', token, { companyId: 'el-sabroso' })).status, 403);
});

test('gestor limitado no modifica productos de otra empresa por identificador', async () => {
  const token = sessionToken();
  getSession(token).user.role = 'Jefe de restaurante';
  getSession(token).user.assignedCompanyId = 'el-tayta';
  stubRepository(prisma.product, 'findUnique', async () => ({ companyId: 'el-sabroso' }));
  const response = await fetch(`${url}/api/catalogs/products/other`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Cambio' }) });
  assert.equal(response.status, 403);
  assert.equal((await request('/catalogs/products', token, { companyId: 'el-sabroso' })).status, 403);
});

test('operación no admite producto relacionado de otra empresa', async () => {
  const token = sessionToken();
  getSession(token).user.role = 'Mesero';
  getSession(token).user.assignedCompanyId = 'el-tayta';
  stubRepository(prisma.order, 'findUnique', async () => ({ companyId: 'el-tayta' }));
  stubRepository(prisma.product, 'findUnique', async () => ({ companyId: 'el-sabroso' }));
  assert.equal((await request('/operations/orders/one/items', token, { productId: 'other', quantity: 1 })).status, 403);
  getSession(token).user.role = 'Administrador';
  getSession(token).user.assignedCompanyId = null;
  assert.equal((await request('/operations/orders/one/items', token, { productId: 'other', quantity: 1 })).status, 403);
});

test('sesión de mozo no recibe turnos financieros ni empresas ajenas', async () => {
  const token = sessionToken();
  const assigned = { ...user, role: 'Mesero', assignedCompanyId: 'el-tayta' };
  stubRepository(prisma.user, 'findFirst', async () => assigned);
  const response = await request('/auth/me', token);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(data.companies.map((company: { id: string }) => company.id), ['el-tayta']);
  assert.deepEqual(data.companyShifts, []);
});

function request(path: string, token?: string, body?: unknown) {
  return fetch(`${url}/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function clientFor(token: string) {
  const client = connect(url, { auth: { token }, autoConnect: false, reconnection: false, transports: ['websocket'] });
  clients.push(client);
  return client;
}

function event(socket: ClientSocket, name: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const listener = (...args: unknown[]) => { clearTimeout(timer); resolve(args); };
    const timer = setTimeout(() => {
      socket.off(name, listener);
      reject(new Error(`No llegó ${name}`));
    }, 3000);
    socket.once(name, listener);
  });
}

async function connectClient(token: string) {
  const client = clientFor(token);
  const connected = event(client, 'connect');
  client.connect();
  await connected;
  return client;
}

test('eventos de inventario no llegan a mozo ni cajero', async () => {
  const waiterToken = sessionToken();
  getSession(waiterToken).user.role = 'Mesero';
  const cashierToken = sessionToken();
  getSession(cashierToken).user.role = 'Cajero';
  const managerToken = sessionToken();
  getSession(managerToken).user.role = 'Jefe de restaurante';
  const sockets = await Promise.all([waiterToken, cashierToken, managerToken].map(connectClient));
  let receivedByRestricted = false;
  sockets.slice(0, 2).forEach((socket) => socket.on('kardex:changed', () => { receivedByRestricted = true; }));
  sockets.forEach((socket) => socket.emit('join-company', { companyId: 'el-tayta' }));
  for (let i = 0; i < 100; i++) {
    if (sockets.every((socket) => realtime.sockets.sockets.get(socket.id!)?.rooms.has('company:el-tayta'))) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.ok(sockets.every((socket) => realtime.sockets.sockets.get(socket.id!)?.rooms.has('company:el-tayta')));
  const received = event(sockets[2], 'kardex:changed');
  emitKardexChanged('el-tayta', { insumoId: 'i', insumoName: 'Insumo', companyId: 'el-tayta', type: 'entrada', quantity: 1, unit: 'kg', unitCost: 5, totalCost: 5, stockBefore: 0, stockAfter: 1, referenceDoc: '', updatedAt: new Date().toISOString() });
  await received;
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(receivedByRestricted, false);
});

test('login conserva el contrato, oculta hashes y emite JWT únicos', async () => {
  const responses = await Promise.all([
    request('/auth/login', undefined, { pin: '1234', deviceCode: 'TERM-TEST' }),
    request('/auth/login', undefined, { pin: '1234', deviceCode: 'TERM-TEST' }),
  ]);
  assert.deepEqual(responses.map((r) => r.status), [200, 200]);
  const [first, second] = await Promise.all(responses.map((r) => r.json()));
  assert.notEqual(first.token, second.token);
  assert.equal(sessions.size, 2);
  assert.ok(first.expiresAt && first.device && first.companies && first.companyShifts);
  assert.equal(first.user.pinHash, undefined);
  assert.equal(first.user.passwordHash, undefined);
  assert.equal((await request('/auth/me', first.token)).status, 200);
});

test('login inválido devuelve 400 para tipos incorrectos y 401 para PIN incorrecto', async () => {
  assert.equal((await request('/auth/login', undefined, { pin: 1234 })).status, 400);
  assert.equal((await request('/auth/login', undefined, { pin: '9999' })).status, 401);
  assert.equal((await request('/auth/login', undefined, { pin: '1234', deviceCode: 'x'.repeat(31) })).status, 400);
});

const invalidTokens: Array<[string, () => string | undefined]> = [
    ['sin token', () => undefined],
    ['alterado', () => `${sessionToken()}x`],
    ['vencido', () => jwt.sign({ ...claims, exp: Math.floor(Date.now() / 1000) - 1 }, process.env.JWT_SECRET!)],
    ['sin expiración', () => jwt.sign(claims, process.env.JWT_SECRET!)],
    ['sin dispositivo', () => jwt.sign({ sub: user.id }, process.env.JWT_SECRET!, { expiresIn: '1h' })],
    ['sesión eliminada', () => { const token = sessionToken(); sessions.delete(hashToken(token)); return token; }],
    ['sesión vencida', () => { const token = sessionToken(); getSession(token).expiresAt = new Date(0); return token; }],
    ['usuario inactivo', () => { const token = sessionToken(); getSession(token).user.isActive = false; return token; }],
    ['usuario eliminado', () => { const token = sessionToken(); getSession(token).user.isDeleted = true; return token; }],
    ['usuario diferente', () => { const token = sessionToken(); getSession(token).userId = 'otro'; return token; }],
    ['dispositivo diferente', () => { const token = sessionToken(); getSession(token).deviceId = 'otro'; return token; }],
    ['dispositivo inactivo', () => { const token = sessionToken(); getSession(token).device.isActive = false; return token; }],
];
for (const [name, makeToken] of invalidTokens) {
    test(`HTTP 401: ${name}`, async () => {
      const response = await request('/auth/me', makeToken());
      assert.equal(response.status, 401);
      assert.equal((await response.json()).error.code, 'UNAUTHORIZED');
    });
}

test('fallos de SQL no se convierten en errores de autenticación', async () => {
  const token = sessionToken();
  databaseFailure = new Error('SQL unavailable');
  await assert.rejects(authenticateAccessToken(token), (err) => err === databaseFailure);
  assert.equal((await request('/auth/me', token)).status, 500);
  const client = clientFor(token);
  const failed = event(client, 'connect_error');
  client.connect();
  assert.equal((await failed)[0].data.code, 'AUTH_UNAVAILABLE');
});

test('logout revoca HTTP y todos los sockets de esa sesión, conservando otras sesiones', async () => {
  const token = sessionToken();
  const other = sessionToken();
  const first = await connectClient(token);
  const second = await connectClient(token);
  const unrelated = await connectClient(other);
  const disconnected = [event(first, 'disconnect'), event(second, 'disconnect')];
  const response = await request('/auth/logout', token, {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  await Promise.all(disconnected);
  assert.equal(unrelated.connected, true);
  assert.equal((await request('/auth/me', token)).status, 401);
  assert.equal((await request('/auth/me', other)).status, 200);
  const reconnect = clientFor(token);
  const failed = event(reconnect, 'connect_error');
  reconnect.connect();
  assert.equal((await failed)[0].data.code, 'UNAUTHORIZED');
});

test('Socket.IO revalida la sesión al solicitar una sala', async () => {
  const token = sessionToken();
  const client = await connectClient(token);
  sessions.delete(hashToken(token));
  const rejected = event(client, 'session:error');
  client.emit('join-company', { companyId: 'el-tayta' });
  assert.equal((await rejected)[0].code, 'UNAUTHORIZED');
});

test('Socket.IO desconecta al vencer la sesión sin esperar una nueva petición', async () => {
  const token = sessionToken();
  getSession(token).expiresAt = new Date(Date.now() + 800);
  const client = await connectClient(token);
  const disconnected = event(client, 'disconnect');
  const rejected = event(client, 'session:error');
  assert.equal((await rejected)[0].code, 'UNAUTHORIZED');
  await disconnected;
});

test('una sesión asignada no puede suscribirse a otra empresa', async () => {
  const token = sessionToken();
  getSession(token).user.assignedCompanyId = 'el-tayta';
  const client = await connectClient(token);
  const denied = event(client, 'company:error');
  client.emit('join-company', { companyId: 'el-sabroso' });
  assert.equal((await denied)[0].code, 'FORBIDDEN');
  assert.equal(client.connected, true);
});

test('health y landing HTML funcionan; HTTP y sockets comparten la lista de orígenes', async () => {
  assert.equal((await fetch(`${url}/health`)).status, 200);
  const html = await fetch(url, { headers: { Accept: 'text/html' } });
  assert.equal(html.status, 200);
  assert.match(html.headers.get('content-type')!, /text\/html/);
  const allowed = await fetch(`${url}/health`, { headers: { Origin: 'http://localhost:3000' } });
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:3000');
  const blocked = await fetch(`${url}/health`, { headers: { Origin: 'https://not-allowed.example' } });
  assert.equal(blocked.headers.get('access-control-allow-origin'), null);
  const client = connect(url, {
    auth: { token: sessionToken() }, autoConnect: false, reconnection: false,
    transports: ['websocket'], extraHeaders: { Origin: 'https://not-allowed.example' },
  });
  clients.push(client);
  const rejected = event(client, 'connect_error');
  client.connect();
  await rejected;
  assert.equal(client.connected, false);
});
