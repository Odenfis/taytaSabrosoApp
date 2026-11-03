import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { NextFunction, Request, Response } from 'express';
import { isGlobalAdministrator, offlineRouteError, verifyOfflineAuthorship } from '../src/lib/offline-authorship.js';
import { auditOperation } from '../src/lib/operation-audit.js';

async function runMiddleware(input: {
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  method?: string;
  path?: string;
  user?: { id: string; role: string; companyId: string | null; assignedCompanyId: string | null };
  deviceId?: string;
}) {
  const headers = input.headers ?? {};
  const req = {
    body: input.body,
    method: input.method ?? 'POST',
    path: input.path ?? '/transactions',
    query: {},
    get: (name: string) => headers[name.toLowerCase()],
    auth: input.user
      ? { user: input.user, deviceId: input.deviceId ?? 'device-1' }
      : undefined,
  } as unknown as Request;
  let passed = false;
  let error: unknown = null;
  await verifyOfflineAuthorship('operations')(req, {} as Response, ((err?: unknown) => {
    if (err) error = err;
    else passed = true;
  }) as NextFunction);
  return { req, passed, error };
}

test('una petición normal sin prueba no se altera', async () => {
  const result = await runMiddleware({ body: { amount: 10 } });
  assert.equal(result.passed, true);
  assert.equal(result.error, null);
  assert.deepEqual(result.req.body, { amount: 10 });
});

test('el replay sin prueba de autoría se rechaza antes de ejecutar la escritura', async () => {
  const result = await runMiddleware({ body: { amount: 10 }, headers: { 'x-offline-replay': '1' } });
  assert.equal(result.passed, false);
  assert.equal((result.error as { code?: string }).code, 'OFFLINE_PROOF_REQUIRED');
  assert.deepEqual(result.req.body, { amount: 10 });
});

test('una prueba malformada se retira del cuerpo y se rechaza', async () => {
  const result = await runMiddleware({ body: { amount: 10, __proof: { document: '', signature: '' } } });
  assert.equal(result.passed, false);
  assert.equal((result.error as { code?: string }).code, 'OFFLINE_PROOF_INVALID');
  assert.deepEqual(result.req.body, { amount: 10 });
});

test('la acción firmada debe ser la que corresponde a la ruta solicitada', () => {
  const correct = { action: 'cash.manual', method: 'POST', path: '/transactions' };
  assert.equal(offlineRouteError('operations', 'POST', '/transactions', correct), null);
  // Ruta de lectura: no admite operaciones firmadas.
  assert.equal(
    (offlineRouteError('operations', 'GET', '/orders/active', correct) as { code?: string }).code,
    'OFFLINE_PROOF_UNEXPECTED',
  );
  // Ruta de escritura que el contrato no declara.
  assert.equal(
    (offlineRouteError('operations', 'POST', '/orders/abc/desconocida', correct) as { code?: string }).code,
    'OFFLINE_PROOF_UNEXPECTED',
  );
  // Acción distinta de la que corresponde a la ruta.
  assert.equal(
    (offlineRouteError('operations', 'POST', '/transactions', { ...correct, action: 'orders.open' }) as { code?: string }).code,
    'OFFLINE_PROOF_ACTION_MISMATCH',
  );
  // Método o plantilla de ruta distintos.
  assert.equal(
    (offlineRouteError('operations', 'POST', '/transactions', { ...correct, method: 'PATCH' }) as { code?: string }).code,
    'OFFLINE_PROOF_ACTION_MISMATCH',
  );
  assert.equal(
    (offlineRouteError('operations', 'POST', '/transactions', { ...correct, path: '/orders/open' }) as { code?: string }).code,
    'OFFLINE_PROOF_ACTION_MISMATCH',
  );
  // La acción de catálogos no habilita una ruta de operaciones.
  assert.equal(
    (offlineRouteError('operations', 'POST', '/transactions', { ...correct, action: 'catalogs.createProduct' }) as { code?: string }).code,
    'OFFLINE_PROOF_ACTION_MISMATCH',
  );
});

test('solo el administrador global sin empresa asignada puede asumir una firma ajena', () => {
  assert.equal(isGlobalAdministrator({ role: 'Administrador', companyId: null, assignedCompanyId: null }), true);
  assert.equal(isGlobalAdministrator({ role: 'Administrador', companyId: 'el-tayta', assignedCompanyId: null }), false);
  assert.equal(isGlobalAdministrator({ role: 'Administrador', companyId: null, assignedCompanyId: 'el-tayta' }), false);
  assert.equal(isGlobalAdministrator({ role: 'Cajero', companyId: null, assignedCompanyId: null }), false);
});

function auditTransaction() {
  const created: Array<Record<string, any>> = [];
  const assumptions: Array<Record<string, any>> = [];
  const tx = {
    operationAudit: { create: async (args: Record<string, any>) => { created.push(args.data); } },
    offlineAssumptionAudit: { upsert: async (args: Record<string, any>) => { assumptions.push(args); } },
  };
  return { tx, created, assumptions };
}

test('la prueba firmada no puede auditar una escritura de otra empresa', async () => {
  const { tx, created } = auditTransaction();
  await assert.rejects(
    auditOperation(tx as never, {
      userId: 'admin', deviceId: 'device',
      offline: { clientOpId: 'op', authorId: 'autor', companyId: 'firmada', action: 'cash.manual', document: '{}', signature: 'firma', assumed: false },
    }, 'otra-empresa', 'crear_movimiento_caja', 'entity'),
    { code: 'OFFLINE_PROOF_COMPANY_MISMATCH' },
  );
  assert.equal(created.length, 0);
});

test('la asunción se registra en la misma auditoría que conserva la prueba y su acción', async () => {
  const { tx, created, assumptions } = auditTransaction();
  const offline = { clientOpId: 'op', authorId: 'autor', companyId: 'empresa', action: 'orders.payTable', document: '{"version":2}', signature: 'firma', assumed: true };
  await auditOperation(tx as never, { userId: 'admin', deviceId: 'device', offline }, 'empresa', 'cobrar_mesa', 'entity');
  assert.equal(created.length, 1);
  assert.deepEqual(
    [created[0].clientOpId, created[0].proofDocument, created[0].proofSignature, created[0].offlineAction],
    ['op', offline.document, offline.signature, 'orders.payTable'],
  );
  assert.equal(assumptions.length, 1);
  assert.deepEqual(
    [assumptions[0].create.authorUserId, assumptions[0].create.assumedByUserId, assumptions[0].create.clientOpId],
    ['autor', 'admin', 'op'],
  );
  assert.equal(assumptions[0].update && Object.keys(assumptions[0].update).length, 0);
});
