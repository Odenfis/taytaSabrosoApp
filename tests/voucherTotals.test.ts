import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVoucherLines } from '../src/lib/voucherImage.ts';
import type { Order } from '../src/types.ts';

const header = { name: 'Tayta', ruc: '20111111111', slogan: 'Restaurante', address: 'Lima' };
const order = { ticketNumber: '7', tableNumber: '01', zone: 'Salón Principal', createdAt: 'Hoy', waiter: 'Prueba',
  status: 'por_cobrar', items: [{ id: 'i', price: 45, quantity: 1, name: 'Lomo Saltado' }],
  subtotal: 38.14, igv: 6.86, total: 45 } as Order;

test('preventa y ticket pagado comparten precio final e IGV incluido', () => {
  for (const paid of [false, true]) {
    const lines = buildVoucherLines({ ...order, status: paid ? 'cobrado' : 'por_cobrar' }, header, paid).map((line) => line.text);
    assert.ok(lines.some((line) => line.includes('S/ 45.00') && line.includes('Lomo Saltado')));
    assert.ok(lines.some((line) => line.includes('Subtotal sin IGV') && line.includes('38.14')));
    assert.ok(lines.some((line) => line.includes('IGV incluido 18%') && line.includes('6.86')));
    assert.ok(lines.some((line) => line.includes('TOTAL') && line.includes('45.00')));
  }
});

test('ticket cobrado histórico conserva su desglose anterior', () => {
  const lines = buildVoucherLines({ ...order, status: 'cobrado', subtotal: 45, igv: 8.1, total: 53.1 }, header, true).map((line) => line.text);
  assert.ok(lines.some((line) => line.startsWith('I.G.V. 18%:') && line.includes('8.10')));
  assert.ok(lines.some((line) => line.includes('TOTAL') && line.includes('53.10')));
});
