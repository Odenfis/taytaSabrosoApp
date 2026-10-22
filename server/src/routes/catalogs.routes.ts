import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../lib/auth.js';
import { AppError } from '../lib/utils.js';
import { prisma } from '../lib/prisma.js';
import * as master from '../services/master.service.js';
import { recordClientOp, statusForError, type OpEntity } from '../lib/oplog.js';
import type { Request } from 'express';
import { createInsumoSchema, updateInsumoSchema } from '../services/insumo.service.js';
import { createProductSchema, updateProductSchema } from '../services/product.service.js';

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
const companyQuery = z.object({ companyId: z.string().optional() });

// ============ COMPANIES ============
router.get('/companies', async (req, res, next) => {
  try {
    const q = companyQuery.parse(req.query);
    res.json(await master.listCompanies(q.companyId));
  } catch (err) {
    next(err);
  }
});

// ============ TABLES ============
router.get('/tables', async (req, res, next) => {
  try {
    const q = companyQuery.parse(req.query);
    res.json(await master.listTables(q.companyId));
  } catch (err) {
    next(err);
  }
});

router.post('/tables', async (req, res, next) => {
  const op = oplog(req, 'mesa', 'crear_mesa');
  try {
    const body = z
      .object({
        companyId: z.string().min(1),
        number: z.string().min(1),
        capacity: z.number().int().positive(),
        zone: z.string().min(1),
        notes: z.string().optional(),
      })
      .parse(req.body);
    const created = await master.createTable(body);
    op.ok(created);
    res.status(201).json(created);
  } catch (err) {
    op.fail(err);
    next(err);
  }
});

router.patch('/tables/:id', async (req, res, next) => {
  const op = oplog(req, 'mesa', 'actualizar_mesa');
  try {
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        number: z.string().min(1).optional(),
        capacity: z.number().int().positive().optional(),
        zone: z.string().min(1).optional(),
        notes: z.string().nullable().optional(),
        status: z.enum(['libre', 'ocupada', 'por_cobrar']).optional(),
      })
      .parse(req.body);
    const created = await master.updateTable(id, body);
    op.ok(created);
    res.json(created);
  } catch (err) {
    op.fail(err);
    next(err);
  }
});

router.delete('/tables/:id', async (req, res, next) => {
  const op = oplog(req, 'mesa', 'eliminar_mesa');
  try {
    const { id } = idParam.parse(req.params);
    const created = await master.deleteTable(id);
    op.ok(created);
    res.json(created);
  } catch (err) {
    op.fail(err);
    next(err);
  }
});

// ============ PRODUCTS ============
router.get('/products', async (req, res, next) => {
  try {
    const q = z
      .object({ companyId: z.string().optional(), category: z.string().optional() })
      .parse(req.query);
    res.json(await master.listProducts(q.companyId, q.category));
  } catch (err) {
    next(err);
  }
});

router.post('/products', async (req, res, next) => {
  const op = oplog(req, 'producto', 'crear_producto');
  try {
    const body = createProductSchema.parse(req.body);
    const created = await master.createProduct(body);
    op.ok(created);
    res.status(201).json(created);
  } catch (err) {
    op.fail(err);
    next(err);
  }
});

router.patch('/products/:id', async (req, res, next) => {
  const op = oplog(req, 'producto', 'actualizar_producto');
  try {
    const { id } = idParam.parse(req.params);
    const body = updateProductSchema.parse(req.body);
    const created = await master.updateProduct(id, body);
    op.ok(created);
    res.json(created);
  } catch (err) {
    op.fail(err);
    next(err);
  }
});

router.delete('/products/:id', async (req, res, next) => {
  const op = oplog(req, 'producto', 'eliminar_producto');
  try {
    const { id } = idParam.parse(req.params);
    const created = await master.deleteProduct(id);
    op.ok(created);
    res.json(created);
  } catch (err) {
    op.fail(err);
    next(err);
  }
});

