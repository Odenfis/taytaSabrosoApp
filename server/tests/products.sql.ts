import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import express from 'express';
import path from 'node:path';
import bcrypt from 'bcryptjs';

const database = process.env.PRODUCT_TEST_DATABASE;
assert.match(database ?? '', /^tayta_products_test_[a-f0-9]{32}$/);
assert.ok(process.env.DATABASE_URL?.includes(';database=' + database));
const { prisma } = await import('../src/lib/prisma.js');
const { createProduct, updateProduct } = await import('../src/services/product.service.js');
const { createRecipe, updateRecipe } = await import('../src/services/master.service.js');
const { openOrderForTable, addItemToOrder, sendToKitchen, updateItemQuantity } = await import('../src/services/order.service.js');
const { createApp } = await import('../src/app.js');
const { initRealtime } = await import('../src/lib/realtime.js');
const { signAccessToken, hashToken, verifyAccessToken } = await import('../src/lib/auth.js');
let passed = 0;
async function check(name: string, action: () => Promise<void>) { await action(); passed++; console.log('✓ SQL: ' + name); }
const companyId = 'el-tayta';
for (const [id, ruc] of [['el-tayta', '20111111111'], ['el-sabroso', '20222222222']]) {
  await prisma.company.create({ data: { id, name: id, tradeName: id, ruc, specialty: 'Prueba', themeColor: '#ffb597', accentColor: '#ffb597', badgeText: 'Prueba', address: 'Prueba' } });
}
await prisma.table.create({ data: { id: 'test-table', companyId, number: '01', capacity: 4, zone: 'Salón Principal' } });
const ingredient = await prisma.insumo.create({ data: { id: randomUUID(), companyId, code: 'TEST-01', name: 'Insumo prueba', category: 'Abarrotes & Especias', unit: 'un', currentStock: 100, minStock: 1, costPerUnit: 2 } });
const draft = { id: randomUUID(), companyId, name: 'Agua prueba', category: 'bebidas' as const, price: 5, description: 'Descripción preservada', image: 'https://example.com/agua.jpg', available: true };
let product: any;
await check('alta UUID, respuesta perdida y reintento sin duplicado', async () => {
  product = await createProduct(draft);
  const repeat = await createProduct(draft);
  assert.equal(repeat.id, product.id);
  assert.equal(await prisma.product.count(), 1);
  assert.equal(product.hasRecipe, false);
});
const order = await openOrderForTable('test-table', {});
await check('venta sin receta no consume insumos', async () => {
  await addItemToOrder(order.id, { productId: product.id });
  const result = await sendToKitchen(order.id);
  assert.equal(result.kardexMovements, 0);
  assert.equal(Number((await prisma.insumo.findUniqueOrThrow({ where: { id: ingredient.id } })).currentStock), 100);
});
const recipeData = { companyId, productId: product.id, productName: draft.name, category: 'bebidas', salePrice: 5, totalCost: 2, theoreticalFoodCostPct: 40, portions: 1, preparationNotes: 'Conservar preparación',
  ingredients: [{ insumoId: ingredient.id, insumoName: ingredient.name, quantity: 1, unit: 'un', costPerUnit: 2, subtotalCost: 2 }] };
