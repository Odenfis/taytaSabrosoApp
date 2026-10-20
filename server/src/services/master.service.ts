import { randomUUID } from 'node:crypto';
import { AppError, plain, toNum, round2 } from '../lib/utils';
import { prisma } from '../lib/prisma';
import { emitRecipeChanged, emitInsumoChanged, emitPaymentMethodChanged, emitPrinterChanged, emitProductChanged } from '../lib/realtime';

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
  emitProductChanged(input.companyId, {
    productId: product.id,
    companyId: input.companyId,
    action: 'create',
    name: product.name,
    price: Number(product.price),
    category: product.category,
    hasRecipe: !!product.hasRecipe,
    updatedAt: new Date(product.updatedAt).toISOString(),
  });
  return product;
}

export async function updateProduct(id: string, updates: Partial<{
  name: string; description: string; price: number; category: string; image: string; available: boolean; hasRecipe: boolean;
}>) {
  const product = plain(await prisma.product.update({ where: { id }, data: { ...updates } }));
  emitProductChanged(product.companyId, {
    productId: product.id,
    companyId: product.companyId,
    action: 'update',
    name: product.name,
    price: Number(product.price),
    category: product.category,
    hasRecipe: !!product.hasRecipe,
    updatedAt: new Date(product.updatedAt).toISOString(),
  });
  return product;
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

  // Notifica en tiempo real la creación del insumo a los terminales de la empresa.
  emitInsumoChanged(input.companyId ?? null, {
    insumoId: insumo.id,
    companyId: input.companyId ?? null,
    action: 'create',
    name: insumo.name,
    category: insumo.category,
    unit: insumo.unit,
    currentStock: toNum(insumo.currentStock),
    costPerUnit: toNum(insumo.costPerUnit),
    updatedAt: insumo.createdAt.toISOString(),
  });

  return plain(insumo);
}

export async function updateInsumo(id: string, updates: Partial<{
  companyId: string | null; name: string; category: string; unit: string; currentStock: number; minStock: number; costPerUnit: number; lastPurchaseDate: string | null;
}>) {
  const updated = await prisma.insumo.update({ where: { id }, data: { ...updates } });

  // Notifica en tiempo real la actualización del insumo a los terminales de la empresa.
  emitInsumoChanged(updated.companyId ?? null, {
    insumoId: updated.id,
    companyId: updated.companyId ?? null,
    action: 'update',
    name: updated.name,
    category: updated.category,
    unit: updated.unit,
    currentStock: toNum(updated.currentStock),
    costPerUnit: toNum(updated.costPerUnit),
    updatedAt: updated.updatedAt.toISOString(),
  });

  return plain(updated);
}

