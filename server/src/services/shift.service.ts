import { randomUUID } from 'node:crypto';
import { AppError, plain, round2, toNum } from '../lib/utils.js';
import { prisma } from '../lib/prisma.js';
import { emitShiftChanged, emitTransactionChanged } from '../lib/realtime.js';

function nowParts() {
  const now = new Date();
  return {
    time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    date: 'Hoy',
    utc: now,
  };
}

// Cierre y cambio de turno (Día <-> Noche) por empresa. Réplica fiel del arqueo de la demo.
export async function switchCompanyShift(input: {
  companyId: string;
  targetShift: string; // 'Día' | 'Noche'
  reportedCash: number;
  initialCashForNext: number;
  notes?: string;
  operator?: string;
  clientOpId?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const shiftState = await tx.companyShift.findUnique({ where: { companyId: input.companyId } });
    const currentShift = shiftState?.currentShift ?? 'Día';
    const initialCash = shiftState ? toNum(shiftState.initialCash) : 350;

    // Transacciones del turno vigente (o sin turno asignado)
    const compTxs = await tx.transaction.findMany({
      where: { companyId: input.companyId, isDeleted: false,
        ...(shiftState ? { timestamp: { gte: shiftState.openedUtc } } : {}) },
    });
    const turnTxs = compTxs.filter((t) => !t.shift || t.shift === currentShift);

    const cashSales = turnTxs
      .filter((t) => t.isIncome && t.type.startsWith('Venta (') && !t.bankAccountId)
      .reduce((sum, t) => sum + toNum(t.amount), 0);
    const cashIncome = turnTxs
      .filter((t) => t.isIncome && t.type !== 'Reclasificación de Pago' && !t.bankAccountId)
      .reduce((sum, t) => sum + toNum(t.amount), 0);

    const cardSales = turnTxs
      .filter(
        (t) =>
          t.isIncome && t.type.startsWith('Venta (') &&
          (t.paymentMethod === 'Tarjeta' ||
            (t.description || '').toLowerCase().includes('tarjeta'))
      )
      .reduce((sum, t) => sum + toNum(t.amount), 0);

    const walletSales = turnTxs
      .filter(
        (t) =>
          t.isIncome && t.type.startsWith('Venta (') &&
          (t.paymentMethod === 'Billetera Digital' ||
            (t.description || '').toLowerCase().includes('yape') ||
            (t.description || '').toLowerCase().includes('plin'))
      )
      .reduce((sum, t) => sum + toNum(t.amount), 0);

    const totalSales = round2(cashSales + cardSales + walletSales);
    const totalExpenses = turnTxs
      .filter((t) => !t.isIncome && t.type !== 'Reclasificación de Pago')
      .reduce((sum, t) => sum + toNum(t.amount), 0);
    // Regla de gaveta: solo los egresos SIN cuenta bancaria salen del efectivo
    // físico (los pagados desde banco decrementan el banco, no la caja).
    const cashExpenses = turnTxs
      .filter((t) => !t.isIncome && !t.bankAccountId && t.type !== 'Reclasificación de Pago')
      .reduce((sum, t) => sum + toNum(t.amount), 0);
    const cashReclassifications = turnTxs
      .filter((t) => t.type === 'Reclasificación de Pago' && !t.bankAccountId)
      .reduce((sum, t) => sum + (t.isIncome ? 1 : -1) * toNum(t.amount), 0);
    const systemCashExpected = round2(initialCash + cashIncome - cashExpenses + cashReclassifications);
    const difference = round2(input.reportedCash - systemCashExpected);

    // Ingresos por cuenta bancaria que no son tarjeta ni billetera digital
    // (transferencias, cheques, etc.).
    const bankTransferSales = turnTxs
      .filter(
        (t) =>
          t.isIncome &&
          !!t.bankAccountId &&
          (t.paymentMethod || '').toLowerCase() !== 'tarjeta' &&
          (t.paymentMethod || '').toLowerCase() !== 'billetera digital' &&
          (t.paymentMethod || '').toLowerCase() !== 'yape / plin' &&
          (t.paymentMethod || '').toLowerCase() !== 'efectivo'
      )
      .reduce((sum, t) => sum + toNum(t.amount), 0);

    const { time } = nowParts();
    const operator = input.operator || shiftState?.openedBy || 'Sistema';

    // Crear historial de turno
    await tx.shiftRecord.create({
      data: {
        id: randomUUID(),
        companyId: input.companyId,
        shift: currentShift,
        openedAt: shiftState?.openedAt || `Hoy 07:30 AM`,
        closedAt: `Hoy ${time}`,
        openedBy: shiftState?.openedBy || operator,
        closedBy: operator,
        initialCash,
        systemCashExpected,
        finalCashReported: input.reportedCash,
        cashDifference: difference,
        totalSales,
        totalExpenses,
        cardSales: round2(cardSales),
        digitalWalletSales: round2(walletSales),
        bankTransferSales: round2(bankTransferSales),
        status: 'cerrado',
        notes: input.notes || `Cierre de turno ${currentShift} realizado.`,
      },
    });

    // Cambiar turno vigente
    await tx.companyShift.upsert({
      where: { companyId: input.companyId },
      create: {
        companyId: input.companyId,
        currentShift: input.targetShift,
        openedAt: `Hoy ${time}`,
        openedBy: operator,
        initialCash: input.initialCashForNext,
      },
      update: {
        currentShift: input.targetShift,
        openedAt: `Hoy ${time}`,
        openedBy: operator,
        initialCash: input.initialCashForNext,
      },
    });

    // Ajuste de saldo (sobrante/faltante)
    if (difference !== 0) {
      await tx.transaction.create({
        data: {
          id: randomUUID(),
          companyId: input.companyId,
          time,
          date: 'Hoy',
          timestamp: new Date(),
          type: 'Ajuste de Saldo',
          description: `Diferencia arqueo ${currentShift} (${difference > 0 ? 'Sobrante' : 'Faltante'})`,
          amount: Math.abs(difference),
          isIncome: difference > 0,
          shift: currentShift,
          clientOpId: input.clientOpId ?? randomUUID(),
        },
      });
    }

    // Aviso realtime: cierra turno + nueva caja inicial para las demás terminales.
    emitShiftChanged(input.companyId, {
      companyId: input.companyId,
      closedShift: currentShift,
      newShift: input.targetShift,
      initialCash: input.initialCashForNext,
      reportedCash: input.reportedCash,
      systemCashExpected,
      difference,
      updatedAt: new Date().toISOString(),
    });

    return {
      companyId: input.companyId,
      closedShift: currentShift,
      newShift: input.targetShift,
      totalSales,
      totalExpenses,
      systemCashExpected,
      reportedCash: input.reportedCash,
      difference,
    };
  }).then((r) => plain(r));
}

