import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { prisma } from '../src/lib/prisma.js';
import { createTaytaPhysicalTable } from '../src/services/master.service.js';
import { createApp } from '../src/app.js';
import { signAccessToken, hashToken } from '../src/lib/auth.js';
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
  const zones = ['Primer Piso', 'Mezanine', 'Jardín', 'Terraza'] as const;
  const created = await Promise.all(zones.map((zone) => createTaytaPhysicalTable({ zone, capacity: 4 })));
  assert.deepEqual(created.map((table) => table.number), ['P01', 'M01', 'J01', 'T01']);
  const concurrent = await Promise.all(Array.from({ length: 2 }, () => createTaytaPhysicalTable({ zone: 'Jardín', capacity: 6 })));
  assert.deepEqual(concurrent.map((table) => table.number).sort(), ['J02', 'J03']);
  await prisma.table.update({ where: { id: concurrent[1].id }, data: { isDeleted: true } });
  assert.equal((await createTaytaPhysicalTable({ zone: 'Jardín', capacity: 4 })).number, 'J04');
  assert.equal(layout('--apply', '--backup-verified', '--terminals-synced'), 0);
  assert.equal(JSON.parse(await readFile(report, 'utf8')).before.status, 'already_configured');
  assert.equal(await prisma.table.count({ where: { companyId: 'el-tayta', isDeleted: false } }), 49);
  const coreTable = fixed.find((table) => table.number === '01')!;
  await prisma.table.update({ where: { id: coreTable.id }, data: { isDeleted: true } });
  assert.equal(layout(), 0);
  assert.equal(JSON.parse(await readFile(report, 'utf8')).before.status, 'blocked');
  assert.notEqual(layout('--apply', '--backup-verified', '--terminals-synced'), 0);
  await prisma.table.update({ where: { id: coreTable.id }, data: { isDeleted: false } });
  const adminId = id(); const waiterId = id(); const deviceId = id();
  await prisma.user.createMany({ data: [
    { id: adminId, companyId: 'el-tayta', name: 'Admin', pinHash: 'test', role: 'Administrador', terminal: 'Test' },
    { id: waiterId, companyId: 'el-tayta', name: 'Mozo', pinHash: 'test', role: 'Mesero', terminal: 'Test' },
  ] });
  await prisma.device.create({ data: { id: deviceId, companyId: 'el-tayta', name: 'Test', terminalCode: 'TEST-TABLE' } });
  const server = createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    const url = `http://127.0.0.1:${address.port}/api/catalogs/tables/physical`;
    async function post(userId: string, role: string, path = url) {
      const token = signAccessToken({ sub: userId, deviceId, role, name: role });
      await prisma.session.create({ data: { id: id(), userId, deviceId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60_000) } });
      return fetch(path, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ companyId: 'el-tayta', zone: 'Terraza', capacity: 4, number: '99' }) });
    }
    assert.equal((await post(waiterId, 'Mesero')).status, 403);
    assert.equal((await post(waiterId, 'Mesero', url.replace('/tables/physical', '/tables'))).status, 400);
    const response = await post(adminId, 'Administrador');
    assert.equal(response.status, 201);
    assert.equal((await response.json()).number, 'T02');
    const secondToken = signAccessToken({ sub: waiterId, deviceId, role: 'Mesero', name: 'Mozo' });
    await prisma.session.create({ data: { id: id(), userId: waiterId, deviceId, tokenHash: hashToken(secondToken), expiresAt: new Date(Date.now() + 60_000) } });
    const visible = await fetch(url.replace('/tables/physical', '/tables'), { headers: { authorization: `Bearer ${secondToken}` } });
    assert.equal(visible.status, 200);
    assert.ok((await visible.json() as Array<{ number: string; zone: string }>).some((table) => table.number === 'T02' && table.zone === 'Terraza'));
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
  assert.equal((await prisma.numberingSequence.findUniqueOrThrow({ where: { companyId_entity: { companyId: 'el-tayta', entity: 'service-table' } } })).lastNumber, 35);
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
