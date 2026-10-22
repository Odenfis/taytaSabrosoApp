import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AppError, plain, round2, toNum } from '../lib/utils.js';
import { emitProductChanged, emitRecipeChanged } from '../lib/realtime.js';

export const productFields = z.object({
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(500),
  price: z.number().finite().positive().max(9999999999.99).refine((v) => Math.abs(v - round2(v)) < 1e-7, 'Use dos decimales como máximo.'),
  category: z.enum(['platos', 'entradas', 'bebidas', 'postres', 'brasas']),
  image: z.string().trim().max(1000).refine((v) => !v || (() => { try { return ['http:', 'https:'].includes(new URL(v).protocol); } catch { return false; } })(), 'Use una URL HTTP o HTTPS.'),
  available: z.boolean(),
});
export const createProductSchema = productFields.extend({
  id: z.uuid().optional(), companyId: z.string().min(1).max(36),
  description: productFields.shape.description.default(''), image: productFields.shape.image.default(''),
  available: z.boolean().default(true), hasRecipe: z.boolean().optional(),
});
export const updateProductSchema = productFields.partial().extend({
  expectedVersion: z.number().int().positive().optional(), hasRecipe: z.boolean().optional(),
});
export type ProductCreate = z.input<typeof createProductSchema>;
export type ProductUpdate = z.input<typeof updateProductSchema>;

export function recipeRatio(totalCost: unknown, price: number): number {
  const ratio = price > 0 ? round2(toNum(totalCost) / price * 100) : 0;
  if (ratio > 999.99) throw new AppError('El precio produce un porcentaje de costo mayor a 999.99%. Revise precio y ficha.', 400, 'INVALID_FOOD_COST');
  return ratio;
}

export async function syncLinkedRecipes(tx: Prisma.TransactionClient, product: { id: string; companyId: string; name: string; category: string; price: unknown }) {
  const recipes = await tx.recipe.findMany({ where: { productId: product.id, isDeleted: false } });
  for (const recipe of recipes) {
    if (recipe.companyId !== product.companyId) throw new AppError('El producto y su ficha deben pertenecer a la misma empresa.', 409, 'PRODUCT_COMPANY_MISMATCH');
    await tx.recipe.update({ where: { id: recipe.id }, data: {
      productName: product.name, category: product.category, salePrice: toNum(product.price),
      theoreticalFoodCostPct: recipeRatio(recipe.totalCost, toNum(product.price)), version: { increment: 1 },
    } });
  }
  return recipes.length > 0;
}

// Compare-and-swap: incluso dos llamadas simultáneas no pueden pisar la misma versión.
export async function writeProduct(tx: Prisma.TransactionClient, id: string, input: ProductUpdate) {
  const { expectedVersion, hasRecipe: _legacyFlag, ...updates } = updateProductSchema.parse(input);
  const current = await tx.product.findUnique({ where: { id } });
  if (!current || current.isDeleted) throw new AppError('Producto no encontrado.', 404, 'PRODUCT_NOT_FOUND');
  const same = Object.entries(updates).every(([key, value]) => key === 'price'
    ? toNum(current.price) === value : current[key as keyof typeof current] === value);
  if (expectedVersion !== undefined && expectedVersion !== current.version) {
    // Respuesta perdida: una asignación ya aplicada se reconoce sin volver a escribir.
    if (same) return current;
    throw new AppError('Otra terminal modificó este producto. Revise los cambios antes de continuar.', 409, 'PRODUCT_VERSION_CONFLICT');
  }
  const hasRecipe = await tx.recipe.count({ where: { productId: id, isDeleted: false } }) > 0;
  const result = await tx.product.updateMany({ where: { id, version: current.version, isDeleted: false },
    data: { ...updates, hasRecipe, version: { increment: 1 } } });
  if (result.count !== 1) throw new AppError('El producto cambió durante el guardado. Revise su versión.', 409, 'PRODUCT_VERSION_CONFLICT');
  const product = (await tx.product.findUnique({ where: { id } }))!;
  await syncLinkedRecipes(tx, product);
  return product;
}

export async function notifyProduct(product: { id: string; companyId: string; name: string; price: unknown; category: string; hasRecipe: boolean; updatedAt: Date }, action: 'create' | 'update' | 'delete' = 'update') {
  emitProductChanged(product.companyId, { productId: product.id, companyId: product.companyId,
    action, name: product.name, price: toNum(product.price), category: product.category,
    hasRecipe: product.hasRecipe, updatedAt: new Date(product.updatedAt).toISOString() });
}

export async function notifyLinkedRecipes(productId: string) {
  const recipes = await prisma.recipe.findMany({ where: { productId, isDeleted: false } });
  for (const r of recipes) emitRecipeChanged(r.companyId, { recipeId: r.id, companyId: r.companyId,
    action: 'update', productName: r.productName, category: r.category, updatedAt: r.updatedAt.toISOString() });
}

export async function createProduct(input: ProductCreate) {
  const { hasRecipe: _legacyFlag, ...data } = createProductSchema.parse(input);
  const id = data.id ?? randomUUID();
  const existing = await prisma.product.findUnique({ where: { id } });
  const replay = (product: NonNullable<typeof existing>) => {
    if (product.companyId !== data.companyId || product.isDeleted) throw new AppError('El identificador del producto ya está ocupado.', 409, 'PRODUCT_ID_CONFLICT');
    const same = Object.entries(data).every(([key, value]) => key === 'price'
      ? toNum(product.price) === value : product[key as keyof typeof product] === value);
    if (!same) throw new AppError('El producto ya fue creado con otros datos. Revise su versión.', 409, 'PRODUCT_VERSION_CONFLICT');
    return plain(product);
  };
  if (existing) return replay(existing);
  try {
    const product = await prisma.product.create({ data: { ...data, id, hasRecipe: false } });
    await notifyProduct(product, 'create');
    return plain(product);
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') {
      const created = await prisma.product.findUnique({ where: { id } });
      if (created) return replay(created);
    }
    throw err;
  }
}

export async function updateProduct(id: string, updates: ProductUpdate) {
  const product = await prisma.$transaction((tx) => writeProduct(tx, id, updates)).catch((err) => {
    if (err?.code === 'P2034') throw new AppError('Otra terminal modificó este producto. Revise su versión.', 409, 'PRODUCT_VERSION_CONFLICT');
    throw err;
  });
  await notifyProduct(product);
  // La notificación nunca debe convertir un commit exitoso en una respuesta de error.
  await notifyLinkedRecipes(id).catch(() => undefined);
  return plain(product);
}
