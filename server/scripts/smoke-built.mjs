import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Verificación de solo lectura: conecta con el SQL configurado, no inicia sesión,
// no crea entidades y no ejecuta migraciones ni seeds.
const root = fileURLToPath(new URL('../', import.meta.url));
assert.ok(existsSync(new URL('../dist/index.js', import.meta.url)), 'Ejecute npm run build primero.');
assert.equal(existsSync(new URL('../dist/prisma', import.meta.url)), false, 'El paquete no debe contener seeds.');
const probe = createServer();
await new Promise((resolve, reject) => {
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', resolve);
});
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));

const child = spawn(process.execPath, ['dist/index.js'], {
  cwd: root, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'],
});
const exited = once(child, 'exit');
let output = '';
child.stdout.on('data', (data) => { output += data.toString(); });
child.stderr.on('data', (data) => { output += data.toString(); });

try {
  const deadline = Date.now() + 15000;
  while (!output.includes('API escuchando')) {
    if (child.exitCode !== null) throw new Error(`El backend no arrancó: ${output.trim()}`);
    if (Date.now() > deadline) throw new Error('El backend no arrancó dentro de 15 segundos.');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const base = `http://127.0.0.1:${port}`;
  const health = await fetch(`${base}/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).ok, true);
  const landing = await fetch(base, { headers: { Accept: 'text/html' } });
  assert.equal(landing.status, 200);
  assert.match(await landing.text(), /<!doctype html>/i);
  const index = await fetch(`${base}/api`);
  assert.equal(index.status, 200);
  await index.json();
  for (const headers of [{}, { Authorization: 'Bearer invalid' }]) {
    const protectedRoute = await fetch(`${base}/api/auth/me`, { headers });
    assert.equal(protectedRoute.status, 401);
    assert.equal((await protectedRoute.json()).error.code, 'UNAUTHORIZED');
  }
  console.log('PASS: backend compilado + conexión SQL + /health + landing HTML + /api + protección 401.');
} finally {
  child.kill('SIGTERM');
  const timeout = setTimeout(() => child.kill('SIGKILL'), 12000);
  try { await exited; } finally { clearTimeout(timeout); }
}
