import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { inventoryTransaction, lockInsumos, assertInsumoCompany } from '../lib/inventory.js';
import { AppError, plain, toNum } from '../lib/utils.js';
import { emitInsumoChanged, emitRecipeChanged } from '../lib/realtime.js';

const amount = z.number().finite().nonnegative().max(99999999.9999).refine((v) => Math.abs(v * 10000 - Math.round(v * 10000)) < 1e-5, 'Use hasta cuatro decimales.');
const fields = z.object({ name: z.string().trim().min(1).max(150),
  category: z.enum(['Carnes & Aves', 'Pescados & Mariscos', 'Verduras & Frutas', 'Abarrotes & Especias', 'Bebidas & Licores', 'Lácteos & Huevos']),
  unit: z.enum(['kg', 'g', 'L', 'ml', 'un', 'bot']), minStock: amount, costPerUnit: amount });
export const createInsumoSchema = fields.extend({ id: z.uuid().optional(), companyId: z.string().min(1).max(36).nullable().optional(),
  currentStock: amount, minStock: amount.default(0), lastPurchaseDate: z.string().max(30).optional(), clientOpId: z.string().max(36).optional() });
// Campos de existencias/empresa no se ignoran: una escritura directa debe rechazarse.
export const updateInsumoSchema = fields.partial().extend({ expectedVersion: z.number().int().positive().optional(), clientOpId: z.string().max(36).optional() }).strict();
const include = { _count: { select: { recipeIngredients: true, purchaseItems: true, kardexMovements: true } },
  recipeIngredients: { where: { recipe: { isDeleted: false } }, select: { recipe: { select: { id: true, productName: true } } } } } satisfies Prisma.InsumoInclude;
