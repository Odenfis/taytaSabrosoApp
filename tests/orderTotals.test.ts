import test from 'node:test';
import assert from 'node:assert/strict';
import { isHistoricalAdditiveOrder, normalizeUnpaidOrder, orderTotalsFromItems } from '../src/lib/orderTotals.ts';
import type { Order } from '../src/types.ts';

const item = (price: number, quantity: number) => ({ price, quantity });

test('precio ingresado ya incluye IGV', () => {
  assert.deepEqual(orderTotalsFromItems([item(45, 1)]), { subtotal: 38.14, igv: 6.86, total: 45 });
  assert.deepEqual(orderTotalsFromItems([item(45, 2), item(5.5, 1)]), { subtotal: 80.93, igv: 14.57, total: 95.5 });
});

test('normaliza órdenes pendientes y conserva tickets cobrados', () => {
  const legacy = { status: 'por_cobrar', subtotal: 45, igv: 8.1, total: 53.1,
    items: [{ price: 45, quantity: 1 }] } as Order;
  assert.deepEqual(normalizeUnpaidOrder(legacy), { ...legacy, subtotal: 38.14, igv: 6.86, total: 45 });
  const paid = { ...legacy, status: 'cobrado' as const };
  assert.strictEqual(normalizeUnpaidOrder(paid), paid);
  assert.equal(isHistoricalAdditiveOrder(paid), true);
  assert.equal(isHistoricalAdditiveOrder({ ...paid, total: 45 }), false);
});
