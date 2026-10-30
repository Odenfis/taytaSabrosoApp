import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../lib/auth.js';
import {
  openOrderForTable,
  cancelOrderOpening,
  syncOpeningItems,
  createQuickBarOrder,
  getOrder,
  addItemToOrder,
  updateItemQuantity,
  updateItemNotes,
  removeItemFromOrder,
  sendToKitchen,
  markTableForBilling,
  payTable,
  listActiveOrders,
} from '../services/order.service.js';
import { createPurchase, regularizePurchase, listPurchases } from '../services/purchase.service.js';
import { addKardexAdjustment, listKardex } from '../services/kardex.service.js';
import {
  switchCompanyShift,
  listShiftRecords,
  listTransactions,
  createManualTransaction,
} from '../services/shift.service.js';
import { notifyOrderState, notifyTableState } from '../lib/realtime.js';
import { correctPayment, listPaymentCorrections } from '../services/payment-correction.service.js';
import { createDinerBills, getDinerBills, payDinerBill } from '../services/diner-bill.service.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/utils.js';
import { recordClientOp, statusForError, type OpEntity } from '../lib/oplog.js';
import type { Request } from 'express';

const router = Router();
router.use(requireAuth);

// Ledger de operaciones (operaciones_cliente): APPLIED tras el servicio, FAILED_* en fallos.
function oplog(req: Request, entity: OpEntity, operation: string) {
  return {
    ok: (result?: unknown) =>
      void recordClientOp(req, { entity, operation }, { status: 'APLICADO', result }),
    fail: (err: unknown) =>
      void recordClientOp(req, { entity, operation }, { status: statusForError(err), error: err }),
  };
}

const idParam = z.object({ id: z.string().min(1) });
async function assertDinerOrderAccess(req: Request, orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { companyId: true } });
  if (!order) throw new AppError('Comanda no encontrada.', 404, 'ORDER_NOT_FOUND');
  const user = req.auth!.user;
  if ((user.companyId && user.companyId !== order.companyId) ||
      (user.assignedCompanyId && user.assignedCompanyId !== order.companyId)) {
    throw new AppError('No tiene acceso a esta empresa.', 403, 'FORBIDDEN');
  }
}

router.get('/orders/:id/bills', async (req, res, next) => {
  try { const { id } = idParam.parse(req.params); await assertDinerOrderAccess(req, id); res.json(await getDinerBills(id)); } catch (err) { next(err); }
});

router.post('/orders/:id/bills', async (req, res, next) => {
  const op = oplog(req, 'pedido', 'repartir_cuenta');
  try {
    const { id } = idParam.parse(req.params);
    await assertDinerOrderAccess(req, id);
    const body = z.object({ clientOpId: z.string().uuid(), bills: z.array(z.object({ id: z.string().uuid(), label: z.string().trim().min(1).max(100), documentType: z.enum(['ticket', 'boleta', 'factura']), recipientName: z.string().max(200).optional(), recipientId: z.string().max(20).optional(), items: z.array(z.object({ orderItemId: z.string().min(1), quantity: z.number().int().positive() })) })).min(1).max(50) }).parse(req.body);
    const result = await createDinerBills(id, body.bills, body.clientOpId);
    op.ok(result); res.status(201).json(result);
    void notifyOrderState(id).catch(() => undefined);
  } catch (err) { op.fail(err); next(err); }
});

router.post('/bills/:id/pay', async (req, res, next) => {
  const op = oplog(req, 'pedido', 'abonar_cuenta');
  try {
    const { id } = idParam.parse(req.params);
    const bill = await prisma.dinerBill.findUnique({ where: { id }, select: { orderId: true } });
    if (!bill) throw new AppError('Cuenta no encontrada.', 404, 'BILL_NOT_FOUND');
    await assertDinerOrderAccess(req, bill.orderId);
    const body = z.object({ amount: z.number().positive(), amountReceived: z.number().positive(), customPaymentMethodId: z.string().min(1), referenceNumber: z.string().max(100).optional(), contributorName: z.string().max(100).optional(), clientOpId: z.string().uuid() }).parse(req.body);
    const result = await payDinerBill(id, body);
    op.ok(result); res.json(result);
    void notifyOrderState(result.bill.orderId).catch(() => undefined);
  } catch (err) { op.fail(err); next(err); }
});

// ============ ORDERS ============
router.get('/orders/active', async (req, res, next) => {
  try {
    const q = z.object({ companyId: z.string().optional() }).parse(req.query);
    res.json(await listActiveOrders(q.companyId));
  } catch (err) {
    next(err);
  }
});

