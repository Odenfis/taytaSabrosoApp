import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateConfig } from '../src/lib/config.js';

const production = {
  NODE_ENV: 'production',
  DATABASE_URL: 'sqlserver://localhost:1433;database=test',
  JWT_SECRET: '9e236e521e6840d6b8b6ded118a32878998b721e4174245',
  CORS_ORIGIN: 'https://pos.example.com,https://caja.example.com',
};

test('configuración de producción válida', () => {
  assert.deepEqual(validateConfig(production), { port: 4000 });
});

test('producción rechaza secretos de ejemplo, conexión ausente y orígenes abiertos', () => {
  for (const JWT_SECRET of ['', 'short', 'dev-only-secret-cambiar-en-produccion', 'CAMBIAR_ESTA_CLAVE'.repeat(3)]) {
    assert.throws(() => validateConfig({ ...production, JWT_SECRET }), /JWT_SECRET/);
  }
  assert.throws(() => validateConfig({ ...production, DATABASE_URL: '' }), /DATABASE_URL/);
  for (const CORS_ORIGIN of ['', '*', 'https://*.example.com', 'https://pos.example.com/path', 'invalid', 'https://user:pass@pos.example.com']) {
    assert.throws(() => validateConfig({ ...production, CORS_ORIGIN }), /CORS_ORIGIN/);
  }
  assert.throws(() => validateConfig({ ...production, PORT: '-1' }), /PORT/);
});
