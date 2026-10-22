import assert from 'node:assert/strict';
import { test } from 'node:test';
import { availablePaymentMethods, reconcilePaymentSelection, resolvePaymentMethod, paymentDetails } from '../src/lib/paymentSelection';
import type { CustomPaymentMethod } from '../src/types';
const cash: CustomPaymentMethod = { id: 'cash', name: 'Efectivo en Caja', companyId: 'el-tayta', category: 'Efectivo', requiresReferenceNumber: false, isActive: true, icon: 'payments' };
const card: CustomPaymentMethod = { ...cash, id: 'card', name: 'POS', category: 'Tarjeta / POS', requiresReferenceNumber: true, bankAccountId: 'bank-1' };

test('selección inicial por categoría, catálogo tardío y selección invalidada', () => {
  assert.equal(reconcilePaymentSelection([], undefined), undefined);
  assert.equal(reconcilePaymentSelection([card, cash], undefined), cash.id);
  assert.equal(reconcilePaymentSelection([card], undefined), card.id);
  assert.equal(reconcilePaymentSelection([cash, card], card.id), card.id);
  assert.equal(reconcilePaymentSelection([cash], card.id), null);
  assert.equal(reconcilePaymentSelection([cash, card], null), null);
  assert.equal(reconcilePaymentSelection([{ ...cash, name: 'Caja principal' }], cash.id), cash.id);
});
test('empresa de mesa, compartidos, inactivos y eliminados', () => {
  const methods = [cash, { ...card, companyId: 'ambas' as const }, { ...cash, id: 'other', companyId: 'el-sabroso' as const }, { ...cash, id: 'inactive', isActive: false }, { ...cash, id: 'deleted', isDeleted: true }];
  assert.deepEqual(availablePaymentMethods(methods, 'el-tayta').map(m => m.id), ['cash', 'card']);
  assert.deepEqual(availablePaymentMethods(methods), []);
});
test('ID prevalece sobre nombres duplicados; ID inválido no cae a nombre', () => {
  const duplicate = { ...card, id: 'second', bankAccountId: 'bank-2' };
  assert.equal(resolvePaymentMethod([card, duplicate], 'el-tayta', 'POS', 'second')?.bankAccountId, 'bank-2');
  assert.equal(resolvePaymentMethod([card], 'el-tayta', 'POS', 'missing'), undefined);
  assert.equal(resolvePaymentMethod([card], 'el-sabroso', 'POS'), undefined);
  assert.equal(resolvePaymentMethod([card], 'el-tayta', 'pos')?.id, card.id);
});
test('efectivo vacío, cero, negativo, inválido, insuficiente, exacto y vuelto', () => {
  for (const input of ['', '113.28']) {
    const details = paymentDetails(cash, 113.28, input, 'viejo');
    assert.equal(details.error, ''); assert.equal(details.amountReceived, 113.28);
    assert.equal(details.referenceNumber, undefined); assert.equal(details.isCash, true);
  }
  for (const input of ['0', '-1', 'abc', 'Infinity', '100']) assert.ok(paymentDetails(cash, 113.28, input, '').error);
  assert.equal(paymentDetails(cash, 113.28, '150', '').change, 36.72);
});
test('campos y payload dependen del método y configuración, no del nombre', () => {
  for (const name of ['Plin BBVA', 'POS', 'Transferencia', 'Yape']) {
    const method = { ...card, name };
    assert.ok(paymentDetails(method, 113.28, '150', ' ').error);
    const details = paymentDetails(method, 113.28, '150', ' OP-123 ');
    assert.equal(details.isCash, false); assert.equal(details.amountReceived, 113.28);
    assert.equal(details.paymentMethod, name); assert.equal(details.customPaymentMethodId, method.id);
    assert.equal(details.referenceNumber, 'OP-123'); assert.equal(details.error, '');
  }
  const optional = paymentDetails({ ...card, requiresReferenceNumber: false }, 10, '0', 'viejo');
  assert.equal(optional.error, ''); assert.equal(optional.referenceNumber, undefined);
  assert.ok(paymentDetails({ ...cash, requiresReferenceNumber: true }, 10, '', '').error);
  assert.ok(paymentDetails(undefined, 10, '', '').error);
});
