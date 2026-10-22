import { inventoryTransaction, requireActiveInsumos } from '../lib/inventory.js';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { productFields, writeProduct, recipeRatio, notifyProduct, notifyLinkedRecipes } from './product.service.js';
export { createProduct, updateProduct } from './product.service.js';
import { AppError, plain, toNum, round2 } from '../lib/utils.js';
import { prisma } from '../lib/prisma.js';
import { emitRecipeChanged, emitInsumoChanged, emitPaymentMethodChanged, emitPrinterChanged, emitProductChanged } from '../lib/realtime.js';

// companyId opcional para filtrar recursos por empresa.
// Los recursos 'ambas' (companyId NULL) siempre se incluyen cuando hay filtro.
function companyWhere(companyId?: string) {
  if (!companyId) return {};
  return { OR: [{ companyId }, { companyId: null }] };
}

// ============================ COMPANIES ============================

export async function listCompanies(companyId?: string) {
  const where = companyId ? { id: companyId } : {};
  const companies = await prisma.company.findMany({ where, orderBy: { name: 'asc' } });
  return plain(companies);
}

export async function listCompanyShifts() {
  return plain(await prisma.companyShift.findMany());
}

// ============================ TABLES ============================

export async function listTables(companyId?: string) {
  const tables = await prisma.table.findMany({
    where: {
      isDeleted: false,
      ...(companyId ? { companyId } : {}),
    },
    orderBy: [{ zone: 'asc' }, { number: 'asc' }],
  });
  return plain(tables);
}

export async function createTable(input: {
  companyId: string;
  number: string;
  capacity: number;
  zone: string;
  notes?: string;
}) {
  const table = await prisma.table.create({
    data: {
      id: randomUUID(),
      companyId: input.companyId,
      number: input.number,
      capacity: input.capacity,
      zone: input.zone,
      status: 'libre',
      notes: input.notes,
    },
  });
  return plain(table);
}

export async function updateTable(id: string, updates: { number?: string; capacity?: number; zone?: string; notes?: string | null; status?: string }) {
  const table = await prisma.table.update({
    where: { id },
    data: { ...updates },
  });
  return plain(table);
}

export async function deleteTable(id: string) {
  // Se permite solo mesas libres (integridad operativa).
  const table = await prisma.table.findUnique({ where: { id } });
  if (!table) throw new AppError('Mesa no encontrada.', 404, 'NOT_FOUND');
  if (table.status !== 'libre') {
    throw new AppError('No se puede eliminar una mesa ocupada o por cobrar.', 409, 'TABLE_ACTIVE');
  }
  return plain(await prisma.table.update({ where: { id }, data: { isDeleted: true } }));
}

// ============================ PRODUCTS ============================

export async function listProducts(companyId?: string, category?: string) {
  const products = await prisma.product.findMany({
    where: {
      isDeleted: false,
      ...(companyId ? { companyId } : {}),
      ...(category ? { category } : {}),
    },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });
  return plain(products);
}

export async function deleteProduct(id: string) {
  const product = plain(await prisma.product.update({ where: { id }, data: { isDeleted: true } }));
  emitProductChanged(product.companyId, {
    productId: product.id,
    companyId: product.companyId,
    action: 'delete',
    name: product.name,
    price: Number(product.price),
    category: product.category,
    hasRecipe: !!product.hasRecipe,
    updatedAt: new Date(product.updatedAt).toISOString(),
  });
  return product;
}

// ============================ INSUMOS ============================

export { listInsumos, createInsumo, updateInsumo, deleteInsumo } from './insumo.service.js';

// ============================ RECIPES ============================

export async function listRecipes(companyId?: string) {
  const recipes = await prisma.recipe.findMany({
    where: {
      isDeleted: false,
      ...(companyId ? { companyId } : {}),
    },
    include: { ingredients: { orderBy: { subtotalCost: 'desc' } } },
    orderBy: { productName: 'asc' },
  });
  return plain(recipes);
}

type IngredientInput = { insumoId?: string | null; insumoName: string; quantity: number; unit: string; costPerUnit: number; subtotalCost: number };
type RecipeInput = {
  id?: string; companyId: string; productId?: string | null; productName: string; category: string;
  portions?: number; salePrice: number; totalCost: number; theoreticalFoodCostPct: number;
  preparationNotes?: string | null; ingredients: IngredientInput[];
};

