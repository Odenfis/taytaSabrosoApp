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
