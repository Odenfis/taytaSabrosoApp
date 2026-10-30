import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import express from 'express';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { io as connect } from '../../node_modules/socket.io-client/build/esm/index.js';
const database = process.env.ORDER_TEST_DATABASE;
assert.match(database ?? '', /^tayta_orders_test_[a-f0-9]{32}$/);
assert.ok(process.env.DATABASE_URL?.includes(';database=' + database));
const { prisma } = await import('../src/lib/prisma.js');
const orders = await import('../src/services/order.service.js');
const { createApp } = await import('../src/app.js');
const { initRealtime } = await import('../src/lib/realtime.js');
const { signAccessToken, hashToken, verifyAccessToken } = await import('../src/lib/auth.js');
let passed = 0;
async function check(name: string, action: () => Promise<void>) { await action(); passed++; console.log('✓ SQL: ' + name); }
const companyId = 'el-tayta';
const id = () => randomUUID();
await prisma.company.create({ data: { id: companyId, name: 'Pruebas', tradeName: 'Pruebas', ruc: '20111111111', specialty: 'Prueba', themeColor: '#fff', accentColor: '#fff', badgeText: 'Prueba', address: 'Prueba' } });
await prisma.table.create({ data: { id: 'test-table', companyId, number: '01', capacity: 4, zone: 'Salón Principal' } });
const product = await prisma.product.create({ data: { id: id(), companyId, name: 'Agua', description: '', image: '', category: 'bebidas', price: 5, available: true } });
const open = (clientOpId: string = id()) => orders.openOrderForTable('test-table', { clientOpId });
async function withItem(quantity = 1) { const order = await open(); return orders.addItemToOrder(order.id, { productId: product.id, quantity }); }
async function free(orderId: string) { const current = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } }); if (current) for (const item of current.items) await orders.removeItemFromOrder(orderId, item.id); }
async function assertFree() { const table = await prisma.table.findUniqueOrThrow({ where: { id: 'test-table' } }); assert.equal(table.status, 'libre'); assert.equal(table.currentOrderId, null); }
try {
await check('migración recalcula órdenes abiertas sin modificar ventas cobradas', async () => {
  const legacyItem = { id: id(), productId: product.id, name: product.name, price: 45, quantity: 1, status: 'servido', addedAt: 'Hoy' };
  const base = { companyId, ticketNumber: id().slice(0, 8), zone: 'Salón Principal', waiter: 'Prueba', createdAt: 'Hoy',
    subtotal: 45, igv: 8.1, total: 53.1, clientOpId: id() };
  const pending = await prisma.order.create({ data: { id: id(), ...base, status: 'por_cobrar',
    items: { create: [legacyItem] } } });
  const paid = await prisma.order.create({ data: { id: id(), ...base, ticketNumber: id().slice(0, 8),
    clientOpId: id(), status: 'cobrado', items: { create: [{ ...legacyItem, id: id() }] } } });
  const migration = await readFile('prisma/migrations/0007_sale_prices_include_igv/migration.sql', 'utf8');
  await prisma.$executeRawUnsafe(migration);
  await prisma.$executeRawUnsafe(migration);
  const recalculated = await prisma.order.findUniqueOrThrow({ where: { id: pending.id }, include: { items: true } });
  assert.deepEqual([Number(recalculated.subtotal), Number(recalculated.igv), Number(recalculated.total)], [38.14, 6.86, 45]);
  assert.equal(Number(recalculated.items[0].price), 45);
  const historical = await prisma.order.findUniqueOrThrow({ where: { id: paid.id } });
  assert.deepEqual([Number(historical.subtotal), Number(historical.igv), Number(historical.total)], [45, 8.1, 53.1]);
});
await check('precio de 45 se cobra por 45 y libro de caja registra 45', async () => {
  const priced = await prisma.product.create({ data: { id: id(), companyId, name: 'Plato con IGV', description: '', image: '', category: 'platos', price: 45, available: true } });
  const opened = await open();
  const withPrice = await orders.addItemToOrder(opened.id, { productId: priced.id, quantity: 1 });
  assert.deepEqual([Number(withPrice.subtotal), Number(withPrice.igv), Number(withPrice.total)], [38.14, 6.86, 45]);
  await orders.sendToKitchen(opened.id);
  const paid = await orders.payTable('test-table', { paymentMethod: 'Efectivo', amountReceived: 50, clientOpId: id() });
  assert.equal(Number(paid.order.total), 45);
  assert.equal(Number(paid.order.change), 5);
  assert.equal(Number(paid.transaction.amount), 45);
  await assertFree();
});
await check('migración preserva historial incierto y aplica default seguro a nuevos pedidos', async () => {
  const legacy = await open();
  const defaults = await prisma.$queryRaw<{ name: string }[]>`SELECT dc.name FROM sys.default_constraints dc JOIN sys.columns c ON c.default_object_id=dc.object_id WHERE dc.parent_object_id=OBJECT_ID('dbo.pedidos') AND c.name='historial_despacho_conocido'`;
  assert.equal(defaults.length, 1);
  assert.match(defaults[0].name, /^[a-zA-Z0-9_]+$/);
  await prisma.$executeRawUnsafe(`ALTER TABLE [dbo].[pedidos] DROP CONSTRAINT [${defaults[0].name}]`);
  await prisma.$executeRawUnsafe('ALTER TABLE [dbo].[pedidos] DROP COLUMN [historial_despacho_conocido], [primer_despacho_utc]');
  await prisma.$executeRawUnsafe('DROP TABLE [dbo].[resultados_pedidos]');
  const migration = await readFile('prisma/migrations/0004_empty_orders/migration.sql', 'utf8');
  for (const statement of migration.split(';').map((s) => s.trim()).filter(Boolean)) await prisma.$executeRawUnsafe(statement);
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: legacy.id } })).dispatchHistoryKnown, false);
  const added = await orders.addItemToOrder(legacy.id, { productId: product.id });
  const removed = await orders.removeItemFromOrder(legacy.id, added.items[0].id);
  assert.equal(removed.status, 'anulado'); assert.equal(removed.isDeleted, true);
  assert.ok(await prisma.order.findUnique({ where: { id: legacy.id } }));
  await assertFree();
});
await check('último producto se elimina físicamente; respuesta final y reintento estables', async () => {
  const order = await withItem();
  assert.equal(order.dispatchHistoryKnown, true);
  const mutation = id();
  const result = await orders.removeItemFromOrder(order.id, order.items[0].id, mutation);
  assert.equal(result.isDeleted, true); assert.equal(result.status, 'anulado'); assert.deepEqual(result.items, []);
  assert.equal(await prisma.order.findUnique({ where: { id: order.id } }), null);
  assert.deepEqual(await orders.removeItemFromOrder(order.id, order.items[0].id, mutation), result);
  await assertFree();
  await assert.rejects(open(order.clientOpId), (e: any) => e.code === 'ORDER_CANCELLED');
});
await check('reducir a cero elimina y no reutiliza número de ticket', async () => {
  const order = await withItem(); const mutation = id();
  const result = await orders.updateItemQuantity(order.id, order.items[0].id, -1, mutation);
  assert.equal(result.isDeleted, true); assert.equal(await prisma.order.findUnique({ where: { id: order.id } }), null);
  assert.deepEqual(await orders.updateItemQuantity(order.id, order.items[0].id, -1, mutation), result);
  const next = await open(); assert.ok(Number(next.ticketNumber) > Number(order.ticketNumber));
  await orders.cancelOrderOpening(next.clientOpId);
});
await check('eliminar una línea conserva las demás; reducción parcial idempotente', async () => {
  const order = await withItem(3);
  const added = await orders.addItemToOrder(order.id, { productId: product.id, notes: 'otra' });
  const result = await orders.removeItemFromOrder(order.id, added.items.find((i: any) => i.notes === 'otra')!.id);
  assert.equal(result.isDeleted, false); assert.equal(result.items.length, 1); assert.equal(Number(result.total), 15);
  const mutation = id();
  await orders.updateItemQuantity(order.id, result.items[0].id, -1, mutation);
  await orders.updateItemQuantity(order.id, result.items[0].id, -1, mutation);
  assert.equal(Number((await prisma.orderItem.findUniqueOrThrow({ where: { id: result.items[0].id } })).quantity), 2);
  await free(order.id);
});
await check('despacho sin receta conserva anulación y fecha de primer despacho', async () => {
  const order = await withItem(); await orders.sendToKitchen(order.id);
  const before = await prisma.order.findUniqueOrThrow({ where: { id: order.id } }); assert.ok(before.firstDispatchedUtc);
  await orders.sendToKitchen(order.id);
  assert.deepEqual((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).firstDispatchedUtc, before.firstDispatchedUtc);
  const result = await orders.updateItemQuantity(order.id, order.items[0].id, -1);
  assert.equal(result.status, 'anulado'); assert.equal(result.isDeleted, true); assert.equal(Number(result.total), 0);
  assert.ok(await prisma.order.findUnique({ where: { id: order.id } })); await assertFree();
  await assert.rejects(orders.addItemToOrder(order.id, { productId: product.id }), (e: any) => e.code === 'ORDER_CANCELLED');
  await assert.rejects(orders.updateItemQuantity(order.id, order.items[0].id, 1), (e: any) => e.code === 'ORDER_CANCELLED');
});
const ingredient = await prisma.insumo.create({ data: { id: id(), companyId, code: 'TEST', name: 'Agua insumo', category: 'Otros', unit: 'un', currentStock: 100, minStock: 1, costPerUnit: 2 } });
await prisma.recipe.create({ data: { id: id(), companyId, productId: product.id, productName: product.name, category: 'bebidas', salePrice: 5, totalCost: 2, theoreticalFoodCostPct: 40, portions: 1,
  ingredients: { create: { id: id(), insumoId: ingredient.id, insumoName: ingredient.name, quantity: 1, unit: 'un', costPerUnit: 2, subtotalCost: 2 } } } });
