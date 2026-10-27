import test from 'node:test';
import assert from 'node:assert/strict';
import { orderTotalsFromItems } from '../src/lib/orderTotals.js';

test('el precio de venta incluye IGV y el redondeo conserva el total', () => {
  assert.deepEqual(orderTotalsFromItems([{ price: 45, quantity: 1 }]), { subtotal: 38.14, igv: 6.86, total: 45 });
  const totals = orderTotalsFromItems([{ price: 10.01, quantity: 3 }, { price: 5.5, quantity: 1 }]);
  assert.equal(totals.total, 35.53);
  assert.equal(Math.round((totals.subtotal + totals.igv) * 100), 3553);
});
