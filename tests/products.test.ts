import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { stageProduct, overlayProducts, overlayRecipes, validateProduct, markProductIssue, type ProductDraft } from '../src/lib/productCatalog';
import { loadQueue } from '../src/lib/offlineQueue';
import { matchingRecipe } from '../src/lib/recipeMatch';
import { replayCall } from '../src/lib/replayQueue';
import { storeAuthToken } from '../src/lib/api';
import type { Product, Recipe } from '../src/types';

beforeEach(() => {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
});
afterEach(() => mock.restoreAll());
const draft: ProductDraft = { companyId: 'el-tayta', name: 'Agua', price: 3.50, category: 'bebidas', description: 'Botella', image: '', available: true };

test('alta offline persiste UUID y las ediciones se acumulan en la misma alta tras recargar', () => {
  const first = stageProduct(draft);
  const restored = overlayProducts([], [], loadQueue())[0];
  assert.equal(restored.name, 'Agua');
  assert.match(restored.id, /^[\da-f-]{36}$/);
  const second = stageProduct({ ...draft, price: 4 }, restored);
  assert.equal(second.op, 'createProduct');
  assert.equal(loadQueue().length, 1);
  assert.equal((second.payload as any).id, restored.id);
  assert.notEqual(second.clientOpId, first.clientOpId);
  assert.equal(overlayProducts([], [])[0].price, 4);
});

test('fallo de almacenamiento no anuncia ni materializa un alta', () => {
  mock.method(localStorage, 'setItem', () => { throw new Error('QuotaExceeded'); });
  assert.throws(() => stageProduct(draft), /No se pudo guardar/);
  assert.equal(loadQueue().length, 0);
});

test('ediciones conservan expectedVersion original y refresco REST conserva cambios locales', () => {
  const server = { ...draft, id: 'product', version: 4, hasRecipe: true } as Product;
  stageProduct({ ...draft, name: 'Agua mineral' }, server);
  stageProduct({ ...draft, name: 'Agua grande' }, { ...server, version: 5 });
  assert.equal((loadQueue()[0].payload as any).expectedVersion, 4);
  const refreshed = overlayProducts([{ ...server, name: 'Servidor', version: 6 }], []);
  assert.equal(refreshed[0].name, 'Agua grande');
  assert.equal(refreshed[0].description, 'Botella');
});

test('conflicto queda persistido y requiere elección antes de editar', () => {
  const current = { ...draft, id: 'product', version: 1, hasRecipe: false } as Product;
  const op = stageProduct(draft, current);
  markProductIssue(op, 'Otra terminal modificó el producto', true);
  assert.equal(loadQueue()[0].conflict, true);
  assert.throws(() => stageProduct(draft, current), /conflicto/);
});

test('producto actualiza campos comerciales de ficha sin alterar ingredientes', () => {
  const product = { ...draft, id: 'p', version: 1, hasRecipe: true } as Product;
  const ingredients = [{ insumoName: 'Agua', quantity: 1 }];
  const recipe = { id: 'r', companyId: draft.companyId, productId: 'p', productName: 'Agua',
    category: 'bebidas', salePrice: 3.5, totalCost: 1, ingredients } as Recipe;
  stageProduct({ ...draft, name: 'Agua nueva', price: 5 }, product);
  const result = overlayRecipes([recipe], [])[0];
  assert.equal(result.productName, 'Agua nueva');
  assert.equal(result.theoreticalFoodCostPct, 20);
  assert.deepEqual(result.ingredients, ingredients);
});

test('validación rechaza precio inválido, nombre vacío, URL inválida y exceso SQL', () => {
  for (const invalid of [{ price: 0 }, { price: 1.001 }, { name: '  ' }, { image: 'https://' }, { name: 'x'.repeat(151) }]) {
    assert.throws(() => validateProduct({ ...draft, ...invalid }));
  }
  assert.equal(validateProduct({ ...draft, name: ' Agua ' }).name, 'Agua');
});

test('recetas homónimas respetan vínculo, empresa y fallback único sin vínculo', () => {
  const recipes = [
    { companyId: 'el-sabroso', productId: 'p', productName: 'Agua' },
    { companyId: 'el-tayta', productId: 'otro', productName: 'Agua' },
  ];
  assert.equal(matchingRecipe(recipes, 'el-tayta', { productId: 'p', name: 'Agua' }), undefined);
  const legacy = { companyId: 'el-tayta', productId: null, productName: 'Agua' };
  assert.equal(matchingRecipe([...recipes, legacy], 'el-tayta', { productId: 'p', name: 'Agua' }), legacy);
  assert.equal(matchingRecipe([legacy, { ...legacy }], 'el-tayta', { productId: 'p', name: 'Agua' }), undefined);
});

test('replay preserva UUID y convierte 409 en conflicto; 401 conserva cola', async () => {
  storeAuthToken({ token: 'test', expiresAt: new Date(Date.now() + 60000).toISOString() });
  const op = stageProduct(draft);
  let body: any;
  const fetchMock = mock.method(globalThis, 'fetch', async (_url: any, init: any) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ error: { code: 'PRODUCT_VERSION_CONFLICT', message: 'Conflicto' } }), { status: 409 });
  });
  assert.equal((await replayCall(op, op.payload as any)).disposition, 'conflict');
  assert.equal(body.id, (op.payload as any).id);
  fetchMock.mock.mockImplementation(async () => new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Sesión vencida' } }), { status: 401 }));
  assert.equal((await replayCall(op, op.payload as any)).unauthorized, true);
  assert.equal(loadQueue().length, 1);
});

test('una respuesta REST antigua no revierte una versión más reciente', () => {
  const current = { ...draft, id: 'p', version: 3, hasRecipe: false } as Product;
  const old = { ...current, version: 2, price: 1 };
  assert.equal(overlayProducts([old], [current])[0].price, current.price);
});

test('ficha pendiente se reconstruye con su producto aunque la caché React no llegó a persistirse', () => {
  const recipe = { id: 'r', companyId: draft.companyId, productId: 'p', productName: 'Plato offline', salePrice: 15,
    category: 'platos', totalCost: 3, ingredients: [], portions: 1, theoreticalFoodCostPct: 20 };
  const queue = [{ clientOpId: 'op', entity: 'catalog' as const, op: 'saveRecipe', createdAt: new Date().toISOString(), payload: recipe }];
  assert.equal(overlayProducts([], [], queue)[0].id, 'p');
  assert.equal(overlayRecipes([], [], queue)[0].productName, 'Plato offline');
});

test('doble replay de la misma alta comparte una sola solicitud', async () => {
  storeAuthToken({ token: 'test', expiresAt: new Date(Date.now() + 60000).toISOString() });
  const op = stageProduct(draft);
  const fetchMock = mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ ...draft, id: (op.payload as any).id })));
  const responses = await Promise.all([replayCall(op, op.payload as any), replayCall(op, op.payload as any)]);
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.ok(responses.every((r) => r.disposition === 'ok'));
});
