import assert from 'node:assert/strict';
import { test } from 'node:test';
import { orderView } from '../src/lib/order-view.js';
test('mozo recibe precios y total de comanda pero no detalles de caja de una venta', () => {
  const sale = { id: 'sale', total: 100, items: [{ price: 100 }], paymentMethod: 'Yape', amountReceived: 100, change: 0 };
  assert.deepEqual(orderView(sale, 'Mesero'), { id: 'sale', total: 100, items: [{ price: 100 }] });
  for (const role of ['Administrador', 'Jefe de restaurante', 'Cajero']) assert.deepEqual(orderView(sale, role), sale);
  assert.equal(sale.paymentMethod, 'Yape');
});
