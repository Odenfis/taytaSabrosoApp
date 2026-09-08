import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../lib/auth';
import {
  openOrderForTable,
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
} from '../services/order.service';
import { createPurchase, regularizePurchase, listPurchases } from '../services/purchase.service';
import { addKardexAdjustment, listKardex } from '../services/kardex.service';
import {
  switchCompanyShift,
  listShiftRecords,
  listTransactions,
  createManualTransaction,
} from '../services/shift.service';

const router = Router();
router.use(requireAuth);

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
  try {
    const body = z
      .object({ tableId: z.string().min(1), waiter: z.string().optional(), clientOpId: z.string().optional() })
      .parse(req.body);
    res.status(201).json(await openOrderForTable(body.tableId, body));
  } catch (err) {
    next(err);
  }
});

router.post('/orders/quick-bar', async (req, res, next) => {
  try {
    const body = z
      .object({ companyId: z.string().min(1), waiter: z.string().optional(), clientOpId: z.string().optional() })
      .parse(req.body);
    res.status(201).json(await createQuickBarOrder(body));
  } catch (err) {
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
  try {
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        productId: z.string().min(1),
        quantity: z.number().positive().optional(),
        notes: z.string().optional(),
      })
      .parse(req.body);
    res.status(201).json(await addItemToOrder(id, body));
  } catch (err) {
    next(err);
  }
});

router.patch('/orders/:id/items/:itemId/quantity', async (req, res, next) => {
  try {
    const params = z
      .object({ id: z.string().min(1), itemId: z.string().min(1) })
      .parse(req.params);
    const body = z.object({ delta: z.number().finite() }).parse(req.body);
    res.json(await updateItemQuantity(params.id, params.itemId, body.delta));
  } catch (err) {
    next(err);
  }
});

router.patch('/orders/:id/items/:itemId/notes', async (req, res, next) => {
  try {
    const params = z
      .object({ id: z.string().min(1), itemId: z.string().min(1) })
      .parse(req.params);
    const body = z.object({ notes: z.string() }).parse(req.body);
    res.json(await updateItemNotes(params.id, params.itemId, body.notes));
  } catch (err) {
    next(err);
  }
});

router.delete('/orders/:id/items/:itemId', async (req, res, next) => {
  try {
    const params = z
      .object({ id: z.string().min(1), itemId: z.string().min(1) })
      .parse(req.params);
    res.json(await removeItemFromOrder(params.id, params.itemId));
  } catch (err) {
    next(err);
  }
});

router.post('/orders/:id/send-to-kitchen', async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);
    res.json(await sendToKitchen(id));
  } catch (err) {
    next(err);
  }
});

// ============ PAGO / COBRO ============
router.post('/tables/:id/por-cobrar', async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);
    res.json(await markTableForBilling(id));
  } catch (err) {
    next(err);
  }
});

router.post('/tables/:id/pay', async (req, res, next) => {
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
    res.json(await payTable(id, body));
  } catch (err) {
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
  } catch (err) {
    next(err);
  }
});

router.post('/purchases/:id/regularize', async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        invoiceNumber: z.string().min(1),
        supplierRuc: z.string().min(1),
        notes: z.string().optional(),
      })
      .parse(req.body);
    res.json(
      await regularizePurchase(id, {
        ...body,
        operator: req.auth!.user.name,
      })
    );
  } catch (err) {
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
  } catch (err) {
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
    res.json(
      await switchCompanyShift({
        ...body,
        operator: req.auth!.user.name,
      })
    );
  } catch (err) {
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
  } catch (err) {
    next(err);
  }
});

export default router;