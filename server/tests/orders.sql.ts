import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
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
const { createManualTransaction } = await import('../src/services/shift.service.js');
const { addKardexAdjustment } = await import('../src/services/kardex.service.js');
const { createPurchase } = await import('../src/services/purchase.service.js');
const { createPaymentMethod } = await import('../src/services/master.service.js');
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
await check('apertura y edición de pedido guardan autor y revierten si falla auditoría', async () => {
  const actor = { userId: 'mozo-prueba', deviceId: 'terminal-prueba' };
  const key = id();
  const opened = await orders.openOrderForTable('test-table', { clientOpId: key, waiter: 'Mozo' }, actor);
  await orders.openOrderForTable('test-table', { clientOpId: key, waiter: 'Mozo' }, actor);
  assert.equal(await prisma.operationAudit.count({ where: { entityId: opened.id, action: 'abrir_pedido' } }), 1);
  const withItem = await orders.addItemToOrder(opened.id, { productId: product.id }, actor);
  assert.equal(await prisma.operationAudit.count({ where: { entityId: opened.id, action: 'agregar_item', actorUserId: actor.userId } }), 1);
  await assert.rejects(orders.addItemToOrder(opened.id, { productId: product.id }, { ...actor, userId: 'x'.repeat(100) }));
  assert.equal(Number((await prisma.orderItem.findUniqueOrThrow({ where: { id: withItem.items[0].id } })).quantity), 1);
  await orders.updateItemNotes(opened.id, withItem.items[0].id, 'Sin hielo', actor);
  const quantityId = id();
  await orders.updateItemQuantity(opened.id, withItem.items[0].id, 1, quantityId, actor);
  await orders.updateItemQuantity(opened.id, withItem.items[0].id, 1, quantityId, actor);
  await orders.sendToKitchen(opened.id, { clientOpId: id() }, actor);
  await orders.markTableForBilling('test-table', actor);
  for (const action of ['actualizar_notas', 'actualizar_cantidad', 'enviar_cocina', 'marcar_por_cobrar']) assert.equal(await prisma.operationAudit.count({ where: { entityId: opened.id, action, actorUserId: actor.userId } }), 1, action);
  await orders.payTable('test-table', { paymentMethod: 'Efectivo', amountReceived: 10, clientOpId: id() }, actor);
  const cancelled = await orders.openOrderForTable('test-table', { clientOpId: id(), waiter: 'Mozo' }, actor);
  const one = await orders.addItemToOrder(cancelled.id, { productId: product.id }, actor);
  await orders.removeItemFromOrder(cancelled.id, one.items[0].id, id(), actor);
  assert.equal(await prisma.operationAudit.count({ where: { entityId: cancelled.id, action: 'quitar_item', actorUserId: actor.userId } }), 1);
});
await check('cuentas bancarias de otra empresa no reciben pagos ni movimientos', async () => {
  const other = 'otra-empresa';
  await prisma.company.create({ data: { id: other, name: 'Otra', tradeName: 'Otra', ruc: '20222222222', specialty: '', themeColor: '', accentColor: '', badgeText: '', address: '' } });
  const bank = await prisma.bankAccount.create({ data: { id: id(), companyId: other, bankName: 'Banco', accountNumber: '123', accountType: 'Ahorros', currency: 'PEN', holderName: 'Otra', alias: 'Otra', currentBalance: 100 } });
  await assert.rejects(createPaymentMethod({ companyId, name: 'Medio ajeno', category: 'Transferencia Bancaria', bankAccountId: bank.id }), (error: any) => error.code === 'INVALID_ACCOUNT');
  const method = await prisma.customPaymentMethod.create({ data: { id: id(), name: 'Transferencia prueba', category: 'Transferencia Bancaria', icon: 'payments', bankAccountId: bank.id, companyId: null } });
  await assert.rejects(createManualTransaction({ companyId, type: 'Ingreso Extra', description: 'Prueba', amount: 10, isIncome: true, bankAccountId: bank.id }), (error: any) => error.code === 'INVALID_ACCOUNT');
  const order = await withItem();
  await prisma.orderItem.updateMany({ where: { orderId: order.id }, data: { status: 'en_cocina' } });
  await assert.rejects(orders.payTable('test-table', { paymentMethod: method.name, amountReceived: 5, customPaymentMethodId: method.id }), (error: any) => error.code === 'INVALID_ACCOUNT');
  assert.equal(Number((await prisma.bankAccount.findUniqueOrThrow({ where: { id: bank.id } })).currentBalance), 100);
  await prisma.orderItem.updateMany({ where: { orderId: order.id }, data: { status: 'agregado' } });
  await free(order.id);
  await prisma.customPaymentMethod.delete({ where: { id: method.id } });
});
await check('reintento de Kardex no puede recuperar ni aplicar movimiento de otra empresa', async () => {
  const actor = { userId: 'usuario-prueba', deviceId: 'terminal-prueba' };
  const foreign = await prisma.insumo.create({ data: { id: id(), companyId: 'otra-empresa', code: id().slice(0, 15), name: 'Ajeno', category: 'Abarrotes & Especias', unit: 'kg', currentStock: 10, minStock: 0, costPerUnit: 1 } });
  const local = await prisma.insumo.create({ data: { id: id(), companyId, code: id().slice(0, 15), name: 'Local', category: 'Abarrotes & Especias', unit: 'kg', currentStock: 10, minStock: 0, costPerUnit: 1 } });
  const operationId = id();
  await addKardexAdjustment({ companyId: 'otra-empresa', insumoId: foreign.id, quantity: 1, type: 'AJUSTE_MERMA', reason: 'Prueba', clientOpId: operationId }, actor);
  await assert.rejects(addKardexAdjustment({ companyId, insumoId: local.id, quantity: 1, type: 'AJUSTE_MERMA', reason: 'Prueba', clientOpId: operationId }, actor), (error: any) => error.code === 'KARDEX_ID_CONFLICT');
  assert.equal(Number((await prisma.insumo.findUniqueOrThrow({ where: { id: local.id } })).currentStock), 10);
  assert.equal(await prisma.kardexMovement.count({ where: { clientOpId: operationId } }), 1);
});
await check('reintentos de caja y compras rechazan identificadores de otra empresa', async () => {
  const actor = { userId: 'usuario-prueba', deviceId: 'terminal-prueba' };
  const transactionId = id();
  const movement = { companyId: 'otra-empresa', type: 'Ingreso Extra', description: 'Prueba', amount: 3, isIncome: true, clientOpId: transactionId };
  await createManualTransaction(movement, actor);
  await assert.rejects(createManualTransaction({ ...movement, companyId }, actor), (error: any) => error.code === 'TRANSACTION_ID_CONFLICT');
  assert.equal(await prisma.transaction.count({ where: { clientOpId: transactionId } }), 1);
  const purchaseId = id();
  const purchase = { companyId: 'otra-empresa', documentStatus: 'provisional', invoiceNumber: 'VALE-AJENO', supplierName: 'Proveedor', supplierRuc: '20111111111', total: 10, items: [], clientOpId: purchaseId };
  await createPurchase(purchase, actor);
  await assert.rejects(createPurchase({ ...purchase, companyId }, actor), (error: any) => error.code === 'PURCHASE_ID_CONFLICT');
  assert.equal(await prisma.purchase.count({ where: { clientOpId: purchaseId } }), 1);
});
await check('insumo compartido registra empresa del movimiento, reintento y rollback', async () => {
  const actor = { userId: 'usuario-prueba', deviceId: 'terminal-prueba' };
  const shared = await prisma.insumo.create({ data: { id: id(), companyId: null, code: id().slice(0, 15), name: 'Compartido', category: 'Abarrotes & Especias', unit: 'kg', currentStock: 10, minStock: 0, costPerUnit: 1 } });
  const first = { companyId, insumoId: shared.id, quantity: 1, type: 'AJUSTE_MERMA' as const, reason: 'Uno', clientOpId: id() };
  const second = { ...first, companyId: 'otra-empresa', clientOpId: id(), reason: 'Dos' };
  const a = await addKardexAdjustment(first, actor);
  await addKardexAdjustment(first, actor);
  const b = await addKardexAdjustment(second, actor);
  assert.equal(Number((await prisma.insumo.findUniqueOrThrow({ where: { id: shared.id } })).currentStock), 8);
  for (const [movement, scope] of [[a.movement, companyId], [b.movement, 'otra-empresa']] as const) {
    const records = await prisma.operationAudit.findMany({ where: { action: 'ajustar_kardex', entityId: movement.id } });
    assert.equal(records.length, 1);
    assert.equal(records[0].companyId, scope);
    assert.equal(records[0].actorUserId, actor.userId);
    assert.equal(records[0].deviceId, actor.deviceId);
  }
  const failedId = id();
  await assert.rejects(addKardexAdjustment({ ...second, clientOpId: failedId }, { ...actor, userId: 'x'.repeat(100) }));
  assert.equal(Number((await prisma.insumo.findUniqueOrThrow({ where: { id: shared.id } })).currentStock), 8);
  assert.equal(await prisma.kardexMovement.count({ where: { clientOpId: failedId } }), 0);
});
await check('medio de efectivo compartido funciona en ambas empresas sin duplicar auditoría', async () => {
  const actor = { userId: 'usuario-prueba', deviceId: 'terminal-prueba' };
  const method = await prisma.customPaymentMethod.create({ data: { id: id(), companyId: null, name: 'Efectivo compartido', category: 'Efectivo', icon: 'payments' } });
  for (const scope of [companyId, 'otra-empresa']) {
    const input = { companyId: scope, type: 'Ingreso Extra', description: 'Prueba', amount: 1, isIncome: true, customPaymentMethodId: method.id, clientOpId: id() };
    const movement = await createManualTransaction(input, actor);
    await createManualTransaction(input, actor);
    const records = await prisma.operationAudit.findMany({ where: { action: 'crear_movimiento_caja', entityId: movement.id } });
    assert.equal(records.length, 1);
    assert.deepEqual([records[0].companyId, records[0].actorUserId, records[0].deviceId], [scope, actor.userId, actor.deviceId]);
  }
});
await check('reintento de edición no devuelve la comanda de otra empresa', async () => {
  const otherTable = await prisma.table.create({ data: { id: id(), companyId: 'otra-empresa', number: '02', capacity: 4, zone: 'Salón Principal' } });
  const otherProduct = await prisma.product.create({ data: { id: id(), companyId: 'otra-empresa', name: 'Ajeno', description: '', image: '', category: 'bebidas', price: 5, available: true } });
  const foreignOrder = await orders.openOrderForTable(otherTable.id, { clientOpId: id() });
  const foreignItems = await orders.addItemToOrder(foreignOrder.id, { productId: otherProduct.id });
  const operationId = id();
  await orders.updateItemQuantity(foreignOrder.id, foreignItems.items[0].id, 1, operationId);
  const localOrder = await withItem();
  await assert.rejects(orders.updateItemQuantity(localOrder.id, localOrder.items[0].id, 1, operationId), (error: any) => error.code === 'ORDER_OPERATION_ID_CONFLICT');
  assert.equal(Number((await prisma.orderItem.findUniqueOrThrow({ where: { id: localOrder.items[0].id } })).quantity), 1);
  await free(localOrder.id);
  await orders.removeItemFromOrder(foreignOrder.id, foreignItems.items[0].id);
});
await check('movimiento de caja y auditoría se guardan juntos e idempotentes', async () => {
  const clientOpId = id();
  const input = { companyId, type: 'Ingreso Extra', description: 'Prueba', amount: 10, isIncome: true, clientOpId };
  const actor = { userId: 'usuario-prueba', deviceId: 'terminal-prueba' };
  const first = await createManualTransaction(input, actor);
  const again = await createManualTransaction(input, actor);
  assert.equal(first.id, again.id);
  const entries = await prisma.operationAudit.findMany({ where: { entityId: first.id } });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].actorUserId, actor.userId);
  assert.equal(entries[0].deviceId, actor.deviceId);
  assert.equal(entries[0].companyId, companyId);
  const failedOp = id();
  await assert.rejects(createManualTransaction({ ...input, clientOpId: failedOp }, { ...actor, userId: 'x'.repeat(100) }));
  assert.equal(await prisma.transaction.count({ where: { clientOpId: failedOp } }), 0);
  await prisma.operationAudit.deleteMany({ where: { entityId: first.id } });
  await prisma.transaction.delete({ where: { id: first.id } });
});
await check('compra y ajuste guardan auditoría con autor y respetan reintentos', async () => {
  const actor = { userId: 'usuario-prueba', deviceId: 'terminal-prueba' };
  const insumo = await prisma.insumo.create({ data: { id: id(), companyId, code: id().slice(0, 15), name: 'Prueba auditoría', category: 'Abarrotes & Especias', unit: 'kg', currentStock: 10, minStock: 1, costPerUnit: 2 } });
  const adjustment = { companyId, insumoId: insumo.id, quantity: 1, type: 'AJUSTE_MERMA' as const, reason: 'Prueba', clientOpId: id() };
  const result = await addKardexAdjustment(adjustment, actor);
  await addKardexAdjustment(adjustment, actor);
  assert.equal(await prisma.operationAudit.count({ where: { entityId: result.movement.id, action: 'ajustar_kardex' } }), 1);
  const purchaseInput = { companyId, documentStatus: 'provisional', invoiceNumber: 'VALE-TEST', supplierName: 'Proveedor', supplierRuc: '20111111111', total: 10, items: [], clientOpId: id() };
  const purchase = await createPurchase(purchaseInput, actor);
  await createPurchase(purchaseInput, actor);
  assert.equal(await prisma.operationAudit.count({ where: { entityId: purchase!.id, action: 'crear_compra', actorUserId: actor.userId } }), 1);
});
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
  const paymentInput = { paymentMethod: 'Efectivo', amountReceived: 50, clientOpId: id() };
  const paymentActor = { userId: 'cajero-test', deviceId: 'terminal-test' };
  const paid = await orders.payTable('test-table', paymentInput, paymentActor);
  await orders.payTable('test-table', paymentInput, paymentActor);
  assert.equal(await prisma.operationAudit.count({ where: { entityId: paid.transaction.id, action: 'cobrar_mesa', actorUserId: paymentActor.userId } }), 1);
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
  const actor = { userId: 'cajero-test', deviceId: 'terminal-test' };
  const bills = await createDinerBills(opened.id, drafts, id(), actor);
  assert.equal(await prisma.operationAudit.count({ where: { entityId: opened.id, action: 'repartir_cuenta', actorUserId: actor.userId } }), 1);
  assert.equal(bills.length, 5);
  assert.equal(new Set(bills.map((b: any) => b.ticketNumber)).size, 5);
  await assert.rejects(orders.payTable('test-table', { paymentMethod: cash.name, amountReceived: 100, customPaymentMethodId: cash.id }), (e: any) => e.code === 'SPLIT_BILLS_EXIST');
  await assert.rejects(orders.updateItemQuantity(opened.id, ordered.items[0].id, 1), (e: any) => e.code === 'SPLIT_BILLS_EXIST');
  const firstId = id();
  const failedPaymentId = id();
  await assert.rejects(payDinerBill(bills[0].id, { amount: 10, amountReceived: 10, customPaymentMethodId: yape.id, referenceNumber: 'YAPE-FAIL', clientOpId: failedPaymentId }, { ...actor, userId: 'x'.repeat(100) }));
  assert.equal(await prisma.transaction.count({ where: { clientOpId: failedPaymentId } }), 0);
  assert.equal(Number((await prisma.bankAccount.findUniqueOrThrow({ where: { id: bank.id } })).currentBalance), 0);
  assert.equal((await prisma.dinerBill.findUniqueOrThrow({ where: { id: bills[0].id } })).status, 'pendiente');
  const first = await payDinerBill(bills[0].id, { amount: 10, amountReceived: 20, customPaymentMethodId: cash.id, clientOpId: firstId }, actor);
  assert.equal(Number(first.transaction.change), 10);
  await payDinerBill(bills[0].id, { amount: 10, amountReceived: 10, customPaymentMethodId: cash.id, clientOpId: firstId }).then(() => assert.fail('monto distinto aceptado'), (e: any) => assert.equal(e.code, 'PAYMENT_ID_CONFLICT'));
  assert.equal((await payDinerBill(bills[0].id, { amount: 10, amountReceived: 20, customPaymentMethodId: cash.id, clientOpId: firstId }, actor)).transaction.id, first.transaction.id);
  assert.equal(await prisma.operationAudit.count({ where: { entityId: first.transaction.id, action: 'abonar_cuenta', actorUserId: actor.userId } }), 1);
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
  const { paymentSummary } = await import('../src/services/payment-summary.service.js');
  const beforeSummary = await paymentSummary(companyId,false);
  const failedCorrectionId = id();
  await assert.rejects(correctPayment({ transactionId: first.transaction.id, correctionId: failedCorrectionId, operatorId, supervisorPin: '4321', expectedMethodId: cash.id,
    expectedBankAccountId: null, expectedReference: null, newMethodId: yape.id, referenceNumber: 'CORR-FAIL', reason: 'Medio registrado por error' }, { userId: 'x'.repeat(100), deviceId: 'terminal-prueba' }));
  assert.equal(await prisma.paymentCorrection.count({ where: { id: failedCorrectionId } }), 0);
  assert.equal(Number((await prisma.bankAccount.findUniqueOrThrow({ where: { id: bank.id } })).currentBalance), 70);
  assert.equal((await prisma.transaction.findUniqueOrThrow({ where: { id: first.transaction.id } })).customPaymentMethodId, cash.id);
  await correctPayment({ transactionId: first.transaction.id, correctionId: id(), operatorId, supervisorPin: '4321', expectedMethodId: cash.id,
    expectedBankAccountId: null, expectedReference: null, newMethodId: yape.id, referenceNumber: 'CORR-1', reason: 'Medio registrado por error' }, { userId: operatorId, deviceId: 'terminal-prueba' });
  assert.equal(await prisma.operationAudit.count({ where: { actorUserId: operatorId, action: 'corregir_medio_pago' } }), 1);
  const corrected = await prisma.transaction.findUniqueOrThrow({ where: { id: first.transaction.id } });
  assert.equal(corrected.customPaymentMethodId, yape.id);
  const afterSummary = await paymentSummary(companyId,false);
  assert.equal(afterSummary.rows.find(r=>r.id===yape.id)!.amount - beforeSummary.rows.find(r=>r.id===yape.id)!.amount,10);
  assert.ok(!afterSummary.rows.some(r=>r.id===cash.id));
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
// El listener de 'connect' se registra en el mismo instante en que se crea el
// socket: si se registrara más tarde, la conexión ya consumida dejaría la
// espera colgada para siempre.
const connectSocket = () => {
  const socket = connect(url, { auth: { token }, transports: ['websocket'] });
  const ready = socket.connected
    ? Promise.resolve()
    : new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('El socket de realtime no conectó a tiempo.')), 10_000);
      socket.once('connect', () => { clearTimeout(timer); resolve(); });
      socket.once('connect_error', (error) => { clearTimeout(timer); reject(error); });
    });
  return { socket, ready };
};
const connections = [connectSocket(), connectSocket()];
const sockets = connections.map((entry) => entry.socket);
// Autor: miembro de la empresa con permiso de caja, en su propia terminal.
const authorId = id();
await prisma.user.create({ data: { id: authorId, name: 'Autora offline', role: 'Jefe de restaurante', terminal: 'Pruebas', companyId, pinHash: bcrypt.hashSync('1357', 4) } });
await prisma.device.create({ data: { id: 'author-device', companyId, name: 'Terminal autora', terminalCode: 'TERM-AUTHOR' } });
const authorToken = signAccessToken({ sub: authorId, deviceId: 'author-device', role: 'Jefe de restaurante', name: 'Autora offline' });
await prisma.session.create({ data: { id: id(), userId: authorId, deviceId: 'author-device', tokenHash: hashToken(authorToken), expiresAt: new Date(verifyAccessToken(authorToken).exp * 1000) } });
const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const jwk = pair.publicKey.export({ format: 'jwk' });
const authorHeaders = { Authorization: 'Bearer ' + authorToken, 'Content-Type': 'application/json' };
const adminHeaders = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const keyId = id();
const signEnvelope = (envelope: Record<string, unknown>) => {
  const document = JSON.stringify(envelope);
  return { document, signature: sign('sha256', Buffer.from(document), { key: pair.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url') };
};
const signed = (clientOpId: string, body: Record<string, unknown>, overrides: Record<string, unknown> = {}) => signEnvelope({
  version: 2, keyId, authorId, deviceId: 'author-device', companyId,
  action: 'cash.manual', method: 'POST', path: '/transactions', clientOpId,
  body, params: {}, query: {}, ...overrides,
});
const cashBody = (clientOpId: string, amount: number, description: string) => ({ companyId, type: 'Ingreso Extra', description, amount, isIncome: true, clientOpId });
try {
  await Promise.all(connections.map((entry) => entry.ready));
  for (const socket of sockets) socket.emit('join-company', { companyId });
  const deadline = Date.now() + 3000;
  while ((await realtime.in('company:' + companyId).fetchSockets()).length < 2 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal((await realtime.in('company:' + companyId).fetchSockets()).length, 2);
  await check('HTTP con SQL real rechaza cruces de empresa sin modificar recursos', async () => {
    const userId = id();
    await prisma.user.create({ data: { id: userId, name: 'Jefe limitado', role: 'Jefe de restaurante', terminal: 'Pruebas', companyId, assignedCompanyId: companyId, pinHash: bcrypt.hashSync('2468', 4) } });
    const limitedToken = signAccessToken({ sub: userId, deviceId: 'test-device', role: 'Jefe de restaurante', name: 'Jefe limitado' });
    await prisma.session.create({ data: { id: id(), userId, deviceId: 'test-device', tokenHash: hashToken(limitedToken), expiresAt: new Date(verifyAccessToken(limitedToken).exp * 1000) } });
    const otherTable = await prisma.table.create({ data: { id: id(), companyId: 'otra-empresa', number: 'X', capacity: 4, zone: 'Salón Principal' } });
    const otherProduct = await prisma.product.create({ data: { id: id(), companyId: 'otra-empresa', name: 'Ajeno HTTP', description: '', image: '', category: 'bebidas', price: 5, available: true } });
    const otherOrder = await orders.openOrderForTable(otherTable.id, { clientOpId: id() });
    const withForeignItem = await orders.addItemToOrder(otherOrder.id, { productId: otherProduct.id });
    const headers = { Authorization: 'Bearer ' + limitedToken, 'Content-Type': 'application/json' };
    const cases = [
      ['GET', `/api/operations/orders/${otherOrder.id}`, undefined],
      ['POST', '/api/operations/orders/open', { tableId: otherTable.id, clientOpId: id() }],
      ['POST', `/api/operations/orders/${otherOrder.id}/items`, { productId: otherProduct.id, quantity: 1 }],
      ['PATCH', `/api/operations/orders/${otherOrder.id}/items/${withForeignItem.items[0].id}/quantity`, { delta: 1, clientOpId: id() }],
      ['POST', `/api/operations/orders/${otherOrder.id}/send-to-kitchen`, { clientOpId: id() }],
      ['POST', `/api/operations/tables/${otherTable.id}/por-cobrar`, {}],
      ['PATCH', `/api/catalogs/products/${otherProduct.id}`, { name: 'No autorizado' }],
      ['GET', '/api/catalogs/products?companyId=otra-empresa', undefined],
      ['POST', '/api/operations/transactions', { companyId: 'otra-empresa', type: 'Ingreso Extra', description: 'Prueba', amount: 1, isIncome: true, clientOpId: id() }],
      ['POST', '/api/operations/purchases', { companyId: 'otra-empresa', documentStatus: 'provisional', invoiceNumber: 'VALE-X', supplierName: 'Proveedor', supplierRuc: '20111111111', total: 5, items: [], clientOpId: id() }],
      ['POST', '/api/operations/kardex/adjustments', { companyId: 'otra-empresa', insumoId: id(), quantity: 1, type: 'AJUSTE_MERMA', reason: 'Prueba', clientOpId: id() }],
      ['POST', '/api/catalogs/products', { companyId: 'otra-empresa', name: 'No permitido', category: 'bebidas', price: 5 }],
    ] as const;
    for (const [method, route, body] of cases) {
      const response = await fetch(url + route, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
      assert.equal(response.status, 403, `${method} ${route}`);
    }
    assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: otherProduct.id } })).name, 'Ajeno HTTP');
    assert.equal(Number((await prisma.orderItem.findUniqueOrThrow({ where: { id: withForeignItem.items[0].id } })).quantity), 1);
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: otherOrder.id } })).status, 'abierto');
    await orders.removeItemFromOrder(otherOrder.id, withForeignItem.items[0].id);
    const openingId = id();
    const opened = await fetch(url + '/api/operations/orders/open', { method: 'POST', headers, body: JSON.stringify({ tableId: 'test-table', waiter: 'Nombre falsificado', clientOpId: openingId }) });
    assert.equal(opened.status, 201);
    const result = await opened.json();
    assert.equal(result.waiter, 'Jefe limitado');
    const audit = await prisma.operationAudit.findMany({ where: { entityId: result.id, action: 'abrir_pedido' } });
    assert.equal(audit.length, 1);
    assert.deepEqual([audit[0].actorUserId, audit[0].deviceId, audit[0].companyId], [userId, 'test-device', companyId]);
    const retry = await fetch(url + '/api/operations/orders/open', { method: 'POST', headers, body: JSON.stringify({ tableId: 'test-table', waiter: 'Nombre falsificado', clientOpId: openingId }) });
    assert.equal(retry.status, 201);
    assert.equal(await prisma.operationAudit.count({ where: { entityId: result.id, action: 'abrir_pedido' } }), 1);
    const itemResponse = await fetch(`${url}/api/operations/orders/${result.id}/items`, { method: 'POST', headers, body: JSON.stringify({ productId: product.id, quantity: 1 }) });
    assert.equal(itemResponse.status, 201);
    const dispatch = await fetch(`${url}/api/operations/orders/${result.id}/send-to-kitchen`, { method: 'POST', headers, body: JSON.stringify({ clientOpId: id() }) });
    assert.equal(dispatch.status, 200);
    const paymentId = id();
    const paymentBody = { paymentMethod: 'Efectivo', amountReceived: 5, clientOpId: paymentId };
    const payment = await fetch(url + '/api/operations/tables/test-table/pay', { method: 'POST', headers, body: JSON.stringify(paymentBody) });
    assert.equal(payment.status, 200);
    const paymentResult = await payment.json();
    const paymentRetry = await fetch(url + '/api/operations/tables/test-table/pay', { method: 'POST', headers, body: JSON.stringify(paymentBody) });
    assert.equal(paymentRetry.status, 200);
    for (const [action, entityId] of [['agregar_item', result.id], ['enviar_cocina', result.id], ['cobrar_mesa', paymentResult.transaction.id]]) {
      const row = await prisma.operationAudit.findMany({ where: { action, entityId, actorUserId: userId, deviceId: 'test-device', companyId } });
      assert.equal(row.length, 1, action);
    }
    const createProductId = id();
    const catalogResponse = await fetch(url + '/api/catalogs/products', { method: 'POST', headers, body: JSON.stringify({ id: createProductId, companyId, name: 'Producto HTTP', category: 'bebidas', price: 5 }) });
    assert.equal(catalogResponse.status, 201);
    assert.equal(await prisma.operationAudit.count({ where: { action: 'crear_producto', entityId: createProductId, actorUserId: userId, deviceId: 'test-device', companyId } }), 1);
    const supplyId = id();
    await prisma.insumo.create({ data: { id: supplyId, companyId, code: id().slice(0, 15), name: 'Insumo HTTP', category: 'Abarrotes & Especias', unit: 'kg', currentStock: 3, minStock: 0, costPerUnit: 1 } });
    const movementId = id();
    const adjustment = { insumoId: supplyId, companyId, quantity: 1, type: 'AJUSTE_MERMA', reason: 'Prueba', clientOpId: movementId };
    const stockResponse = await fetch(url + '/api/operations/kardex/adjustments', { method: 'POST', headers, body: JSON.stringify(adjustment) });
    assert.equal(stockResponse.status, 201);
    const stockResult = await stockResponse.json();
    assert.equal(await prisma.operationAudit.count({ where: { action: 'ajustar_kardex', entityId: stockResult.movement.id, actorUserId: userId, deviceId: 'test-device', companyId } }), 1);
    const purchaseId = id();
    const purchaseBody = { companyId, documentStatus: 'provisional', invoiceNumber: 'VALE-HTTP', supplierName: 'Proveedor', supplierRuc: '20111111111', total: 5, items: [], clientOpId: purchaseId };
    const purchaseResponse = await fetch(url + '/api/operations/purchases', { method: 'POST', headers, body: JSON.stringify(purchaseBody) });
    assert.equal(purchaseResponse.status, 201);
    const purchaseResult = await purchaseResponse.json();
    assert.equal(await prisma.operationAudit.count({ where: { action: 'crear_compra', entityId: purchaseResult.id, actorUserId: userId, deviceId: 'test-device', companyId } }), 1);
    const cashId = id();
    const cashResponse = await fetch(url + '/api/operations/transactions', { method: 'POST', headers, body: JSON.stringify({ companyId, type: 'Ingreso Extra', description: 'Prueba HTTP', amount: 1, isIncome: true, clientOpId: cashId }) });
    assert.equal(cashResponse.status, 201);
    const cashResult = await cashResponse.json();
    assert.equal(await prisma.operationAudit.count({ where: { action: 'crear_movimiento_caja', entityId: cashResult.id, actorUserId: userId, deviceId: 'test-device', companyId } }), 1);
  });
  await check('HTTP con SQL real firma el replay y audita la asunción administrativa', async () => {
    // El cliente propone el identificador y lo registra desde su sesión; el
    // servidor lo liga al usuario y a la terminal autenticados.
    const keyBody = { id: keyId, kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
    const registered = await fetch(url + '/api/sync/signing-keys', { method: 'POST', headers: authorHeaders, body: JSON.stringify(keyBody) });
    assert.equal(registered.status, 201);
    assert.deepEqual(await registered.json(), { id: keyId });
    const keyRow = await prisma.offlineSigningKey.findUniqueOrThrow({ where: { id: keyId } });
    assert.deepEqual([keyRow.userId, keyRow.deviceId, keyRow.fingerprint], [authorId, 'author-device', createHash('sha256').update(keyRow.publicKey).digest('hex')]);
    const again = await fetch(url + '/api/sync/signing-keys', { method: 'POST', headers: authorHeaders, body: JSON.stringify(keyBody) });
    assert.equal(again.status, 200);
    assert.deepEqual(await again.json(), { id: keyId });
    const stolen = await fetch(url + '/api/sync/signing-keys', { method: 'POST', headers: adminHeaders, body: JSON.stringify(keyBody) });
    assert.equal(stolen.status, 409);
    assert.equal((await stolen.json()).error.code, 'SIGNING_KEY_UNAVAILABLE');

    // Replay normal: la prueba se conserva junto a la escritura y queda ligada a su clientOpId.
    const ownId = id();
    const ownCash = cashBody(ownId, 7, 'Replay firmado');
    const ownProof = signed(ownId, ownCash);
    const ownBody = { ...ownCash, __proof: ownProof };
    const ownResponse = await fetch(url + '/api/operations/transactions', { method: 'POST', headers: { ...authorHeaders, 'x-offline-replay': '1' }, body: JSON.stringify(ownBody) });
    assert.equal(ownResponse.status, 201);
    const ownTransaction = await ownResponse.json();
    const ownAudit = await prisma.operationAudit.findMany({ where: { entityId: ownTransaction.id, action: 'crear_movimiento_caja' } });
    assert.equal(ownAudit.length, 1);
    assert.deepEqual(
      [ownAudit[0].actorUserId, ownAudit[0].deviceId, ownAudit[0].clientOpId, ownAudit[0].proofDocument, ownAudit[0].proofSignature],
      [authorId, 'author-device', ownId, ownProof.document, ownProof.signature],
    );
    // La auditoría conserva la acción lógica que la firma autorizó.
    assert.equal(ownAudit[0].offlineAction, 'cash.manual');
    assert.equal(await prisma.offlineAssumptionAudit.count({ where: { clientOpId: ownId } }), 0);

    // Un replay sin prueba no se ejecuta ni escribe: la cola no puede saltarse la autoría.
    const unsignedId = id();
    const unsigned = await fetch(url + '/api/operations/transactions', {
      method: 'POST', headers: { ...authorHeaders, 'x-offline-replay': '1' },
      body: JSON.stringify({ companyId, type: 'Ingreso Extra', description: 'Sin firma', amount: 9, isIncome: true, clientOpId: unsignedId }),
    });
    assert.equal(unsigned.status, 403);
    assert.equal((await unsigned.json()).error.code, 'OFFLINE_PROOF_REQUIRED');
    assert.equal(await prisma.transaction.count({ where: { clientOpId: unsignedId } }), 0);

    // Una firma ajena sin asunción explícita se rechaza.
    const foreignId = id();
    const foreignCash = cashBody(foreignId, 11, 'Firma ajena');
    const foreignProof = signed(foreignId, foreignCash);
    const foreignBody = { ...foreignCash, __proof: foreignProof };
    const noAssume = await fetch(url + '/api/operations/transactions', { method: 'POST', headers: { ...adminHeaders, 'x-offline-replay': '1' }, body: JSON.stringify(foreignBody) });
    assert.equal(noAssume.status, 403);
    assert.equal((await noAssume.json()).error.code, 'OFFLINE_PROOF_SESSION_MISMATCH');
    assert.equal(await prisma.transaction.count({ where: { clientOpId: foreignId } }), 0);

    // Un administrador no global no puede asumir operaciones de otra terminal.
    const scopedId = id();
    await prisma.user.create({ data: { id: scopedId, name: 'Admin limitado asunción', role: 'Administrador', terminal: 'Pruebas', companyId, assignedCompanyId: companyId, pinHash: bcrypt.hashSync('8642', 4) } });
    const scopedToken = signAccessToken({ sub: scopedId, deviceId: 'test-device', role: 'Administrador', name: 'Admin limitado asunción' });
    await prisma.session.create({ data: { id: id(), userId: scopedId, deviceId: 'test-device', tokenHash: hashToken(scopedToken), expiresAt: new Date(verifyAccessToken(scopedToken).exp * 1000) } });
    const scopedAssume = await fetch(url + '/api/operations/transactions', {
      method: 'POST', headers: { Authorization: 'Bearer ' + scopedToken, 'Content-Type': 'application/json', 'x-offline-replay': '1', 'x-offline-assume': '1' }, body: JSON.stringify(foreignBody),
    });
    assert.equal(scopedAssume.status, 403);
    assert.equal((await scopedAssume.json()).error.code, 'OFFLINE_PROOF_SESSION_MISMATCH');
    assert.equal(await prisma.transaction.count({ where: { clientOpId: foreignId } }), 0);

    // El administrador global asume la firma: la escritura queda a su nombre, la
    // prueba original se conserva y la asunción se audita una sola vez.
    const assumedCash = cashBody(foreignId, 13, 'Firma ajena');
    const assumedBody = { ...assumedCash, __proof: signed(foreignId, assumedCash) };
    // El autor perdió acceso a la empresa después de crear el pendiente.
    await prisma.user.update({ where: { id: authorId }, data: { companyId: 'otra-empresa', assignedCompanyId: 'otra-empresa' } });
    const revokedReplay = await fetch(url + '/api/operations/transactions', { method: 'POST', headers: { ...authorHeaders, 'x-offline-replay': '1' }, body: JSON.stringify(assumedBody) });
    assert.equal(revokedReplay.status, 403);
    assert.equal(await prisma.transaction.count({ where: { clientOpId: foreignId } }), 0);
    await prisma.user.update({ where: { id: authorId }, data: { isDeleted: true, isActive: false } });
    const assumeHeaders = { ...adminHeaders, 'x-offline-replay': '1', 'x-offline-assume': '1' };
    const assumed = await fetch(url + '/api/operations/transactions', { method: 'POST', headers: assumeHeaders, body: JSON.stringify(assumedBody) });
    assert.equal(assumed.status, 201);
    const assumedTransaction = await assumed.json();
    const assumedAudit = await prisma.operationAudit.findMany({ where: { entityId: assumedTransaction.id, action: 'crear_movimiento_caja' } });
    assert.equal(assumedAudit.length, 1);
    assert.deepEqual(
      [assumedAudit[0].actorUserId, assumedAudit[0].deviceId, assumedAudit[0].clientOpId, assumedAudit[0].proofDocument, assumedAudit[0].proofSignature],
      ['test-user', 'test-device', foreignId, assumedBody.__proof.document, assumedBody.__proof.signature],
    );
    assert.equal(assumedAudit[0].offlineAction, 'cash.manual');
    const assumption = await prisma.offlineAssumptionAudit.findUniqueOrThrow({ where: { clientOpId: foreignId } });
    assert.deepEqual(
      [assumption.authorUserId, assumption.assumedByUserId, assumption.deviceId, assumption.companyId],
      [authorId, 'test-user', 'test-device', companyId],
    );
    assert.equal(assumption.documentFingerprint, createHash('sha256').update(assumedBody.__proof.document).digest('hex'));
    assert.equal(await prisma.offlineAssumptionAudit.count({ where: { clientOpId: foreignId } }), 1);
    // La repetición del mismo replay no duplica la asunción ni la auditoría.
    const assumedRetry = await fetch(url + '/api/operations/transactions', { method: 'POST', headers: assumeHeaders, body: JSON.stringify(assumedBody) });
    assert.equal(assumedRetry.status, 201);
    assert.equal(await prisma.offlineAssumptionAudit.count({ where: { clientOpId: foreignId } }), 1);
    assert.equal(await prisma.operationAudit.count({ where: { entityId: assumedTransaction.id, action: 'crear_movimiento_caja' } }), 1);
    await prisma.user.update({ where: { id: authorId }, data: { companyId: null, assignedCompanyId: null, isDeleted: false, isActive: true } });
  });
  await check('la prueba queda atada a la acción, la ruta y el contenido que se ejecuta', async () => {
    const table = await prisma.table.create({ data: { id: id(), companyId, number: 'F1', capacity: 4, zone: 'Salón Principal' } });
    const replayHeaders = { ...authorHeaders, 'x-offline-replay': '1' };

    // Una prueba válida de caja no habilita una escritura de otra acción.
    const switchId = id();
    const switchCash = cashBody(switchId, 5, 'Cambio de turno');
    const switchProof = signed(switchId, switchCash, {
      action: 'cash.switchShift', method: 'POST', path: '/shifts/switch',
      body: { companyId, targetShift: 'Noche', reportedCash: 5, initialCashForNext: 0, clientOpId: switchId },
    });
    const wrongAction = await fetch(url + '/api/operations/transactions', {
      method: 'POST', headers: replayHeaders, body: JSON.stringify({ ...switchCash, __proof: switchProof }),
    });
    assert.equal(wrongAction.status, 403);
    assert.equal((await wrongAction.json()).error.code, 'OFFLINE_PROOF_ACTION_MISMATCH');
    assert.equal(await prisma.transaction.count({ where: { clientOpId: switchId } }), 0);

    // La misma prueba en su propia ruta sí se aplica.
    const switchBody = { companyId, targetShift: 'Noche', reportedCash: 5, initialCashForNext: 0, clientOpId: switchId };
    const switchOk = await fetch(url + '/api/operations/shifts/switch', {
      method: 'POST', headers: replayHeaders, body: JSON.stringify({ ...switchBody, __proof: switchProof }),
    });
    assert.equal(switchOk.status, 200);

    // Un contenido distinto del firmado no se ejecuta.
    const alteredId = id();
    const alteredCash = cashBody(alteredId, 7, 'Importe firmado');
    const alteredProof = signed(alteredId, alteredCash);
    const altered = await fetch(url + '/api/operations/transactions', {
      method: 'POST', headers: replayHeaders, body: JSON.stringify({ ...alteredCash, amount: 999, __proof: alteredProof }),
    });
    assert.equal(altered.status, 403);
    assert.equal((await altered.json()).error.code, 'OFFLINE_PROOF_MISMATCH');
    assert.equal(await prisma.transaction.count({ where: { clientOpId: alteredId } }), 0);

    // Un replay hacia una ruta de lectura tampoco se acepta: no hay cuerpo
    // donde viaje la prueba, así que el servidor exige la prueba y la rechaza.
    const readReplay = await fetch(url + '/api/operations/orders/active', {
      method: 'GET', headers: replayHeaders,
    });
    assert.equal(readReplay.status, 403);
    assert.equal((await readReplay.json()).error.code, 'OFFLINE_PROOF_REQUIRED');

    // La apertura firmada y el vaciado de sus ítems viajan con pruebas propias.
    const openId = id();
    const openProof = signEnvelope({
      version: 2, keyId, authorId, deviceId: 'author-device', companyId,
      action: 'orders.open', method: 'POST', path: '/orders/open', clientOpId: openId,
      body: { tableId: table.id, waiter: 'Autora offline', clientOpId: openId }, params: {}, query: {},
    });
    const opened = await fetch(url + '/api/operations/orders/open', {
      method: 'POST', headers: replayHeaders, body: JSON.stringify({ tableId: table.id, waiter: 'Autora offline', clientOpId: openId, __proof: openProof }),
    });
    assert.equal(opened.status, 201);
    const order = await opened.json();
    const openAudit = await prisma.operationAudit.findFirstOrThrow({ where: { entityId: order.id, action: 'abrir_pedido' } });
    assert.equal(openAudit.offlineAction, 'orders.open');

    // Se pierde la respuesta antes de procesar los ítems: tras reiniciar el
    // cliente reenvía exactamente la misma apertura y recupera el mismo id.
    const retriedOpening = await fetch(url + '/api/operations/orders/open', {
      method: 'POST', headers: replayHeaders, body: JSON.stringify({ tableId: table.id, waiter: 'Autora offline', clientOpId: openId, __proof: openProof }),
    });
    assert.equal(retriedOpening.status, 201);
    assert.equal((await retriedOpening.json()).id, order.id);
    assert.equal(await prisma.order.count({ where: { clientOpId: openId } }), 1);
    assert.equal(await prisma.operationAudit.count({ where: { entityId: order.id, action: 'abrir_pedido' } }), 1);

    const items = [{ productId: product.id, quantity: 1 }];
    const itemsProof = signEnvelope({
      version: 2, keyId, authorId, deviceId: 'author-device', companyId,
      action: 'orders.openingItems', method: 'POST', path: '/orders/opening-items', clientOpId: openId,
      body: { openingClientOpId: openId, items }, params: {}, query: {},
    });
    const mismatched = await fetch(url + '/api/operations/orders/opening-items', {
      method: 'POST', headers: replayHeaders, body: JSON.stringify({ openingClientOpId: openId, items: [{ productId: product.id, quantity: 5 }], __proof: itemsProof }),
    });
    assert.equal(mismatched.status, 403);
    assert.equal((await mismatched.json()).error.code, 'OFFLINE_PROOF_MISMATCH');
    assert.equal(await prisma.orderItem.count({ where: { orderId: order.id } }), 0);
    const synced = await fetch(url + '/api/operations/orders/opening-items', {
      method: 'POST', headers: replayHeaders, body: JSON.stringify({ openingClientOpId: openId, items, __proof: itemsProof }),
    });
    assert.equal(synced.status, 200);
    assert.equal(await prisma.orderItem.count({ where: { orderId: order.id } }), 1);

    // Una referencia temporal firmada se resuelve contra la apertura que la originó.
    const addId = id();
    const addProof = signEnvelope({
      version: 2, keyId, authorId, deviceId: 'author-device', companyId,
      action: 'orders.addItem', method: 'POST', path: '/orders/:id/items', clientOpId: addId,
      body: { productId: product.id, quantity: 1 }, params: { id: { orderRef: { openingClientOpId: openId } } }, query: {},
    });
    const added = await fetch(`${url}/api/operations/orders/${order.id}/items`, {
      method: 'POST', headers: replayHeaders, body: JSON.stringify({ productId: product.id, quantity: 1, __proof: addProof }),
    });
    const addedBody = await added.json();
    assert.equal(added.status, 201, JSON.stringify(addedBody));

    // Un marcador que no corresponde a ninguna apertura no se puede resolver.
    const orphanProof = signEnvelope({
      version: 2, keyId, authorId, deviceId: 'author-device', companyId,
      action: 'orders.addItem', method: 'POST', path: '/orders/:id/items', clientOpId: id(),
      body: { productId: product.id, quantity: 1 }, params: { id: { orderRef: { openingClientOpId: id() } } }, query: {},
    });
    const orphan = await fetch(`${url}/api/operations/orders/${order.id}/items`, {
      method: 'POST', headers: replayHeaders, body: JSON.stringify({ productId: product.id, quantity: 1, __proof: orphanProof }),
    });
    assert.equal(orphan.status, 403);
    assert.equal((await orphan.json()).error.code, 'OFFLINE_PROOF_REF_UNRESOLVED');
  });
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
  await check('caja por turno preserva acumulados y reintenta el cierre sin repetirlo', async () => {
    const shifts = await import('../src/services/shift.service.js');
    const cid = id();
    await prisma.company.create({data:{id:cid,name:'Turnos',tradeName:'Turnos',ruc:'20999999999',specialty:'',themeColor:'',accentColor:'',badgeText:'',address:''}});
    await prisma.companyShift.create({data:{companyId:cid,currentShift:'Día',openedAt:'Prueba',openedBy:'Prueba',initialCash:100,openedUtc:new Date(0)}});
    await shifts.createManualTransaction({companyId:cid,type:'Ingreso Extra',description:'Inicial',amount:30,isIncome:true});
    const request={companyId:cid,targetShift:'Noche',reportedCash:130,initialCashForNext:40,clientOpId:id()};
    const first=await shifts.switchCompanyShift(request);
    assert.equal(first.systemCashExpected,130);
    assert.equal((await shifts.listTransactions(cid,false,true)).length,0);
    assert.equal((await shifts.listTransactions(cid,false)).length,1);
    await shifts.createManualTransaction({companyId:cid,type:'Ingreso Extra',description:'Nuevo turno',amount:12,isIncome:true});
    assert.equal((await shifts.listTransactions(cid,false,true)).length,1);
    assert.equal((await shifts.listTransactions(cid,false)).length,2);
    await shifts.switchCompanyShift(request);
    assert.equal((await shifts.listShiftRecords(cid)).length,1);
    assert.equal((await shifts.currentShiftForCompany(cid))?.initialCash,40);
    assert.equal((await shifts.listTransactions(cid,false,true)).length,1);
  });
  await check('resumen por medio supera 1000 abonos, excluye ajustes y respeta el turno', async () => {
    const {paymentSummary}=await import('../src/services/payment-summary.service.js');
    const cid=id();
    await prisma.company.create({data:{id:cid,name:'Resumen',tradeName:'Resumen',ruc:'20888888888',specialty:'',themeColor:'',accentColor:'',badgeText:'',address:''}});
    const method=await prisma.customPaymentMethod.create({data:{id:id(),companyId:cid,name:'Yape BCP',category:'Billetera Digital',icon:'payments'}});
    const zero=await prisma.customPaymentMethod.create({data:{id:id(),companyId:cid,name:'POS Niubiz',category:'Tarjeta',icon:'credit_card'}});
    const cash=await prisma.customPaymentMethod.create({data:{id:id(),companyId:cid,name:'Caja',category:'Efectivo',icon:'payments'}});
    for(let batch=0;batch<11;batch++) await prisma.transaction.createMany({data:Array.from({length:batch===10?1:100},()=>({id:id(),clientOpId:id(),companyId:cid,time:'10:00',date:'Hoy',timestamp:new Date(1000),type:'Venta (Mesa)',description:'Abono',amount:1,isIncome:true,customPaymentMethodId:method.id,paymentMethod:method.name,shift:'Día'}))});
    await prisma.transaction.createMany({data:[{id:id(),clientOpId:id(),companyId:cid,time:'10:00',date:'Hoy',timestamp:new Date(1000),type:'Reclasificación de Pago',description:'Ajuste',amount:500,isIncome:true,customPaymentMethodId:method.id},{id:id(),clientOpId:id(),companyId:cid,time:'10:00',date:'Hoy',timestamp:new Date(1000),type:'Venta (Mesa)',description:'Efectivo',amount:50,isIncome:true,customPaymentMethodId:cash.id}]});
    const twin=await prisma.customPaymentMethod.create({data:{id:id(),companyId:cid,name:method.name,category:'Billetera Digital',icon:'payments'}});
    await prisma.transaction.create({data:{id:id(),clientOpId:id(),companyId:cid,time:'10:00',date:'Hoy',timestamp:new Date(1000),type:'Venta (Mesa)',description:'Homónimo',amount:7,isIncome:true,customPaymentMethodId:twin.id}});
    const summary=await paymentSummary(cid,false);
    assert.equal(summary.rows.filter(r=>r.name===method.name).length,2);
    assert.equal(summary.rows.find(r=>r.id===twin.id)?.amount,7);
    assert.equal(summary.rows.find(r=>r.id===method.id)?.amount,1001);
    assert.equal(summary.rows.find(r=>r.id===zero.id)?.amount,0);
    assert.ok(!summary.rows.some(r=>r.id===cash.id));
    await prisma.companyShift.create({data:{companyId:cid,currentShift:'Noche',openedAt:'Hoy',openedBy:'Prueba',initialCash:20}});
    assert.equal((await paymentSummary(cid,true)).rows.find(r=>r.id===method.id)?.amount,0);
    await prisma.customPaymentMethod.update({where:{id:method.id},data:{isActive:false}});
    assert.equal((await paymentSummary(cid,false)).rows.find(r=>r.id===method.id)?.historical,true);
    assert.ok(!(await paymentSummary(cid,true)).rows.some(r=>r.id===method.id));
  });
  console.log(passed + ' escenarios de pedidos SQL/API/realtime aprobados.');
  if (process.argv.includes('--roles')) {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/test-browser-roles.mjs'], {
        cwd: path.resolve('..'), env: { ...process.env, BROWSER_TEST_URL: url }, stdio: 'inherit',
      });
      child.once('error', reject);
      child.once('exit', code => code === 0 ? resolve() : reject(new Error('Role integration failed: ' + code)));
    });
  }
  if (process.argv.includes('--browser-recovery')) {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, ['scripts/test-browser-recovery.mjs'], {
        cwd: path.resolve('..'), env: { ...process.env, BROWSER_TEST_URL: url }, stdio: 'inherit',
      });
      child.once('error', reject);
      child.once('exit', code => code === 0 ? resolve() : reject(new Error('Browser recovery failed: ' + code)));
    });
  }
  if (process.argv.includes('--browser')) {
    console.log('Navegador aislado: ' + url + ' · PIN 9876 · escriba fin y Enter para cerrar.');
    await new Promise<void>((resolve) => { process.stdin.resume(); process.stdin.once('data', () => { process.stdin.pause(); resolve(); }); });
  }
} finally { sockets.forEach((socket) => socket.disconnect()); await new Promise<void>((resolve) => realtime.close(() => resolve())); if (http.listening) await new Promise<void>((resolve) => http.close(() => resolve())); }
} finally { await prisma.$disconnect(); }
