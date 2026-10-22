import 'dotenv/config';
import { createApp } from './app.js';
import { prisma } from './lib/prisma.js';
import { initRealtime } from './lib/realtime.js';
import { validateConfig } from './lib/config.js';
import { createServer } from 'node:http';

async function bootstrap() {
  const { port } = validateConfig();
  await prisma.$connect();
  const app = createApp();
  const httpServer = createServer(app);
  const realtime = initRealtime(httpServer);
  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, resolve);
  });
  console.log(`✅ Tayta & Sabroso API escuchando en http://localhost:${port}`);

  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    const timeout = setTimeout(() => process.exit(1), 10000);
    timeout.unref();
    realtime.close(() => {
      void prisma.$disconnect().finally(() => {
        clearTimeout(timeout);
        process.exit(0);
      });
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

bootstrap()
  .catch(async (err) => {
    // No imprimir errores de conexión completos: pueden contener datos del entorno.
    console.error('Error al iniciar el servidor:', err instanceof Error && err.name.startsWith('Prisma')
      ? 'No se pudo conectar con SQL Server. Revise conexión y credenciales.'
      : err instanceof Error ? err.message : 'Error de configuración.');
    await prisma.$disconnect();
    process.exit(1);
  });
