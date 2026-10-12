// Seed VACÍO para pruebas desde cero (2026-10-12).
//
// Uso: npx tsx prisma/seed.ts && npx tsx prisma/seed-empty.ts
//
// 1. Corre PRIMERO el seed canónico (maestros: empresas, PIN 1004, 13 mesas,
//    16 productos, 13 insumos con stock, 7 recetas, 4 cuentas con saldos,
//    9 métodos, 4 impresoras, turnos Día con caja 350).
// 2. Este script vacía SOLO operaciones: orderItem, order, purchaseItem,
//    purchase, kardexMovement, transaction, shiftRecord, session, clientOp.
// 3. Libera las 13 mesas y resetea numberingSequence a 0 (tickets limpios).
// 4. NO toca: catálogos, stocks, saldos, turnos, usuarios, dispositivos.
//
// Para volver al demo con historia: npx tsx prisma/seed.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Vaciando operaciones (seed vacío)...');

  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.purchaseItem.deleteMany();
  await prisma.purchase.deleteMany();
  await prisma.kardexMovement.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.shiftRecord.deleteMany();
  await prisma.session.deleteMany();
  await prisma.clientOp.deleteMany();

  const tables = await prisma.table.updateMany({
    data: {
      status: 'libre',
      occupiedSince: null,
      minutesElapsed: null,
      currentOrderId: null,
      waiter: null,
    },
  });
  console.log(`Mesas liberadas: ${tables.count}`);

  const seq = await prisma.numberingSequence.updateMany({
    data: { lastNumber: 0 },
  });
  console.log(`Secuencias reseteadas: ${seq.count}`);

  const check = {
    orders: await prisma.order.count({ where: { isDeleted: false } }),
    purchases: await prisma.purchase.count({ where: { isDeleted: false } }),
    kardex: await prisma.kardexMovement.count(),
    transactions: await prisma.transaction.count(),
    busyTables: await prisma.table.count({ where: { isDeleted: false, status: { not: 'libre' } } }),
    tables: await prisma.table.count({ where: { isDeleted: false } }),
    products: await prisma.product.count({ where: { isDeleted: false } }),
    insumos: await prisma.insumo.count({ where: { isDeleted: false } }),
  };
  console.log('Estado:', JSON.stringify(check));
  if (check.orders !== 0 || check.purchases !== 0 || check.kardex !== 0 ||
      check.transactions !== 0 || check.busyTables !== 0) {
    throw new Error('Seed vacío incompleto, revisar.');
  }
  console.log('✅ Seed vacío completado.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
