import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { AppError, plain, toNum } from '../lib/utils.js';
import { emitTransactionChanged } from '../lib/realtime.js';
import { isServiceZone } from '../lib/taytaTableLayout.js';

const cents = (n: number) => Math.round(n * 100);
const money = (n: number) => n / 100;
export interface BillDraft {
  id: string;
  label: string;
  documentType: 'ticket' | 'boleta' | 'factura';
  recipientName?: string;
  recipientId?: string;
  items: { orderItemId: string; quantity: number }[];
}

export async function getDinerBills(orderId: string) {
  return plain(await prisma.dinerBill.findMany({ where: { orderId }, include: {
    items: { include: { orderItem: true } }, transactions: { orderBy: { timestamp: 'asc' } }, order: { select: { ticketNumber: true } },
  }, orderBy: { createdUtc: 'asc' } }));
}

export async function createDinerBills(orderId: string, drafts: BillDraft[], clientOpId: string) {
  if (!drafts.length || drafts.length > 50) throw new AppError('Debe indicar entre 1 y 50 cuentas.', 400, 'INVALID_BILLS');
  return plain(await prisma.$transaction(async (db) => {
    await db.$queryRaw`SELECT [id] FROM [dbo].[pedidos] WITH (UPDLOCK, HOLDLOCK) WHERE [id] = ${orderId}`;
    const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true, dinerBills: true } });
    if (!order || order.isDeleted || order.status !== 'por_cobrar') throw new AppError('La comanda no está lista para repartir.', 409, 'ORDER_NOT_READY');
    if (order.dinerBills.length) {
      const existing = await db.dinerBill.findMany({ where: { orderId }, include: { items: { include: { orderItem: true } }, transactions: true }, orderBy: { createdUtc: 'asc' } });
      const unchanged = existing.length === drafts.length && drafts.every((draft) => {
        const bill = existing.find((b) => b.id === draft.id);
        return !!bill && bill.label === draft.label.trim() && bill.documentType === draft.documentType &&
          (bill.recipientName ?? '') === (draft.recipientName?.trim() ?? '') &&
          (bill.recipientId ?? '') === (draft.recipientId?.trim() ?? '') &&
          bill.items.length === draft.items.length && draft.items.every((line) =>
            bill.items.some((item) => item.orderItemId === line.orderItemId && toNum(item.quantity) === line.quantity));
      });
      if (unchanged) return existing;
      throw new AppError('La comanda ya tiene cuentas. Actualice la mesa.', 409, 'BILLS_EXIST');
    }
    if (await db.transaction.count({ where: { orderId, isDeleted: false } })) throw new AppError('Ya existe un cobro para esta comanda.', 409, 'ALREADY_PAID');
    const assigned = new Map<string, number>();
    const totals = new Map<string, number>();
    const ids = new Set<string>();
    for (const draft of drafts) {
      if (ids.has(draft.id) || !draft.id || !draft.label.trim() || !draft.items.length) throw new AppError('Cuenta inválida o repetida.', 400, 'INVALID_BILLS');
      ids.add(draft.id);
      if (draft.documentType === 'factura' && (!draft.recipientName?.trim() || !/^\d{11}$/.test(draft.recipientId ?? ''))) throw new AppError('Factura: indique razón social y RUC de 11 dígitos.', 400, 'INVALID_RECIPIENT');
      if (draft.documentType === 'boleta' && !draft.recipientName?.trim()) throw new AppError('Boleta: indique el receptor.', 400, 'INVALID_RECIPIENT');
      let sum = 0;
      const seen = new Set<string>();
      for (const line of draft.items) {
        const item = order.items.find((i) => i.id === line.orderItemId);
        if (!item || seen.has(line.orderItemId) || !Number.isInteger(line.quantity) || line.quantity <= 0 || !Number.isInteger(toNum(item.quantity))) throw new AppError('Solo se pueden asignar unidades completas y existentes.', 400, 'INVALID_ITEMS');
        seen.add(line.orderItemId);
        assigned.set(item.id, (assigned.get(item.id) ?? 0) + line.quantity);
        sum += cents(toNum(item.price)) * line.quantity;
      }
      totals.set(draft.id, sum);
    }
    for (const item of order.items) if (assigned.get(item.id) !== toNum(item.quantity)) throw new AppError('Todos los platos deben asignarse una sola vez.', 400, 'UNASSIGNED_ITEMS');
    if ([...totals.values()].reduce((a, b) => a + b, 0) !== cents(toNum(order.total))) throw new AppError('El reparto no coincide con el total.', 409, 'TOTAL_MISMATCH');
    await db.numberingSequence.upsert({ where: { companyId_entity: { companyId: order.companyId, entity: 'diner-bill' } }, create: { companyId: order.companyId, entity: 'diner-bill', lastNumber: 0 }, update: {} });
    for (const draft of drafts) {
      const seq = await db.numberingSequence.update({ where: { companyId_entity: { companyId: order.companyId, entity: 'diner-bill' } }, data: { lastNumber: { increment: 1 } } });
      await db.dinerBill.create({ data: { id: draft.id, orderId, companyId: order.companyId, ticketNumber: String(seq.lastNumber), label: draft.label.trim(), documentType: draft.documentType, recipientName: draft.recipientName?.trim() || null, recipientId: draft.recipientId?.trim() || null, total: money(totals.get(draft.id)!), items: { create: draft.items.map((i) => ({ id: randomUUID(), orderItemId: i.orderItemId, quantity: i.quantity })) } } });
    }
    return db.dinerBill.findMany({ where: { orderId }, include: { items: { include: { orderItem: true } }, transactions: true } });
  }, { timeout: 15000 }));
}

