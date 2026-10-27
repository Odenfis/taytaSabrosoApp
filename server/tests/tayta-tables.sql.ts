import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { prisma } from '../src/lib/prisma.js';
import { createQuickBarOrder, openOrderForTable, addItemToOrder, sendToKitchen, payTable, cancelOrderOpening } from '../src/services/order.service.js';

const database = process.env.TABLE_TEST_DATABASE;
assert.match(database ?? '', /^tayta_tables_test_[a-f0-9]{32}$/);
assert.ok(process.env.DATABASE_URL?.includes(';database=' + database));
const id = () => randomUUID();
const report = `/tmp/tayta-layout-${database}.json`;
function layout(...args: string[]) {
  const result = spawnSync(process.execPath, ['dist/scripts/configure-tayta-tables.js', `--report=${report}`, ...args], { stdio: 'inherit', env: process.env });
  return result.status;
}
try {
  await prisma.company.create({ data: { id: 'el-tayta', name: 'El Tayta', tradeName: 'El Tayta', ruc: '20111111111', specialty: 'Prueba', themeColor: '#fff', accentColor: '#fff', badgeText: 'Tayta', address: 'Prueba' } });
  const legacy = await prisma.table.create({ data: { id: id(), companyId: 'el-tayta', number: 'T1', capacity: 2, zone: 'Terraza', status: 'libre' } });
  const openingId = id();
  await openOrderForTable(legacy.id, { clientOpId: openingId });
  assert.equal(layout(), 0);
  assert.equal(JSON.parse(await readFile(report, 'utf8')).before.status, 'blocked');
  assert.notEqual(layout('--apply', '--backup-verified', '--terminals-synced'), 0);
  await cancelOrderOpening(openingId);
  assert.equal(layout(), 0);
  assert.equal(JSON.parse(await readFile(report, 'utf8')).before.status, 'ready');
  assert.notEqual(layout('--apply'), 0);
  assert.equal(await prisma.table.count({ where: { companyId: 'el-tayta', isDeleted: false } }), 1);
  assert.equal(layout('--apply', '--backup-verified', '--terminals-synced'), 0);
  assert.equal(layout('--apply', '--backup-verified', '--terminals-synced'), 0);
  const fixed = await prisma.table.findMany({ where: { companyId: 'el-tayta', isDeleted: false } });
  assert.equal(fixed.length, 43);
  for (const [zone, count] of [['Primer Piso', 5], ['Mezanine', 7], ['Jardín', 14], ['Terraza', 9], ['Barra', 8]] as const) {
    assert.equal(fixed.filter((table) => table.zone === zone).length, count);
  }
  assert.equal(fixed.find((table) => table.number === 'B08')?.capacity, 1);
  for (let n = 0; n < 8; n++) await createQuickBarOrder({ companyId: 'el-tayta', clientOpId: id() });
  await assert.rejects(createQuickBarOrder({ companyId: 'el-tayta', clientOpId: id() }), (error: any) => error.code === 'BAR_FULL');
  assert.equal((await prisma.numberingSequence.findUniqueOrThrow({ where: { companyId_entity: { companyId: 'el-tayta', entity: 'service-table' } } })).lastNumber, 35);
  const openings = await Promise.all([
    createQuickBarOrder({ companyId: 'el-tayta', zone: 'Delivery', clientOpId: id() }),
    createQuickBarOrder({ companyId: 'el-tayta', zone: 'Llevar', clientOpId: id() }),
  ]);
  assert.deepEqual(openings.map((order) => Number(order.tableNumber)).sort((a, b) => a - b), [36, 37]);
  const retry = await createQuickBarOrder({ companyId: 'el-tayta', zone: 'Delivery', clientOpId: openings[0].clientOpId });
  assert.equal(retry.id, openings[0].id);
  const product = await prisma.product.create({ data: { id: id(), companyId: 'el-tayta', name: 'Producto', description: '', image: '', category: 'platos', price: 10, available: true } });
  await addItemToOrder(openings[0].id, { productId: product.id });
  await sendToKitchen(openings[0].id);
  await payTable(openings[0].tableId!, { paymentMethod: 'Efectivo', amountReceived: 10, clientOpId: id() });
  assert.equal((await prisma.table.findUniqueOrThrow({ where: { id: openings[0].tableId! } })).isDeleted, true);
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: openings[0].id } })).tableNumber, openings[0].tableNumber);
  await cancelOrderOpening(openings[1].clientOpId);
  assert.equal((await prisma.table.findUniqueOrThrow({ where: { id: openings[1].tableId! } })).isDeleted, true);
  console.log('Mesas: catálogo, respaldo obligatorio, idempotencia, concurrencia, cobro e historial correctos.');
} finally {
  await prisma.$disconnect();
}
