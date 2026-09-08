import { randomUUID } from 'node:crypto';
import { AppError, plain, round2, toNum } from '../lib/utils';
import { prisma } from '../lib/prisma';

function nowParts() {
  const now = new Date();
  return {
    time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    date: 'Hoy',
    utc: now,
  };
}

// Ajuste de inventario / merma. Réplica fiel de la demo:
// AJUSTE_MERMA = salida negativa, ENTRADA_COMPRA = entrada positiva, stock nunca negativo.
export async function addKardexAdjustment(input: {
  insumoId: string;
  quantity: number;
  type: 'AJUSTE_MERMA' | 'ENTRADA_COMPRA';
  reason: string;
  companyId?: string;
  clientOpId?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const insumo = await tx.insumo.findFirst({ where: { id: input.insumoId, isDeleted: false } });
    if (!insumo) throw new AppError('Insumo no encontrado.', 404, 'NOT_FOUND');

    // Idempotencia: reintentos con el mismo clientOpId devuelven el movimiento existente.
    if (input.clientOpId) {
      const existing = await tx.kardexMovement.findFirst({
        where: { clientOpId: input.clientOpId },
      });
      if (existing) {
        return { movement: existing, companyId: insumo.companyId || input.companyId || 'el-tayta' };
      }
    }

    const stockBefore = toNum(insumo.currentStock);
    const stockDelta =
      input.type === 'AJUSTE_MERMA' ? -Math.abs(input.quantity) : Math.abs(input.quantity);
    const stockAfter = Math.max(0, round2(stockBefore + stockDelta));
    const unitCost = toNum(insumo.costPerUnit);
    const totalCost = round2(Math.abs(input.quantity) * unitCost);

    // Insumo 'ambas' (companyId null): se atribuye a la empresa activa o por defecto El Tayta.
    const companyId = insumo.companyId || input.companyId || 'el-tayta';

    const { time, date, utc } = nowParts();

    const movement = await tx.kardexMovement.create({
      data: {
        id: randomUUID(),
        companyId,
        timestamp: utc,
        date,
        time,
        insumoId: insumo.id,
        insumoName: insumo.name,
        type: input.type,
        referenceDoc: `Ajuste manual: ${input.reason}`,
        quantity: stockDelta,
        unit: insumo.unit,
        unitCost,
        totalCost,
        stockBefore,
        stockAfter,
        notes: input.reason,
        clientOpId: input.clientOpId ?? randomUUID(),
      },
    });

    await tx.insumo.update({
      where: { id: insumo.id },
      data: { currentStock: stockAfter },
    });

    return { movement, companyId };
  }).then((r) => plain(r));
}

export async function listKardex(companyId?: string, insumoId?: string) {
  const movements = await prisma.kardexMovement.findMany({
    where: {
      ...(companyId ? { companyId } : {}),
      ...(insumoId ? { insumoId } : {}),
    },
    orderBy: { timestamp: 'desc' },
    take: 500,
  });
  return plain(movements);
}