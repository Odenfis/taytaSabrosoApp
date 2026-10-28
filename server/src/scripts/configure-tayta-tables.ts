import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { isServiceZone, TAYTA_TABLE_LAYOUT, TAYTA_PHYSICAL_PREFIXES } from '../lib/taytaTableLayout.js';

const companyId = 'el-tayta';
const apply = process.argv.includes('--apply');
const reportPath = process.argv.find((arg) => arg.startsWith('--report='))?.slice('--report='.length);
if (!reportPath) throw new Error('Indique --report=ruta.json.');
if (apply && (!process.argv.includes('--backup-verified') || !process.argv.includes('--terminals-synced'))) {
  throw new Error('Para aplicar, verifique respaldo y terminales; use --backup-verified --terminals-synced.');
}

type Reader = Pick<Prisma.TransactionClient, 'table' | 'order' | 'numberingSequence'>;
async function inspect(tx: Reader) {
  const [tables, activeOrders, sequence] = await Promise.all([
    tx.table.findMany({ where: { companyId, isDeleted: false }, orderBy: [{ zone: 'asc' }, { number: 'asc' }] }),
    tx.order.count({ where: { companyId, isDeleted: false, status: { notIn: ['cobrado', 'anulado'] } } }),
    tx.numberingSequence.findUnique({ where: { companyId_entity: { companyId, entity: 'service-table' } } }),
  ]);
  const fixed = tables.filter((table) => !isServiceZone(table.zone));
  const layoutMatches = TAYTA_TABLE_LAYOUT.every((expected) =>
    fixed.some((table) => table.number === expected.number && table.zone === expected.zone && table.capacity === expected.capacity));
  const conflictingNumbers = fixed.filter((table) => /^\d+$/.test(table.number) && Number(table.number) > 35)
    .map((table) => `${table.number} (${table.zone})`);
  const addedPhysicalTables = fixed.filter((table) =>
    Object.entries(TAYTA_PHYSICAL_PREFIXES).some(([zone, prefix]) => table.zone === zone && new RegExp(`^${prefix}\\d{2,}$`).test(table.number)));
  const busyTables = tables.filter((table) => table.status !== 'libre' || table.currentOrderId).map((table) => table.number);
  const status = layoutMatches ? 'already_configured' : activeOrders || busyTables.length || conflictingNumbers.length || addedPhysicalTables.length || (sequence && sequence.lastNumber > 35)
    ? 'blocked' : 'ready';
  return { status, activeOrders, busyTables, conflictingNumbers, sequence: sequence?.lastNumber ?? null,
    extraPhysicalTables: layoutMatches ? fixed.filter((table) => !TAYTA_TABLE_LAYOUT.some((expected) => expected.number === table.number && expected.zone === table.zone)).map((table) => ({ number: table.number, zone: table.zone })) : [],
    current: tables.map((table) => ({ id: table.id, number: table.number, zone: table.zone, capacity: table.capacity, status: table.status })),
    target: TAYTA_TABLE_LAYOUT, archivedCount: status === 'ready' ? fixed.length : 0 };
}

try {
  const before = await inspect(prisma);
  await writeFile(reportPath, JSON.stringify({ generatedAt: new Date().toISOString(), applied: false, ...before }, null, 2) + '\n');
  if (apply && before.status === 'blocked') throw new Error('Catálogo bloqueado. Revise el informe; no se cambió ninguna mesa.');
  if (apply && before.status === 'ready') {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT [id] FROM [dbo].[empresas] WITH (UPDLOCK, HOLDLOCK) WHERE [id] = ${companyId}`;
      const current = await inspect(tx);
      if (current.status !== 'ready' || JSON.stringify(current.current) !== JSON.stringify(before.current)) {
        throw new Error('El catálogo cambió durante la revisión. Genere otro informe.');
      }
      await tx.table.updateMany({ where: { companyId, isDeleted: false, zone: { notIn: ['Delivery', 'Llevar'] } },
        data: { isDeleted: true, version: { increment: 1 } } });
      await tx.table.createMany({ data: TAYTA_TABLE_LAYOUT.map((table) => ({ id: randomUUID(), companyId, ...table, status: 'libre' })) });
      await tx.numberingSequence.upsert({ where: { companyId_entity: { companyId, entity: 'service-table' } },
        create: { companyId, entity: 'service-table', lastNumber: 35 }, update: {} });
    }, { timeout: 30000 });
  }
  const after = apply ? await inspect(prisma) : before;
  await writeFile(reportPath, JSON.stringify({ generatedAt: new Date().toISOString(), applied: apply && before.status === 'ready', before, after }, null, 2) + '\n');
  console.log(`Mesas El Tayta: ${before.status} → ${after.status}; informe ${reportPath}`);
} finally {
  await prisma.$disconnect();
}
