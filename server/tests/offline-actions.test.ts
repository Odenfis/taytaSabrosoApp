import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ROUTE_PERMISSIONS } from '../src/lib/route-permissions.js';
import {
  OFFLINE_ACTIONS,
  canonicalJson,
  offlineActionForRequest,
  offlineBindingsForOp,
} from '../src/lib/offline-actions.js';

const WRITE_METHODS = new Set(['POST', 'PATCH', 'DELETE']);

test('toda ruta de escritura de operaciones y catálogos declara una acción firmada', () => {
  const writes = ROUTE_PERMISSIONS.filter((route) =>
    (route.group === 'operations' || route.group === 'catalogs') && WRITE_METHODS.has(route.method));
  assert.ok(writes.length >= 41, `el inventario de rutas de escritura debe estar completo (${writes.length})`);
  for (const route of writes) {
    const match = offlineActionForRequest(route.group as 'operations' | 'catalogs', route.method, route.path);
    assert.ok(match, `la ruta ${route.method} ${route.path} no declara acción en el contrato offline`);
  }
});

test('ninguna acción reutiliza la misma ruta y método que otra', () => {
  const seen = new Map<string, string>();
  for (const action of OFFLINE_ACTIONS) {
    for (const variant of action.variants) {
      const key = `${action.group}:${variant.method}:${variant.path}`;
      const previous = seen.get(key);
      assert.equal(previous, undefined, `la ruta ${key} está declarada por ${previous} y ${action.id}`);
      seen.set(key, action.id);
    }
  }
});

test('el servidor resuelve la acción por método y ruta, ignorando la query', () => {
  const match = offlineActionForRequest('operations', 'POST', '/orders/abc/items');
  assert.equal(match?.action.id, 'orders.addItem');
  assert.equal(match?.variantIndex, 0);
  assert.equal(match?.params.id, 'abc');
  assert.equal(offlineActionForRequest('operations', 'POST', '/orders/abc/items?x=1'), undefined);
  assert.equal(offlineActionForRequest('operations', 'GET', '/orders/abc/items'), undefined);
  assert.equal(offlineActionForRequest('catalogs', 'POST', '/orders/abc/items'), undefined);
});

test('las operaciones de la cola declaran las acciones que las autorizan', () => {
  const bindings = offlineBindingsForOp({ op: 'manualTransaction' });
  assert.deepEqual(bindings.map((entry) => entry.actionId), ['cash.manual']);
  const opening = offlineBindingsForOp({ op: 'openOrder' });
  assert.deepEqual(opening.map((entry) => entry.actionId), ['orders.open', 'orders.openingItems', 'orders.cancelOpening']);
  // La ficha se firma para PATCH y para POST: cada variante lleva su prueba.
  const recipe = offlineBindingsForOp({ op: 'saveRecipe' });
  assert.deepEqual(recipe.map((entry) => entry.actionId), ['catalogs.saveRecipe']);
  assert.equal(recipe[0].variants, undefined);
  assert.deepEqual(offlineBindingsForOp({ op: 'createRecipe' })[0].variants, [1]);
  assert.deepEqual(offlineBindingsForOp({ op: 'updateRecipe' })[0].variants, [0]);
});

test('el JSON canónico ordena las claves pero no ignora los valores', () => {
  assert.equal(canonicalJson({ b: 1, a: 2 }), canonicalJson({ a: 2, b: 1 }));
  assert.notEqual(canonicalJson({ a: 2 }), canonicalJson({ a: 3 }));
  assert.equal(canonicalJson({ a: undefined, b: 1 }), '{"b":1}');
  assert.equal(canonicalJson([{ b: 1, a: 2 }]), '[{"a":2,"b":1}]');
});
