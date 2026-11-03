import { initializeProvenanceReview, requiresProvenanceReview } from '../src/lib/offlineProvenance';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionCacheScope, readSessionCache, writeSessionCache } from '../src/lib/sessionCache';
import type { User } from '../src/types';

test('caché aislada por usuario, registro de instalación y revisión de permisos; cola intacta', () => {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  } });
  const user = { id: 'admin', role: 'Administrador', version: 1 } as User;
  const scope = sessionCacheScope(user, 'server-device-A', ['a', 'b']);
  data.set('ts_tables_v2', '["legacy"]');
  data.set('ts_pending_queue_v2', '["pending"]');
  writeSessionCache(scope, 'tables', ['private']);
  assert.deepEqual(readSessionCache(scope, 'tables', []), ['private']);
  for (const other of [null, sessionCacheScope({ ...user, id: 'waiter' }, 'server-device-A', ['a', 'b']),
    sessionCacheScope(user, 'server-device-B', ['a', 'b']),
    sessionCacheScope({ ...user, version: 2 }, 'server-device-A', ['a', 'b']),
    sessionCacheScope(user, 'server-device-A', ['a'])]) {
    assert.deepEqual(readSessionCache(other, 'tables', []), []);
  }
  assert.equal(sessionCacheScope(user, 'server-device-A', ['b', 'a']), scope);
  assert.equal(sessionCacheScope(user, null, ['a']), null);
  assert.equal(data.get('ts_pending_queue_v2'), '["pending"]');
  assert.equal(data.get('ts_tables_v2'), '["legacy"]');
});


test('actualización conserva cola antigua y exige revisión incluso con terminal o firma declarada', () => {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  } });
  const original = JSON.stringify([{ clientOpId: 'old', deviceId: 'inferred', proofs: [{ signature: 'historic' }] }]);
  data.set('ts_pending_queue_v2', original);
  initializeProvenanceReview();
  assert.equal(requiresProvenanceReview('old'), true);
  assert.equal(requiresProvenanceReview('new'), false);
  assert.equal(data.get('ts_pending_queue_v2'), original);
  data.set('ts_pending_queue_v2', JSON.stringify([{ clientOpId: 'new' }]));
  initializeProvenanceReview();
  assert.equal(requiresProvenanceReview('old'), true);
  assert.equal(requiresProvenanceReview('new'), false);
});