// ============ INSUMOS ============
router.get('/insumos', async (req, res, next) => {
  try {
    const q = z
      .object({ companyId: z.string().optional(), category: z.string().optional() })
      .parse(req.query);
    res.json(await master.listInsumos(q.companyId, q.category, req.auth?.user.assignedCompanyId ?? req.auth?.user.companyId));
  } catch (err) {
    next(err);
  }
});

router.post('/insumos', async (req, res, next) => {
  const op = oplog(req, 'insumo', 'crear_insumo');
  try {
    const body = createInsumoSchema.parse(req.body);
    const created = await master.createInsumo(body, req.auth?.user.assignedCompanyId ?? req.auth?.user.companyId);
    op.ok(created);
    res.status(201).json(created);
  } catch (err) {
    op.fail(err);
    next(err);
  }
});

router.patch('/insumos/:id', async (req, res, next) => {
  const op = oplog(req, 'insumo', 'actualizar_insumo');
  try {
    const { id } = idParam.parse(req.params);
    const body = updateInsumoSchema.parse(req.body);
    const created = await master.updateInsumo(id, body, req.auth?.user.assignedCompanyId ?? req.auth?.user.companyId);
    op.ok(created);
    res.json(created);
  } catch (err) {
    op.fail(err);
    next(err);
  }
});

router.delete('/insumos/:id', async (req, res, next) => {
  const op = oplog(req, 'insumo', 'eliminar_insumo');
  try {
    const { id } = idParam.parse(req.params);
    const query = z.object({ expectedVersion: z.coerce.number().int().positive().optional() }).parse(req.query);
    const created = await master.deleteInsumo(id, query.expectedVersion, req.auth?.user.assignedCompanyId ?? req.auth?.user.companyId);
    op.ok(created);
    res.json(created);
  } catch (err) {
    op.fail(err);
    next(err);
  }
});

// ============ RECIPES ============
const recipeIngredientSchema = z.object({
  insumoId: z.string().nullable().optional(),
  insumoName: z.string().min(1),
  quantity: z.number().nonnegative(),
  unit: z.string().min(1),
  costPerUnit: z.number().nonnegative(),
  subtotalCost: z.number().nonnegative(),
});

router.get('/recipes', async (req, res, next) => {
  try {
    const q = companyQuery.parse(req.query);
    res.json(await master.listRecipes(q.companyId));
  } catch (err) {
    next(err);
  }
});

router.post('/recipes', async (req, res, next) => {
  const op = oplog(req, 'receta', 'crear_receta');
  try {
    const body = z
      .object({
        id: z.string().min(1).max(36).optional(),
        companyId: z.string().min(1),
        productId: z.string().nullable().optional(),
        productName: z.string().min(1),
        category: z.string().min(1),
        portions: z.number().int().positive().optional(),
        salePrice: z.number().nonnegative(),
        totalCost: z.number().nonnegative(),
        theoreticalFoodCostPct: z.number().nonnegative(),
        preparationNotes: z.string().nullable().optional(),
        ingredients: z.array(recipeIngredientSchema).default([]),
      })
      .parse(req.body);
    const created = await master.createRecipe(body);
    op.ok(created);
    res.status(201).json(created);
  } catch (err) {
    op.fail(err);
    next(err);
  }
});

router.patch('/recipes/:id', async (req, res, next) => {
  const op = oplog(req, 'receta', 'actualizar_receta');
  try {
    const { id } = idParam.parse(req.params);

    // Verificar existencia antes de validar el cuerpo: si la receta no existe,
    // devolvemos 404 para que el cliente pueda hacer fallback a POST (crear nueva).
    const existing = await prisma.recipe.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('Receta no encontrada.', 404, 'NOT_FOUND');
    }

    const body = z
      .object({
        productId: z.string().nullable().optional(),
        productName: z.string().optional(),
        category: z.string().optional(),
        portions: z.number().int().positive().optional(),
        salePrice: z.number().nonnegative().optional(),
        totalCost: z.number().nonnegative().optional(),
        theoreticalFoodCostPct: z.number().nonnegative().optional(),
        preparationNotes: z.string().nullable().optional(),
        ingredients: z.array(recipeIngredientSchema).optional(),
      })
      .parse(req.body);
    const created = await master.updateRecipe(id, body);
    op.ok(created);
    res.json(created);
  } catch (err) {
    op.fail(err);
    next(err);
  }
});

