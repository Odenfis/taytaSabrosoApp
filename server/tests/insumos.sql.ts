import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import express from 'express';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { io as connect } from '../../node_modules/socket.io-client/build/esm/index.js';
const database = process.env.INSUMO_TEST_DATABASE;
assert.match(database ?? '', /^tayta_insumos_test_[a-f0-9]{32}$/);
assert.ok(process.env.DATABASE_URL?.includes(';database=' + database));
const { prisma } = await import('../src/lib/prisma.js');
const insumos = await import('../src/services/insumo.service.js');
const master = await import('../src/services/master.service.js');
const { createPurchase } = await import('../src/services/purchase.service.js');
const { addKardexAdjustment } = await import('../src/services/kardex.service.js');
const orders = await import('../src/services/order.service.js');
const { createApp } = await import('../src/app.js');
const { initRealtime } = await import('../src/lib/realtime.js');
const { signAccessToken, hashToken, verifyAccessToken } = await import('../src/lib/auth.js');
const id = () => randomUUID(); const companyId = 'el-tayta'; let passed = 0;
async function check(name: string, run: () => Promise<void>) { await run(); passed++; console.log('✓ SQL: ' + name); }
const base = { companyId, name: 'Sal de prueba', category: 'Abarrotes & Especias' as const, unit: 'kg' as const, currentStock: 0, minStock: 5, costPerUnit: 2 };
const make = (extra = {}) => insumos.createInsumo({ ...base, id: id(), ...extra });
const purchase = (insumo: any, quantity = 2) => createPurchase({ companyId, invoiceNumber: id(), supplierName: 'Proveedor prueba', supplierRuc: '20111111111', total: Math.round(quantity * 2 * 1.18 * 100) / 100, paymentStatus: 'Crédito 15 días', paidFromCash: false, clientOpId: id(), items: [{ insumoId: insumo.id, insumoName: insumo.name, unit: insumo.unit, quantity, unitCost: 2, totalCost: quantity * 2 }] });
const adjustment = (insumo: any, quantity: number, type: 'AJUSTE_MERMA' | 'ENTRADA_COMPRA' = 'AJUSTE_MERMA') => addKardexAdjustment({ insumoId: insumo.id, companyId, quantity, type, reason: 'Prueba aislada', clientOpId: id() });
const recipeInput = (insumo: any) => ({ companyId, id: id(), productName: 'Plato ' + id().slice(0, 8), category: 'platos', salePrice: 10, totalCost: 2, theoreticalFoodCostPct: 20, portions: 1, ingredients: [{ insumoId: insumo.id, insumoName: insumo.name, quantity: 1, unit: insumo.unit, costPerUnit: 2, subtotalCost: 2 }] });
try {
for (const [key, ruc] of [['el-tayta', '20111111111'], ['el-sabroso', '20222222222']]) await prisma.company.create({ data: { id: key, name: key, tradeName: key, ruc, specialty: 'Prueba', themeColor: '#ffb597', accentColor: '#823b19', badgeText: 'Prueba', address: 'Prueba' } });
await prisma.table.create({ data: { id: 'test-table', companyId, number: '01', capacity: 4, zone: 'Salón Principal' } });
await check('UUID de alta y reintento no duplican ni restauran stock de compras posteriores', async () => {
  const draft = { ...base, id: id() }; const first = await insumos.createInsumo(draft); const repeat = await insumos.createInsumo(draft); assert.equal(first.id, repeat.id);
  await purchase(first); await insumos.createInsumo(draft);
  assert.equal(Number((await prisma.insumo.findUniqueOrThrow({ where: { id: first.id } })).currentStock), 2);
  assert.equal(await prisma.insumo.count({ where: { id: first.id } }), 1);
});
await check('altas concurrentes reciben códigos distintos', async () => {
  const [a, b] = await Promise.all([make(), make()]); assert.notEqual(a.code, b.code);
});
await check('unidad/costo inicial corregibles sin uso; mínimo cero y reintento de edición', async () => {
  const row = await make(); assert.equal(row.canEditBase, true);
  const patch = { unit: 'g' as const, costPerUnit: 0.1234, minStock: 0, expectedVersion: row.version };
  const updated = await insumos.updateInsumo(row.id, patch); assert.equal(updated.unit, 'g'); assert.equal(updated.minStock, 0); assert.equal(updated.costPerUnit, 0.1234);
  assert.equal((await insumos.updateInsumo(row.id, patch)).version, updated.version);
  assert.equal(await prisma.kardexMovement.count({ where: { insumoId: row.id } }), 0);
});
await check('stock existente bloquea cambiar unidad o costo inicial', async () => {
  const row = await make({ currentStock: 5 });
  for (const update of [{ unit: 'g' as const }, { costPerUnit: 3 }]) await assert.rejects(insumos.updateInsumo(row.id, update), (e: any) => e.code === 'INSUMO_BASE_LOCKED');
  await assert.rejects(insumos.deleteInsumo(row.id), (e: any) => e.code === 'INSUMO_HAS_STOCK');
});
await check('nombre sincroniza fichas activas conservando cantidades/costos e historial', async () => {
  const row = await make(); const recipe = await master.createRecipe(recipeInput(row)); await purchase(row, 1);
  const beforeMovement = await prisma.kardexMovement.findMany({ where: { insumoId: row.id } }); const beforePurchase = await prisma.purchaseItem.findMany({ where: { insumoId: row.id } });
  const before = await prisma.recipeIngredient.findFirstOrThrow({ where: { recipeId: recipe.id } });
  const updated = await insumos.updateInsumo(row.id, { name: 'Sal renombrada', minStock: 0 });
  assert.equal(updated.canEditBase, false);
  const after = await prisma.recipeIngredient.findUniqueOrThrow({ where: { id: before.id } }); assert.equal(after.insumoName, 'Sal renombrada'); assert.equal(Number(after.quantity), Number(before.quantity)); assert.equal(Number(after.costPerUnit), Number(before.costPerUnit));
  assert.deepEqual(await prisma.kardexMovement.findMany({ where: { insumoId: row.id } }), beforeMovement); assert.deepEqual(await prisma.purchaseItem.findMany({ where: { insumoId: row.id } }), beforePurchase);
});
await check('recetas activas bloquean baja y se identifican por nombre', async () => {
  const row = await make(); const recipe = await master.createRecipe(recipeInput(row));
  await assert.rejects(insumos.deleteInsumo(row.id), (e: any) => e.code === 'INSUMO_IN_RECIPES' && e.message.includes(recipe.productName));
  await assert.rejects(insumos.updateInsumo(row.id, { unit: 'g' }), (e: any) => e.code === 'INSUMO_BASE_LOCKED');
});
let deleted: any;
await check('baja con historial conserva compras/Kardex y respuesta definitiva idempotente', async () => {
  const row = await make(); await purchase(row); await adjustment(row, 2);
  const history = await prisma.kardexMovement.findMany({ where: { insumoId: row.id } });
  const current = await prisma.insumo.findUniqueOrThrow({ where: { id: row.id } }); deleted = await insumos.deleteInsumo(row.id, current.version);
  assert.equal(deleted.isDeleted, true); assert.equal(Number(deleted.currentStock), 0);
  assert.equal((await insumos.deleteInsumo(row.id, current.version)).version, deleted.version);
  assert.ok(await prisma.insumo.findUnique({ where: { id: row.id } })); assert.deepEqual(await prisma.kardexMovement.findMany({ where: { insumoId: row.id } }), history);
  assert.equal(await prisma.purchaseItem.count({ where: { insumoId: row.id } }), 1);
  assert.ok(!(await insumos.listInsumos()).some((i: any) => i.id === row.id));
});
await check('insumo eliminado bloquea compra/receta/ajuste sin escrituras parciales', async () => {
  const before = { purchases: await prisma.purchase.count(), products: await prisma.product.count(), kardex: await prisma.kardexMovement.count() };
  await assert.rejects(purchase(deleted), (e: any) => e.code === 'INSUMO_DELETED');
  await assert.rejects(master.createRecipe(recipeInput(deleted)), (e: any) => e.code === 'INSUMO_DELETED');
  await assert.rejects(adjustment(deleted, 1, 'ENTRADA_COMPRA'), (e: any) => e.code === 'INSUMO_DELETED');
  assert.deepEqual({ purchases: await prisma.purchase.count(), products: await prisma.product.count(), kardex: await prisma.kardexMovement.count() }, before);
});
await check('compras y ajustes incrementan versión y edición antigua no pisa sus costos', async () => {
  const row = await make(); await purchase(row);
  await assert.rejects(insumos.updateInsumo(row.id, { name: 'Cambio antiguo', expectedVersion: row.version }), (e: any) => e.code === 'INSUMO_VERSION_CONFLICT');
  const current = await prisma.insumo.findUniqueOrThrow({ where: { id: row.id } }); assert.ok(current.version > row.version);
  await insumos.updateInsumo(row.id, { name: 'Cambio revisado', expectedVersion: current.version });
  assert.equal(Number((await prisma.insumo.findUniqueOrThrow({ where: { id: row.id } })).currentStock), 2);
});
await check('dos ediciones de la misma versión producen un ganador y un conflicto', async () => {
  const row = await make(); const result = await Promise.allSettled([insumos.updateInsumo(row.id, { name: 'Terminal A', expectedVersion: row.version }), insumos.updateInsumo(row.id, { name: 'Terminal B', expectedVersion: row.version })]);
  assert.equal(result.filter((r) => r.status === 'fulfilled').length, 1); const rejected = result.find((r) => r.status === 'rejected') as PromiseRejectedResult; assert.equal(rejected.reason.code, 'INSUMO_VERSION_CONFLICT');
});
await check('compra/eliminación concurrentes no dejan stock en una baja confirmada', async () => {
  for (let n = 0; n < 3; n++) {
    const row = await make(); const results = await Promise.allSettled([purchase(row), insumos.deleteInsumo(row.id, row.version)]);
    const current = await prisma.insumo.findUniqueOrThrow({ where: { id: row.id } });
    if (current.isDeleted) { assert.equal(Number(current.currentStock), 0); assert.equal(results[0].status, 'rejected'); }
    else { assert.equal(Number(current.currentStock), 2); assert.equal(results[1].status, 'rejected'); }
  }
});
await check('receta/eliminación concurrentes no vinculan un insumo eliminado', async () => {
  const row = await make(); await Promise.allSettled([master.createRecipe(recipeInput(row)), insumos.deleteInsumo(row.id)]);
  const current = await prisma.insumo.findUniqueOrThrow({ where: { id: row.id } }); const refs = await prisma.recipeIngredient.count({ where: { insumoId: row.id, recipe: { isDeleted: false } } });
  assert.equal(current.isDeleted && refs > 0, false);
});
await check('ajuste/eliminación concurrentes preservan la condición de stock cero', async () => {
  const row = await make(); await Promise.allSettled([adjustment(row, 1, 'ENTRADA_COMPRA'), insumos.deleteInsumo(row.id)]);
  const current = await prisma.insumo.findUniqueOrThrow({ where: { id: row.id } }); assert.equal(current.isDeleted && Number(current.currentStock) > 0, false);
});
await check('empresa ajena rechazada; insumo compartido visible y editable', async () => {
  const foreign = await make({ companyId: 'el-sabroso' });
  await assert.rejects(insumos.updateInsumo(foreign.id, { minStock: 0 }, companyId), (e: any) => e.code === 'INSUMO_COMPANY_MISMATCH');
  await assert.rejects(insumos.deleteInsumo(foreign.id, undefined, companyId), (e: any) => e.code === 'INSUMO_COMPANY_MISMATCH');
  const shared = await make({ companyId: null }); await insumos.updateInsumo(shared.id, { minStock: 0 }, companyId);
  assert.ok((await insumos.listInsumos(undefined, undefined, companyId)).some((i: any) => i.id === shared.id)); assert.ok(!(await insumos.listInsumos('el-sabroso', undefined, companyId)).some((i: any) => i.id === foreign.id));
});
await check('unidades inconsistentes se rechazan en compras y recetas', async () => {
  const row = await make(); const input = recipeInput(row); input.ingredients[0].unit = 'g';
  await assert.rejects(master.createRecipe(input), (e: any) => e.code === 'INSUMO_UNIT_MISMATCH');
  await assert.rejects(purchase({ ...row, unit: 'g' }), (e: any) => e.code === 'INSUMO_UNIT_MISMATCH');
});
await check('devolución histórica puede reponer una referencia conservada dada de baja', async () => {
  const row = await make({ currentStock: 1 }); const recipe = await master.createRecipe(recipeInput(row));
  const order = await orders.openOrderForTable('test-table', { clientOpId: id() }); const added = await orders.addItemToOrder(order.id, { productId: recipe.productId! }); await orders.sendToKitchen(order.id);
  // Simula una baja antigua ya existente: la nueva API impediría dar de baja esta ficha activa.
  await prisma.insumo.update({ where: { id: row.id }, data: { isDeleted: true } });
  await orders.removeItemFromOrder(order.id, added.items[0].id);
  const restored = await prisma.insumo.findUniqueOrThrow({ where: { id: row.id } }); assert.equal(restored.isDeleted, true); assert.equal(Number(restored.currentStock), 1);
  assert.equal(await prisma.kardexMovement.count({ where: { insumoId: row.id, type: 'ENTRADA_DEVOLUCION_VENTA_POS' } }), 1);
});
await prisma.user.create({ data: { id: 'test-user', name: 'Administrador prueba', pinHash: bcrypt.hashSync('9876', 4), role: 'Administrador', terminal: 'Pruebas', companyId: null } });
await prisma.device.create({ data: { id: 'test-device', name: 'Pruebas', terminalCode: 'TERM-TEST' } });
const token = signAccessToken({ sub: 'test-user', deviceId: 'test-device', role: 'Administrador', name: 'Administrador prueba' });
await prisma.session.create({ data: { id: id(), userId: 'test-user', deviceId: 'test-device', tokenHash: hashToken(token), expiresAt: new Date(verifyAccessToken(token).exp * 1000) } });
const web = express(); web.use(express.static(path.resolve('../dist'))); web.use(createApp());
const http = createServer(web); const realtime = initRealtime(http);
await new Promise<void>((resolve) => http.listen(process.argv.includes('--browser') ? 4310 : 0, '127.0.0.1', resolve));
const url = 'http://127.0.0.1:' + (http.address() as any).port;
const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const sockets = [connect(url, { auth: { token }, transports: ['websocket'] }), connect(url, { auth: { token }, transports: ['websocket'] })];
try {
  await Promise.all(sockets.map((socket) => new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); })));
  sockets.forEach((socket) => socket.emit('join-company', { companyId }));
  const deadline = Date.now() + 3000; while ((await realtime.in('company:' + companyId).fetchSockets()).length < 2 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 10));
  assert.equal((await realtime.in('company:' + companyId).fetchSockets()).length, 2);
  await check('HTTP rechaza editar stock/empresa y responde conflictos de versión', async () => {
    const row = await make(); const endpoint = url + '/api/catalogs/insumos/' + row.id;
    for (const body of [{ currentStock: 200 }, { companyId: 'el-sabroso' }]) assert.equal((await fetch(endpoint, { method: 'PATCH', headers, body: JSON.stringify(body) })).status, 400);
    await insumos.updateInsumo(row.id, { name: 'Actual' });
    const conflict = await fetch(endpoint, { method: 'PATCH', headers, body: JSON.stringify({ name: 'Antiguo', expectedVersion: row.version }) }); assert.equal(conflict.status, 409); assert.equal((await conflict.json()).error.code, 'INSUMO_VERSION_CONFLICT');
  });
  await check('dos terminales reciben edición/baja; REST conserva código y mínimo cero', async () => {
    const row = await make();
    const listen = (action: string) => Promise.all(sockets.map((socket) => new Promise<any>((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Sin evento ' + action)), 5000); const handler = (event: any) => { if (event.insumoId === row.id && event.action === action) { clearTimeout(timer); socket.off('insumo:changed', handler); resolve(event); } }; socket.on('insumo:changed', handler); })));
    const events = listen('update'); const changed = await fetch(`${url}/api/catalogs/insumos/${row.id}`, { method: 'PATCH', headers, body: JSON.stringify({ minStock: 0, name: 'Revisado por terminal A', expectedVersion: row.version }) }); assert.equal(changed.status, 200); const updated = await changed.json(); await events;
    const all = await fetch(url + '/api/catalogs/insumos', { headers }); const exact = (await all.json()).find((i: any) => i.id === row.id); assert.equal(exact.code, row.code); assert.equal(exact.minStock, 0); assert.equal(exact.version, updated.version);
    const removed = listen('delete'); const deletion = await fetch(`${url}/api/catalogs/insumos/${row.id}?expectedVersion=${updated.version}`, { method: 'DELETE', headers }); assert.equal(deletion.status, 200); assert.equal((await deletion.json()).isDeleted, true); await removed;
  });
  console.log(passed + ' escenarios SQL/API/realtime de insumos aprobados.');
  if (process.argv.includes('--browser')) {
    console.log('POS aislado: ' + url + ' · PIN 9876 · fin y Enter para cerrar.');
    await new Promise<void>((resolve) => { process.stdin.resume(); process.stdin.once('data', () => { process.stdin.pause(); resolve(); }); });
  }
  const ledgerDeadline = Date.now() + 3000; while (await prisma.clientOp.count() < 5 && Date.now() < ledgerDeadline) await new Promise((r) => setTimeout(r, 10));
} finally { sockets.forEach((socket) => socket.disconnect()); await new Promise<void>((resolve) => realtime.close(() => resolve())); if (http.listening) await new Promise<void>((resolve) => http.close(() => resolve())); }
} finally { await prisma.$disconnect(); }
