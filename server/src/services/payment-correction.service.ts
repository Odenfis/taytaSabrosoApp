import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { AppError, plain, toNum } from '../lib/utils.js';
import { emitTransactionChanged } from '../lib/realtime.js';

export interface CorrectPaymentInput {
  transactionId: string;
  correctionId: string;
  operatorId: string;
  supervisorPin: string;
  expectedMethodId: string | null;
  expectedBankAccountId: string | null;
  expectedReference: string | null;
  newMethodId: string;
  referenceNumber: string | null;
  reason: string;
}

export async function listPaymentCorrections(transactionId: string) {
  return plain(await prisma.paymentCorrection.findMany({
    where: { transactionId },
    include: { operator: { select: { id: true, name: true } }, authorizer: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  }));
}

export async function correctPayment(input: CorrectPaymentInput) {
  // Verify authority before taking financial locks. The PIN is never logged or persisted.
  const subject = await prisma.transaction.findUnique({ where: { id: input.transactionId }, select: { companyId: true } });
  if (!subject?.companyId) throw new AppError('Cobro no encontrado.', 404, 'NOT_FOUND');
  const operator = await prisma.user.findUnique({ where: { id: input.operatorId } });
  if (!operator || !operator.isActive || operator.isDeleted ||
      (operator.assignedCompanyId && operator.assignedCompanyId !== subject.companyId) ||
      (operator.companyId && operator.companyId !== subject.companyId)) {
    throw new AppError('No tiene acceso a esta empresa.', 403, 'FORBIDDEN');
  }
  const supervisors = await prisma.user.findMany({ where: { role: 'Administrador', isActive: true, isDeleted: false,
    OR: [{ assignedCompanyId: subject.companyId }, { assignedCompanyId: null }],
    AND: [{ OR: [{ companyId: subject.companyId }, { companyId: null }] }],
  } });
  let authorizer = null;
  for (const user of supervisors) {
    if (await bcrypt.compare(input.supervisorPin, user.pinHash)) { authorizer = user; break; }
  }
  if (!authorizer) throw new AppError('PIN de administrador incorrecto.', 403, 'INVALID_SUPERVISOR_PIN');
  if (input.supervisorPin === '1004') throw new AppError('El administrador debe cambiar el PIN inicial en Configuración antes de autorizar correcciones.', 403, 'DEFAULT_SUPERVISOR_PIN');

  const result = await prisma.$transaction(async (db) => {
    // Serializes all corrections of the same sale, even from different terminals.
    await db.$queryRaw`SELECT [id] FROM [dbo].[transacciones] WITH (UPDLOCK, HOLDLOCK) WHERE [id] = ${input.transactionId}`;
    const prior = await db.paymentCorrection.findUnique({ where: { id: input.correctionId } });
    if (prior) {
      if (prior.transactionId !== input.transactionId || prior.operatorId !== input.operatorId ||
          prior.newMethodId !== input.newMethodId || prior.newReference !== (input.referenceNumber?.trim() || null)) {
        throw new AppError('Identificador de corrección ya utilizado.', 409, 'CORRECTION_ID_CONFLICT');
      }
      return { correction: prior, changed: false };
    }
    const transaction = await db.transaction.findUnique({ where: { id: input.transactionId } });
    const order = transaction?.orderId ? await db.order.findUnique({ where: { id: transaction.orderId } }) : null;
    if (!transaction || !order || transaction.isDeleted || order.isDeleted || order.status !== 'cobrado' ||
        !transaction.type.startsWith('Venta (') || !transaction.isIncome || transaction.companyId !== order.companyId) {
      throw new AppError('Solo se puede corregir una venta cobrada.', 409, 'NOT_PAID_SALE');
    }
    if ((transaction.customPaymentMethodId ?? null) !== input.expectedMethodId ||
        (transaction.bankAccountId ?? null) !== input.expectedBankAccountId ||
        (transaction.referenceNumber ?? null) !== input.expectedReference) {
      throw new AppError('Otro usuario cambió este cobro. Actualice Libro de Caja.', 409, 'PAYMENT_CHANGED');
    }
    const method = await db.customPaymentMethod.findFirst({ where: { id: input.newMethodId, isActive: true, isDeleted: false,
      OR: [{ companyId: order.companyId }, { companyId: null }] } });
    if (!method || method.category === 'Crédito') throw new AppError('Método de pago no disponible.', 400, 'INVALID_METHOD');
    const newBankId = method.bankAccountId ?? null;
    if ((method.category === 'Efectivo' && newBankId) || (method.category !== 'Efectivo' && !newBankId)) {
      throw new AppError('El método no tiene una cuenta de destino válida.', 400, 'INVALID_METHOD_ACCOUNT');
    }
    const newBank = newBankId ? await db.bankAccount.findUnique({ where: { id: newBankId } }) : null;
    if (newBankId && (!newBank || newBank.companyId !== order.companyId || !newBank.isActive || newBank.isDeleted || newBank.currency !== 'PEN')) {
      throw new AppError('Cuenta bancaria no disponible para esta empresa en soles.', 400, 'INVALID_BANK_ACCOUNT');
    }
    if (transaction.bankAccountId) {
      const oldBank = await db.bankAccount.findUnique({ where: { id: transaction.bankAccountId } });
      if (!oldBank || oldBank.companyId !== order.companyId || oldBank.currency !== 'PEN') {
        throw new AppError('Cuenta bancaria anterior inválida.', 409, 'INVALID_OLD_ACCOUNT');
      }
    }
    const reference = input.referenceNumber?.trim() || null;
    if (method.requiresReferenceNumber && !reference) throw new AppError('Ingrese el número de operación.', 400, 'REFERENCE_REQUIRED');
    if (newBankId === transaction.bankAccountId && method.id === transaction.customPaymentMethodId && reference === (transaction.referenceNumber ?? null)) {
      throw new AppError('No hay cambios para corregir.', 400, 'NO_CHANGE');
    }

    const amount = toNum(transaction.amount);
    if (transaction.bankAccountId && transaction.bankAccountId !== newBankId) {
      await db.bankAccount.update({ where: { id: transaction.bankAccountId }, data: { currentBalance: { decrement: amount } } });
    }
    if (newBankId && newBankId !== transaction.bankAccountId) {
      await db.bankAccount.update({ where: { id: newBankId }, data: { currentBalance: { increment: amount } } });
    }
    const shift = await db.companyShift.findUnique({ where: { companyId: order.companyId } });
    const closedShift = !shift || transaction.timestamp < shift.openedUtc || transaction.shift !== shift.currentShift;
    const cashDelta = (transaction.bankAccountId ? 0 : -amount) + (newBankId ? 0 : amount);
    let adjustmentTransactionId: string | null = null;
    if (closedShift && cashDelta !== 0) {
      const now = new Date();
      adjustmentTransactionId = randomUUID();
      await db.transaction.create({ data: {
        id: adjustmentTransactionId, companyId: order.companyId, time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        date: 'Hoy', timestamp: now, type: 'Reclasificación de Pago',
        description: `Ajuste de caja por corrección del ticket #${order.ticketNumber}`,
        amount: Math.abs(cashDelta), isIncome: cashDelta > 0, shift: shift?.currentShift ?? 'Día',
        clientOpId: randomUUID(),
      } });
    }
    const alias = newBank?.alias ?? null;
    const ticketSuffix = transaction.description.match(/ - Ticket #.*$/)?.[0] ?? ` - Ticket #${order.ticketNumber}`;
    const description = `Pago ${method.name}${alias ? ` (${alias})` : ''}${ticketSuffix}`;
    await db.transaction.update({ where: { id: transaction.id }, data: {
      paymentMethod: method.name, customPaymentMethodId: method.id, bankAccountId: newBankId,
      bankAccountAlias: alias, referenceNumber: reference, description,
    } });
    await db.order.update({ where: { id: order.id }, data: {
      paymentMethod: method.name,
      amountReceived: !newBankId && !transaction.bankAccountId ? order.amountReceived : amount,
      change: !newBankId && !transaction.bankAccountId ? order.change : 0,
    } });
    const correction = await db.paymentCorrection.create({ data: {
      id: input.correctionId, companyId: order.companyId, transactionId: transaction.id,
      operatorId: operator.id, authorizerId: authorizer.id,
      oldMethodId: transaction.customPaymentMethodId, oldMethodName: transaction.paymentMethod,
      oldBankAccountId: transaction.bankAccountId, oldBankAccountAlias: transaction.bankAccountAlias,
      oldReference: transaction.referenceNumber, oldAmountReceived: order.amountReceived, oldChange: order.change,
      newMethodId: method.id, newMethodName: method.name, newBankAccountId: newBankId,
      newBankAccountAlias: alias, newReference: reference, reason: input.reason.trim(), amount, closedShift,
      adjustmentTransactionId,
    } });
    return { correction, changed: true };
  }, { timeout: 15000 });
  if (result.changed) emitTransactionChanged(subject.companyId, {
    transactionId: input.transactionId, companyId: subject.companyId, type: 'Corrección de pago',
    amount: toNum(result.correction.amount), isIncome: true, paymentMethod: result.correction.newMethodName,
    bankAccountId: result.correction.newBankAccountId, bankAccountAlias: result.correction.newBankAccountAlias,
    shift: '', tableNumber: null, updatedAt: new Date().toISOString(),
  });
  return plain(result.correction);
}