await check('despacho persiste saldo negativo, reintento no duplica y devolución lo revierte', async () => {
  await prisma.insumo.update({ where: { id: ingredient.id }, data: { currentStock: 0 } });
  const order = await withItem();
  await orders.sendToKitchen(order.id);
  await orders.sendToKitchen(order.id);
  assert.equal(Number((await prisma.insumo.findUniqueOrThrow({ where: { id: ingredient.id } })).currentStock), -1);
  assert.equal(await prisma.kardexMovement.count({ where: { insumoId: ingredient.id, type: 'SALIDA_VENTA_POS' } }), 1);
  await orders.removeItemFromOrder(order.id, order.items[0].id);
  assert.equal(Number((await prisma.insumo.findUniqueOrThrow({ where: { id: ingredient.id } })).currentStock), 0);
  await prisma.insumo.update({ where: { id: ingredient.id }, data: { currentStock: 100 } });
});
await check('despacho con receta y devolución se registran una sola vez tras respuesta perdida', async () => {
  const returnsBefore = await prisma.kardexMovement.count({ where: { type: 'ENTRADA_DEVOLUCION_VENTA_POS' } });
  const order = await withItem(2); await orders.sendToKitchen(order.id);
  assert.equal(Number((await prisma.insumo.findUniqueOrThrow({ where: { id: ingredient.id } })).currentStock), 98);
  await orders.removeItemFromOrder(order.id, order.items[0].id, 'lost-response');
  await orders.removeItemFromOrder(order.id, order.items[0].id, 'lost-response');
  assert.equal(Number((await prisma.insumo.findUniqueOrThrow({ where: { id: ingredient.id } })).currentStock), 100);
  assert.equal(await prisma.kardexMovement.count({ where: { type: 'ENTRADA_DEVOLUCION_VENTA_POS' } }), returnsBefore + 1);
});
await check('pedidos cobrados rechazan borrar, cantidad y notas sin tocar caja o stock', async () => {
  const order = await withItem(); await orders.sendToKitchen(order.id);
  await orders.payTable('test-table', { paymentMethod: 'Efectivo', amountReceived: 20 });
  for (const action of [() => orders.removeItemFromOrder(order.id, order.items[0].id), () => orders.updateItemQuantity(order.id, order.items[0].id, -1), () => orders.updateItemNotes(order.id, order.items[0].id, 'x')]) {
    await assert.rejects(action(), (e: any) => e.code === 'ALREADY_PAID');
  }
  assert.equal(await prisma.transaction.count({ where: { orderId: order.id } }), 1);
  assert.equal(await prisma.orderItem.count({ where: { orderId: order.id } }), 1); await assertFree();
});
await check('replay antiguo no libera ni cambia un nuevo pedido', async () => {
  const old = await withItem(); await orders.removeItemFromOrder(old.id, old.items[0].id);
  const fresh = await withItem();
  await orders.removeItemFromOrder(old.id, old.items[0].id);
  assert.equal((await prisma.table.findUniqueOrThrow({ where: { id: 'test-table' } })).currentOrderId, fresh.id);
  assert.equal(await prisma.orderItem.count({ where: { orderId: fresh.id } }), 1); await free(fresh.id);
});
await check('adición y eliminación concurrentes nunca pierden una adición confirmada', async () => {
  for (let n = 0; n < 5; n++) {
    const order = await withItem();
    const results = await Promise.allSettled([orders.addItemToOrder(order.id, { productId: product.id, notes: 'terminal B' }), orders.removeItemFromOrder(order.id, order.items[0].id)]);
    assert.equal(results[1].status, 'fulfilled');
    if (results[0].status === 'fulfilled') {
      assert.equal(await prisma.orderItem.count({ where: { orderId: order.id } }), 1);
      assert.equal((await prisma.table.findUniqueOrThrow({ where: { id: 'test-table' } })).currentOrderId, order.id);
      await free(order.id);
    } else { assert.equal(await prisma.order.findUnique({ where: { id: order.id } }), null); await assertFree(); }
  }
});
await check('cancelar antes y después de abrir impide recrear pedidos', async () => {
  const neverSent = id(); await orders.cancelOrderOpening(neverSent);
  await assert.rejects(open(neverSent), (e: any) => e.code === 'ORDER_CANCELLED');
  const sent = id(); const order = await open(sent); await orders.cancelOrderOpening(sent);
  assert.equal(await prisma.order.findUnique({ where: { id: order.id } }), null);
  await assert.rejects(open(sent), (e: any) => e.code === 'ORDER_CANCELLED'); await assertFree();
});
await check('flush inicial repetido no duplica; cancelación conserva aportes de otra terminal', async () => {
  const opening = id(); const order = await open(opening);
  const desired = [{ productId: product.id, quantity: 2 }];
  await orders.syncOpeningItems(opening, desired); await orders.syncOpeningItems(opening, desired);
  assert.equal(Number((await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } })).quantity), 2);
  await orders.addItemToOrder(order.id, { productId: product.id, quantity: 3 });
  const result = await orders.cancelOrderOpening(opening);
  assert.equal(result.id, order.id); assert.equal(result.isDeleted, false); assert.equal(Number(result.items[0].quantity), 3);
  await assert.rejects(orders.syncOpeningItems(opening, desired), (e: any) => e.code === 'ORDER_CANCELLED');
  await free(order.id);
});
await check('dos aperturas comparten mesa sin sustituir el aporte de la otra terminal', async () => {
  const a = id(); const b = id(); const [first, second] = await Promise.all([open(a), open(b)]);
  assert.equal(first.id, second.id);
  await orders.syncOpeningItems(a, [{ productId: product.id, quantity: 1 }]);
  await orders.syncOpeningItems(b, [{ productId: product.id, quantity: 2 }]);
  const current = await prisma.orderItem.findFirstOrThrow({ where: { orderId: first.id } }); assert.equal(Number(current.quantity), 3);
  await orders.cancelOrderOpening(a);
  assert.equal(Number((await prisma.orderItem.findUniqueOrThrow({ where: { id: current.id } })).quantity), 2);
  await orders.cancelOrderOpening(b); assert.equal(await prisma.order.findUnique({ where: { id: first.id } }), null); await assertFree();
});
await check('cancelación durante flush en vuelo deja el pedido ausente', async () => {
  const opening = id(); const order = await open(opening);
  const results = await Promise.allSettled([orders.syncOpeningItems(opening, [{ productId: product.id, quantity: 1 }]), orders.cancelOrderOpening(opening)]);
  assert.equal(results[1].status, 'fulfilled'); assert.equal(await prisma.order.findUnique({ where: { id: order.id } }), null); await assertFree();
});
await check('limpieza separada omite pedidos cambiados y solo elimina el borrador vacío seleccionado', async () => {
  const first = await open();
  await orders.addItemToOrder(first.id, { productId: product.id });
  const skipped = await orders.cleanupEmptyDraft(first.id); assert.equal('skipped' in skipped && skipped.skipped, true);
  assert.ok(await prisma.order.findUnique({ where: { id: first.id } })); await free(first.id);
  const empty = await open(); const removed = await orders.cleanupEmptyDraft(empty.id);
  assert.equal('isDeleted' in removed && removed.isDeleted, true);
  assert.equal(await prisma.order.findUnique({ where: { id: empty.id } }), null);
  await assertFree();
});
await check('cinco cuentas y pagos mixtos conservan tickets y liberan mesa solo al saldar', async () => {
  const { createDinerBills, payDinerBill } = await import('../src/services/diner-bill.service.js');
  const plate = await prisma.product.create({ data: { id: id(), companyId, name: 'Plato compartido', description: '', image: '', category: 'platos', price: 20, available: true } });
  const bank = await prisma.bankAccount.create({ data: { id: id(), companyId, bankName: 'BCP', accountNumber: id(), accountType: 'Ahorros', currency: 'PEN', holderName: 'Pruebas', alias: 'BCP prueba', currentBalance: 0 } });
  const cash = await prisma.customPaymentMethod.create({ data: { id: id(), companyId, name: 'Efectivo prueba', category: 'Efectivo', icon: 'payments' } });
  const yape = await prisma.customPaymentMethod.create({ data: { id: id(), companyId, name: 'Yape prueba', category: 'Billetera Digital', bankAccountId: bank.id, bankAccountAlias: bank.alias, requiresReferenceNumber: true, icon: 'payments' } });
  const opened = await open();
  const ordered = await orders.addItemToOrder(opened.id, { productId: plate.id, quantity: 5 });
  await orders.sendToKitchen(opened.id);
  await orders.markTableForBilling('test-table');
  const drafts = Array.from({ length: 5 }, (_, i) => ({ id: id(), label: `Comensal ${i + 1}`, documentType: 'ticket' as const, recipientName: `Cliente ${i + 1}`, items: [{ orderItemId: ordered.items[0].id, quantity: 1 }] }));
  await assert.rejects(createDinerBills(opened.id, drafts.map((d) => ({ ...d, items: [{ ...d.items[0], quantity: 2 }] })), id()), (e: any) => e.code === 'UNASSIGNED_ITEMS');
  const bills = await createDinerBills(opened.id, drafts, id());
  assert.equal(bills.length, 5);
  assert.equal(new Set(bills.map((b: any) => b.ticketNumber)).size, 5);
  await assert.rejects(orders.payTable('test-table', { paymentMethod: cash.name, amountReceived: 100, customPaymentMethodId: cash.id }), (e: any) => e.code === 'SPLIT_BILLS_EXIST');
  await assert.rejects(orders.updateItemQuantity(opened.id, ordered.items[0].id, 1), (e: any) => e.code === 'SPLIT_BILLS_EXIST');
  const firstId = id();
  const first = await payDinerBill(bills[0].id, { amount: 10, amountReceived: 20, customPaymentMethodId: cash.id, clientOpId: firstId });
  assert.equal(Number(first.transaction.change), 10);
  await payDinerBill(bills[0].id, { amount: 10, amountReceived: 10, customPaymentMethodId: cash.id, clientOpId: firstId }).then(() => assert.fail('monto distinto aceptado'), (e: any) => assert.equal(e.code, 'PAYMENT_ID_CONFLICT'));
  assert.equal((await payDinerBill(bills[0].id, { amount: 10, amountReceived: 20, customPaymentMethodId: cash.id, clientOpId: firstId })).transaction.id, first.transaction.id);
  await assert.rejects(payDinerBill(bills[0].id, { amount: 10, amountReceived: 10, customPaymentMethodId: yape.id, clientOpId: id() }), (e: any) => e.code === 'REFERENCE_REQUIRED');
  await payDinerBill(bills[0].id, { amount: 10, amountReceived: 10, customPaymentMethodId: yape.id, referenceNumber: 'YAPE-1', contributorName: 'Comensal 2', clientOpId: id() });
  for (const b of bills.slice(1, 4)) await payDinerBill(b.id, { amount: 20, amountReceived: 20, customPaymentMethodId: yape.id, referenceNumber: id(), clientOpId: id() });
  assert.equal((await prisma.table.findUniqueOrThrow({ where: { id: 'test-table' } })).status, 'por_cobrar');
  await Promise.all([
    payDinerBill(bills[4].id, { amount: 10, amountReceived: 10, customPaymentMethodId: cash.id, clientOpId: id() }),
    payDinerBill(bills[4].id, { amount: 10, amountReceived: 10, customPaymentMethodId: cash.id, clientOpId: id() }),
  ]);
  await assertFree();
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: opened.id } })).status, 'cobrado');
  assert.equal((await payDinerBill(bills[0].id, { amount: 10, amountReceived: 20, customPaymentMethodId: cash.id, clientOpId: firstId })).orderClosed, true);
  const txs = await prisma.transaction.findMany({ where: { orderId: opened.id } });
  assert.equal(txs.reduce((n, t) => n + Number(t.amount), 0), 100);
  assert.equal(Number((await prisma.bankAccount.findUniqueOrThrow({ where: { id: bank.id } })).currentBalance), 70);
  const operatorId = id();
  await prisma.user.create({ data: { id: operatorId, name: 'Cajero reparto', pinHash: bcrypt.hashSync('9876', 4), role: 'Cajero', terminal: 'Pruebas', companyId } });
  await prisma.user.create({ data: { id: id(), name: 'Administrador reparto', pinHash: bcrypt.hashSync('4321', 4), role: 'Administrador', terminal: 'Pruebas', companyId } });
  const { correctPayment } = await import('../src/services/payment-correction.service.js');
  await correctPayment({ transactionId: first.transaction.id, correctionId: id(), operatorId, supervisorPin: '4321', expectedMethodId: cash.id,
    expectedBankAccountId: null, expectedReference: null, newMethodId: yape.id, referenceNumber: 'CORR-1', reason: 'Medio registrado por error' });
  const corrected = await prisma.transaction.findUniqueOrThrow({ where: { id: first.transaction.id } });
  assert.equal(corrected.customPaymentMethodId, yape.id);
  assert.equal(Number(corrected.amountReceived), 10);
  assert.equal(Number(corrected.change), 0);
  assert.equal(Number((await prisma.bankAccount.findUniqueOrThrow({ where: { id: bank.id } })).currentBalance), 80);
});
// HTTP y Socket.IO reales con dos clientes sobre la BD efímera.
await prisma.user.create({ data: { id: 'test-user', name: 'Administrador prueba', pinHash: bcrypt.hashSync('9876', 4), role: 'Administrador', terminal: 'Pruebas', companyId: null } });
await prisma.device.create({ data: { id: 'test-device', name: 'Pruebas', terminalCode: 'TERM-TEST' } });
const token = signAccessToken({ sub: 'test-user', deviceId: 'test-device', role: 'Administrador', name: 'Administrador prueba' });
await prisma.session.create({ data: { id: id(), userId: 'test-user', deviceId: 'test-device', tokenHash: hashToken(token), expiresAt: new Date(verifyAccessToken(token).exp * 1000) } });
const web = express(); web.use(express.static(path.resolve('../dist'))); web.use(createApp());
const http = createServer(web); const realtime = initRealtime(http);
await new Promise<void>((resolve) => http.listen(process.argv.includes('--browser') ? 4310 : 0, '127.0.0.1', resolve));
const url = 'http://127.0.0.1:' + (http.address() as any).port;
const sockets = [connect(url, { auth: { token }, transports: ['websocket'] }), connect(url, { auth: { token }, transports: ['websocket'] })];
try {
  await Promise.all(sockets.map((socket) => new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); })));
  for (const socket of sockets) socket.emit('join-company', { companyId });
  const deadline = Date.now() + 3000;
  while ((await realtime.in('company:' + companyId).fetchSockets()).length < 2 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal((await realtime.in('company:' + companyId).fetchSockets()).length, 2);
  await check('HTTP responde estado final; ambas terminales reciben anulación y mesa libre', async () => {
    const order = await withItem();
    const events = sockets.map((socket) => new Promise<any>((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Sin evento de anulación')), 5000); const handler = (e: any) => { if (e.orderId === order.id && e.status === 'anulado') { clearTimeout(timer); socket.off('order:changed', handler); resolve(e); } }; socket.on('order:changed', handler); }));
    const tableEvents = sockets.map((socket) => new Promise<any>((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Sin evento de mesa libre')), 5000); const handler = (e: any) => { if (e.tableId === 'test-table' && e.status === 'libre') { clearTimeout(timer); socket.off('table:changed', handler); resolve(e); } }; socket.on('table:changed', handler); }));
    const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
    const response = await fetch(`${url}/api/operations/orders/${order.id}/items/${order.items[0].id}?clientOpId=${id()}`, { method: 'DELETE', headers });
    assert.equal(response.status, 200); const result = await response.json(); assert.equal(result.isDeleted, true); assert.equal(result.status, 'anulado');
    const received = await Promise.all([...events, ...tableEvents]);
    for (const event of received.slice(0, 2)) assert.equal(event.isDeleted, true);
    for (const event of received.slice(2)) assert.equal(event.currentOrderId, null);
    const active = await fetch(url + '/api/operations/orders/active', { headers }); assert.ok(!(await active.json()).some((o: any) => o.id === order.id));
    assert.equal((await fetch(url + '/api/operations/orders/' + order.id, { headers })).status, 404);
  });
  console.log(passed + ' escenarios de pedidos SQL/API/realtime aprobados.');
  if (process.argv.includes('--browser')) {
    console.log('Navegador aislado: ' + url + ' · PIN 9876 · escriba fin y Enter para cerrar.');
    await new Promise<void>((resolve) => { process.stdin.resume(); process.stdin.once('data', () => { process.stdin.pause(); resolve(); }); });
  }
} finally { sockets.forEach((socket) => socket.disconnect()); await new Promise<void>((resolve) => realtime.close(() => resolve())); if (http.listening) await new Promise<void>((resolve) => http.close(() => resolve())); }
} finally { await prisma.$disconnect(); }