async function ingredientData(tx: Prisma.TransactionClient, ingredients: IngredientInput[], companyId: string) {
  const ids = ingredients.flatMap((i) => i.insumoId ? [i.insumoId] : []);
  const insumos = await requireActiveInsumos(tx, ids, companyId);
  const valid = new Set(insumos.map((i) => i.id));
  for (const item of ingredients) {
    const insumo = insumos.find((i) => i.id === item.insumoId);
    if (insumo && insumo.unit !== item.unit) throw new AppError('La unidad del ingrediente no coincide con el insumo.', 409, 'INSUMO_UNIT_MISMATCH');
  }
  return ingredients.map((i) => ({ id: randomUUID(), insumoId: i.insumoId && valid.has(i.insumoId) ? i.insumoId : null,
    insumoName: insumos.find((ins) => ins.id === i.insumoId)?.name ?? i.insumoName, quantity: round2(i.quantity), unit: i.unit,
    costPerUnit: round2(i.costPerUnit), subtotalCost: round2(i.subtotalCost) }));
}

async function resolveRecipeProduct(tx: Prisma.TransactionClient, data: {
  companyId: string; productId?: string | null; productName: string; category: string; salePrice: number;
}) {
  const fields = productFields.pick({ name: true, price: true, category: true }).parse({
    name: data.productName, price: round2(data.salePrice), category: data.category,
  });
  const existing = data.productId ? await tx.product.findUnique({ where: { id: data.productId } }) : null;
  if (existing) {
    if (existing.companyId !== data.companyId) throw new AppError('El producto y la ficha deben pertenecer a la misma empresa.', 409, 'PRODUCT_COMPANY_MISMATCH');
    if (existing.isDeleted) throw new AppError('El producto vinculado fue retirado.', 409, 'PRODUCT_DELETED');
    return existing;
  }
  // UUID estable del cliente: una ficha offline conserva el vínculo antes y después del replay.
  const id = data.productId && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(data.productId) ? data.productId : randomUUID();
  return tx.product.create({ data: { id, companyId: data.companyId, ...fields,
    description: '', image: '', available: true, hasRecipe: false } });
}

async function notifyRecipeCommit(product: Awaited<ReturnType<typeof resolveRecipeProduct>>) {
  await notifyProduct(product);
  await notifyLinkedRecipes(product.id).catch(() => undefined);
}

export async function createRecipe(input: RecipeInput) {
  const result = await inventoryTransaction(async (tx) => {
    if (input.id) {
      const prior = await tx.recipe.findUnique({ where: { id: input.id }, include: { ingredients: true } });
      if (prior) {
        if (prior.companyId !== input.companyId || prior.isDeleted) throw new AppError('La ficha ya existe en otro contexto.', 409, 'RECIPE_ID_CONFLICT');
        return { recipe: prior, product: null };
      }
    }
    const product = await resolveRecipeProduct(tx, input);
    const recipe = await tx.recipe.create({ data: {
      id: input.id ?? randomUUID(), companyId: input.companyId, productId: product.id,
      productName: input.productName.trim(), category: input.category, portions: input.portions ?? 1,
      salePrice: round2(input.salePrice), totalCost: round2(input.totalCost),
      theoreticalFoodCostPct: recipeRatio(round2(input.totalCost), round2(input.salePrice)),
      preparationNotes: input.preparationNotes,
      ingredients: { create: await ingredientData(tx, input.ingredients, input.companyId) },
    }, include: { ingredients: true } });
    const updated = await writeProduct(tx, product.id, { name: recipe.productName, price: toNum(recipe.salePrice), category: recipe.category as 'platos' });
    return { recipe: (await tx.recipe.findUnique({ where: { id: recipe.id }, include: { ingredients: true } }))!, product: updated };
  });
  if (result.product) await notifyRecipeCommit(result.product);
  return plain(result.recipe);
}

export async function updateRecipe(id: string, input: Partial<Omit<RecipeInput, 'companyId' | 'id'>>) {
  const result = await inventoryTransaction(async (tx) => {
    const prior = await tx.recipe.findUnique({ where: { id } });
    if (!prior || prior.isDeleted) throw new AppError('Ficha no encontrada.', 404, 'NOT_FOUND');
    const product = await resolveRecipeProduct(tx, { companyId: prior.companyId,
      productId: input.productId === undefined ? prior.productId : input.productId,
      productName: input.productName ?? prior.productName, category: input.category ?? prior.category,
      salePrice: input.salePrice ?? toNum(prior.salePrice) });
    const { ingredients, ...fields } = input;
    const updated = await tx.recipe.update({ where: { id }, data: { ...fields, productId: product.id,
      ...(input.productName !== undefined ? { productName: input.productName.trim() } : {}),
      ...(input.salePrice !== undefined ? { salePrice: round2(input.salePrice) } : {}),
      ...(input.totalCost !== undefined ? { totalCost: round2(input.totalCost) } : {}),
      version: { increment: 1 } } });
    if (ingredients) {
      await tx.recipeIngredient.deleteMany({ where: { recipeId: id } });
      await tx.recipeIngredient.createMany({ data: (await ingredientData(tx, ingredients, prior.companyId)).map((i) => ({ ...i, recipeId: id })) });
    }
    const synced = await writeProduct(tx, product.id, { name: updated.productName, price: toNum(updated.salePrice), category: updated.category as 'platos' });
    let previousProduct = null;
    if (prior.productId && prior.productId !== product.id) previousProduct = await writeProduct(tx, prior.productId, {});
    return { recipe: (await tx.recipe.findUnique({ where: { id }, include: { ingredients: true } }))!, product: synced, previousProduct };
  });
  await notifyRecipeCommit(result.product);
  if (result.previousProduct) await notifyRecipeCommit(result.previousProduct);
  return plain(result.recipe);
}