router.delete('/recipes/:id', async (req, res, next) => {
  const op = oplog(req, 'receta', 'eliminar_receta');
  try {
    const { id } = idParam.parse(req.params);
    const created = await master.deleteRecipe(id);
    op.ok(created);
    res.json(created);
  } catch (err) {
    op.fail(err);
    next(err);
  }
});

// ============ BANK ACCOUNTS ============
router.get('/bank-accounts', async (req, res, next) => {
  try {
    const q = companyQuery.parse(req.query);
    res.json(await master.listBankAccounts(q.companyId));
  } catch (err) {
    next(err);
  }
});

router.post('/bank-accounts', async (req, res, next) => {
  const op = oplog(req, 'cuenta_bancaria', 'crear_cuenta_bancaria');
  try {
    const body = z
      .object({
        companyId: z.string().min(1),
        bankName: z.string().min(1),
        accountNumber: z.string().min(1),
        cci: z.string().optional(),
        accountType: z.enum(['Corriente', 'Ahorros']),
        currency: z.enum(['PEN', 'USD']).default('PEN'),
        holderName: z.string().min(1),
        alias: z.string().min(1),
        currentBalance: z.number().optional(),
        notes: z.string().optional(),
      })
      .parse(req.body);
    const created = await master.createBankAccount(body);
    op.ok(created);
    res.status(201).json(created);
  } catch (err) {
    op.fail(err);
    next(err);
  }
});

router.patch('/bank-accounts/:id', async (req, res, next) => {
  const op = oplog(req, 'cuenta_bancaria', 'actualizar_cuenta_bancaria');
  try {
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        bankName: z.string().optional(),
        accountNumber: z.string().optional(),
        cci: z.string().nullable().optional(),
        accountType: z.enum(['Corriente', 'Ahorros']).optional(),
        currency: z.enum(['PEN', 'USD']).optional(),
        holderName: z.string().optional(),
        alias: z.string().optional(),
        currentBalance: z.number().optional(),
        isActive: z.boolean().optional(),
        notes: z.string().nullable().optional(),
      })
      .parse(req.body);
    const created = await master.updateBankAccount(id, body);
    op.ok(created);
    res.json(created);
  } catch (err) {
    op.fail(err);
    next(err);
  }
});

router.delete('/bank-accounts/:id', async (req, res, next) => {
  const op = oplog(req, 'cuenta_bancaria', 'eliminar_cuenta_bancaria');
  try {
    const { id } = idParam.parse(req.params);
    const created = await master.deleteBankAccount(id);
    op.ok(created);
    res.json(created);
  } catch (err) {
    op.fail(err);
    next(err);
  }
});

// ============ PAYMENT METHODS ============
router.get('/payment-methods', async (req, res, next) => {
  try {
    const q = companyQuery.parse(req.query);
    res.json(await master.listPaymentMethods(q.companyId));
  } catch (err) {
    next(err);
  }
});

router.post('/payment-methods', async (req, res, next) => {
  const op = oplog(req, 'metodo_pago', 'crear_metodo_pago');
  try {
    const body = z
      .object({
        companyId: z.string().nullable().optional(), // null = 'ambas'
        name: z.string().min(1),
        category: z.string().min(1),
        bankAccountId: z.string().optional(),
        commissionPct: z.number().nonnegative().optional(),
        requiresReferenceNumber: z.boolean().optional(),
        icon: z.string().optional(),
      })
      .parse(req.body);
    const created = await master.createPaymentMethod(body);
    op.ok(created);
    res.status(201).json(created);
  } catch (err) {
    op.fail(err);
    next(err);
  }
});

