import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canOpenScreen } from '../src/lib/screenAccess';

test('navegación aplica la matriz central por perfil', () => {
  assert.equal(canOpenScreen('Administrador', 'configuracion'), true);
  assert.equal(canOpenScreen('Jefe de restaurante', 'productos'), true);
  assert.equal(canOpenScreen('Jefe de restaurante', 'reportes'), false);
  assert.equal(canOpenScreen('Cajero', 'cobro'), true);
  assert.equal(canOpenScreen('Cajero', 'kardex'), false);
  assert.equal(canOpenScreen('Mesero', 'pedido'), true);
  assert.equal(canOpenScreen('Mesero', 'cobro'), false);
  assert.equal(canOpenScreen('Coordinador', 'mesas'), false);
});
