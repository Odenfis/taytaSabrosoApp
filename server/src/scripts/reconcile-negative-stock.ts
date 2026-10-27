import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { prisma } from '../lib/prisma.js';

const apply = process.argv.includes('--apply');
const acknowledgedBackup = process.argv.includes('--backup-verified');
const reportPath = process.argv.find((arg) => arg.startsWith('--report='))?.slice('--report='.length);
if (!reportPath) throw new Error('Indique --report=ruta.json');
if (apply && !acknowledgedBackup) throw new Error('Antes de --apply, verifique un respaldo SQL y añada --backup-verified.');

const round = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;
const eq = (a: number, b: number) => Math.abs(a - b) < 0.00005;
type Correction = { id: string; before: number; after: number };
const report: Array<{ id: string; code: string; name: string; stored: number; expected: number | null; status: string; reason?: string; movements: number }> = [];
const candidates: Array<{ id: string; code: string; stored: number; version: number; balance: number; corrections: Correction[] }> = [];
const insumos = await prisma.insumo.findMany({ orderBy: { code: 'asc' } });

try {
  for (const insumo of insumos) {
    const rows = await prisma.kardexMovement.findMany({ where: { insumoId: insumo.id }, orderBy: [{ timestamp: 'asc' }, { id: 'asc' }] });
    const stored = Number(insumo.currentStock);
    if (!rows.length) {
      report.push({ id: insumo.id, code: insumo.code, name: insumo.name, stored, expected: null, status: 'sin_movimientos', movements: 0 });
      continue;
    }
    let balance = Number(rows[0].stockBefore);
    const corrections: Correction[] = [];
    let reason: string | undefined;
    for (const row of rows) {
      const before = Number(row.stockBefore);
      const after = Number(row.stockAfter);
      const quantity = Number(row.quantity);
      const expectedAfter = round(balance + quantity);
      const clampedBefore = round(Math.max(0, balance));
      const clampedAfter = round(Math.max(0, expectedAfter));
      if ((!eq(before, balance) && !(balance < 0 && eq(before, clampedBefore))) ||
          (!eq(after, expectedAfter) && !(expectedAfter < 0 && eq(after, clampedAfter)) &&
           !(balance < 0 && eq(before, 0) && eq(after, round(quantity))))) {
        reason = `Salto no explicado en movimiento ${row.id}`;
        break;
      }
      if (!eq(before, balance) || !eq(after, expectedAfter)) corrections.push({ id: row.id, before: balance, after: expectedAfter });
      balance = expectedAfter;
    }
    if (!reason && !eq(stored, balance) && !eq(stored, Math.max(0, balance)) &&
        !(corrections.length && eq(stored, Number(rows.at(-1)!.stockAfter)))) {
      reason = 'La existencia no coincide con el último movimiento ni con el saldo reconstruido';
    }
    const status = reason ? 'revision_manual' : corrections.length || !eq(stored, balance) ? 'corregible' : 'correcto';
    report.push({ id: insumo.id, code: insumo.code, name: insumo.name, stored, expected: reason ? null : balance, status, reason, movements: rows.length });
    if (status === 'corregible') candidates.push({ id: insumo.id, code: insumo.code, stored, version: insumo.version, balance, corrections });
  }
  await writeFile(reportPath, JSON.stringify({ applied: false, generatedAt: new Date().toISOString(), report }, null, 2) + '\n');
  if (apply) {
    for (const candidate of candidates) {
      await prisma.$transaction(async (tx) => {
        const current = await tx.insumo.findUniqueOrThrow({ where: { id: candidate.id } });
        if (!eq(Number(current.currentStock), candidate.stored) || current.version !== candidate.version) throw new Error(`Existencia cambió durante conciliación: ${candidate.code}`);
        for (const correction of candidate.corrections) {
          await tx.kardexMovement.update({ where: { id: correction.id }, data: { stockBefore: correction.before, stockAfter: correction.after } });
        }
        await tx.insumo.update({ where: { id: candidate.id }, data: { currentStock: candidate.balance, version: { increment: 1 } } });
      });
      report.find((row) => row.id === candidate.id)!.status = 'aplicado';
      await writeFile(reportPath, JSON.stringify({ applied: true, generatedAt: new Date().toISOString(), report }, null, 2) + '\n');
    }
  }
  console.log(`Reporte: ${reportPath}; corregibles: ${report.filter((r) => r.status === 'corregible').length}; revisión manual: ${report.filter((r) => r.status === 'revision_manual').length}`);
} finally {
  await prisma.$disconnect();
}
