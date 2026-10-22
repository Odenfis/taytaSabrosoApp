import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isBackdropClick } from '../src/lib/modalGesture';
const point = { pointerId: 1, x: 10, y: 10, onBackdrop: true };
test('arrastrar selección desde el formulario hacia el fondo no cierra', () => {
  assert.equal(isBackdropClick({ ...point, onBackdrop: false }, { ...point, x: 200 }), false);
});
test('solo un clic corto iniciado y terminado en fondo puede cerrar', () => {
  assert.equal(isBackdropClick(point, point), true);
  assert.equal(isBackdropClick(point, { ...point, x: 100 }), false);
  assert.equal(isBackdropClick(point, { ...point, onBackdrop: false }), false);
  assert.equal(isBackdropClick(null, point), false);
  assert.equal(isBackdropClick(point, { ...point, pointerId: 2 }), false);
});
