import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { createServer } from 'node:http';
import { prisma } from '../src/lib/prisma.js';
import { correctPayment, listPaymentCorrections } from '../src/services/payment-correction.service.js';
import { getCompanyAnalysis, getReportSummary } from '../src/services/analytics.service.js';
import { createApp } from '../src/app.js';

const companyId = 'el-tayta';
const operatorId = randomUUID();
const supervisorId = randomUUID();
const bcpId = randomUUID();
const bbvaId = randomUUID();
const cashId = randomUUID();
const yapeId = randomUUID();
const plinId = randomUUID();
const transferId = randomUUID();
const now = Date.now();
const amount = 100;

function request(transactionId: string, oldMethodId: string, oldBankAccountId: string | null, newMethodId: string, referenceNumber: string | null, expectedReference: string | null = null) {
  return { transactionId, correctionId: randomUUID(), operatorId, supervisorPin: '4321',
    expectedMethodId: oldMethodId, expectedBankAccountId: oldBankAccountId, expectedReference,
    newMethodId, referenceNumber, reason: 'Método seleccionado por error' };
}

async function sale(methodId: string, bankId: string | null, methodName: string, timestamp = new Date(now)) {
  const orderId = randomUUID();
  const transactionId = randomUUID();
  await prisma.order.create({ data: { id: orderId, companyId, ticketNumber: orderId.slice(0, 8), zone: 'Salón Principal',
    waiter: 'Operador', createdAt: 'Hoy', subtotal: amount, igv: 0, total: amount, status: 'cobrado',
    paymentMethod: methodName, amountReceived: amount, change: 0, clientOpId: randomUUID() } });
  await prisma.transaction.create({ data: { id: transactionId, companyId, time: '12:00 PM', date: 'Hoy', timestamp,
    type: 'Venta (Mesa)', description: 'Pago ' + methodName, amount, isIncome: true,
    paymentMethod: methodName, customPaymentMethodId: methodId, bankAccountId: bankId,
    shift: 'Día', orderId, clientOpId: randomUUID() } });
  return { orderId, transactionId };
}