router.patch('/payment-methods/:id', async (req, res, next) => {
  const op = oplog(req, 'metodo_pago', 'actualizar_metodo_pago');
  try {
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        companyId: z.string().nullable().optional(),
        name: z.string().optional(),
        category: z.string().optional(),
        bankAccountId: z.string().nullable().optional(),
        commissionPct: z.number().nullable().optional(),
        requiresReferenceNumber: z.boolean().optional(),
        icon: z.string().optional(),
        isActive: z.boolean().optional(),
      })
      .parse(req.body);
    const created = await master.updatePaymentMethod(id, body);
    op.ok(created);
    res.json(created);
  } catch (err) {
    op.fail(err);
    next(err);
  }
});

router.delete('/payment-methods/:id', async (req, res, next) => {
  const op = oplog(req, 'metodo_pago', 'eliminar_metodo_pago');
  try {
    const { id } = idParam.parse(req.params);
    const created = await master.deletePaymentMethod(id);
    op.ok(created);
    res.json(created);
  } catch (err) {
    op.fail(err);
    next(err);
  }
});

// ============ PRINTERS ============
router.get('/printers', async (req, res, next) => {
  try {
    const q = companyQuery.parse(req.query);
    res.json(await master.listPrinters(q.companyId));
  } catch (err) {
    next(err);
  }
});

router.post('/printers', async (req, res, next) => {
  const op = oplog(req, 'impresora', 'crear_impresora');
  try {
    const body = z
      .object({
        companyId: z.string().nullable().optional(),
        name: z.string().min(1),
        role: z.enum(['cocina_fria', 'cocina_caliente', 'barra', 'caja']),
        connectionType: z.enum(['LAN_TCP', 'USB', 'BLUETOOTH', 'BROWSER_PRINT']),
        ipAddress: z.string().optional(),
        port: z.number().int().optional(),
        paperWidth: z.enum(['80mm', '58mm']).optional(),
        autoCut: z.boolean().optional(),
        beepOnPrint: z.boolean().optional(),
        categories: z.array(z.string()).optional(),
      })
      .parse(req.body);
    const created = await master.createPrinter(body);
    op.ok(created);
    res.status(201).json(created);
  } catch (err) {
    op.fail(err);
    next(err);
  }
});

router.patch('/printers/:id', async (req, res, next) => {
  const op = oplog(req, 'impresora', 'actualizar_impresora');
  try {
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        name: z.string().optional(),
        role: z.enum(['cocina_fria', 'cocina_caliente', 'barra', 'caja']).optional(),
        connectionType: z.enum(['LAN_TCP', 'USB', 'BLUETOOTH', 'BROWSER_PRINT']).optional(),
        ipAddress: z.string().nullable().optional(),
        port: z.number().int().nullable().optional(),
        paperWidth: z.enum(['80mm', '58mm']).optional(),
        autoCut: z.boolean().optional(),
        beepOnPrint: z.boolean().optional(),
        status: z.enum(['online', 'offline']).optional(),
        isEnabled: z.boolean().optional(),
        categories: z.array(z.string()).optional(),
      })
      .parse(req.body);
    const created = await master.updatePrinter(id, body);
    op.ok(created);
    res.json(created);
  } catch (err) {
    op.fail(err);
    next(err);
  }
});

router.delete('/printers/:id', async (req, res, next) => {
  const op = oplog(req, 'impresora', 'eliminar_impresora');
  try {
    const { id } = idParam.parse(req.params);
    const created = await master.deletePrinter(id);
    op.ok(created);
    res.json(created);
  } catch (err) {
    op.fail(err);
    next(err);
  }
});

export default router;