import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
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

export interface CreatePurchaseInput {
  companyId: string;
  category?: string;
  documentStatus?: string;
  provisionalNoteNumber?: string;
  invoiceNumber: string;
  supplierName: string;
  supplierRuc: string;
  shift?: string;
  subtotal?: number;
  igv?: number;
  total: number;
  paymentStatus?: string;
  paidFromCash?: boolean;
  bankAccountId?: string;
  bankAccountAlias?: string;
  notes?: string;
  items: { insumoId?: string | null; insumoName: string; quantity: number; unit: string; unitCost: number; totalCost: number }[];
  clientOpId?: string;
}

// Registra compra + movimientos Kardex ENTRADA_COMPRA + costo promedio ponderado + libro de caja.
export async function createPurchase(input: CreatePurchaseInput) {
  return prisma.$transaction(async (tx) => {
    const { items, ...data } = input;
    const { time, date, utc } = nowParts();

    // Idempotencia: reintentos con el mismo clientOpId devuelven la compra existente.
    if (data.clientOpId) {
      const existing = await tx.purchase.findFirst({
        where: { clientOpId: data.clientOpId, isDeleted: false },
        include: { items: true },
      });
      if (existing) return existing;
    }

    const purchase = await tx.purchase.create({
      data: {
        id: randomUUID(),
        companyId: data.companyId,
        category: data.category ?? 'insumos',
        documentStatus: data.documentStatus ?? 'provisional',
        provisionalNoteNumber: data.provisionalNoteNumber,
        invoiceNumber: data.invoiceNumber,
        supplierName: data.supplierName,
        supplierRuc: data.supplierRuc,
        date,
        time,
        shift: data.shift ?? 'Día',
        subtotal: data.subtotal ?? round2(data.total / 1.18),
        igv: data.igv ?? round2(data.total - data.total / 1.18),
        total: data.total,
        paymentStatus: data.paymentStatus ?? 'Pagado (Caja)',
        paidFromCash: data.paidFromCash ?? false,
        bankAccountId: data.bankAccountId,
        bankAccountAlias: data.bankAccountAlias,
        notes: data.notes,
        clientOpId: data.clientOpId ?? randomUUID(),
        items: {
          create: items.map((it) => ({
            id: randomUUID(),
            insumoId: it.insumoId ?? null,
            insumoName: it.insumoName,
            quantity: it.quantity,
            unit: it.unit,
            unitCost: it.unitCost,
            totalCost: it.totalCost,
          })),
        },
      },
      include: { items: true },
    });

    // 1. Kardex ENTRADA_COMPRA + stock + costo promedio ponderado
    for (const item of purchase.items) {
      const existingInsumo = item.insumoId
        ? await tx.insumo.findUnique({ where: { id: item.insumoId } })
        : null;

      const stockBefore = existingInsumo ? toNum(existingInsumo.currentStock) : 0;
      const qty = toNum(item.quantity);
      const stockAfter = round2(stockBefore + qty);

      await tx.kardexMovement.create({
        data: {
          id: randomUUID(),
          companyId: purchase.companyId,
          timestamp: utc,
          date,
          time,
          insumoId: item.insumoId,
          insumoName: item.insumoName,
          type: 'ENTRADA_COMPRA',
          referenceDoc: `Compra Factura #${purchase.invoiceNumber || purchase.provisionalNoteNumber} (${purchase.supplierName})`,
          quantity: item.quantity,
          unit: item.unit,
          unitCost: item.unitCost,
          totalCost: item.totalCost,
          stockBefore,
          stockAfter,
          notes: purchase.notes ?? undefined,
          clientOpId: randomUUID(),
        },
      });

      if (existingInsumo) {
        // Costo promedio ponderado (mismo algoritmo que la demo)
        const oldStock = toNum(existingInsumo.currentStock);
        const oldCost = toNum(existingInsumo.costPerUnit);
        const totalOldCost = oldStock * oldCost;
        const totalNewCost = toNum(item.quantity) * toNum(item.unitCost);
        const newTotalStock = oldStock + toNum(item.quantity);
        const weightedCost =
          newTotalStock > 0
            ? round2((totalOldCost + totalNewCost) / newTotalStock)
            : item.unitCost;

        await tx.insumo.update({
          where: { id: existingInsumo.id },
          data: {
            currentStock: stockAfter,
            costPerUnit: weightedCost,
            lastPurchaseDate: `${date} ${time}`,
            lastPurchaseUtc: utc,
          },
        });
      }
    }

    // 2. Libro de caja (Pago Proveedor)
    const companyShift = await tx.companyShift.findUnique({ where: { companyId: purchase.companyId } });
    const currentShift = companyShift?.currentShift ?? 'Día';

    if (purchase.paidFromCash) {
      await tx.transaction.create({
        data: {
          id: randomUUID(),
          companyId: purchase.companyId,
          time,
          date,
          timestamp: utc,
          type: 'Pago Proveedor',
          description: `Compra Factura #${purchase.invoiceNumber} - ${purchase.supplierName}`,
          amount: toNum(purchase.total),
          isIncome: false,
          shift: currentShift,
          clientOpId: randomUUID(),
        },
      });
    } else if (purchase.bankAccountId) {
      const bankAcc = await tx.bankAccount.findUnique({ where: { id: purchase.bankAccountId } });
      if (bankAcc) {
        await tx.bankAccount.update({
          where: { id: bankAcc.id },
          data: { currentBalance: { decrement: toNum(purchase.total) } },
        });
      }
      await tx.transaction.create({
        data: {
          id: randomUUID(),
          companyId: purchase.companyId,
          time,
          date,
          timestamp: utc,
          type: 'Pago Proveedor',
          description: `Compra Factura #${purchase.invoiceNumber} - ${purchase.supplierName} (${purchase.bankAccountAlias || bankAcc?.alias || 'Banco'})`,
          amount: toNum(purchase.total),
          isIncome: false,
          bankAccountId: purchase.bankAccountId,
          bankAccountAlias: purchase.bankAccountAlias || bankAcc?.alias,
          shift: currentShift,
          clientOpId: randomUUID(),
        },
      });
    }

    const enriched = await tx.purchase.findUnique({
      where: { id: purchase.id },
      include: { items: true },
    });
    return enriched;
  }).then((p) => plain(p));
}