export async function deleteInsumo(id: string) {
  const insumo = await prisma.insumo.findUnique({ where: { id } });
  if (!insumo) throw new AppError('Insumo no encontrado.', 404, 'NOT_FOUND');
  await prisma.insumo.update({ where: { id }, data: { isDeleted: true } });

  // Notifica en tiempo real la eliminación (soft-delete) del insumo a los terminales de la empresa.
  emitInsumoChanged(insumo.companyId ?? null, {
    insumoId: insumo.id,
    companyId: insumo.companyId ?? null,
    action: 'delete',
    name: insumo.name,
    category: insumo.category,
    unit: insumo.unit,
    currentStock: toNum(insumo.currentStock),
    costPerUnit: toNum(insumo.costPerUnit),
    updatedAt: new Date().toISOString(),
  });

  return plain(insumo);
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

// Resuelve el plato de una ficha: si productId es nulo o no existe en productos
// (p.ej. id temporal generado offline), crea automáticamente el producto con los
// datos de la ficha para que impacte en el menú de mesas. Devuelve el productId final.
async function resolveRecipeProduct(
  companyId: string,
  productId: string | null | undefined,
  productName: string,
  category: string,
  salePrice: number,
  preparationNotes?: string | null
): Promise<string | null> {
  const existing = productId ? await prisma.product.findUnique({ where: { id: productId } }) : null;
  if (existing) {
    if (!existing.hasRecipe) {
      const updated = await prisma.product.update({ where: { id: existing.id }, data: { hasRecipe: true } });
      emitProductChanged(existing.companyId, {
        productId: updated.id,
        companyId: updated.companyId,
        action: 'update',
        name: updated.name,
        price: Number(updated.price),
        category: updated.category,
        hasRecipe: true,
        updatedAt: new Date(updated.updatedAt).toISOString(),
      });
    }
    return existing.id;
  }
  const created = await prisma.product.create({
    data: {
      id: randomUUID(),
      companyId,
      name: productName,
      description: preparationNotes ?? '',
      price: round2(salePrice),
      category,
      image: '',
      available: true,
      hasRecipe: true,
    },
  });
  emitProductChanged(companyId, {
    productId: created.id,
    companyId,
    action: 'create',
    name: created.name,
    price: Number(created.price),
    category: created.category,
    hasRecipe: true,
    updatedAt: created.createdAt.toISOString(),
  });
  return created.id;
}

// Verifica qué insumos existen antes de insertar ingredientes para no violar la FK
// de ingredientes_receta (los insumos creados offline llevan ids temporales que
// aún no existen en el server: se guardan con insumo_id NULL conservando el nombre).
async function validInsumoIds(nestedIds: (string | null | undefined)[]): Promise<Set<string>> {
  const wanted = [...new Set(nestedIds.filter((v): v is string => !!v))];
  if (wanted.length === 0) return new Set();
  const rows = await prisma.insumo.findMany({ where: { id: { in: wanted } }, select: { id: true } });
  return new Set(rows.map((r) => r.id));
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
  preparationNotes?: string | null;
  ingredients: { insumoId?: string | null; insumoName: string; quantity: number; unit: string; costPerUnit: number; subtotalCost: number }[];
}) {
  const productId = await resolveRecipeProduct(
    input.companyId,
    input.productId ?? null,
    input.productName,
    input.category,
    input.salePrice,
    input.preparationNotes
  );
  const valid = await validInsumoIds(input.ingredients.map((ing) => ing.insumoId));
  const recipe = await prisma.recipe.create({
    data: {
      id: randomUUID(),
      companyId: input.companyId,
      productId,
      productName: input.productName,
      category: input.category,
      portions: input.portions ?? 1,
      salePrice: round2(input.salePrice),
      totalCost: round2(input.totalCost),
      theoreticalFoodCostPct: round2(input.theoreticalFoodCostPct),
      preparationNotes: input.preparationNotes,
      ingredients: {
        create: input.ingredients.map((ing) => ({
          id: randomUUID(),
          insumoId: ing.insumoId && valid.has(ing.insumoId) ? ing.insumoId : null,
          insumoName: ing.insumoName,
          quantity: round2(ing.quantity),
          unit: ing.unit,
          costPerUnit: round2(ing.costPerUnit),
          subtotalCost: round2(ing.subtotalCost),
        })),
      },
    },
    include: { ingredients: true },
  });

  // Notifica en tiempo real la creación de la receta a los terminales de la empresa.
  emitRecipeChanged(input.companyId, {
    recipeId: recipe.id,
    companyId: input.companyId,
    action: 'create',
    productName: recipe.productName,
    category: recipe.category,
    updatedAt: recipe.createdAt.toISOString(),
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
  // Estándar de dos decimales: se normaliza lo monetario antes de escribir.
  const roundedData: typeof data = {
    ...data,
    ...(data.salePrice !== undefined ? { salePrice: round2(data.salePrice) } : {}),
    ...(data.totalCost !== undefined ? { totalCost: round2(data.totalCost) } : {}),
    ...(data.theoreticalFoodCostPct !== undefined
      ? { theoreticalFoodCostPct: round2(data.theoreticalFoodCostPct) }
      : {}),
  };
  let effectiveData = roundedData;
  // Solo si el payload trae productId: lo resuelve/crea si no existe en productos.
  if (effectiveData.productId !== undefined) {
    const existing = await prisma.recipe.findUnique({ where: { id } });
    if (existing) {
      effectiveData.productId = await resolveRecipeProduct(
        existing.companyId,
        effectiveData.productId,
        effectiveData.productName ?? existing.productName,
        effectiveData.category ?? existing.category,
        effectiveData.salePrice !== undefined ? effectiveData.salePrice : Number(existing.salePrice),
        effectiveData.preparationNotes !== undefined ? effectiveData.preparationNotes : existing.preparationNotes
      );
    }
  }
  const valid = ingredients ? await validInsumoIds(ingredients.map((ing) => ing.insumoId)) : null;
  const updated = await prisma.$transaction(async (tx) => {
    const recipe = await tx.recipe.update({
      where: { id },
      data: { ...effectiveData },
    });
    if (ingredients) {
      await tx.recipeIngredient.deleteMany({ where: { recipeId: id } });
      await tx.recipeIngredient.createMany({
        data: ingredients.map((ing) => ({
          id: randomUUID(),
          recipeId: id,
          insumoId: ing.insumoId && valid?.has(ing.insumoId) ? ing.insumoId : null,
          insumoName: ing.insumoName,
          quantity: round2(ing.quantity),
          unit: ing.unit,
          costPerUnit: round2(ing.costPerUnit),
          subtotalCost: round2(ing.subtotalCost),
        })),
      });
    }
    return recipe;
  });

  // Notifica en tiempo real la actualización de la receta a los terminales de la empresa.
  emitRecipeChanged(updated.companyId, {
    recipeId: updated.id,
    companyId: updated.companyId,
    action: 'update',
    productName: updated.productName,
    category: updated.category,
    updatedAt: updated.updatedAt.toISOString(),
  });

  return plain(updated);
}

export async function deleteRecipe(id: string) {
  const recipe = await prisma.recipe.findUnique({ where: { id } });
  if (!recipe) throw new AppError('Receta no encontrada.', 404, 'NOT_FOUND');
  await prisma.recipe.update({ where: { id }, data: { isDeleted: true } });

  // Notifica en tiempo real la eliminación (soft-delete) de la receta a los terminales de la empresa.
  emitRecipeChanged(recipe.companyId, {
    recipeId: recipe.id,
    companyId: recipe.companyId,
    action: 'delete',
    productName: recipe.productName,
    category: recipe.category,
    updatedAt: new Date().toISOString(),
  });

  return plain(recipe);
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