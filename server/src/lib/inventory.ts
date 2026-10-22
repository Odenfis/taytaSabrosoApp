import type { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import { AppError } from './utils.js';

const notices = new WeakMap<Prisma.TransactionClient, (() => void)[]>();
export function notifyInventoryAfterCommit(tx: Prisma.TransactionClient, notify: () => void) { notices.get(tx)?.push(notify); }
export async function inventoryTransaction<T>(run: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      const pending: (() => void)[] = [];
      const result = await prisma.$transaction((tx) => { notices.set(tx, pending); return run(tx); }, { timeout: 15000 });
      pending.forEach((notify) => notify());
      return result;
    }
    catch (error) {
      const e = error as { code?: string; meta?: { code?: string | number } };
      if (attempt === 3 || !(e.code === 'P2034' || (e.code === 'P2010' && String(e.meta?.code) === '1205'))) throw error;
    }
  }
}
export async function lockInsumos(tx: Prisma.TransactionClient, ids: (string | null | undefined)[]) {
  for (const id of [...new Set(ids.filter((id): id is string => !!id))].sort()) {
    await tx.$queryRaw`SELECT [id] FROM [dbo].[insumos] WITH (UPDLOCK, HOLDLOCK) WHERE [id] = ${id}`;
  }
}
export function assertInsumoCompany(companyId: string | null, scope?: string | null) {
  if (scope && companyId !== null && companyId !== scope) throw new AppError('El insumo pertenece a otra empresa.', 403, 'INSUMO_COMPANY_MISMATCH');
}
export async function requireActiveInsumos(tx: Prisma.TransactionClient, ids: (string | null | undefined)[], companyId?: string | null) {
  await lockInsumos(tx, ids);
  const result = await tx.insumo.findMany({ where: { id: { in: ids.filter((id): id is string => !!id) } } });
  for (const id of ids.filter(Boolean)) {
    const insumo = result.find((i) => i.id === id);
    if (!insumo || insumo.isDeleted) throw new AppError('Un insumo fue eliminado o no existe. Revise la operación pendiente.', 409, 'INSUMO_DELETED');
    assertInsumoCompany(insumo.companyId, companyId);
  }
  return result;
}