// Pasar un vale provisional a documento formal (regularizar).
export async function regularizePurchase(
  purchaseId: string,
  input: { invoiceNumber: string; supplierRuc: string; notes?: string; operator?: string }
) {
  return prisma.$transaction(async (tx) => {
    const purchase = await tx.purchase.findFirst({ where: { id: purchaseId, isDeleted: false } });
    if (!purchase) throw new AppError('Compra no encontrada.', 404, 'NOT_FOUND');
    if (purchase.documentStatus === 'regularizado') {
      throw new AppError('La compra ya fue regularizada.', 409, 'ALREADY_REGULARIZED');
    }

    const { time, date } = nowParts();
    const notes = input.notes
      ? `${purchase.notes || ''} [Regularizado: ${input.notes.trim()}]`.trim()
      : purchase.notes;

    return tx.purchase.update({
      where: { id: purchase.id },
      data: {
        documentStatus: 'regularizado',
        invoiceNumber: input.invoiceNumber.trim(),
        supplierRuc: input.supplierRuc.trim(),
        regularizedAt: `${date} ${time}`,
        regularizedBy: input.operator ?? 'Sistema',
        notes: notes || null,
      },
    });
  }).then((p) => plain(p));
}

export async function listPurchases(companyId?: string) {
  const purchases = await prisma.purchase.findMany({
    where: {
      isDeleted: false,
      ...(companyId ? { companyId } : {}),
    },
    include: { items: true },
    orderBy: { purchasedUtc: 'desc' },
  });
  return plain(purchases);
}

export type PurchaseRecord = Prisma.PurchaseGetPayload<{ include: { items: true } }>;