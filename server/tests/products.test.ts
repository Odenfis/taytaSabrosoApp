import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createProductSchema, updateProductSchema, recipeRatio } from '../src/services/product.service.js';
import { matchingRecipe } from '../src/lib/recipeMatch.js';

test('contrato productos acepta clientes antiguos y UUID/version opcionales', () => {
  const product = createProductSchema.parse({ companyId: 'el-tayta', name: '  Agua  ', price: 0.50, category: 'bebidas', hasRecipe: true });
  assert.equal(product.name, 'Agua');
  assert.equal(product.available, true);
  assert.equal(product.description, '');
  assert.equal(updateProductSchema.parse({ price: 2, expectedVersion: 3 }).expectedVersion, 3);
});
test('validación API rechaza valores fuera del contrato SQL', () => {
  for (const bad of [{ name: ' ' }, { price: 0 }, { price: 1.001 }, { price: 10000000000 }, { category: 'otra' }, { image: 'https://' }, { description: 'x'.repeat(501) }, { expectedVersion: 0 }]) {
    assert.equal(updateProductSchema.safeParse(bad).success, false);
  }
});
test('porcentaje de costo se recalcula y exceso decimal se rechaza antes de SQL', () => {
  assert.equal(recipeRatio(2, 15), 13.33);
  assert.throws(() => recipeRatio(2, 0.01), (error: any) => error.code === 'INVALID_FOOD_COST');
});
test('resolución de receta no cruza empresas ni usa nombres de productos vinculados ajenos', () => {
  const own = { companyId: 'a', productId: 'p', productName: 'Antes' };
  const other = { companyId: 'b', productId: 'x', productName: 'Nombre' };
  assert.equal(matchingRecipe([own, other], 'a', { productId: 'p', name: 'Nuevo' }), own);
  assert.equal(matchingRecipe([other], 'a', { productId: 'p', name: 'Nombre' }), undefined);
  assert.equal(matchingRecipe([{ ...own, productId: 'otro', productName: 'Nuevo' }], 'a', { productId: 'p', name: 'Nuevo' }), undefined);
  const legacy = { companyId: 'a', productId: null, productName: 'Nuevo' };
  assert.equal(matchingRecipe([legacy], 'a', { productId: 'p', name: 'Nuevo' }), legacy);
  assert.equal(matchingRecipe([legacy, { ...legacy }], 'a', { productId: 'p', name: 'Nuevo' }), undefined);
});