export interface BillPaymentInput { amount: number; amountReceived: number; customPaymentMethodId: string; referenceNumber?: string; contributorName?: string; clientOpId: string; }
export async function payDinerBill(billId: string, input: BillPaymentInput) {
  const result = await prisma.$transaction(async (db) => {
    const existing = await db.transaction.findUnique({ where: { clientOpId: input.clientOpId } });
    if (existing) {
      if (existing.dinerBillId !== billId || cents(toNum(existing.amount)) !== cents(input.amount) ||
          cents(toNum(existing.amountReceived)) !== cents(input.amountReceived) ||
          existing.customPaymentMethodId !== input.customPaymentMethodId ||
          (existing.referenceNumber ?? '') !== (input.referenceNumber?.trim() ?? '') ||
          (existing.contributorName ?? '') !== (input.contributorName?.trim() ?? '')) {
        throw new AppError('Identificador de pago reutilizado.', 409, 'PAYMENT_ID_CONFLICT');
      }
      const existingOrder = existing.orderId ? await db.order.findUnique({ where: { id: existing.orderId } }) : null;
      return { transaction: existing, bill: await db.dinerBill.findUniqueOrThrow({ where: { id: billId }, include: { items: { include: { orderItem: true } }, transactions: true } }), orderClosed: existingOrder?.status === 'cobrado', replay: true };
    }
    const candidate = await db.dinerBill.findUnique({ where: { id: billId } });
    if (!candidate) throw new AppError('Cuenta no encontrada.', 404, 'BILL_NOT_FOUND');
    await db.$queryRaw`SELECT [id] FROM [dbo].[pedidos] WITH (UPDLOCK, HOLDLOCK) WHERE [id] = ${candidate.orderId}`;
    const bill = await db.dinerBill.findUniqueOrThrow({ where: { id: billId }, include: { transactions: true } });
    const order = await db.order.findUniqueOrThrow({ where: { id: bill.orderId }, include: { dinerBills: { include: { transactions: true } } } });
    if (order.status !== 'por_cobrar' || bill.status === 'pagada') throw new AppError('La cuenta ya está cerrada.', 409, 'BILL_CLOSED');
    const paid = bill.transactions.filter((t) => !t.isDeleted).reduce((s, t) => s + cents(toNum(t.amount)), 0);
    const amount = cents(input.amount);
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > cents(toNum(bill.total)) - paid || !Number.isFinite(input.amountReceived) || cents(input.amountReceived) < amount) throw new AppError('Importe fuera del saldo de la cuenta.', 400, 'INVALID_AMOUNT');
    const method = await db.customPaymentMethod.findFirst({ where: { id: input.customPaymentMethodId, isActive: true, isDeleted: false, OR: [{ companyId: order.companyId }, { companyId: null }] } });
    if (!method || method.category === 'Crédito') throw new AppError('Medio de pago no disponible.', 400, 'INVALID_METHOD');
    if (method.requiresReferenceNumber && !input.referenceNumber?.trim()) throw new AppError('Ingrese número de operación.', 400, 'REFERENCE_REQUIRED');
    if (method.category !== 'Efectivo' && cents(input.amountReceived) !== amount) throw new AppError('Solo efectivo admite vuelto.', 400, 'INVALID_RECEIVED');
    const bank = method.bankAccountId ? await db.bankAccount.findUnique({ where: { id: method.bankAccountId } }) : null;
    if ((method.category === 'Efectivo' && bank) || (method.category !== 'Efectivo' && !bank) || (bank && (bank.companyId !== order.companyId || !bank.isActive || bank.isDeleted || bank.currency !== 'PEN'))) throw new AppError('Cuenta destino inválida.', 400, 'INVALID_ACCOUNT');
    const table = order.tableId ? await db.table.findUnique({ where: { id: order.tableId } }) : null;
    if (!table || table.currentOrderId !== order.id) throw new AppError('La mesa cambió. Actualice antes de cobrar.', 409, 'TABLE_CHANGED');
    const now = new Date();
    const shift = await db.companyShift.findUnique({ where: { companyId: order.companyId } });
    const transaction = await db.transaction.create({ data: { id: randomUUID(), companyId: order.companyId, time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), date: 'Hoy', timestamp: now, type: table.zone === 'Barra' ? 'Venta (Barra)' : 'Venta (Mesa)', description: `Pago ${method.name} - Ticket interno #${bill.ticketNumber} / Comanda #${order.ticketNumber}`, amount: money(amount), amountReceived: input.amountReceived, change: money(cents(input.amountReceived) - amount), isIncome: true, paymentMethod: method.name, customPaymentMethodId: method.id, bankAccountId: bank?.id ?? null, bankAccountAlias: bank?.alias ?? null, shift: shift?.currentShift ?? 'Día', referenceNumber: input.referenceNumber?.trim() || null, tableNumber: table.number, orderId: order.id, dinerBillId: bill.id, contributorName: input.contributorName?.trim() || null, ticketNumber: bill.ticketNumber, clientOpId: input.clientOpId } });
    if (bank) await db.bankAccount.update({ where: { id: bank.id }, data: { currentBalance: { increment: money(amount) } } });
    const billClosed = paid + amount === cents(toNum(bill.total));
    if (billClosed) await db.dinerBill.update({ where: { id: bill.id }, data: { status: 'pagada', closedUtc: now } });
    const totalPaid = order.dinerBills.reduce((s, b) => s + b.transactions.filter((t) => !t.isDeleted).reduce((v, t) => v + cents(toNum(t.amount)), 0), 0) + amount;
    const orderClosed = totalPaid === cents(toNum(order.total));
    if (orderClosed) {
      await db.order.update({ where: { id: order.id }, data: { status: 'cobrado', paymentMethod: 'Múltiple', amountReceived: money(totalPaid), change: 0, closedAt: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), closedUtc: now } });
      await db.orderItem.updateMany({ where: { orderId: order.id }, data: { status: 'servido' } });
      await db.table.update({ where: { id: table.id }, data: { status: 'libre', occupiedSince: null, minutesElapsed: null, currentOrderId: null, waiter: null, isDeleted: isServiceZone(table.zone) } });
    }
    return { transaction, bill: await db.dinerBill.findUniqueOrThrow({ where: { id: billId }, include: { items: { include: { orderItem: true } }, transactions: true } }), orderClosed, replay: false };
  }, { timeout: 15000 });
  if (!result.replay) emitTransactionChanged(result.bill.companyId, { transactionId: result.transaction.id, companyId: result.bill.companyId, type: result.transaction.type, amount: toNum(result.transaction.amount), isIncome: true, paymentMethod: result.transaction.paymentMethod ?? '', bankAccountId: result.transaction.bankAccountId, bankAccountAlias: result.transaction.bankAccountAlias, shift: result.transaction.shift ?? '', tableNumber: result.transaction.tableNumber, updatedAt: new Date().toISOString() });
  return plain(result);
}
