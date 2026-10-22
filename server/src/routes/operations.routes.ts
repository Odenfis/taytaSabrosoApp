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
      .object({ companyId: z.string().min(1), waiter: z.string().optional(), clientOpId: z.string().optional() })
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
        items: z.array(itemSchema).min(1),
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