router.post('/orders/open', async (req, res, next) => {
  const op = oplog(req, 'pedido', 'abrir_pedido');
  try {
    const body = z
      .object({ tableId: z.string().min(1), waiter: z.string().optional(), clientOpId: z.string().optional() })
      .parse(req.body);
    const order = await openOrderForTable(body.tableId, body);
    op.ok(order);
    res.status(201).json(order);
    void notifyOrderState((order as { id: string }).id).catch(() => undefined);
  } catch (err) {
    op.fail(err);
    next(err);
  }
});

router.post('/orders/opening-items', async (req, res, next) => {
  try {
    const body = z.object({ openingClientOpId: z.string().min(1).max(36), items: z.array(z.object({
      productId: z.string().min(1), quantity: z.number().positive(), notes: z.string().optional(),
    })) }).parse(req.body);
    const order = await syncOpeningItems(body.openingClientOpId, body.items);
    res.json(order);
    void notifyOrderState(order.id).catch(() => undefined);
  } catch (err) { next(err); }
});

router.post('/orders/cancel-opening', async (req, res, next) => {
  const op = oplog(req, 'pedido', 'cancelar_apertura');
  try {
    const body = z.object({ openingClientOpId: z.string().min(1).max(36) }).parse(req.body);
    const order = await cancelOrderOpening(body.openingClientOpId);
    op.ok(order);
    res.json(order);
    if (order.id) void notifyOrderState(order.id).catch(() => undefined);
  } catch (err) { op.fail(err); next(err); }
});

router.post('/orders/quick-bar', async (req, res, next) => {
  const op = oplog(req, 'pedido', 'abrir_barra_rapida');
  try {
    const body = z
      .object({ companyId: z.string().min(1), zone: z.enum(['Barra', 'Delivery', 'Llevar']).optional(), waiter: z.string().optional(), clientOpId: z.string().optional() })
      .parse(req.body);
    const order = await createQuickBarOrder(body);
    op.ok(order);
    res.status(201).json(order);
    void notifyOrderState((order as { id: string }).id).catch(() => undefined);
  } catch (err) {
    op.fail(err);
    next(err);
  }
});

router.get('/orders/:id', async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);
    res.json(await getOrder(id));
  } catch (err) {
    next(err);
  }
});

router.post('/orders/:id/items', async (req, res, next) => {
  const op = oplog(req, 'linea_pedido', 'agregar_item');
  try {
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        productId: z.string().min(1),
        quantity: z.number().positive().optional(),
        notes: z.string().optional(),
      })
      .parse(req.body);
    const order = await addItemToOrder(id, body);
    op.ok(order);
    res.status(201).json(order);
    void notifyOrderState((order as { id: string }).id ?? id).catch(() => undefined);
  } catch (err) {
    op.fail(err);
    next(err);
  }
});

router.patch('/orders/:id/items/:itemId/quantity', async (req, res, next) => {
  const op = oplog(req, 'linea_pedido', 'actualizar_cantidad');
  try {
    const params = z
      .object({ id: z.string().min(1), itemId: z.string().min(1) })
      .parse(req.params);
    const body = z.object({ delta: z.number().finite(), clientOpId: z.string().max(36).optional() }).parse(req.body);
    const order = await updateItemQuantity(params.id, params.itemId, body.delta, body.clientOpId);
    op.ok(order);
    res.json(order);
    void notifyOrderState((order as { id: string }).id ?? params.id).catch(() => undefined);
  } catch (err) {
    op.fail(err);
    next(err);
  }
});

router.patch('/orders/:id/items/:itemId/notes', async (req, res, next) => {
  const op = oplog(req, 'linea_pedido', 'actualizar_notas');
  try {
    const params = z
      .object({ id: z.string().min(1), itemId: z.string().min(1) })
      .parse(req.params);
    const body = z.object({ notes: z.string() }).parse(req.body);
    res.json(await updateItemNotes(params.id, params.itemId, body.notes));
    op.ok();
    void notifyOrderState(params.id).catch(() => undefined);
  } catch (err) {
    op.fail(err);
    next(err);
  }
});

router.delete('/orders/:id/items/:itemId', async (req, res, next) => {
  const op = oplog(req, 'linea_pedido', 'quitar_item');
  try {
    const params = z
      .object({ id: z.string().min(1), itemId: z.string().min(1) })
      .parse(req.params);
    const query = z.object({ clientOpId: z.string().max(36).optional() }).parse(req.query);
    const order = await removeItemFromOrder(params.id, params.itemId, query.clientOpId);
    op.ok(order);
    res.json(order);
    void notifyOrderState((order as { id: string }).id ?? params.id).catch(() => undefined);
  } catch (err) {
    op.fail(err);
    next(err);
  }
});

