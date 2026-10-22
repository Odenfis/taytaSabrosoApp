import type { Product, ProductCategory, PendingOp, Recipe } from '../types';
import { loadQueue, saveQueue } from './offlineQueue';

export const PRODUCT_CATEGORIES: Record<ProductCategory, string> = {
  platos: 'Platos de fondo', entradas: 'Entradas', bebidas: 'Bebidas', postres: 'Postres', brasas: 'Brasas',
};
export type ProductDraft = Pick<Product, 'companyId' | 'name' | 'description' | 'price' | 'category' | 'image' | 'available'>;
export const PRODUCT_QUEUE_EVENT = 'pos:product-queue';
export const isProductOp = (op: PendingOp) => op.op === 'createProduct' || op.op === 'updateProduct';
export const productIdOf = (op: PendingOp) => String((op.payload as Record<string, unknown>)?.id ?? '');
export function productPending() { return loadQueue().filter(isProductOp); }
export function signalProductQueue() { window.dispatchEvent(new Event(PRODUCT_QUEUE_EVENT)); }
export function persistProductQueue(queue: PendingOp[]) {
  saveQueue(queue, true);
  signalProductQueue();
}
export function uuid() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  const h = Array.from(b, (v) => v.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
export function validateProduct(draft: ProductDraft): ProductDraft {
  const d = { ...draft, name: draft.name.trim(), description: draft.description.trim(), image: draft.image.trim() };
  if (!['el-tayta', 'el-sabroso'].includes(d.companyId)) throw new Error('Seleccione una empresa.');
  if (!d.name || d.name.length > 150) throw new Error('Ingrese un nombre de hasta 150 caracteres.');
  if (!Object.hasOwn(PRODUCT_CATEGORIES, d.category)) throw new Error('Seleccione una categoría válida.');
  if (!Number.isFinite(d.price) || d.price <= 0 || d.price > 9999999999.99 || Math.abs(d.price * 100 - Math.round(d.price * 100)) > 0.00001) throw new Error('Ingrese un precio mayor que cero, con hasta dos decimales.');
  if (d.description.length > 500) throw new Error('La descripción admite hasta 500 caracteres.');
  if (d.image.length > 1000) throw new Error('La URL de imagen admite hasta 1000 caracteres.');
  if (d.image) {
    try { if (!['http:', 'https:'].includes(new URL(d.image).protocol)) throw new Error(); }
    catch { throw new Error('Ingrese una URL de imagen HTTP o HTTPS válida.'); }
  }
  return d;
}

export function stageProduct(draft: ProductDraft, current?: Product, preferredId?: string) {
  const data = validateProduct(draft);
  const id = current?.id ?? preferredId ?? uuid();
  const queue = loadQueue();
  const index = queue.findIndex((op) => isProductOp(op) && productIdOf(op) === id);
  const prior = queue[index];
  if (prior?.conflict) throw new Error('Revise primero el conflicto de este producto.');
  const op: PendingOp = { clientOpId: uuid(), entity: 'catalog',
    op: prior?.op ?? (current ? 'updateProduct' : 'createProduct'),
    payload: { ...data, id, expectedVersion: (prior?.payload as Record<string, unknown>)?.expectedVersion ?? current?.version },
    createdAt: prior?.createdAt ?? new Date().toISOString() };
  if (index >= 0) queue[index] = op; else queue.push(op);
  persistProductQueue(queue); // Persistir antes de anunciar éxito o cambiar estado React.
  return op;
}

export function markProductIssue(op: PendingOp, message: string, conflict: boolean) {
  persistProductQueue(loadQueue().map((item) => item.clientOpId === op.clientOpId ? { ...item, error: message, conflict } : item));
}

export function overlayProducts(server: Product[], local: Product[], queue = loadQueue()): Product[] {
  const products = new Map(server.map((p) => {
    const previous = local.find((item) => item.id === p.id);
    return [p.id, previous && (previous.version ?? 0) > (p.version ?? 0) ? previous : p];
  }));
  for (const op of queue) {
    const data = op.payload as Record<string, unknown>;
    if (isProductOp(op)) {
      const id = productIdOf(op);
      const base = products.get(id) ?? local.find((p) => p.id === id);
      products.set(id, { ...base, ...data, id, hasRecipe: base?.hasRecipe ?? false } as Product);
    } else if (['saveRecipe', 'createRecipe', 'updateRecipe'].includes(op.op) && data.productId) {
      const id = String(data.productId);
      const base = products.get(id) ?? local.find((p) => p.id === id);
      products.set(id, { description: '', image: '', available: true, companyId: data.companyId as Product['companyId'], id, ...base, name: String(data.productName ?? base?.name),
        price: Number(data.salePrice ?? base?.price), category: (data.category ?? base?.category) as ProductCategory, hasRecipe: true });
    }
  }
  return [...products.values()];
}

export function overlayRecipes(server: Recipe[], local: Recipe[], queue = loadQueue()): Recipe[] {
  const recipes = new Map(server.map((r) => {
    const previous = local.find((item) => item.id === r.id);
    return [r.id, previous && (previous.version ?? 0) > (r.version ?? 0) ? previous : r];
  }));
  for (const op of queue) {
    const data = op.payload as Record<string, unknown>;
    if (['saveRecipe', 'createRecipe', 'updateRecipe'].includes(op.op)) {
      const id = String(data.id ?? data.tempId ?? '');
      const base = recipes.get(id) ?? local.find((r) => r.id === id);
      recipes.set(id, { ...base, ...data, id } as unknown as Recipe);
      for (const [linkedId, linked] of recipes) {
        if (linkedId !== id && data.productId && linked.productId === data.productId && linked.companyId === data.companyId) {
          const price = Number(data.salePrice);
          recipes.set(linkedId, { ...linked, productName: String(data.productName), category: String(data.category), salePrice: price,
            theoreticalFoodCostPct: price > 0 ? Math.round(linked.totalCost / price * 10000) / 100 : 0 });
        }
      }
    }
    if (isProductOp(op)) {
      for (const [id, recipe] of recipes) if (recipe.productId === data.id && recipe.companyId === data.companyId) {
        const price = Number(data.price);
        recipes.set(id, { ...recipe, productName: String(data.name), category: String(data.category), salePrice: price,
          theoreticalFoodCostPct: price > 0 ? Math.round(recipe.totalCost / price * 10000) / 100 : 0 });
      }
    }
  }
  return [...recipes.values()];
}
