import 'dotenv/config';
import { createApp } from './app';
import { prisma } from './lib/prisma';

const PORT = Number(process.env.PORT || 4000);

async function bootstrap() {
  const app = createApp();

  app.listen(PORT, () => {
    console.log(`✅ Tayta & Sabroso API escuchando en http://localhost:${PORT}`);
  });
}

bootstrap()
  .catch(async (err) => {
    console.error('Error al iniciar el servidor:', err);
    await prisma.$disconnect();
    process.exit(1);
  });