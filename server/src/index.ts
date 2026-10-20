import 'dotenv/config';
import { createApp } from './app';
import { prisma } from './lib/prisma';
import { initRealtime } from './lib/realtime';

const PORT = Number(process.env.PORT || 4000);

async function bootstrap() {
  const app = createApp();

  const httpServer = app.listen(PORT, () => {
    console.log(`✅ Tayta & Sabroso API escuchando en http://localhost:${PORT}`);
  });
  initRealtime(httpServer);
}

bootstrap()
  .catch(async (err) => {
    console.error('Error al iniciar el servidor:', err);
    await prisma.$disconnect();
    process.exit(1);
  });