router.post('/orders/:id/send-to-kitchen', async (req, res, next) => {
  const op = oplog(req, 'pedido', 'enviar_cocina');
  try {
    const { id } = idParam.parse(req.params);
    const body = z.object({ clientOpId: z.string().optional() }).parse(req.body ?? {});
    const result = await sendToKitchen(id, body);
    op.ok(result);
    res.json(result);
    void notifyOrderState((result as { order: { id: string } }).order?.id ?? id).catch(() => undefined);
  } catch (err) {
    op.fail(err);
    next(err);
  }
});

// ============ PAGO / COBRO ============
router.post('/tables/:id/por-cobrar', async (req, res, next) => {
  const op = oplog(req, 'pedido', 'marcar_por_cobrar');
  try {
    const { id } = idParam.parse(req.params);
    const order = await markTableForBilling(id);
    op.ok(order);
    res.json(order);
    void notifyTableState(id).catch(() => undefined);
  } catch (err) {
    op.fail(err);
    next(err);
  }
});

router.post('/tables/:id/pay', async (req, res, next) => {
  const op = oplog(req, 'pedido', 'cobrar_mesa');
  try {
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        paymentMethod: z.string().min(1),
        amountReceived: z.number().nonnegative(),
        customPaymentMethodId: z.string().optional(),
        referenceNumber: z.string().optional(),
        clientOpId: z.string().optional(),
      })
      .parse(req.body);
    const result = await payTable(id, body);
    op.ok(result);
    res.json(result);
    void notifyTableState(id).catch(() => undefined);
  } catch (err) {
    op.fail(err);
    next(err);
  }
});

// ============ PURCHASES ============
router.get('/purchases', async (req, res, next) => {
  try {
    const q = z.object({ companyId: z.string().optional() }).parse(req.query);
    res.json(await listPurchases(q.companyId));
  } catch (err) {
    next(err);
  }
});

router.post('/purchases', async (req, res, next) => {
  const op = oplog(req, 'compra', 'crear_compra');
  try {
    const itemSchema = z.object({
      insumoId: z.string().nullable().optional(),
      insumoName: z.string().min(1),
      quantity: z.number().positive(),
      unit: z.string().min(1),
      unitCost: z.number().nonnegative(),
      discount: z.number().nonnegative().optional(),
      totalCost: z.number().nonnegative(),
    });
    const body = z
      .object({
        companyId: z.string().min(1),
        category: z.enum(['insumos', 'productos_reventa', 'gastos_operativos']).optional(),
        documentStatus: z.enum(['provisional', 'regularizado']).optional(),
        provisionalNoteNumber: z.string().optional(),
        invoiceNumber: z.string().min(1),
        supplierName: z.string().min(1),
        supplierRuc: z.string().min(1),
        shift: z.enum(['Día', 'Noche']).optional(),
        subtotal: z.number().optional(),
        igv: z.number().optional(),
        total: z.number().nonnegative(),
        paymentStatus: z.string().optional(),
        paidFromCash: z.boolean().optional(),
        bankAccountId: z.string().optional(),
        bankAccountAlias: z.string().optional(),
        notes: z.string().optional(),
        clientOpId: z.string().optional(),
        items: z.array(itemSchema),
      })
      .refine((value) => value.documentStatus === 'provisional' || value.items.length > 0, {
        message: 'La compra formal requiere al menos un insumo.', path: ['items'],
      })
      .refine((value) => value.items.length > 0 || value.total > 0, {
        message: 'El vale sin insumos requiere un monto positivo.', path: ['total'],
      })
      .parse(req.body);
    res.status(201).json(await createPurchase(body));
    op.ok();
  } catch (err) {
    op.fail(err);
    next(err);
  }
});

router.post('/purchases/:id/regularize', async (req, res, next) => {
  const op = oplog(req, 'compra', 'regularizar_compra');
  try {
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        invoiceNumber: z.string().min(1),
        supplierRuc: z.string().min(1),
        notes: z.string().optional(),
        clientOpId: z.string().optional(),
        items: z.array(z.object({
          id: z.string().optional(),
          insumoId: z.string().min(1), insumoName: z.string().min(1),
          quantity: z.number().positive(), unit: z.string().min(1),
          unitCost: z.number().nonnegative(), totalCost: z.number().nonnegative(),
          discount: z.number().nonnegative().optional(),
        })).optional(),
      })
      .parse(req.body);
    const regularized = await regularizePurchase(id, {
      ...body,
      operator: req.auth!.user.name,
    });
    op.ok(regularized);
    res.json(regularized);
  } catch (err) {
    op.fail(err);
    next(err);
  }
});