export async function deleteRecipe(id: string) {
  const result = await inventoryTransaction(async (tx) => {
    const recipe = await tx.recipe.findUnique({ where: { id } });
    if (!recipe) throw new AppError('Receta no encontrada.', 404, 'NOT_FOUND');
    await tx.recipe.update({ where: { id }, data: { isDeleted: true, version: { increment: 1 } } });
    return { recipe, product: recipe.productId ? await writeProduct(tx, recipe.productId, {}) : null };
  });
  if (result.product) await notifyRecipeCommit(result.product);
  emitRecipeChanged(result.recipe.companyId, { recipeId: id, companyId: result.recipe.companyId,
    action: 'delete', productName: result.recipe.productName, category: result.recipe.category, updatedAt: new Date().toISOString() });
  return plain(result.recipe);
}

// ============================ BANK ACCOUNTS ============================

export async function listBankAccounts(companyId?: string) {
  const accounts = await prisma.bankAccount.findMany({
    where: {
      isDeleted: false,
      ...(companyId ? { companyId: companyId as string } : {}),
    },
    orderBy: { alias: 'asc' },
  });
  return plain(accounts);
}

export async function createBankAccount(input: {
  companyId: string;
  bankName: string;
  accountNumber: string;
  cci?: string;
  accountType: string;
  currency?: string;
  holderName: string;
  alias: string;
  currentBalance?: number;
  notes?: string;
}) {
  const account = await prisma.bankAccount.create({
    data: {
      id: randomUUID(),
      companyId: input.companyId,
      bankName: input.bankName,
      accountNumber: input.accountNumber,
      cci: input.cci,
      accountType: input.accountType,
      currency: input.currency ?? 'PEN',
      holderName: input.holderName,
      alias: input.alias,
      currentBalance: input.currentBalance ?? 0,
      notes: input.notes,
    },
  });
  return plain(account);
}

export async function updateBankAccount(id: string, updates: Partial<{
  companyId: string; bankName: string; accountNumber: string; cci: string | null; accountType: string; currency: string; holderName: string; alias: string; currentBalance: number; isActive: boolean; notes: string | null;
}>) {
  return plain(await prisma.bankAccount.update({ where: { id }, data: { ...updates } }));
}

export async function deleteBankAccount(id: string) {
  return plain(await prisma.bankAccount.update({ where: { id }, data: { isDeleted: true } }));
}

// ============================ PAYMENT METHODS ============================

export async function listPaymentMethods(companyId?: string) {
  const methods = await prisma.customPaymentMethod.findMany({
    where: {
      isDeleted: false,
      ...(companyId ? companyWhere(companyId) : {}),
    },
    include: { bankAccount: true },
    orderBy: { name: 'asc' },
  });
  return plain(methods);
}

export async function createPaymentMethod(input: {
  companyId?: string | null; // null = 'ambas'
  name: string;
  category: string;
  bankAccountId?: string;
  commissionPct?: number;
  requiresReferenceNumber?: boolean;
  icon?: string;
}) {
  const method = await prisma.customPaymentMethod.create({
    data: {
      id: randomUUID(),
      companyId: input.companyId ?? null,
      name: input.name,
      category: input.category,
      bankAccountId: input.bankAccountId ?? null,
      commissionPct: input.commissionPct ?? 0,
      requiresReferenceNumber: input.requiresReferenceNumber ?? false,
      icon: input.icon ?? 'payments',
    },
  });

  // Notifica en tiempo real la creación del método de pago a los terminales de la empresa.
  emitPaymentMethodChanged(input.companyId ?? null, {
    paymentMethodId: method.id,
    companyId: input.companyId ?? null,
    action: 'create',
    name: method.name,
    category: method.category,
    icon: method.icon,
    updatedAt: method.createdAt.toISOString(),
  });

  return plain(method);
}

export async function updatePaymentMethod(id: string, updates: Partial<{
  companyId: string | null; name: string; category: string; bankAccountId: string | null; commissionPct: number | null; requiresReferenceNumber: boolean; icon: string; isActive: boolean;
}>) {
  const updated = await prisma.customPaymentMethod.update({ where: { id }, data: { ...updates } });

  // Notifica en tiempo real la actualización del método de pago a los terminales de la empresa.
  emitPaymentMethodChanged(updated.companyId, {
    paymentMethodId: updated.id,
    companyId: updated.companyId ?? null,
    action: 'update',
    name: updated.name,
    category: updated.category,
    icon: updated.icon,
    updatedAt: updated.updatedAt.toISOString(),
  });

  return plain(updated);
}

