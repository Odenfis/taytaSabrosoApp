import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { io } from 'socket.io-client';
import { PrismaClient } from '../server/node_modules/@prisma/client/default.js';
import bcrypt from '../server/node_modules/bcryptjs/index.js';
import { ROUTE_PERMISSIONS } from '../server/src/lib/route-permissions.ts';
import { hasPermission } from '../server/src/lib/permissions.ts';

assert.match(process.env.ORDER_TEST_DATABASE ?? '', /^tayta_orders_test_[a-f0-9]{32}$/);
assert.ok(process.env.DATABASE_URL.includes(';database=' + process.env.ORDER_TEST_DATABASE));
const prisma = new PrismaClient();
const base = process.env.BROWSER_TEST_URL;
const profile = await mkdtemp(path.join(tmpdir(), 'tayta-roles-'));
let context; const sockets = [];
const accounts = [
  { role: 'Administrador', pin: '993301', companyId: null },
  { role: 'Jefe de restaurante', pin: '993302', companyId: 'el-tayta' },
  { role: 'Cajero', pin: '993303', companyId: 'el-tayta' },
  { role: 'Mesero', pin: '993304', companyId: 'el-tayta' },
];
async function call(token, method, route, data) {
  const response = await fetch(base + '/api' + route, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  return { status: response.status, body: await response.json() };
}
async function login(pin, suffix) {
  const result = await call(null, 'POST', '/auth/login', { pin, deviceCode: 'STEP3-' + suffix, terminalName: 'Roles test' });
  assert.equal(result.status, 200, JSON.stringify(result.body)); return result.body;
}
try {
  await prisma.user.update({ where: { id: 'test-user' }, data: { pinHash: bcrypt.hashSync('993300', 4) } });
  const root = await login('993300', 'root');
  for (const account of accounts) {
    const created = await call(root.token, 'POST', '/users', { name: 'Roles ' + account.role, role: account.role, companyId: account.companyId, isActive: true, pin: account.pin });
    assert.equal(created.status, 201, JSON.stringify(created.body)); account.user = created.body;
    account.session = await login(account.pin, account.role.replaceAll(' ', '').slice(0, 10));
    assert.ok(!('pinHash' in created.body));
  }
  const admin = accounts[0], manager = accounts[1], cashier = accounts[2], waiter = accounts[3];
  let denials = 0;
  for (const account of accounts) {
    for (const route of ROUTE_PERMISSIONS.filter(route => !hasPermission(account.role, route.permission))) {
      const endpoint = (route.group === 'reports' ? '' : '/' + route.group) + route.path.replace(/:[A-Za-z]+/g, randomUUID());
      const result = await call(account.session.token, route.method, endpoint, route.method === 'GET' || route.method === 'DELETE' ? undefined : {});
      assert.equal(result.status, 403, account.role + ' ' + endpoint + ': ' + JSON.stringify(result.body)); denials++;
    }
    for (const [route, permission] of [['/catalogs/tables','tables.read'], ['/catalogs/products','products.sale_read'], ['/catalogs/insumos','inventory.read'], ['/catalogs/recipes','recipes.manage'], ['/catalogs/bank-accounts','banks.manage'], ['/catalogs/payment-methods','payments.read'], ['/operations/transactions','cash.read']]) {
      const result = await call(account.session.token, 'GET', route);
      assert.equal(result.status, hasPermission(account.role, permission) ? 200 : 403, account.role + route);
    }
    if (account.companyId) {
      const result = await call(account.session.token, 'GET', '/catalogs/tables?companyId=otra-empresa'); assert.equal(result.status, 403);
      const me = await call(account.session.token, 'GET', '/auth/me'); assert.deepEqual(me.body.companies.map(company => company.id), ['el-tayta']);
      if (account.role === 'Mesero') assert.equal(me.body.companyShifts.length, 0);
    }
  }
  const physical = await call(manager.session.token, 'POST', '/catalogs/tables/physical', { zone: 'Primer Piso', capacity: 4 }); assert.equal(physical.status, 201, JSON.stringify(physical.body));
  const historic = await prisma.order.findFirstOrThrow({ where: { companyId: 'el-tayta', status: 'cobrado' } });
  const historicRead = await call(waiter.session.token, 'GET', '/operations/orders/' + historic.id); assert.equal(historicRead.status, 200);
  assert.ok(!('amountReceived' in historicRead.body) && !('change' in historicRead.body) && !('paymentMethod' in historicRead.body));
  console.log(`PASS: ${denials} denied route/profile combinations and authorized reads/company boundaries over HTTP.`);

  // Jornada completa con sesiones limitadas reales en ambas empresas.
  for (const [companyIndex, company] of (await prisma.company.findMany()).entries()) {
    const operators = {};
    for (const [roleIndex, role] of ['Mesero','Cajero','Jefe de restaurante'].entries()) {
      const pin = String(880000 + companyIndex * 10 + roleIndex);
      const created = await call(root.token,'POST','/users',{name:'Jornada ' + role,role,companyId:company.id,isActive:true,pin});
      assert.equal(created.status,201,JSON.stringify(created.body));
      operators[role] = { user:created.body, ...(await login(pin,'journey-' + companyIndex + '-' + roleIndex)) };
    }
    const cash = await prisma.customPaymentMethod.create({data:{id:randomUUID(),companyId:company.id,name:'Efectivo jornada',category:'Efectivo',icon:'payments'}});
    const dish = await prisma.product.create({data:{id:randomUUID(),companyId:company.id,name:'Plato jornada',description:'',image:'',category:'platos',price:10,available:true}});
    for (const split of [false,true]) {
      const table = await prisma.table.create({data:{id:randomUUID(),companyId:company.id,number:'JORNADA-' + split,capacity:4,zone:'Primer Piso'}});
      const mozo = operators.Mesero, cajera = operators.Cajero;
      const opened = await call(mozo.token,'POST','/operations/orders/open',{tableId:table.id,clientOpId:randomUUID()});
      assert.equal(opened.status,201,JSON.stringify(opened.body));
      const orderId = opened.body.id;
      const added = await call(mozo.token,'POST',`/operations/orders/${orderId}/items`,{productId:dish.id,quantity:2});
      assert.equal(added.status,201,JSON.stringify(added.body));
      assert.equal((await call(mozo.token,'POST',`/operations/orders/${orderId}/send-to-kitchen`,{clientOpId:randomUUID()})).status,200);
      assert.equal((await call(mozo.token,'POST',`/operations/tables/${table.id}/por-cobrar`,{})).status,200);
      if (split) {
        const item = await prisma.orderItem.findFirstOrThrow({where:{orderId}});
        const divided = await call(cajera.token,'POST',`/operations/orders/${orderId}/bills`,{clientOpId:randomUUID(),bills:[1,2].map(i=>({id:randomUUID(),label:'Persona '+i,documentType:'ticket',recipientName:'Receptor '+i,items:[{orderItemId:item.id,quantity:1}]}))});
        assert.equal(divided.status,201,JSON.stringify(divided.body));
        assert.equal(new Set(divided.body.map(b=>b.ticketNumber)).size,2);
        for (const bill of divided.body) {
          const payload={amount:10,amountReceived:20,customPaymentMethodId:cash.id,clientOpId:randomUUID()};
          const paid=await call(cajera.token,'POST',`/operations/bills/${bill.id}/pay`,payload);
          assert.equal(paid.status,200,JSON.stringify(paid.body));
          assert.equal((await call(cajera.token,'POST',`/operations/bills/${bill.id}/pay`,payload)).body.transaction.id,paid.body.transaction.id);
        }
      } else {
        const payload={paymentMethod:cash.name,customPaymentMethodId:cash.id,amountReceived:30,clientOpId:randomUUID()};
        assert.equal((await call(cajera.token,'POST',`/operations/tables/${table.id}/pay`,payload)).status,200);
        assert.equal((await call(cajera.token,'POST',`/operations/tables/${table.id}/pay`,payload)).status,200);
      }
      assert.equal((await prisma.table.findUniqueOrThrow({where:{id:table.id}})).status,'libre');
      const txs=await prisma.transaction.findMany({where:{orderId}});
      assert.equal(txs.reduce((sum,t)=>sum+Number(t.amount),0),20);
      for (const tx of txs) assert.ok(await prisma.operationAudit.findFirst({where:{entityId:tx.id,actorUserId:cajera.user.id,companyId:company.id}}));
    }
    const purchase = await call(operators['Jefe de restaurante'].token,'POST','/operations/purchases',{companyId:company.id,category:'gastos_operativos',documentStatus:'provisional',invoiceNumber:'JORNADA',supplierName:'Proveedor prueba',supplierRuc:'20999999999',total:1,items:[],clientOpId:randomUUID()});
    assert.equal(purchase.status,201,JSON.stringify(purchase.body));
    const shiftPayload={companyId:company.id,targetShift:'Noche',reportedCash:40,initialCashForNext:0,clientOpId:randomUUID()};
    const close = await call(operators.Cajero.token,'POST','/operations/shifts/switch',shiftPayload);
    assert.equal(close.status,200,JSON.stringify(close.body));
    assert.equal((await call(operators.Cajero.token,'POST','/operations/shifts/switch',shiftPayload)).status,200);
  }
  console.log('PASS: ambas empresas con mozo -> cocina -> por cobrar -> cajera, cobro directo/dividido, reintentos sin duplicar, auditoría SQL, mesa libre, compra por jefe y cierre por cajera.');

  const duplicate = await call(root.token, 'POST', '/users', { name: 'duplicate', role: 'Mesero', companyId: 'el-tayta', isActive: true, pin: waiter.pin }); assert.equal(duplicate.status, 409);
  const unsafePin = await call(waiter.session.token, 'PATCH', '/auth/pin', { currentPin: waiter.pin, newPin: '999887' }); assert.equal(unsafePin.status, 403);
  const events = new Map();
  for (const account of accounts) {
    const socket = io(base, { auth: { token: account.session.token }, transports: ['websocket'] }); sockets.push(socket);
    const received = []; events.set(account.role, received);
    socket.onAny((event, payload) => received.push({ event, payload }));
    await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
    socket.emit('join-company', { companyId: 'el-tayta' });
  }
  await new Promise(resolve => setTimeout(resolve, 150));
  const tableId = randomUUID();
  await prisma.table.create({ data: { id: tableId, companyId: 'el-tayta', number: 'ROL-3', capacity: 4, zone: 'Primer Piso' } });
  const product = await prisma.product.create({ data: { id: randomUUID(), companyId: 'el-tayta', name: 'Plato Roles', description: '', image: '', category: 'platos', price: 10, available: true } });
  const opened = await call(waiter.session.token, 'POST', '/operations/orders/open', { tableId, clientOpId: randomUUID(), waiter: 'false identity' }); assert.equal(opened.status, 201);
  const orderId = opened.body.id;
  assert.equal(opened.body.waiter, waiter.user.name);
  assert.equal((await call(waiter.session.token, 'POST', `/operations/orders/${orderId}/items`, { productId: product.id, quantity: 1 })).status, 201);
  assert.equal((await call(manager.session.token, 'POST', `/operations/orders/${orderId}/send-to-kitchen`, { clientOpId: randomUUID() })).status, 200);
  const consultTable = randomUUID();
  await prisma.table.create({ data: { id: consultTable, companyId: 'el-tayta', number: 'ROL-CONSULTA', capacity: 4, zone: 'Primer Piso' } });
  const consultOrder = await call(manager.session.token, 'POST', '/operations/orders/open', { tableId: consultTable, clientOpId: randomUUID() });
  await call(manager.session.token, 'POST', `/operations/orders/${consultOrder.body.id}/items`, { productId: product.id, quantity: 1 });
  await call(manager.session.token, 'POST', `/operations/orders/${consultOrder.body.id}/send-to-kitchen`, { clientOpId: randomUUID() });
  const movement = await call(cashier.session.token, 'POST', '/operations/transactions', { companyId: 'el-tayta', type: 'INGRESO', description: 'Roles test cash', amount: 1, isIncome: true, clientOpId: randomUUID() }); assert.equal(movement.status, 201, JSON.stringify(movement.body));
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.ok(events.get('Cajero').some(e => e.event === 'transaction:changed'));
  assert.ok(!events.get('Mesero').some(e => ['transaction:changed', 'shift:changed', 'kardex:changed'].includes(e.event)));
  assert.ok(events.get('Mesero').some(e => e.event === 'order:changed'));
  const revision = await call(root.token, 'PATCH', '/users/' + waiter.user.id, { name: waiter.user.name, role: waiter.role, companyId: 'el-tayta', isActive: false, expectedVersion: waiter.user.version }); assert.equal(revision.status, 200);
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(sockets[3].connected, false);
  assert.equal((await call(waiter.session.token, 'GET', '/catalogs/tables')).status, 401);
  const restored = await call(root.token, 'PATCH', '/users/' + waiter.user.id, { name: waiter.user.name, role: waiter.role, companyId: 'el-tayta', isActive: true, expectedVersion: revision.body.version }); assert.equal(restored.status, 200);
  const stale = await call(root.token, 'PATCH', '/users/' + waiter.user.id, { name: waiter.user.name, role: waiter.role, companyId: 'el-tayta', isActive: true, expectedVersion: waiter.user.version }); assert.equal(stale.status, 409);
  console.log('PASS: user HTTP validation, audit, version conflict, revoked HTTP session and live socket; waiter does not receive cash events.');

  context = await chromium.launchPersistentContext(profile, { executablePath: process.env.CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, viewport: { width: 1440, height: 1000 } });
  const page = context.pages()[0]; const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(base);
  for (const account of [waiter, cashier, manager, admin]) {
    const forbiddenFetches = [];
    const listener = response => { if (response.url().includes('/api/') && response.status() === 403) forbiddenFetches.push(response.url()); };
    page.on('response', listener);
    await page.getByPlaceholder('Ingresa tu PIN').fill(account.pin); await page.locator('#btn-login-submit').click();
    await page.locator('#btn-logout').waitFor();
    if (account === admin) await page.locator('#btn-switch-tayta').click();
    await page.getByText('ROL-3', { exact: true }).waitFor();
    const content = await page.locator('body').innerText();
    if (account !== admin) {
      assert.ok(!content.includes('Food Cost')); assert.ok(!content.includes('Cuentas & Bancos')); assert.ok(!content.includes('Reportes & Métricas'));
      assert.equal(await page.locator('#btn-switch-sabroso').count(), 0);
    }
    assert.equal(await page.getByRole('button', { name: /Nueva Mesa/ }).count(), account === manager || account === admin ? 1 : 0);
    assert.equal(await page.locator('#btn-sidebar-shift').count(), account === waiter ? 0 : 1);
    await page.getByText('ROL-3', { exact: true }).click();
    if (account === waiter) {
      assert.equal(await page.getByRole('button', { name: 'Cobrar Mesa' }).count(), 0);
      await page.getByRole('button', { name: 'Marcar por cobrar' }).click();
      await page.getByText('ROL-3', { exact: true }).waitFor();
      await page.getByText('ROL-3', { exact: true }).click();
      await page.getByRole('button', { name: 'Marcar por cobrar' }).waitFor();
    } else if (account === cashier) {
      // A por-cobrar table opens payment directly. Go back to inspect read-only order.
      await page.getByRole('button', { name: /Mesas & POS/ }).click();
      await page.getByText('ROL-CONSULTA', { exact: true }).click();
      await page.getByText('Comanda Actual', { exact: true }).waitFor();
      assert.equal(await page.getByTitle('Aumentar', { exact: true }).count(), 0);
      assert.equal(await page.getByTitle('Disminuir', { exact: true }).count(), 0);
      assert.equal(await page.locator('#btn-send-to-kitchen').count(), 0);
      await page.locator('#btn-proceed-to-payment').click();
      const pendingId = randomUUID();
      await page.evaluate(({ orderId, pendingId }) => {
        localStorage.setItem('ts_diner_bills_' + orderId, JSON.stringify([{ recipientName: 'LEGACY-PRIVATE-RECIPIENT' }]));
        localStorage.setItem('ts_pending_queue_v2', JSON.stringify([{ clientOpId: pendingId, entity: 'order', op: 'createDinerBills', payload: { orderId, bills: [] }, authorId: 'another-user', deviceId: 'another-device', companyId: 'el-tayta', createdAt: new Date().toISOString() }]));
      }, { orderId: consultOrder.body.id, pendingId });
      await page.reload();
      await page.getByText('ROL-CONSULTA', { exact: true }).click();
      await page.locator('#btn-proceed-to-payment').click();
      await page.getByRole('button', { name: 'Confirmar reparto', exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Confirmar reparto', exact: true }).isDisabled(), true);
      assert.ok(!(await page.locator('body').innerText()).includes('LEGACY-PRIVATE-RECIPIENT'));
      const retained = await page.evaluate(() => JSON.parse(localStorage.getItem('ts_pending_queue_v2')));
      assert.equal(retained[0].authorId, 'another-user'); assert.equal(retained[0].deviceId, 'another-device');
      await page.evaluate(() => localStorage.removeItem('ts_pending_queue_v2'));
      console.log('PASS: foreign pending diner account blocks collection; legacy recipient cache is not displayed and original authorship is retained.');
      await page.getByRole('button', { name: /Mesas & POS/ }).click();
      await page.getByRole('button', { name: /Libro de Caja/ }).click();
      assert.equal(await page.getByText('Saldo en Bancos', { exact: true }).count(), 0);
    }
    assert.deepEqual(forbiddenFetches, [], account.role + ' must not fetch forbidden sources');
    page.off('response', listener);
    await page.screenshot({ path: '/tmp/tayta-role-' + account.role.replaceAll(' ', '-') + '.png' });
    await page.locator('#btn-logout').click();
  }
  await page.getByPlaceholder('Ingresa tu PIN').fill(admin.pin); await page.locator('#btn-login-submit').click();
  await page.getByRole('button', { name: /Configuración/ }).click();
  await page.getByRole('button', { name: 'Usuarios', exact: true }).click();
  await page.screenshot({ path: '/tmp/tayta-usuarios-oscuro.png', fullPage: true });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/tmp/tayta-usuarios-claro-movil.png', fullPage: true });
  assert.ok(await page.getByRole('heading', { name: 'Usuarios y perfiles' }).isVisible());
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.getByLabel('Nombre', { exact: true }).fill('Usuario visual paso 3');
  await page.getByLabel('PIN', { exact: true }).fill(waiter.pin);
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.getByRole('alert').waitFor();
  assert.equal(await page.getByLabel('Nombre', { exact: true }).inputValue(), 'Usuario visual paso 3');
  assert.equal(await page.getByLabel('PIN', { exact: true }).inputValue(), waiter.pin);

  await page.getByLabel('Perfil', { exact: true }).selectOption('Mesero');
  await page.getByLabel('Empresa', { exact: true }).selectOption('el-tayta');
  await page.getByLabel('PIN', { exact: true }).fill('993305');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.getByRole('button', { name: /Usuario visual paso 3/ }).click();
  await page.getByLabel('Perfil', { exact: true }).selectOption('Cajero');
  await page.getByLabel('Nuevo PIN (dejar vacío para conservar)', { exact: true }).fill('993306');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.getByRole('button', { name: /Usuario visual paso 3.*Cajero/ }).waitFor();
  assert.equal((await login('993306', 'visual')).user.role, 'Cajero');
  const wrongPin = await call(null, 'POST', '/auth/login', { pin: '993305', deviceCode: 'STEP3-old-pin' }); assert.equal(wrongPin.status, 401);
  await page.getByRole('button', { name: /Usuario visual paso 3.*Cajero/ }).click();
  await page.getByLabel('Usuario activo', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.getByRole('button', { name: /Usuario visual paso 3.*Inactivo/ }).waitFor();
  const disabled = await call(null, 'POST', '/auth/login', { pin: '993306', deviceCode: 'STEP3-disabled' }); assert.equal(disabled.status, 401);
  const managed = await prisma.user.findFirstOrThrow({ where: { name: 'Usuario visual paso 3' } });
  assert.equal(await prisma.userAccessAudit.count({ where: { subjectUserId: managed.id } }), 3);
  console.log('PASS: administrator UI creates, edits role, resets PIN and disables user; SQL audit and login reflect every change.');
  await page.getByRole('button', { name: /Usuario visual paso 3.*Inactivo/ }).click();
  await page.getByRole('button', { name: 'Archivar usuario', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar archivo', exact: true }).click();
  await page.getByText('Usuario archivado.', { exact: false }).waitFor();
  assert.equal(await page.getByRole('button', { name: /Usuario visual paso 3/ }).count(),0);
  await page.getByRole('button', { name: 'Archivados', exact: true }).click();
  await page.getByLabel('Buscar archivados').fill('Usuario visual');
  await page.getByRole('button', { name: /Usuario visual paso 3/ }).click();
  await page.getByLabel('Nuevo PIN para restaurar').fill('993307');
  await page.getByRole('button', { name: 'Restaurar usuario', exact: true }).click();
  await page.getByText('Usuario restaurado como inactivo.', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Equipo actual', exact: true }).click();
  await page.getByRole('button', { name: /Usuario visual paso 3.*Inactivo/ }).waitFor();
  assert.equal((await call(null,'POST','/auth/login',{pin:'993307',deviceCode:'STEP3-restored'})).status,401);
  assert.equal(await prisma.userAccessAudit.count({where:{subjectUserId:managed.id}}),5);
  console.log('PASS: archivo y restauración por interfaz preservan usuario y auditoría; restaurado permanece inactivo.');


  const publicKey = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).publicKey.export({ format: 'jwk' });
  const registered = await call(manager.session.token, 'POST', '/sync/signing-keys', { kty: publicKey.kty, crv: publicKey.crv, x: publicKey.x, y: publicKey.y }); assert.equal(registered.status, 201);
  await page.getByRole('button', { name: 'Seguridad', exact: true }).click();
  const row = page.locator('li').filter({ hasText: registered.body.id });
  await row.getByRole('button', { name: 'Revocar clave', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar revocación', exact: true }).click();
  await row.getByText(/Revocada:/).waitFor();
  const revoked = await prisma.offlineSigningKey.findUniqueOrThrow({ where: { id: registered.body.id } });
  assert.equal(revoked.revokedBy, admin.user.id);
  assert.ok(revoked.revokedAt);
  assert.equal(await prisma.userAccessAudit.count({ where: { subjectUserId: manager.user.id, action: 'revocar_clave_offline' } }), 1);
  const listed = await call(admin.session.token, 'GET', '/sync/signing-keys');
  assert.equal(listed.status, 200); assert.ok(listed.body.every(key => !('publicKey' in key) && !('fingerprint' in key)));
  await page.screenshot({ path: '/tmp/tayta-role-security.png' });
  console.log('PASS: key revocation via administrator UI audited in SQL; list excludes key material.');
  // A permission change must clear the live UI, not only reject the next API call.
  let victim = await prisma.user.findUniqueOrThrow({ where: { id: managed.id } });
  const enabled = await call(root.token, 'PATCH', '/users/' + victim.id, { name: victim.name, role: 'Cajero', companyId: 'el-tayta', isActive: true, expectedVersion: victim.version }); assert.equal(enabled.status, 200);
  await page.locator('#btn-logout').click();
  await page.getByPlaceholder('Ingresa tu PIN').fill('993307'); await page.locator('#btn-login-submit').click();
  await page.getByText('ROL-3', { exact: true }).waitFor();
  await page.getByRole('button', { name: /Libro de Caja/ }).click();
  await page.getByText('Movimientos Registrados', { exact: true }).waitFor();
  const narrowed = await call(root.token, 'PATCH', '/users/' + victim.id, { name: victim.name, role: 'Mesero', companyId: 'otra-empresa', isActive: true, expectedVersion: enabled.body.version }); assert.equal(narrowed.status, 200);
  await page.getByPlaceholder('Ingresa tu PIN').waitFor();
  await page.getByPlaceholder('Ingresa tu PIN').fill('993307'); await page.locator('#btn-login-submit').click();
  await page.locator('#btn-logout').waitFor();
  await page.getByText('Salón & Mesas: Otra', { exact: true }).waitFor();
  assert.equal(await page.getByText('ROL-3', { exact: true }).count(), 0);
  assert.equal(await page.getByText('Movimientos Registrados', { exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: /Libro de Caja/ }).count(), 0);
  console.log('PASS: live role/company change closes browser session and prevents financial/table cache reuse on login.');
  assert.deepEqual(pageErrors, []);
  console.log('PASS: all four profiles rendered, company selectors and financial indicators restricted; waiter marks billing without entering payment.');
} finally { for (const socket of sockets) socket.disconnect(); if (context) await context.close(); await prisma.$disconnect(); }
