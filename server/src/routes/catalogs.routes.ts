import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../lib/auth';
import { AppError } from '../lib/utils';
import * as master from '../services/master.service';

const router = Router();
router.use(requireAuth);

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
    res.status(201).json(await master.createTable(body));
  } catch (err) {
    next(err);
  }
});

router.patch('/tables/:id', async (req, res, next) => {
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
    res.json(await master.updateTable(id, body));
  } catch (err) {
    next(err);
  }
});

router.delete('/tables/:id', async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);
    res.json(await master.deleteTable(id));
  } catch (err) {
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
  try {
    const body = z
      .object({
        companyId: z.string().min(1),
        name: z.string().min(1),
        description: z.string().default(''),
        price: z.number().nonnegative(),
        category: z.string().min(1),
        image: z.string().default(''),
        available: z.boolean().optional(),
        hasRecipe: z.boolean().optional(),
      })
      .parse(req.body);
    res.status(201).json(await master.createProduct(body));
  } catch (err) {
    next(err);
  }
});

router.patch('/products/:id', async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        price: z.number().nonnegative().optional(),
        category: z.string().optional(),
        image: z.string().optional(),
        available: z.boolean().optional(),
        hasRecipe: z.boolean().optional(),
      })
      .parse(req.body);
    res.json(await master.updateProduct(id, body));
  } catch (err) {
    next(err);
  }
});

router.delete('/products/:id', async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);
    res.json(await master.deleteProduct(id));
  } catch (err) {
    next(err);
  }
});

// ============ INSUMOS ============
router.get('/insumos', async (req, res, next) => {
  try {
    const q = z
      .object({ companyId: z.string().optional(), category: z.string().optional() })
      .parse(req.query);
    res.json(await master.listInsumos(q.companyId, q.category));
  } catch (err) {
    next(err);
  }
});

router.post('/insumos', async (req, res, next) => {
  try {
    const body = z
      .object({
        companyId: z.string().nullable().optional(), // null = 'ambas'
        name: z.string().min(1),
        category: z.string().min(1),
        unit: z.string().min(1),
        currentStock: z.number().nonnegative(),
        minStock: z.number().nonnegative().default(0),
        costPerUnit: z.number().nonnegative(),
        lastPurchaseDate: z.string().optional(),
      })
      .parse(req.body);
    res.status(201).json(await master.createInsumo(body));
  } catch (err) {
    next(err);
  }
});

router.patch('/insumos/:id', async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        companyId: z.string().nullable().optional(),
        name: z.string().optional(),
        category: z.string().optional(),
        unit: z.string().optional(),
        currentStock: z.number().nonnegative().optional(),
        minStock: z.number().nonnegative().optional(),
        costPerUnit: z.number().nonnegative().optional(),
        lastPurchaseDate: z.string().nullable().optional(),
      })
      .parse(req.body);
    res.json(await master.updateInsumo(id, body));
  } catch (err) {
    next(err);
  }
});

router.delete('/insumos/:id', async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);
    res.json(await master.deleteInsumo(id));
  } catch (err) {
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
  try {
    const body = z
      .object({
        companyId: z.string().min(1),
        productId: z.string().optional(),
        productName: z.string().min(1),
        category: z.string().min(1),
        portions: z.number().int().positive().optional(),
        salePrice: z.number().nonnegative(),
        totalCost: z.number().nonnegative(),
        theoreticalFoodCostPct: z.number().nonnegative(),
        preparationNotes: z.string().optional(),
        ingredients: z.array(recipeIngredientSchema).default([]),
      })
      .parse(req.body);
    res.status(201).json(await master.createRecipe(body));
  } catch (err) {
    next(err);
  }
});

router.patch('/recipes/:id', async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);
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
    res.json(await master.updateRecipe(id, body));
  } catch (err) {
    next(err);
  }
});

router.delete('/recipes/:id', async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);
    res.json(await master.deleteRecipe(id));
  } catch (err) {
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
    res.status(201).json(await master.createBankAccount(body));
  } catch (err) {
    next(err);
  }
});

router.patch('/bank-accounts/:id', async (req, res, next) => {
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
    res.json(await master.updateBankAccount(id, body));
  } catch (err) {
    next(err);
  }
});

router.delete('/bank-accounts/:id', async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);
    res.json(await master.deleteBankAccount(id));
  } catch (err) {
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
    res.status(201).json(await master.createPaymentMethod(body));
  } catch (err) {
    next(err);
  }
});

router.patch('/payment-methods/:id', async (req, res, next) => {
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
    res.json(await master.updatePaymentMethod(id, body));
  } catch (err) {
    next(err);
  }
});

router.delete('/payment-methods/:id', async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);
    res.json(await master.deletePaymentMethod(id));
  } catch (err) {
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
    res.status(201).json(await master.createPrinter(body));
  } catch (err) {
    next(err);
  }
});

router.patch('/printers/:id', async (req, res, next) => {
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
    res.json(await master.updatePrinter(id, body));
  } catch (err) {
    next(err);
  }
});

router.delete('/printers/:id', async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);
    res.json(await master.deletePrinter(id));
  } catch (err) {
    next(err);
  }
});

export default router;