export async function deletePaymentMethod(id: string) {
  const method = await prisma.customPaymentMethod.findUnique({ where: { id } });
  if (!method) throw new AppError('Método de pago no encontrado.', 404, 'NOT_FOUND');
  await prisma.customPaymentMethod.update({ where: { id }, data: { isDeleted: true } });

  // Notifica en tiempo real la eliminación (soft-delete) del método de pago a los terminales de la empresa.
  emitPaymentMethodChanged(method.companyId, {
    paymentMethodId: method.id,
    companyId: method.companyId ?? null,
    action: 'delete',
    name: method.name,
    category: method.category,
    icon: method.icon,
    updatedAt: new Date().toISOString(),
  });

  return plain(method);
}

// ============================ PRINTERS ============================

export async function listPrinters(companyId?: string) {
  const printers = await prisma.printer.findMany({
    where: {
      isDeleted: false,
      ...(companyId ? companyWhere(companyId) : {}),
    },
    include: { categories: { orderBy: { idx: 'asc' } } },
    orderBy: { name: 'asc' },
  });
  return plain(printers);
}

export async function createPrinter(input: {
  companyId?: string | null; // null = 'ambas'
  name: string;
  role: string;
  connectionType: string;
  ipAddress?: string;
  port?: number;
  paperWidth?: string;
  autoCut?: boolean;
  beepOnPrint?: boolean;
  categories?: string[];
}) {
  const printer = await prisma.printer.create({
    data: {
      id: randomUUID(),
      companyId: input.companyId ?? null,
      name: input.name,
      role: input.role,
      connectionType: input.connectionType,
      ipAddress: input.ipAddress,
      port: input.port ?? 9100,
      paperWidth: input.paperWidth ?? '80mm',
      autoCut: input.autoCut ?? true,
      beepOnPrint: input.beepOnPrint ?? false,
      categories: input.categories?.length
        ? {
            create: input.categories.map((c, i) => ({
              id: randomUUID(),
              category: c,
              idx: i,
            })),
          }
        : undefined,
    },
    include: { categories: { orderBy: { idx: 'asc' } } },
  });

  // Notifica en tiempo real la creación de la impresora a los terminales de la empresa.
  emitPrinterChanged(input.companyId ?? null, {
    printerId: printer.id,
    companyId: input.companyId ?? null,
    action: 'create',
    name: printer.name,
    role: printer.role,
    connectionType: printer.connectionType,
    ipAddress: printer.ipAddress,
    updatedAt: printer.createdAt.toISOString(),
  });

  return plain(printer);
}

export async function updatePrinter(
  id: string,
  input: Partial<{
    name: string; role: string; connectionType: string; ipAddress: string | null; port: number | null; paperWidth: string; autoCut: boolean; beepOnPrint: boolean; status: string; isEnabled: boolean;
  }> & { categories?: string[] }
) {
  const { categories, ...data } = input;
  const updated = await prisma.$transaction(async (tx) => {
    const printer = await tx.printer.update({ where: { id }, data: { ...data } });
    if (categories) {
      await tx.printerCategory.deleteMany({ where: { printerId: id } });
      await tx.printerCategory.createMany({
        data: categories.map((c, i) => ({
          id: randomUUID(),
          printerId: id,
          category: c,
          idx: i,
        })),
      });
    }
    return printer;
  });

  // Notifica en tiempo real la actualización de la impresora a los terminales de la empresa.
  emitPrinterChanged(updated.companyId, {
    printerId: updated.id,
    companyId: updated.companyId ?? null,
    action: 'update',
    name: updated.name,
    role: updated.role,
    connectionType: updated.connectionType,
    ipAddress: updated.ipAddress,
    updatedAt: updated.updatedAt.toISOString(),
  });

  return plain(updated);
}

export async function deletePrinter(id: string) {
  const printer = await prisma.printer.findUnique({ where: { id } });
  if (!printer) throw new AppError('Impresora no encontrada.', 404, 'NOT_FOUND');
  await prisma.printer.update({ where: { id }, data: { isDeleted: true } });

  // Notifica en tiempo real la eliminación (soft-delete) de la impresora a los terminales de la empresa.
  emitPrinterChanged(printer.companyId ?? null, {
    printerId: printer.id,
    companyId: printer.companyId ?? null,
    action: 'delete',
    name: printer.name,
    role: printer.role,
    connectionType: printer.connectionType,
    ipAddress: printer.ipAddress,
    updatedAt: new Date().toISOString(),
  });

  return plain(printer);
}