// ============ KARDEX ============
router.get('/kardex', async (req, res, next) => {
  try {
    const q = z
      .object({ companyId: z.string().optional(), insumoId: z.string().optional() })
      .parse(req.query);
    res.json(await listKardex(q.companyId, q.insumoId));
  } catch (err) {
    next(err);
  }
});

router.post('/kardex/adjustments', async (req, res, next) => {
  const op = oplog(req, 'movimiento_kardex', 'ajustar_kardex');
  try {
    const body = z
      .object({
        insumoId: z.string().min(1),
        quantity: z.number().finite(),
        type: z.enum(['AJUSTE_MERMA', 'ENTRADA_COMPRA']),
        reason: z.string().min(1),
        companyId: z.string().optional(),
        clientOpId: z.string().optional(),
      })
      .parse(req.body);
    res.status(201).json(await addKardexAdjustment(body));
    op.ok();
  } catch (err) {
    op.fail(err);
    next(err);
  }
});

// ============ SHIFTS ============
router.get('/shifts/records', async (req, res, next) => {
  try {
    const q = z.object({ companyId: z.string().optional() }).parse(req.query);
    res.json(await listShiftRecords(q.companyId));
  } catch (err) {
    next(err);
  }
});

router.post('/shifts/switch', async (req, res, next) => {
  const op = oplog(req, 'turno', 'cambiar_turno');
  try {
    const body = z
      .object({
        companyId: z.string().min(1),
        targetShift: z.enum(['Día', 'Noche']),
        reportedCash: z.number().nonnegative(),
        initialCashForNext: z.number().nonnegative(),
        notes: z.string().optional(),
        clientOpId: z.string().optional(),
      })
      .parse(req.body);
    const shiftResult = await switchCompanyShift({
      ...body,
      operator: req.auth!.user.name,
    });
    op.ok(shiftResult);
    res.json(shiftResult);
  } catch (err) {
    op.fail(err);
    next(err);
  }
});

// ============ TRANSACTIONS (Libro de Caja) ============
router.get('/transactions', async (req, res, next) => {
  try {
    const q = z.object({ companyId: z.string().optional() }).parse(req.query);
    res.json(await listTransactions(q.companyId));
  } catch (err) {
    next(err);
  }
});

// Transacciones manuales de Caja (Caja Chica / Retiro de Caja / Ingreso Extra / Ajuste de Saldo)
router.get('/transactions/:id/corrections', async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);
    const sale = await prisma.transaction.findUnique({ where: { id }, select: { companyId: true } });
    const user = req.auth!.user;
    if (!sale?.companyId || (user.companyId && user.companyId !== sale.companyId) ||
        (user.assignedCompanyId && user.assignedCompanyId !== sale.companyId)) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Cobro no encontrado.' } }); return;
    }
    res.json(await listPaymentCorrections(id));
  } catch (err) { next(err); }
});

router.post('/transactions/:id/corrections', async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);
    const body = z.object({
      correctionId: z.string().uuid(), supervisorPin: z.string().min(1).max(100),
      expectedMethodId: z.string().nullable(), expectedBankAccountId: z.string().nullable(),
      expectedReference: z.string().nullable(), newMethodId: z.string().min(1),
      referenceNumber: z.string().max(100).nullable(), reason: z.string().trim().min(5).max(500),
    }).parse(req.body);
    res.status(201).json(await correctPayment({
      transactionId: id, operatorId: req.auth!.user.id, correctionId: body.correctionId,
      supervisorPin: body.supervisorPin, expectedMethodId: body.expectedMethodId ?? null,
      expectedBankAccountId: body.expectedBankAccountId ?? null,
      expectedReference: body.expectedReference ?? null, newMethodId: body.newMethodId,
      referenceNumber: body.referenceNumber ?? null, reason: body.reason,
    }));
  } catch (err) { next(err); }
});

router.post('/transactions', async (req, res, next) => {
  const op = oplog(req, 'transaccion', 'crear_transaccion');
  try {
    const body = z
      .object({
        companyId: z.string().min(1),
        type: z.string().min(1),
        description: z.string().min(1),
        amount: z.number().nonnegative(),
        isIncome: z.boolean(),
        bankAccountId: z.string().optional(),
        customPaymentMethodId: z.string().optional(),
        referenceNumber: z.string().optional(),
        clientOpId: z.string().optional(),
      })
      .parse(req.body);
    res.status(201).json(await createManualTransaction(body));
    op.ok();
  } catch (err) {
    op.fail(err);
    next(err);
  }
});

export default router;
