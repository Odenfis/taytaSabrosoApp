import assert from 'node:assert/strict';
import { test } from 'node:test';
import { redactSecrets } from '../src/lib/oplog.js';

test('registro operativo elimina secretos también en objetos anidados', () => {
  assert.deepEqual(redactSecrets({ adminPin: '123456', payment: { password: 'x', amount: 42 }, records: [{ accessToken: 'secret' }] }), {
    adminPin: '[protegido]', payment: { password: '[protegido]', amount: 42 }, records: [{ accessToken: '[protegido]' }],
  });
});