let recipe: any;
await check('vincular ficha al producto existente sin duplicado', async () => {
  recipe = await createRecipe({ ...recipeData, id: randomUUID() });
  assert.equal(await prisma.product.count(), 1);
  assert.equal(recipe.productId, product.id);
  assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).hasRecipe, true);
});
await check('edición transaccional sincroniza todas las fichas y conserva ingredientes e historial', async () => {
  await createRecipe({ ...recipeData, id: randomUUID() });
  const before = await prisma.recipeIngredient.findMany();
  const current = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
  product = await updateProduct(product.id, { name: 'Agua nueva', category: 'brasas', price: 10, expectedVersion: current.version });
  const recipes = await prisma.recipe.findMany({ where: { productId: product.id } });
  assert.equal(recipes.length, 2);
  for (const r of recipes) { assert.equal(r.productName, 'Agua nueva'); assert.equal(r.category, 'brasas'); assert.equal(Number(r.salePrice), 10); assert.equal(Number(r.theoreticalFoodCostPct), 20); }
  assert.deepEqual(await prisma.recipeIngredient.findMany(), before);
  const historical = await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } });
  assert.equal(historical.name, draft.name);
  assert.equal(Number(historical.price), 5);
});
await check('respuesta perdida de PATCH no incrementa versión al reintentar', async () => {
  const repeat = await updateProduct(product.id, { name: 'Agua nueva', category: 'brasas', price: 10, expectedVersion: product.version - 1 });
  assert.equal(repeat.version, product.version);
});
await check('conflicto conserva versión y datos del servidor', async () => {
  await assert.rejects(updateProduct(product.id, { price: 11, expectedVersion: 1 }), (err: any) => err.code === 'PRODUCT_VERSION_CONFLICT');
  assert.equal(Number((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).price), 10);
});
await check('dos terminales concurrentes: una versión ganadora y un conflicto', async () => {
  const current = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
  const results = await Promise.allSettled([
    updateProduct(product.id, { price: 13, expectedVersion: current.version }),
    updateProduct(product.id, { price: 14, expectedVersion: current.version }),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
  assert.equal(rejected.reason.code, 'PRODUCT_VERSION_CONFLICT');
  assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).version, current.version + 1);
});
await check('rollback completo si ratio no cabe en SQL', async () => {
  const before = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
  await assert.rejects(updateProduct(product.id, { price: 0.01, expectedVersion: before.version }), (err: any) => err.code === 'INVALID_FOOD_COST');
  assert.deepEqual(await prisma.product.findUniqueOrThrow({ where: { id: product.id } }), before);
});
await check('guardar ficha preserva imagen descripción y disponibilidad', async () => {
  await updateProduct(product.id, { available: false });
  const before = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
  await updateRecipe(recipe.id, { productName: 'Agua ficha', category: 'bebidas', salePrice: 12 });
  const after = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
  assert.equal(after.image, draft.image); assert.equal(after.description, draft.description); assert.equal(after.available, false);
  assert.ok(after.version > before.version);
});
await check('ficha de otra empresa rechazada sin escrituras parciales', async () => {
  const count = await prisma.recipe.count();
  await assert.rejects(createRecipe({ ...recipeData, companyId: 'el-sabroso', id: randomUUID() }), (err: any) => err.code === 'PRODUCT_COMPANY_MISMATCH');
  assert.equal(await prisma.recipe.count(), count);
});
const foreign = await createProduct({ ...draft, id: randomUUID(), companyId: 'el-sabroso' });
await check('API de venta rechaza no disponible y empresa ajena', async () => {
  await assert.rejects(addItemToOrder(order.id, { productId: product.id }), (err: any) => err.code === 'PRODUCT_UNAVAILABLE');
  const line = await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } });
  await assert.rejects(updateItemQuantity(order.id, line.id, 1), (err: any) => err.code === 'PRODUCT_UNAVAILABLE');
  await assert.rejects(addItemToOrder(order.id, { productId: foreign.id }), (err: any) => err.code === 'PRODUCT_COMPANY_MISMATCH');
});
await check('crear desde ficha genera exactamente un producto; reintento conserva vínculo', async () => {
  const id = randomUUID(); const productId = randomUUID(); const before = await prisma.product.count();
  const created = await createRecipe({ ...recipeData, id, productId, productName: 'Nuevo desde ficha' });
  const repeated = await createRecipe({ ...recipeData, id, productId, productName: 'Nuevo desde ficha' });
  assert.equal(created.productId, productId); assert.equal(repeated.id, id);
  assert.equal(await prisma.product.count(), before + 1);
});

await prisma.user.create({ data: { id: 'test-user', name: 'Administrador prueba', pinHash: bcrypt.hashSync('9876', 4), role: 'Administrador', terminal: 'Pruebas', companyId: null } });
await prisma.device.create({ data: { id: 'test-device', name: 'Pruebas', terminalCode: 'TERM-TEST' } });
const token = signAccessToken({ sub: 'test-user', deviceId: 'test-device', role: 'Administrador', name: 'Administrador prueba' });
await prisma.session.create({ data: { id: randomUUID(), userId: 'test-user', deviceId: 'test-device', tokenHash: hashToken(token), expiresAt: new Date(verifyAccessToken(token).exp * 1000) } });
const web = express();
web.use(express.static(path.resolve('../dist')));
web.use(createApp());
const http = createServer(web);
const realtime = initRealtime(http);
await new Promise<void>((resolve) => http.listen(process.argv.includes('--browser') ? 4310 : 0, '127.0.0.1', resolve));
const url = 'http://127.0.0.1:' + (http.address() as any).port;
try {
  await check('contrato HTTP autenticado GET/PATCH y validación de precio', async () => {
    const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
    const result = await fetch(url + '/api/catalogs/products', { headers });
    assert.equal(result.status, 200); assert.ok((await result.json()).length >= 3);
    const invalid = await fetch(url + '/api/catalogs/products/' + product.id, { method: 'PATCH', headers, body: JSON.stringify({ price: 0 }) });
    assert.equal(invalid.status, 400);
    const unavailable = await fetch(url + '/api/operations/orders/' + order.id + '/items', { method: 'POST', headers, body: JSON.stringify({ productId: product.id }) });
    assert.equal(unavailable.status, 409);
    assert.equal((await unavailable.json()).error.code, 'PRODUCT_UNAVAILABLE');
    // El ledger se escribe en segundo plano: esperar sus dos registros antes de cerrar Prisma.
    const deadline = Date.now() + 5000;
    while (await prisma.clientOp.count() < 2 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
    assert.ok(await prisma.clientOp.count() >= 2);
  });
  console.log(passed + ' pruebas SQL aprobadas.');
  if (process.argv.includes('--browser')) {
    console.log('Navegador aislado: ' + url + ' · usuario Administrador prueba · PIN 9876. Escriba fin y Enter para cerrar.');
    await new Promise<void>((resolve) => { process.stdin.resume(); process.stdin.once('data', () => { process.stdin.pause(); resolve(); }); });
  }
} finally {
  await new Promise<void>((resolve) => realtime.close(() => resolve()));
  if (http.listening) await new Promise<void>((resolve) => http.close(() => resolve()));
  await prisma.$disconnect();
}
