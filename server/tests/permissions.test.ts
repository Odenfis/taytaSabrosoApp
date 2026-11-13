import assert from 'node:assert/strict';
import { test } from 'node:test';
import { POS_PERMISSIONS, canAccessCompany, hasPermission, permissionsForRole } from '../src/lib/permissions.js';

test('matriz concede solo las capacidades acordadas por perfil', () => {
  for (const permission of POS_PERMISSIONS) assert.equal(hasPermission('Administrador', permission), true, permission);
  for (const permission of ['products.manage', 'recipes.manage', 'purchases.manage', 'inventory.manage', 'payments.collect'] as const) assert.equal(hasPermission('Jefe de restaurante', permission), true);
  for (const permission of ['banks.manage', 'reports.financial', 'users.manage', 'security.manage'] as const) assert.equal(hasPermission('Jefe de restaurante', permission), false);
  for (const permission of ['payments.collect', 'cash.manual', 'cash.close', 'orders.read'] as const) assert.equal(hasPermission('Cajero', permission), true);
  for (const permission of ['orders.modify', 'inventory.read', 'products.manage', 'banks.manage'] as const) assert.equal(hasPermission('Cajero', permission), false);
  for (const permission of ['orders.modify', 'orders.dispatch', 'orders.mark_for_billing', 'products.sale_read'] as const) assert.equal(hasPermission('Mesero', permission), true);
  for (const permission of ['payments.collect', 'cash.read', 'inventory.read', 'reports.financial'] as const) assert.equal(hasPermission('Mesero', permission), false);
});
test('roles anteriores o desconocidos no se traducen de forma implícita', () => {
  for (const role of ['Coordinador', 'Jefe de Cocina', 'inexistente', '__proto__', null]) assert.deepEqual(permissionsForRole(role), []);
});
test('ámbito respeta ambas columnas de empresa', () => {
  assert.equal(canAccessCompany({ companyId: null, assignedCompanyId: null }, 'el-tayta'), true);
  assert.equal(canAccessCompany({ companyId: 'el-tayta', assignedCompanyId: null }, 'el-sabroso'), false);
  assert.equal(canAccessCompany({ companyId: 'el-tayta', assignedCompanyId: 'el-sabroso' }, 'el-tayta'), false);
  assert.equal(canAccessCompany({ companyId: 'el-tayta', assignedCompanyId: 'el-tayta' }, 'el-tayta'), true);
});

test('informes limitan agregados y selección explícita a la empresa autorizada', async () => {
  const { reportCompany } = await import('../src/lib/report-access.js');
  const global = { companyId: null, assignedCompanyId: null };
  const scoped = { companyId: 'tayta', assignedCompanyId: 'tayta' };
  assert.equal(reportCompany(global, 'all'), 'all');
  assert.equal(reportCompany(global, 'sabroso'), 'sabroso');
  assert.equal(reportCompany(scoped, 'all'), 'tayta');
  assert.equal(reportCompany(scoped, 'tayta'), 'tayta');
  assert.throws(() => reportCompany(scoped, 'sabroso'), (e: any) => e.code === 'FORBIDDEN');
  assert.throws(() => reportCompany({ companyId: 'tayta', assignedCompanyId: 'sabroso' }, 'all'), (e: any) => e.code === 'FORBIDDEN');
});

test('el middleware usa el rol de la sesión autenticada y no el rol enviado por el cliente', async () => {
  const { requirePermission } = await import('../src/lib/auth.js');
  const check = (role: string | undefined, clientRole = 'Administrador') => new Promise<unknown>((resolve) => {
    const req = { auth: role ? { user: { role } } : undefined, body: { role: clientRole } };
    requirePermission('payments.collect')(req as never, {} as never, ((err?: unknown) => resolve(err)) as never);
  });
  const forbidden = await check('Mesero');
  assert.equal((forbidden as { statusCode: number }).statusCode, 403);
  assert.equal(await check('Cajero'), undefined);
  assert.equal((await check(undefined) as { statusCode: number }).statusCode, 401);
  assert.equal((await check('Coordinador') as { statusCode: number }).statusCode, 403);
});

test('cada ruta autenticada declarada tiene permiso explícito, sin duplicados', async () => {
  const { readFile } = await import('node:fs/promises');
  const { ROUTE_PERMISSIONS, permissionForDeclaredRoute } = await import('../src/lib/route-permissions.js');
  const groups = ['catalogs', 'operations', 'reports', 'sync', 'users', 'fiscal', 'transformations'] as const;
  const seen = new Set<string>();
  for (const entry of ROUTE_PERMISSIONS) {
    const key = `${entry.group}:${entry.method}:${entry.path}`;
    assert.equal(seen.has(key), false, `Política repetida: ${key}`);
    seen.add(key);
  }
  for (const group of groups) {
    const source = await readFile(new URL(`../src/routes/${group}.routes.ts`, import.meta.url), 'utf8');
    for (const match of source.matchAll(/router\.(get|post|patch|delete)\('([^']+)'/g)) {
      const method = match[1].toUpperCase();
      assert.ok(permissionForDeclaredRoute(group, method, match[2]), `Falta política para ${group} ${method} ${match[2]}`);
    }
  }
});

test('la resolución de rutas distingue verbos y niega rutas desconocidas', async () => {
  const { permissionForRequest } = await import('../src/lib/route-permissions.js');
  assert.equal(permissionForRequest('operations', 'GET', '/orders/active'), 'orders.read');
  assert.equal(permissionForRequest('operations', 'POST', '/orders/123/items'), 'orders.modify');
  assert.equal(permissionForRequest('operations', 'POST', '/bills/123/pay'), 'payments.collect');
  assert.equal(permissionForRequest('operations', 'GET', '/bills/123/pay'), undefined);
  assert.equal(permissionForRequest('operations', 'POST', '/bills/123%2fother/pay'), undefined);
  assert.equal(permissionForRequest('catalogs', 'POST', '/bank-accounts'), 'banks.manage');
});

test('todas las rutas de escritura trasladan la identidad autenticada a la capa de servicio', async () => {
  const { readFile } = await import('node:fs/promises');
  const groups = ['catalogs', 'operations', 'users'] as const;
  for (const group of groups) {
    const source = await readFile(new URL(`../src/routes/${group}.routes.ts`, import.meta.url), 'utf8');
    const routes = [...source.matchAll(/router\.(get|post|patch|delete)\('([^']+)'/g)];
    for (let i = 0; i < routes.length; i++) {
      const [declaration, method, path] = routes[i];
      if (method === 'get') continue;
      const block = source.slice(routes[i].index, routes[i + 1]?.index ?? source.length);
      assert.ok(block.includes('operationActor(req)') || (block.includes('req.auth!.user.id') && block.includes('req.auth!.deviceId')), `${group} ${method} ${path}: falta identidad autenticada`);
      assert.ok(declaration.length > 0);
    }
  }
});
