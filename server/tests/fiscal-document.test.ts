import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fiscalCents, fiscalTaxIncluded, nextFiscalDocumentState } from '../src/lib/fiscal-document.js';

test('resultado incierto exige consulta o revisión antes de reenviar', () => {
  assert.equal(nextFiscalDocumentState('prepared', 'send'), 'sending');
  assert.equal(nextFiscalDocumentState('sending', 'transport_uncertain'), 'outcome_unknown');
  assert.throws(() => nextFiscalDocumentState('outcome_unknown', 'send'));
  assert.equal(nextFiscalDocumentState('outcome_unknown', 'accept'), 'accepted');
  assert.throws(() => nextFiscalDocumentState('accepted', 'send'));
  assert.equal(nextFiscalDocumentState('sending', 'reject'), 'rejected');
  assert.equal(nextFiscalDocumentState('rejected', 'require_review'), 'review_required');
});
test('importe con IGV incluido conserva céntimos y rechaza entradas imprecisas', () => {
  assert.deepEqual(fiscalTaxIncluded(45), { total: 4500, subtotal: 3814, igv: 686 });
  assert.deepEqual(fiscalTaxIncluded(0.01), { total: 1, subtotal: 1, igv: 0 });
  for (const n of [-1, Infinity, NaN, 1.001, 10_000_000_000]) assert.throws(() => fiscalCents(n));
});

test('ejemplos anonimizados 10,5 %: precios finales, desglose por línea y totales', async () => {
  const { calculateFiscalLines } = await import('../src/lib/fiscal-document.js');
  const samples = [
    { lines: [{ description: 'Artículo', quantity: 1, unitPriceCents: 300 }], total: 300, base: 271, tax: 29 },
    { lines: [{ description: 'Artículo A', quantity: 1, unitPriceCents: 3800 }, { description: 'Artículo B', quantity: 1, unitPriceCents: 2100 }], total: 5900, base: 5339, tax: 561 },
    { lines: [{ description: 'Artículo A', quantity: 1, unitPriceCents: 3800 }, { description: 'Artículo B', quantity: 1, unitPriceCents: 500 }], total: 4300, base: 3891, tax: 409 },
    { lines: [{ description: 'Artículo A', quantity: 1, unitPriceCents: 11500 }, { description: 'Artículo B', quantity: 1, unitPriceCents: 2200 }, { description: 'Artículo C', quantity: 3, unitPriceCents: 1800 }], total: 19100, base: 17285, tax: 1815 },
  ];
  for (const sample of samples) {
    const result = calculateFiscalLines(sample.lines, 1050);
    assert.deepEqual([result.totalCents, result.baseCents, result.taxCents], [sample.total, sample.base, sample.tax]);
    for (const line of result.lines) assert.equal(line.baseCents + line.taxCents, line.totalCents);
  }
});

test('tasas y líneas fiscales rechazan entradas imposibles sin alterar datos', async () => {
  const { calculateFiscalLines } = await import('../src/lib/fiscal-document.js');
  const lines = [{ description: 'Producto', quantity: 1, unitPriceCents: 4500 }];
  const before = structuredClone(lines);
  assert.equal(calculateFiscalLines(lines, 1800).taxCents, 686);
  assert.equal(calculateFiscalLines(lines, 0).taxCents, 0);
  for (const rate of [-1, 1.5, 10001, NaN]) assert.throws(() => calculateFiscalLines(lines, rate));
  for (const line of [{...lines[0], quantity: 0}, {...lines[0], quantity: 1.5}, {...lines[0], unitPriceCents: -1}, {...lines[0], description: ' '}]) assert.throws(() => calculateFiscalLines([line], 1050));
  assert.deepEqual(lines, before);
});
