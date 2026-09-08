import { randomUUID } from 'node:crypto';
import { AppError, plain } from '../lib/utils';
import { prisma } from '../lib/prisma';

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

export async function createProduct(input: {
  companyId: string;
  name: string;
  description: string;
  price: number;
  category: string;
  image: string;
  available?: boolean;
  hasRecipe?: boolean;
}) {
  const product = await prisma.product.create({
    data: { id: randomUUID(), ...input },
  });
  return plain(product);
}

export async function updateProduct(id: string, updates: Partial<{
  name: string; description: string; price: number; category: string; image: string; available: boolean; hasRecipe: boolean;
}>) {
  return plain(await prisma.product.update({ where: { id }, data: { ...updates } }));
}

export async function deleteProduct(id: string) {
  return plain(await prisma.product.update({ where: { id }, data: { isDeleted: true } }));
}

// ============================ INSUMOS ============================

export async function listInsumos(companyId?: string, category?: string) {
  const where: Record<string, unknown> = {
    isDeleted: false,
    ...(companyId ? companyWhere(companyId) : {}),
  };
  const insumos = await prisma.insumo.findMany({
    where: { ...where, ...(category ? { category } : {}) } as never,
    orderBy: { code: 'asc' },
  });
  return plain(insumos);
}

export async function createInsumo(input: {
  companyId?: string | null; // null = 'ambas'
  name: string;
  category: string;
  unit: string;
  currentStock: number;
  minStock: number;
  costPerUnit: number;
  lastPurchaseDate?: string;
}) {
  const codes = await prisma.insumo.findMany({
    where: { code: { startsWith: 'INS-' } },
    select: { code: true },
  });
  let next = codes.length + 1;
  const existing = new Set(codes.map((c) => c.code));
  while (existing.has(`INS-${String(next).padStart(3, '0')}`)) next += 1;
  const code = `INS-${String(next).padStart(3, '0')}`;

  const insumo = await prisma.insumo.create({
    data: {
      id: randomUUID(),
      code,
      companyId: input.companyId ?? null,
      name: input.name,
      category: input.category,
      unit: input.unit,
      currentStock: input.currentStock,
      minStock: input.minStock,
      costPerUnit: input.costPerUnit,
      lastPurchaseDate: input.lastPurchaseDate,
      lastPurchaseUtc: new Date(),
    },
  });
  return plain(insumo);
}

export async function updateInsumo(id: string, updates: Partial<{
  companyId: string | null; name: string; category: string; unit: string; currentStock: number; minStock: number; costPerUnit: number; lastPurchaseDate: string | null;
}>) {
  return plain(await prisma.insumo.update({ where: { id }, data: { ...updates } }));
}

export async function deleteInsumo(id: string) {
  return plain(await prisma.insumo.update({ where: { id }, data: { isDeleted: true } }));
}

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

export async function createRecipe(input: {
  companyId: string;
  productId?: string | null;
  productName: string;
  category: string;
  portions?: number;
  salePrice: number;
  totalCost: number;
  theoreticalFoodCostPct: number;
  preparationNotes?: string;
  ingredients: { insumoId?: string | null; insumoName: string; quantity: number; unit: string; costPerUnit: number; subtotalCost: number }[];
}) {
  const recipe = await prisma.recipe.create({
    data: {
      id: randomUUID(),
      companyId: input.companyId,
      productId: input.productId ?? null,
      productName: input.productName,
      category: input.category,
      portions: input.portions ?? 1,
      salePrice: input.salePrice,
      totalCost: input.totalCost,
      theoreticalFoodCostPct: input.theoreticalFoodCostPct,
      preparationNotes: input.preparationNotes,
      ingredients: {
        create: input.ingredients.map((ing) => ({
          id: randomUUID(),
          insumoId: ing.insumoId ?? null,
          insumoName: ing.insumoName,
          quantity: ing.quantity,
          unit: ing.unit,
          costPerUnit: ing.costPerUnit,
          subtotalCost: ing.subtotalCost,
        })),
      },
    },
    include: { ingredients: true },
  });
  return plain(recipe);
}

export async function updateRecipe(
  id: string,
  input: Partial<{
    productId: string | null;
    productName: string;
    category: string;
    portions: number;
    salePrice: number;
    totalCost: number;
    theoreticalFoodCostPct: number;
    preparationNotes: string | null;
  }> & { ingredients?: { insumoId?: string | null; insumoName: string; quantity: number; unit: string; costPerUnit: number; subtotalCost: number }[] }
) {
  const { ingredients, ...data } = input;
  return prisma.$transaction(async (tx) => {
    const recipe = await tx.recipe.update({
      where: { id },
      data: { ...data },
    });
    if (ingredients) {
      await tx.recipeIngredient.deleteMany({ where: { recipeId: id } });
      await tx.recipeIngredient.createMany({
        data: ingredients.map((ing) => ({
          id: randomUUID(),
          recipeId: id,
          insumoId: ing.insumoId ?? null,
          insumoName: ing.insumoName,
          quantity: ing.quantity,
          unit: ing.unit,
          costPerUnit: ing.costPerUnit,
          subtotalCost: ing.subtotalCost,
        })),
      });
    }
    return recipe;
  }).then((r) => plain(r));
}

export async function deleteRecipe(id: string) {
  return plain(await prisma.recipe.update({ where: { id }, data: { isDeleted: true } }));
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
  return plain(method);
}

export async function updatePaymentMethod(id: string, updates: Partial<{
  companyId: string | null; name: string; category: string; bankAccountId: string | null; commissionPct: number | null; requiresReferenceNumber: boolean; icon: string; isActive: boolean;
}>) {
  return plain(await prisma.customPaymentMethod.update({ where: { id }, data: { ...updates } }));
}

export async function deletePaymentMethod(id: string) {
  return plain(await prisma.customPaymentMethod.update({ where: { id }, data: { isDeleted: true } }));
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
  return plain(printer);
}

export async function updatePrinter(
  id: string,
  input: Partial<{
    name: string; role: string; connectionType: string; ipAddress: string | null; port: number | null; paperWidth: string; autoCut: boolean; beepOnPrint: boolean; status: string; isEnabled: boolean;
  }> & { categories?: string[] }
) {
  const { categories, ...data } = input;
  return prisma.$transaction(async (tx) => {
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
  }).then((r) => plain(r));
}

export async function deletePrinter(id: string) {
  return plain(await prisma.printer.update({ where: { id }, data: { isDeleted: true } }));
}