import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInsumoSchema, updateInsumoSchema } from '../src/services/insumo.service.js';

test('contrato de edición rechaza stock, empresa, código y fechas', () => {
  for (const field of ['currentStock', 'companyId', 'code', 'lastPurchaseDate']) assert.equal(updateInsumoSchema.safeParse({ [field]: field === 'currentStock' ? 0 : 'x' }).success, false);
  assert.equal(updateInsumoSchema.parse({ minStock: 0, expectedVersion: 2 }).minStock, 0);
});
test('contrato valida precisión SQL, categorías y unidades', () => {
  for (const value of [-1, NaN, Infinity, 100000000, 0.00001]) assert.equal(updateInsumoSchema.safeParse({ minStock: value }).success, false);
  assert.equal(updateInsumoSchema.safeParse({ category: 'Otra' }).success, false);
  assert.equal(updateInsumoSchema.safeParse({ unit: 'caja' }).success, false);
  const created = createInsumoSchema.parse({ companyId: null, name: '  Sal  ', category: 'Abarrotes & Especias', unit: 'kg', currentStock: 0, costPerUnit: 0 });
  assert.equal(created.name, 'Sal'); assert.equal(created.minStock, 0);
});