export async function listShiftRecords(companyId?: string) {
  const records = await prisma.shiftRecord.findMany({
    where: companyId ? { companyId } : {},
    orderBy: { closedUtc: 'desc' },
  });
  return plain(records);
}

export async function listTransactions(companyId?: string) {
  const transactions = await prisma.transaction.findMany({
    where: {
      isDeleted: false,
      // Sin companyId = compartida (legacy): visible en todas las empresas.
      ...(companyId ? { OR: [{ companyId }, { companyId: null }] } : {}),
    },
    orderBy: { timestamp: 'desc' },
    take: 1000,
    include: { _count: { select: { corrections: true } } },
  });
  return plain(transactions.map(({ _count, ...transaction }) => ({ ...transaction, correctionCount: _count.corrections })));
}

export async function currentShiftForCompany(companyId: string) {
  return plain(await prisma.companyShift.findUnique({ where: { companyId } }));
}

// Transacción manual de Caja (Caja Chica / Retiro de Caja / Ingreso Extra / Ajuste de Saldo).
export interface CreateManualTransactionInput {
  companyId: string;
  type: string;
  description: string;
  amount: number;
  isIncome: boolean;
  bankAccountId?: string;
  customPaymentMethodId?: string;
  referenceNumber?: string;
  clientOpId?: string;
}

export async function createManualTransaction(input: CreateManualTransactionInput) {
  return prisma.$transaction(async (tx) => {
    // Idempotencia: reintentos con el mismo clientOpId devuelven la transacción existente.
    if (input.clientOpId) {
      const existing = await tx.transaction.findFirst({
        where: { clientOpId: input.clientOpId },
      });
      if (existing) return existing;
    }

    const companyShift = await tx.companyShift.findUnique({ where: { companyId: input.companyId } });
    const currentShift = companyShift?.currentShift ?? 'Día';
    const bankAcc = input.bankAccountId
      ? await tx.bankAccount.findUnique({ where: { id: input.bankAccountId } })
      : null;

    if (bankAcc) {
      await tx.bankAccount.update({
        where: { id: bankAcc.id },
        data: input.isIncome
          ? { currentBalance: { increment: toNum(input.amount) } }
          : { currentBalance: { decrement: toNum(input.amount) } },
      });
    }

    const { time, date, utc } = nowParts();
    const transaction = await tx.transaction.create({
      data: {
        id: randomUUID(),
        companyId: input.companyId,
        time,
        date,
        timestamp: utc,
        type: input.type,
        description: input.description,
        amount: toNum(input.amount),
        isIncome: input.isIncome,
        customPaymentMethodId: input.customPaymentMethodId ?? null,
        bankAccountId: input.bankAccountId ?? null,
        bankAccountAlias: bankAcc?.alias ?? null,
        shift: currentShift,
        referenceNumber: input.referenceNumber ?? null,
        clientOpId: input.clientOpId ?? randomUUID(),
      },
    });

    // Aviso realtime Libro de Caja: transacción manual registrada (toca gaveta o banco).
    emitTransactionChanged(input.companyId, {
      transactionId: transaction.id,
      companyId: input.companyId,
      type: input.type,
      amount: toNum(input.amount),
      isIncome: input.isIncome,
      paymentMethod: bankAcc ? (bankAcc.alias ?? 'Transferencia') : 'Efectivo',
      bankAccountId: input.bankAccountId ?? null,
      bankAccountAlias: bankAcc?.alias ?? null,
      shift: currentShift,
      tableNumber: null,
      updatedAt: utc.toISOString(),
    });

    return transaction;
  }).then((t) => plain(t));
}

export function notFoundCompanyShiftError() {
  return new AppError('El turno vigente de la empresa no existe.', 404, 'NOT_FOUND');
}
