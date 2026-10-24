import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const database = process.env.PURCHASE_TEST_DATABASE;
assert.match(database ?? '', /^tayta_provisional_test_[a-f0-9]{32}$/);
assert.ok(process.env.DATABASE_URL?.includes(';database=' + database));
const { prisma } = await import('../src/lib/prisma.js');
const { createPurchase, regularizePurchase } = await import('../src/services/purchase.service.js');
const { createInsumo } = await import('../src/services/insumo.service.js');
const companyId = 'el-tayta';
const id = () => randomUUID();
const number = (value: unknown) => Number(value);
try {
  await prisma.company.create({ data: { id: companyId, name: 'El Tayta', tradeName: 'El Tayta', ruc: '20111111111',
    specialty: 'Prueba', themeColor: '#ffffff', accentColor: '#000000', badgeText: 'Tayta', address: 'Lima' } });
  await prisma.companyShift.create({ data: { companyId, currentShift: 'Día', openedAt: 'Hoy', openedUtc: new Date(),
    openedBy: 'Prueba', initialCash: 100 } });
  const bank = await prisma.bankAccount.create({ data: { id: id(), companyId, bankName: 'BCP', accountNumber: '123',
    accountType: 'Ahorros', currency: 'PEN', holderName: 'El Tayta', alias: 'BCP', currentBalance: 100 } });
  const insumo = await createInsumo({ id: id(), companyId, name: 'Arroz de prueba', category: 'Abarrotes & Especias',
    unit: 'kg', currentStock: 0, minStock: 0, costPerUnit: 2 });
  const base = { companyId, documentStatus: 'provisional', invoiceNumber: 'PENDIENTE FACTURA',
    supplierName: 'Proveedor', supplierRuc: 'PENDIENTE', total: 11.8, subtotal: 10, igv: 1.8, items: [] };
  const cash = await createPurchase({ ...base, provisionalNoteNumber: 'VALE-CAJA', paidFromCash: true, clientOpId: id() });
  const bankVale = await createPurchase({ ...base, provisionalNoteNumber: 'VALE-BANCO', paidFromCash: false,
    bankAccountId: bank.id, bankAccountAlias: bank.alias, clientOpId: id() });
  const credit = await createPurchase({ ...base, provisionalNoteNumber: 'VALE-CREDITO', paidFromCash: false,
    paymentStatus: 'Crédito 15 días', clientOpId: id() });
  assert.equal(await prisma.purchaseItem.count(), 0);
  assert.equal(await prisma.kardexMovement.count(), 0);
  assert.equal(number((await prisma.insumo.findUniqueOrThrow({ where: { id: insumo.id } })).currentStock), 0);
  assert.equal(await prisma.transaction.count({ where: { purchaseId: cash.id } }), 1);
  assert.equal(await prisma.transaction.count({ where: { purchaseId: bankVale.id } }), 1);
  assert.equal(await prisma.transaction.count({ where: { purchaseId: credit.id } }), 0);
  assert.equal(number((await prisma.bankAccount.findUniqueOrThrow({ where: { id: bank.id } })).currentBalance), 88.2);
  await assert.rejects(createPurchase({ ...base, documentStatus: 'regularizado', clientOpId: id() }), (error: any) => error.code === 'PURCHASE_ITEMS_REQUIRED');

  const item = { insumoId: insumo.id, insumoName: insumo.name, quantity: 5, unit: 'kg', unitCost: 2, totalCost: 10 };
  const regularize = { invoiceNumber: 'B001-123', supplierRuc: '20111111111', items: [item], clientOpId: id() };
  await assert.rejects(regularizePurchase(cash.id, { ...regularize, items: [{ ...item, totalCost: 9 }] }),
    (error: any) => error.code === 'PURCHASE_TOTAL_MISMATCH');
  assert.equal((await prisma.purchase.findUniqueOrThrow({ where: { id: cash.id } })).documentStatus, 'provisional');
  await prisma.insumo.update({ where: { id: insumo.id }, data: { isDeleted: true } });
  await assert.rejects(regularizePurchase(cash.id, regularize), (error: any) => error.code === 'INSUMO_DELETED');
  await prisma.insumo.update({ where: { id: insumo.id }, data: { isDeleted: false } });
  const formal = await regularizePurchase(cash.id, regularize);
  assert.equal(formal.items.length, 1);
  assert.equal(await prisma.kardexMovement.count({ where: { purchaseId: cash.id } }), 1);
  assert.equal(number((await prisma.insumo.findUniqueOrThrow({ where: { id: insumo.id } })).currentStock), 5);
  await regularizePurchase(cash.id, regularize);
  assert.equal(await prisma.kardexMovement.count({ where: { purchaseId: cash.id } }), 1);
  assert.equal(number((await prisma.insumo.findUniqueOrThrow({ where: { id: insumo.id } })).currentStock), 5);
  const withItems = await createPurchase({ ...base, provisionalNoteNumber: 'VALE-CON-INSUMOS',
    items: [item], paidFromCash: false, clientOpId: id() });
  await regularizePurchase(withItems.id, { invoiceNumber: 'F001-124', supplierRuc: '20111111111',
    items: [{ ...item, quantity: 1, totalCost: 2 }], clientOpId: id() });
  assert.equal(await prisma.purchaseItem.count({ where: { purchaseId: withItems.id } }), 1);
  assert.equal(await prisma.kardexMovement.count({ where: { purchaseId: withItems.id } }), 1);
  console.log('Vales: caja, banco, crédito, validación, atomicidad y reintento correctos.');
} finally {
  await prisma.$disconnect();
}
