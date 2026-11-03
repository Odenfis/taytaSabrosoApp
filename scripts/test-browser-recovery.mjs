import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import dotenv from 'dotenv';
import { PrismaClient } from '../server/node_modules/@prisma/client/default.js';
import bcrypt from '../server/node_modules/bcryptjs/index.js';

const database = process.env.ORDER_TEST_DATABASE;
assert.match(database ?? '', /^tayta_orders_test_[a-f0-9]{32}$/);
dotenv.config({ path: 'server/.env', quiet: true });
const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL.replace(/;database=[^;]+/i, ';database=' + database) });
const profile = await mkdtemp(path.join(tmpdir(), 'tayta-restart-'));
let context;
const launch = () => chromium.launchPersistentContext(profile, {
  executablePath: process.env.CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, viewport: { width: 1440, height: 1000 },
});
const base = process.env.BROWSER_TEST_URL || 'http://127.0.0.1:4310';
const tableId = randomUUID();
const tableLabel = 'R-' + tableId.slice(0, 6);
try {
  await prisma.user.update({ where: { id: 'test-user' }, data: { pinHash: bcrypt.hashSync('998877', 4) } });
  await prisma.table.upsert({ where: { id: tableId }, create: { id: tableId, companyId: 'el-tayta', number: tableLabel, capacity: 4, zone: 'Salón Principal' }, update: {} });
  context = await launch();
  let page = context.pages()[0];
  page.on('pageerror', error => console.log('PAGE ERROR', error.message));
  await page.goto(base);
  await page.getByPlaceholder('Ingresa tu PIN').fill('998877');
  await page.locator('#btn-login-submit').click();
  await page.getByRole('button', { name: 'Tayta', exact: true }).click();
  await page.getByText(tableLabel, { exact: true }).waitFor({timeout: 10000}).catch(async error => { console.log(await page.locator('body').innerText()); throw error; });
  await page.getByText(tableLabel, { exact: true }).click();
  await page.getByText('Plato compartido', { exact: true }).waitFor();
  // Register the nonextractable signing key before disconnecting.
  await page.waitForFunction(async () => {
    const request = indexedDB.open('ts_offline_signing_v1');
    return await new Promise(resolve => {
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('keys')) { db.close(); resolve(false); return; }
        const read = db.transaction('keys').objectStore('keys').getAll();
        read.onsuccess = () => { db.close(); resolve(read.result.some(key => key.registered)); };
      };
      request.onerror = () => resolve(false);
    });
  });
  await context.setOffline(true);
  await page.getByText('Plato compartido', { exact: true }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('ts_pending_queue_v2') || '[]')
    .some(op => op.op === 'openOrder' && op.proofs?.some(proof => proof.action === 'orders.openingItems')));
  const opening = await page.evaluate(() => JSON.parse(localStorage.getItem('ts_pending_queue_v2')).find(op => op.op === 'openOrder'));
  let itemsIntercepted;
  const interrupted = new Promise(resolve => { itemsIntercepted = resolve; });
  // Hold the dependent write: opening response is already delivered and persisted.
  await context.route('**/api/operations/orders/opening-items', async route => {
    itemsIntercepted();
    await new Promise(resolve => context.once('close', resolve));
    await route.abort().catch(() => undefined);
  });
  await context.setOffline(false);
  await Promise.race([interrupted, new Promise((_, reject) => setTimeout(() => reject(new Error('No dependent request intercepted')), 15000))]);
  const before = await prisma.order.findFirstOrThrow({ where: { clientOpId: opening.clientOpId }, include: { items: true } });
  assert.equal(before.items.length, 0);
  const resolutions = await page.evaluate(() => JSON.parse(localStorage.getItem('ts_offline_resolutions_v1') || '{}'));
  assert.equal(resolutions[opening.payload.tmpOrderId].orderId, before.id);
  assert.equal(await prisma.operationAudit.count({ where: { entityId: before.id, action: 'abrir_pedido' } }), 1);
  await page.screenshot({ path: '/tmp/tayta-restart-before.png' });
  // Close the complete Chrome process, then reopen the same persistent profile.
  // Also remove disposable cache to prove recovery does not depend on a draft.
  await page.evaluate(() => { for (const key of Object.keys(localStorage)) if (key.startsWith('ts_scoped_v1:')) localStorage.removeItem(key); });
  await context.close();
  context = await launch();
  page = context.pages()[0];
  await page.goto(base);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('ts_pending_queue_v2') || '[]').length === 0, { timeout: 15000 });
  const after = await prisma.order.findFirstOrThrow({ where: { clientOpId: opening.clientOpId }, include: { items: true } });
  assert.equal(after.id, before.id);
  assert.equal(after.items.length, 1);
  assert.equal(Number(after.items[0].quantity), 1);
  assert.equal(await prisma.order.count({ where: { clientOpId: opening.clientOpId } }), 1);
  assert.equal(await prisma.operationAudit.count({ where: { entityId: before.id, action: 'abrir_pedido' } }), 1);
  const audits = await prisma.operationAudit.findMany({ where: { entityId: before.id } });
  assert.ok(audits.some(row => row.action === 'aplicar_items_apertura' || row.offlineAction === 'orders.openingItems'));
  await page.getByRole('button', { name: 'Tayta', exact: true }).click();
  await page.getByText(tableLabel, { exact: true }).click();
  await page.getByText('Comanda Actual', { exact: true }).waitFor();
  await page.screenshot({ path: '/tmp/tayta-restart-after.png' });
  console.log('PASS: full browser process restart retained signed queue, recovered server order, applied one item and created one opening audit.');
  // Populate a unique source-session marker, then deny the new user's catalog
  // read. A failed fetch must not expose the previous user's cached tables.
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('ts_scoped_v1:') && key.endsWith(':ts_tables_v2')) {
        const rows = JSON.parse(localStorage.getItem(key));
        for (const row of rows) row.number = 'PRIVATE-CACHE-MARKER';
        localStorage.setItem(key, JSON.stringify(rows));
      }
    }
    localStorage.setItem('ts_tables_v2', JSON.stringify([{ id: 'legacy-secret', number: 'LEGACY-SECRET', companyId: 'el-tayta', status: 'libre' }]));
  });
  await prisma.user.updateMany({ where: { name: 'Autora offline' }, data: { isActive: true, isDeleted: false, companyId: 'el-tayta', assignedCompanyId: 'el-tayta' } });
  await page.locator('#btn-logout').click();
  await context.route('**/api/catalogs/tables', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await page.getByPlaceholder('Ingresa tu PIN').fill('1357');
  await page.locator('#btn-login-submit').click();
  await page.locator('#btn-logout').waitFor();
  assert.equal(await page.getByText('PRIVATE-CACHE-MARKER', { exact: true }).count(), 0);
  assert.equal(await page.getByText('LEGACY-SECRET', { exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: /Cuentas & Bancos/ }).count(), 0);
  const caches = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('ts_scoped_v1:') && key.endsWith(':ts_tables_v2')).map(key => ({ key, data: JSON.parse(localStorage.getItem(key)) })));
  assert.ok(caches.some(cache => cache.key.includes('test-user')));
  assert.ok(caches.some(cache => !cache.key.includes('test-user') && cache.data.length === 0));
  console.log('PASS: switching user with unavailable catalog does not reuse previous session or legacy cache.');


  await page.locator('#btn-logout').click();
  await page.evaluate(() => localStorage.removeItem('ts_terminal_code_v1'));
  await page.getByPlaceholder('Ingresa tu PIN').fill('998877');
  await page.locator('#btn-login-submit').click();
  await page.locator('#btn-logout').waitFor();
  const adminCaches = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('ts_scoped_v1:') && key.includes('test-user') && key.endsWith(':ts_tables_v2')).map(key => JSON.parse(localStorage.getItem(key))));
  assert.ok(adminCaches.length >= 2);
  assert.ok(adminCaches.some(rows => rows.length === 0));
  assert.equal(await page.getByText('PRIVATE-CACHE-MARKER', { exact: true }).count(), 0);
  console.log('PASS: new server terminal registration for the same user does not reuse the prior installation cache.');

  // A different user assumes the signed opening with no access to its draft.
  await page.locator('#btn-logout').click();
  await context.unroute('**/api/catalogs/tables');
  const assumedTableId = randomUUID();
  const assumedLabel = 'A-' + assumedTableId.slice(0, 6);
  await prisma.table.create({ data: { id: assumedTableId, companyId: 'el-tayta', number: assumedLabel, capacity: 4, zone: 'Salón Principal' } });
  await page.getByPlaceholder('Ingresa tu PIN').fill('1357');
  await page.locator('#btn-login-submit').click();
  await page.getByText(assumedLabel, { exact: true }).click();
  await page.getByText('Plato compartido', { exact: true }).waitFor();
  // Read the author session and wait for its registered signing key in SQL.
  const author = await prisma.user.findFirstOrThrow({ where: { name: 'Autora offline' } });
  const authorDeviceId = await page.evaluate(async () => (await (await fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + localStorage.getItem('ts_auth_token') } })).json()).deviceId);
  let registered = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await prisma.offlineSigningKey.count({ where: { userId: author.id, deviceId: authorDeviceId, revokedAt: null } })) { registered = true; break; }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(registered, 'current author terminal key registered before disconnecting');
  await context.setOffline(true);
  await page.getByText('Plato compartido', { exact: true }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('ts_pending_queue_v2') || '[]').some(op => op.proofs?.some(p => p.action === 'orders.openingItems')));
  const assumedOp = await page.evaluate(() => JSON.parse(localStorage.getItem('ts_pending_queue_v2'))[0]);
  await page.locator('#btn-logout').click();
  await page.getByPlaceholder('Ingresa tu PIN').waitFor();
  await context.setOffline(false);
  await page.getByPlaceholder('Ingresa tu PIN').fill('998877');
  await page.locator('#btn-login-submit').click();
  await page.getByRole('button', { name: /Configuración/ }).click();
  await page.getByRole('button', { name: /Modo Offline/ }).click();
  await page.getByRole('button', { name: 'Revisar operaciones pendientes' }).click();
  await page.getByRole('button', { name: 'Asumir esta operación' }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('ts_pending_queue_v2') || '[]').length === 0, undefined, { timeout: 15000 }).catch(async error => { console.log(await page.locator('body').innerText()); console.log(await page.evaluate(() => JSON.parse(localStorage.getItem('ts_pending_queue_v2') || '[]').map(({op,error,conflict}) => ({op,error,conflict})))); throw error; });
  const assumed = await prisma.order.findFirstOrThrow({ where: { clientOpId: assumedOp.clientOpId }, include: { items: true } });
  assert.equal(assumed.items.length, 1);
  const assumption = await prisma.offlineAssumptionAudit.findUniqueOrThrow({ where: { clientOpId: assumedOp.clientOpId } });
  assert.equal(assumption.authorUserId, author.id);
  assert.equal(assumption.assumedByUserId, 'test-user');
  await page.screenshot({ path: '/tmp/tayta-assumption-after.png' });
  console.log('PASS: administrator assumes another user signed opening from isolated cache; SQL records original author and responsible administrator.');

} finally {
  if (context) await context.close();
  await prisma.$disconnect();
}