try {
  await prisma.company.create({ data: { id: companyId, name: 'El Tayta', tradeName: 'El Tayta', ruc: '12345678901',
    specialty: 'Comida', themeColor: '#ffffff', accentColor: '#000000', badgeText: 'Tayta', address: 'Lima' } });
  await prisma.company.create({ data: { id: 'el-sabroso', name: 'El Sabroso', tradeName: 'El Sabroso', ruc: '12345678902',
    specialty: 'Comida', themeColor: '#ffffff', accentColor: '#000000', badgeText: 'Sabroso', address: 'Lima' } });
  await prisma.user.create({ data: { id: operatorId, companyId, name: 'Operador', pinHash: await bcrypt.hash('1111', 4),
    role: 'Cajero', terminal: 'Caja' } });
  await prisma.user.create({ data: { id: supervisorId, companyId, name: 'Supervisor', pinHash: await bcrypt.hash('1004', 4),
    role: 'Administrador', terminal: 'Caja' } });
  await prisma.companyShift.create({ data: { companyId, currentShift: 'Día', openedAt: 'Hoy 07:00 AM',
    openedUtc: new Date(now - 60_000), openedBy: 'Operador', initialCash: 350 } });
  for (const [id, bankName] of [[bcpId, 'BCP'], [bbvaId, 'BBVA']]) {
    await prisma.bankAccount.create({ data: { id, companyId, bankName, accountNumber: id, accountType: 'Ahorros',
      currency: 'PEN', holderName: 'El Tayta', alias: bankName, currentBalance: bankName === 'BBVA' ? 100 : 0 } });
  }
  for (const [id, name, category, bankAccountId] of [
    [cashId, 'Efectivo', 'Efectivo', null], [yapeId, 'Yape BCP', 'Billetera Digital', bcpId],
    [plinId, 'Plin BBVA', 'Billetera Digital', bbvaId], [transferId, 'Transferencia BCP', 'Transferencia Bancaria', bcpId],
  ] as const) {
    await prisma.customPaymentMethod.create({ data: { id, companyId, name, category, bankAccountId,
      bankAccountAlias: bankAccountId === bcpId ? 'BCP' : bankAccountId === bbvaId ? 'BBVA' : null,
      requiresReferenceNumber: bankAccountId !== null, icon: 'payments' } });
  }

  const first = await sale(cashId, null, 'Efectivo');
  const cashToYape = request(first.transactionId, cashId, null, yapeId, 'YAPE-123');
  await assert.rejects(correctPayment({ ...cashToYape, supervisorPin: '1004' }), /PIN inicial/);
  await prisma.user.update({ where: { id: supervisorId }, data: { pinHash: await bcrypt.hash('4321', 4) } });
  await assert.rejects(correctPayment({ ...cashToYape, supervisorPin: 'bad' }), /PIN/);
  await assert.rejects(correctPayment({ ...cashToYape, referenceNumber: null }), /número de operación/);
  assert.equal((await prisma.bankAccount.findUniqueOrThrow({ where: { id: bcpId } })).currentBalance.toNumber(), 0);
  await prisma.customPaymentMethod.update({ where: { id: yapeId }, data: { isActive: false } });
  await assert.rejects(correctPayment(cashToYape), /Método de pago no disponible/);
  await prisma.customPaymentMethod.update({ where: { id: yapeId }, data: { isActive: true } });
  await correctPayment(cashToYape);
  await correctPayment(cashToYape); // same correction ID is idempotent
  assert.equal((await prisma.bankAccount.findUniqueOrThrow({ where: { id: bcpId } })).currentBalance.toNumber(), 100);
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: first.orderId } })).paymentMethod, 'Yape BCP');
  assert.equal((await listPaymentCorrections(first.transactionId)).length, 1);

  const second = await sale(plinId, bbvaId, 'Plin BBVA');
  const moveBank = request(second.transactionId, plinId, bbvaId, transferId, 'BCP-456');
  await correctPayment(moveBank);
  assert.equal((await prisma.bankAccount.findUniqueOrThrow({ where: { id: bbvaId } })).currentBalance.toNumber(), 0);
  assert.equal((await prisma.bankAccount.findUniqueOrThrow({ where: { id: bcpId } })).currentBalance.toNumber(), 200);
  assert.equal((await prisma.transaction.findUniqueOrThrow({ where: { id: second.transactionId } })).referenceNumber, 'BCP-456');

  const third = await sale(cashId, null, 'Efectivo', new Date(now - 30_000));
  const closedRecordId = randomUUID();
  await prisma.shiftRecord.create({ data: { id: closedRecordId, companyId, shift: 'Día', openedAt: 'Hoy 07:00 AM',
    closedAt: 'Hoy 12:00 PM', openedBy: 'Operador', closedBy: 'Operador', initialCash: 350,
    systemCashExpected: 450, finalCashReported: 450, cashDifference: 0, totalSales: 100, totalExpenses: 0 } });
  await prisma.companyShift.update({ where: { companyId }, data: { openedUtc: new Date(now - 10_000), initialCash: 350 } });
  await correctPayment(request(third.transactionId, cashId, null, yapeId, 'YAPE-789'));
  const adjustments = await prisma.transaction.findMany({ where: { type: 'Reclasificación de Pago' } });
  assert.equal(adjustments.length, 1);
  assert.equal(adjustments[0].isIncome, false);
  assert.equal(adjustments[0].amount.toNumber(), amount);
  assert.equal((await listPaymentCorrections(third.transactionId))[0].closedShift, true);
  assert.equal((await prisma.shiftRecord.findUniqueOrThrow({ where: { id: closedRecordId } })).systemCashExpected?.toNumber(), 450);

  const fourth = await sale(plinId, bbvaId, 'Plin BBVA');
  await prisma.bankAccount.update({ where: { id: bbvaId }, data: { currentBalance: { increment: amount } } });
  await correctPayment(request(fourth.transactionId, plinId, bbvaId, cashId, null));
  assert.equal((await prisma.bankAccount.findUniqueOrThrow({ where: { id: bbvaId } })).currentBalance.toNumber(), 0);
  assert.equal((await listPaymentCorrections(fourth.transactionId))[0].closedShift, false);
  assert.equal((await prisma.transaction.count({ where: { type: 'Reclasificación de Pago' } })), 1);

  const fifth = await sale(cashId, null, 'Efectivo');
  const concurrent = await Promise.allSettled([
    correctPayment(request(fifth.transactionId, cashId, null, yapeId, 'YAPE-900')),
    correctPayment(request(fifth.transactionId, cashId, null, transferId, 'BCP-900')),
  ]);
  assert.equal(concurrent.filter((x) => x.status === 'fulfilled').length, 1);
  assert.equal((await listPaymentCorrections(fifth.transactionId)).length, 1);
  assert.equal((await prisma.bankAccount.findUniqueOrThrow({ where: { id: bcpId } })).currentBalance.toNumber(), 400);
  const summary = await getReportSummary(companyId);
  assert.equal(summary.totalIngresos, 500);
  assert.equal(summary.totalEgresos, 0);
  assert.equal(summary.saldoActual, 350);
  assert.equal((await getCompanyAnalysis(companyId)).totalSales, 500);
  const http = createServer(createApp());
  try {
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
    const address = http.address();
    if (!address || typeof address === 'string') throw new Error('Sin puerto de prueba');
    const base = `http://127.0.0.1:${address.port}/api`;
    const login = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '4321', deviceCode: 'PAYMENT-TEST' }) });
    assert.equal(login.status, 200);
    const token = (await login.json()).token as string;
    const pinChange = await fetch(base + '/auth/pin', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ currentPin: '4321', newPin: '87654321' }) });
    assert.equal(pinChange.status, 200);
    assert.equal(await bcrypt.compare('87654321', (await prisma.user.findUniqueOrThrow({ where: { id: supervisorId } })).pinHash), true);
  } finally { await new Promise<void>((resolve) => http.close(() => resolve())); }
  console.log('Correcciones SQL: caja↔banco, BBVA→BCP, PIN, método inactivo, referencia, concurrencia, reintento y turno cerrado aprobados.');
} finally {
  await prisma.$disconnect();
}
