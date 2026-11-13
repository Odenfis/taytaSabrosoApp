import test from 'node:test';
import assert from 'node:assert/strict';
import { expectedShiftCash } from '../src/lib/shiftCash.ts';
import type { Transaction } from '../src/types.ts';

test('arqueo incluye ingresos adicionales y reclasificaciones de efectivo, pero no banco', () => {
  const movement = (amount: number, isIncome: boolean, type: string, bankAccountId?: string) =>
    ({ amount, isIncome, type, bankAccountId } as Transaction);
  assert.equal(expectedShiftCash([
    movement(100, true, 'Venta (mesa)'),
    movement(30, true, 'Ingreso adicional'),
    movement(20, false, 'Gasto'),
    movement(10, false, 'Reclasificación de Pago'),
    movement(5, true, 'Reclasificación de Pago'),
    movement(900, true, 'Venta (mesa)', 'banco'),
    movement(400, false, 'Gasto', 'banco'),
  ], 200), 305);
});
