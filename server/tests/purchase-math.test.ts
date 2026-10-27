import test from 'node:test';
import assert from 'node:assert/strict';
import { checkedPurchaseLine, checkedPurchaseTotals } from '../src/lib/purchaseMath.js';

test('descuento por línea se resta antes de IGV y suma al total neto', () => {
  const first = { quantity: 2, unitCost: 10, discount: 3, totalCost: 17 };
  const second = { quantity: 1, unitCost: 5, totalCost: 5 };
  assert.deepEqual(checkedPurchaseTotals([first, second], 22, 3.96, 25.96), {
    subtotal: 22, igv: 3.96, total: 25.96,
  });
  assert.equal(checkedPurchaseLine(first).netUnitCost, 8.5);
});

test('rechaza descuentos inválidos e importes manipulados', () => {
  const base = { quantity: 2, unitCost: 10, discount: 3, totalCost: 17 };
  for (const invalid of [
    { ...base, discount: -1 }, { ...base, discount: 21 },
    { ...base, discount: Number.NaN }, { ...base, totalCost: 18 },
  ]) assert.throws(() => checkedPurchaseLine(invalid));
  assert.throws(() => checkedPurchaseTotals([base], 17, 3.06, 21));
});