function present(row: any) {
  const { _count, recipeIngredients, ...insumo } = row;
  return plain({ ...insumo, canEditBase: toNum(row.currentStock) === 0 && Object.values(_count).every((n) => n === 0),
    activeRecipes: recipeIngredients.map((i: any) => ({ id: i.recipe.id, name: i.recipe.productName })) });
}
async function details(tx: Prisma.TransactionClient, id: string) { return tx.insumo.findUniqueOrThrow({ where: { id }, include }); }
function changed(row: any, action: 'create' | 'update' | 'delete') {
  emitInsumoChanged(row.companyId, { insumoId: row.id, companyId: row.companyId, action, name: row.name, category: row.category,
    unit: row.unit, currentStock: toNum(row.currentStock), costPerUnit: toNum(row.costPerUnit), updatedAt: new Date(row.updatedAt).toISOString() });
}
export async function listInsumos(companyId?: string, category?: string, scope?: string | null) {
  const company = scope || companyId;
  return (await prisma.insumo.findMany({ where: { isDeleted: false, ...(company ? { OR: [{ companyId: company }, { companyId: null }] } : {}), ...(category ? { category } : {}) }, include, orderBy: { code: 'asc' } })).map(present);
}
export async function createInsumo(input: z.input<typeof createInsumoSchema>, scope?: string | null) {
  const { clientOpId: _op, ...data } = createInsumoSchema.parse(input);
  assertInsumoCompany(data.companyId ?? null, scope);
  const id = data.id ?? randomUUID();
  const result = await inventoryTransaction(async (tx) => {
    await lockInsumos(tx, [id]);
    const existing = await tx.insumo.findUnique({ where: { id } });
    if (existing) {
      if (existing.isDeleted || existing.companyId !== (data.companyId ?? null)) throw new AppError('El identificador ya fue utilizado.', 409, 'INSUMO_ID_CONFLICT');
      return details(tx, id); // UUID de alta estable; no restablecer stock/costo de una compra posterior.
    }
    // Rango bloqueado para que dos altas no asignen el mismo código.
    await tx.$queryRaw`SELECT [codigo] FROM [dbo].[insumos] WITH (UPDLOCK, HOLDLOCK) WHERE [codigo] LIKE 'INS-%'`;
    const codes = await tx.insumo.findMany({ select: { code: true } });
    const used = new Set(codes.map((i) => i.code)); let n = 1;
    while (used.has(`INS-${String(n).padStart(3, '0')}`)) n++;
    await tx.insumo.create({ data: { ...data, id, companyId: data.companyId ?? null, code: `INS-${String(n).padStart(3, '0')}`,
      lastPurchaseDate: data.lastPurchaseDate ?? null, lastPurchaseUtc: null } });
    return details(tx, id);
  });
  changed(result, 'create'); return present(result);
}
export async function updateInsumo(id: string, input: z.input<typeof updateInsumoSchema>, scope?: string | null) {
  const { expectedVersion, clientOpId: _op, ...updates } = updateInsumoSchema.parse(input);
  const result = await inventoryTransaction(async (tx) => {
    await lockInsumos(tx, [id]);
    const current = await details(tx, id);
    assertInsumoCompany(current.companyId, scope);
    if (current.isDeleted) throw new AppError('El insumo fue eliminado.', 409, 'INSUMO_DELETED');
    const same = Object.entries(updates).every(([key, value]) => ['minStock', 'costPerUnit'].includes(key) ? toNum(current[key as keyof typeof current] as any) === value : current[key as keyof typeof current] === value);
    if (expectedVersion !== undefined && current.version !== expectedVersion) {
      if (same) return { insumo: current, recipes: [] };
      throw new AppError('El insumo cambió en otra operación. Revise los datos actuales antes de guardar.', 409, 'INSUMO_VERSION_CONFLICT');
    }
    const baseChanged = (updates.unit !== undefined && updates.unit !== current.unit) || (updates.costPerUnit !== undefined && updates.costPerUnit !== toNum(current.costPerUnit));
    if (baseChanged && !present(current).canEditBase) throw new AppError('Unidad y costo inicial solo se corrigen sin stock ni referencias en compras, recetas o Kardex.', 409, 'INSUMO_BASE_LOCKED');
    if (same) return { insumo: current, recipes: [] };
    await tx.insumo.update({ where: { id }, data: { ...updates, version: { increment: 1 } } });
    const recipes = updates.name !== undefined && updates.name !== current.name ? current.recipeIngredients.map((i) => i.recipe) : [];
    if (recipes.length) {
      await tx.recipeIngredient.updateMany({ where: { insumoId: id, recipe: { isDeleted: false } }, data: { insumoName: updates.name } });
      await tx.recipe.updateMany({ where: { id: { in: recipes.map((r) => r.id) } }, data: { version: { increment: 1 } } });
    }
    return { insumo: await details(tx, id), recipes };
  });
  changed(result.insumo, 'update');
  for (const ref of result.recipes) {
    const recipe = await prisma.recipe.findUniqueOrThrow({ where: { id: ref.id } });
    emitRecipeChanged(recipe.companyId, { recipeId: recipe.id, companyId: recipe.companyId, action: 'update', productName: recipe.productName, category: recipe.category, updatedAt: recipe.updatedAt.toISOString() });
  }
  return present(result.insumo);
}
export async function deleteInsumo(id: string, expectedVersion?: number, scope?: string | null) {
  const result = await inventoryTransaction(async (tx) => {
    await lockInsumos(tx, [id]); const current = await details(tx, id); assertInsumoCompany(current.companyId, scope);
    if (current.isDeleted) return current;
    if (expectedVersion !== undefined && current.version !== expectedVersion) throw new AppError('El insumo cambió. Revise sus datos antes de eliminar.', 409, 'INSUMO_VERSION_CONFLICT');
    if (toNum(current.currentStock) !== 0) throw new AppError(`Tiene ${current.currentStock} ${current.unit} en stock. Registre el ajuste correspondiente antes de eliminar.`, 409, 'INSUMO_HAS_STOCK');
    if (current.recipeIngredients.length) throw new AppError('Está vinculado a fichas activas: ' + current.recipeIngredients.map((i) => i.recipe.productName).join(', '), 409, 'INSUMO_IN_RECIPES');
    await tx.insumo.update({ where: { id }, data: { isDeleted: true, version: { increment: 1 } } });
    return details(tx, id);
  });
  changed(result, 'delete'); return present(result);
}
