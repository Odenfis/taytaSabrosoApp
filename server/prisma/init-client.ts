import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

const tableSchema = z.object({ number: z.string().trim().min(1).max(20), capacity: z.number().int().positive(), zone: z.string().trim().min(1).max(30) });
const companySchema = z.object({
  name: z.string().trim().min(1).max(200), tradeName: z.string().trim().min(1).max(120),
  ruc: z.string().regex(/^\d{11}$/), address: z.string().trim().min(1).max(200),
  specialty: z.string().trim().max(200), tables: z.array(tableSchema).min(1),
});
const configSchema = z.object({
  companies: z.object({ 'el-tayta': companySchema, 'el-sabroso': companySchema }),
  administrator: z.object({ name: z.string().trim().min(1).max(120), pin: z.string().regex(/^\d{6,12}$/) }),
});

const prisma = new PrismaClient();

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Indique el archivo JSON de configuración inicial.');
  const config = configSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
  const entries = Object.entries(config.companies);
  if (config.administrator.pin === '1004') throw new Error('No se admite el PIN de demostración.');
  if (entries[0][1].ruc === entries[1][1].ruc) throw new Error('Los RUC deben ser distintos.');
  for (const [id, company] of entries) {
    if (company.ruc.startsWith('000000') || /RAZÓN SOCIAL REAL|DIRECCIÓN REAL/i.test(`${company.name} ${company.address}`)) {
      throw new Error(`Complete los datos reales de ${id} antes de inicializar.`);
    }
    const numbers = company.tables.map((table) => table.number.toLocaleLowerCase());
    if (new Set(numbers).size !== numbers.length) throw new Error(`Mesas duplicadas en ${id}.`);
  }

  // Una sola transacción evita dejar un catálogo a medio instalar.
  await prisma.$transaction(async (tx) => {
    const counts = await Promise.all([
      tx.company.count(), tx.user.count(), tx.table.count(), tx.product.count(),
      tx.insumo.count(), tx.recipe.count(), tx.order.count(), tx.purchase.count(),
      tx.transaction.count(), tx.kardexMovement.count(), tx.bankAccount.count(),
      tx.customPaymentMethod.count(), tx.printer.count(), tx.clientOp.count(),
    ]);
    if (counts.some(Boolean)) throw new Error('La base contiene datos. Inicialización cancelada.');

    for (const [id, company] of entries) {
      await tx.company.create({ data: {
        id, name: company.name, tradeName: company.tradeName, ruc: company.ruc,
        address: company.address, specialty: company.specialty,
        themeColor: id === 'el-tayta' ? '#ffb597' : '#ebc246',
        accentColor: id === 'el-tayta' ? '#823b19' : '#6f4f00',
        badgeText: company.tradeName,
      } });
      await tx.table.createMany({ data: company.tables.map((table, index) => ({
        id: `${id}-mesa-${index + 1}`, companyId: id, number: table.number,
        capacity: table.capacity, zone: table.zone, status: 'libre',
      })) });
      await tx.numberingSequence.create({ data: { companyId: id, entity: 'order', lastNumber: 0 } });
      await tx.companyShift.create({ data: {
        companyId: id, currentShift: 'Día', openedAt: 'Sin apertura',
        openedBy: config.administrator.name, initialCash: 0,
      } });
      await tx.customPaymentMethod.create({ data: {
        id: `${id}-efectivo`, companyId: id, name: 'Efectivo en Caja',
        category: 'Efectivo', commissionPct: 0, requiresReferenceNumber: false,
        icon: 'payments', isActive: true,
      } });
    }
    await tx.user.create({ data: {
      id: 'admin-inicial', name: config.administrator.name,
      pinHash: await bcrypt.hash(config.administrator.pin, 12),
      role: 'Administrador', terminal: 'Terminal principal',
    } });
  }, { timeout: 30000 });
  console.log('Inicialización del cliente completada: dos empresas y catálogos limpios.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
