import { PrismaClient } from '@prisma/client';

// Prisma devuelve Decimal para columnas DECIMAL. El front consume números, por eso
// la conversión explícita en la capa de servicios (ver toNum en ./utils).
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});