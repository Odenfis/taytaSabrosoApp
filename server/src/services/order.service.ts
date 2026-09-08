import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { AppError, plain, round2, round3, toNum } from '../lib/utils';
import { prisma } from '../lib/prisma';

function nowParts(timeStr?: string) {
  const now = new Date();
  const time =
    timeStr ??
    now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return { time, date: 'Hoy', utc: now };
}

// Asigna el siguiente folio de la empresa de forma atómica (concurrencia 5+ terminales).
async function allocateTicket(tx: Prisma.TransactionClient, companyId: string): Promise<number> {
  await tx.numberingSequence.upsert({
    where: { companyId_entity: { companyId, entity: 'order' } },
    create: { companyId, entity: 'order', lastNumber: 0 },
    update: { entity: 'order' },
  });
  const seq = await tx.numberingSequence.update({
    where: { companyId_entity: { companyId, entity: 'order' } },
    data: { lastNumber: { increment: 1 } },
  });
  return seq.lastNumber;
}

function recalcTotals(items: { price: number | Prisma.Decimal; quantity: number | Prisma.Decimal }[]) {
  const subtotal = round2(items.reduce((acc, i) => acc + toNum(i.price) * toNum(i.quantity), 0));
  const igv = round2(subtotal * 0.18);
  const total = round2(subtotal + igv);
  return { subtotal, igv, total };
}

// Cuando la comanda queda sin ítems, libera la mesa y elimina lógicamente la orden
// (esta_eliminado=1: desaparece de activos/analítica pero conserva historial y referencias Kardex).
// Guard anti-race: solo se libera la mesa si esta comanda sigue siendo su pedido activo,
// protege el caso de replays offline mientras ya se abrió una orden nueva en esa mesa.
async function vacateOrderAndFreeTable(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
  const order = await tx.order.findUnique({ where: { id: orderId } });
  if (!order || order.isDeleted || !order.tableId) return;

  const itemsCount = await tx.orderItem.count({ where: { orderId } });
  if (itemsCount > 0) return;

  const table = await tx.table.findFirst({ where: { id: order.tableId, isDeleted: false } });
  if (!table) return;

  if (table.currentOrderId === order.id) {
    await tx.table.update({
      where: { id: table.id },
      data: { status: 'libre', occupiedSince: null, minutesElapsed: null, currentOrderId: null, waiter: null },
    });
  }

  await tx.order.update({ where: { id: order.id }, data: { isDeleted: true } });
}

// ============================ APERTURA DE MESA / ORDEN ============================

export async function openOrderForTable(
  tableId: string,
  input: { waiter?: string; clientOpId?: string }
) {
  return prisma.$transaction(async (tx) => {
    const table = await tx.table.findFirst({ where: { id: tableId, isDeleted: false } });
    if (!table) throw new AppError('Mesa no encontrada.', 404, 'NOT_FOUND');

    // Idempotencia (contrato de sync): si el cliente reenvía el mismo clientOpId, devolver la orden existente.
    if (input.clientOpId) {
      const existing = await tx.order.findFirst({
        where: { clientOpId: input.clientOpId, isDeleted: false },
        include: { items: true },
      });
      if (existing) return existing;
    }

    // Si ya tiene una orden activa, retornarla.
    if (table.currentOrderId) {
      const existing = await tx.order.findFirst({
        where: { id: table.currentOrderId, isDeleted: false },
        include: { items: true },
      });
      if (existing && existing.status !== 'cobrado') {
        // Sincronizar estado de mesa si quedó desincronizada (ej. UPDATE manual en BD).
        if (table.status !== 'ocupada') {
          const { time: syncTime } = nowParts();
          await tx.table.update({
            where: { id: table.id },
            data: { status: 'ocupada', occupiedSince: syncTime, currentOrderId: existing.id, waiter: input.waiter?.trim() || existing.waiter },
          });
        }
        return existing;
      }
      // Orden ya no es válida (borrada o cobrada) → limpiar referencia muerta.
      await tx.table.update({
        where: { id: table.id },
        data: { currentOrderId: null },
      });
    }

    const { time } = nowParts();
    const ticketNumber = (await allocateTicket(tx, table.companyId)).toString();
    const waiter = input.waiter?.trim() || '';

    const order = await tx.order.create({
      data: {
        id: randomUUID(),
        companyId: table.companyId,
        ticketNumber,
        tableId: table.id,
        tableNumber: table.number,
        zone: table.zone,
        waiter,
        createdAt: time,
        subtotal: 0,
        igv: 0,
        total: 0,
        status: 'abierto',
        clientOpId: input.clientOpId ?? randomUUID(),
      },
      include: { items: true },
    });

    await tx.table.update({
      where: { id: table.id },
      data: { status: 'ocupada', occupiedSince: time, currentOrderId: order.id, waiter },
    });

    return order;
  }).then((o) => plain(o));
}

// Pedido rápido en barra (reutiliza mesa libre de barra o crea una nueva).
export async function createQuickBarOrder(input: { companyId: string; waiter?: string; clientOpId?: string }) {
  const companyId = input.companyId;
  return prisma.$transaction(async (tx) => {
    const freeBarra = await tx.table.findFirst({
      where: { companyId, isDeleted: false, status: 'libre', zone: 'Barra' },
      orderBy: { number: 'asc' },
    });

    let table = freeBarra;
    if (!table) {
      const barraTables = await tx.table.findMany({ where: { companyId, zone: 'Barra' } });
      let max = 0;
      for (const t of barraTables) {
        const parsed = parseInt(t.number.replace(/\D/g, ''), 10);
        if (!Number.isNaN(parsed) && parsed > max) max = parsed;
      }
      table = await tx.table.create({
        data: {
          id: `t-express-${randomUUID().replace(/-/g, '').slice(0, 26)}`,
          companyId,
          number: `B${max + 1}`,
          capacity: 1,
          zone: 'Barra',
          status: 'libre',
        },
      });
    }

    const order = await openOrderForTableTx(tx, table.id, input.waiter, input.clientOpId);
    return order;
  }).then((o) => plain(o));
}

async function openOrderForTableTx(
  tx: Prisma.TransactionClient,
  tableId: string,
  waiter?: string,
  clientOpId?: string
) {
  const table = await tx.table.findFirst({ where: { id: tableId, isDeleted: false } });
  if (!table) throw new AppError('Mesa no encontrada.', 404, 'NOT_FOUND');

  if (clientOpId) {
    const dedup = await tx.order.findFirst({
      where: { clientOpId, isDeleted: false },
      include: { items: true },
    });
    if (dedup) return dedup;
  }

  if (table.currentOrderId) {
    const existing = await tx.order.findFirst({
      where: { id: table.currentOrderId, isDeleted: false },
      include: { items: true },
    });
    if (existing && existing.status !== 'cobrado') {
      // Sincronizar estado de mesa si quedó desincronizada (ej. UPDATE manual en BD).
      if (table.status !== 'ocupada') {
        const { time: syncTime } = nowParts();
        await tx.table.update({
          where: { id: table.id },
          data: { status: 'ocupada', occupiedSince: syncTime, currentOrderId: existing.id, waiter: waiter?.trim() || existing.waiter },
        });
      }
      return existing;
    }
    // Orden ya no es válida (borrada o cobrada) → limpiar referencia muerta.
    await tx.table.update({
      where: { id: table.id },
      data: { currentOrderId: null },
    });
  }

  const { time } = nowParts();
  const ticketNumber = (await allocateTicket(tx, table.companyId)).toString();

  const order = await tx.order.create({
    data: {
      id: randomUUID(),
      companyId: table.companyId,
      ticketNumber,
      tableId: table.id,
      tableNumber: table.number,
      zone: table.zone,
      waiter: waiter?.trim() || '',
      createdAt: time,
      subtotal: 0,
      igv: 0,
      total: 0,
      status: 'abierto',
      clientOpId: clientOpId ?? randomUUID(),
    },
    include: { items: true },
  });

  await tx.table.update({
    where: { id: table.id },
    data: { status: 'ocupada', occupiedSince: time, currentOrderId: order.id, waiter },
  });

  return order;
}

// ============================ ITEMS ============================

export async function getOrder(orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, isDeleted: false },
    include: { items: true },
  });
  if (!order) throw new AppError('Orden no encontrada.', 404, 'NOT_FOUND');
  return plain(order);
}

export async function addItemToOrder(orderId: string, input: { productId: string; quantity?: number; notes?: string }) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { id: orderId, isDeleted: false }, include: { items: true } });
    if (!order) throw new AppError('Orden no encontrada.', 404, 'NOT_FOUND');
    if (order.status === 'cobrado') throw new AppError('La orden ya fue cobrada.', 409, 'ALREADY_PAID');

    const product = await tx.product.findFirst({ where: { id: input.productId, isDeleted: false } });
    if (!product) throw new AppError('Producto no encontrado.', 404, 'PRODUCT_NOT_FOUND');

    const quantity = input.quantity ?? 1;
    const notes = input.notes?.trim() || '';
    const { time } = nowParts();

    // Merging idéntico a la demo: mismo producto + mismas notas -> incrementa cantidad.
    const existingItem = order.items.find(
      (i) => i.productId === product.id && (i.notes || '') === notes
    );

    if (existingItem) {
      await tx.orderItem.update({
        where: { id: existingItem.id },
        data: { quantity: { increment: quantity } },
      });
    } else {
      await tx.orderItem.create({
        data: {
          id: randomUUID(),
          orderId: order.id,
          productId: product.id,
          name: product.name,
          price: product.price,
          quantity,
          notes: notes || null,
          status: 'agregado',
          addedAt: time,
        },
      });
    }

    const items = await tx.orderItem.findMany({ where: { orderId: order.id } });
    const totals = recalcTotals(items);
    const updated = await tx.order.update({ where: { id: order.id }, data: { ...totals } });
    return { ...updated, items };
  }).then((o) => plain(o));
}

// ============================ REVERSO KARDEX (DEVOLUCIONES) ============================

// Repone insumos cuando un ítem YA despachado (estado 'en_cocina', o sea que hubo rebaja
// de stock por receta) se reduce o se borra. Registra movimientos ENTRADA_DEVOLUCION_VENTA_POS.
async function reverseKitchenForItems(
  tx: Prisma.TransactionClient,
  order: { id: string; companyId: string; ticketNumber: string | number },
  item: { productId: string | null; name: string; quantity: number | Prisma.Decimal },
  qtyToReverse: number
): Promise<void> {
  if (qtyToReverse <= 0) return;

  const recipes = await tx.recipe.findMany({ where: { isDeleted: false }, include: { ingredients: true } });
  const recipe = recipes.find((r) => r.productId === item.productId || r.productName === item.name);
  if (!recipe || recipe.ingredients.length === 0) return;

  const { time, date, utc } = nowParts();
  const deductionByInsumo: Record<string, number> = {};
  const movements: Prisma.KardexMovementCreateManyInput[] = [];

  for (const ing of recipe.ingredients) {
    const qtyRev = round3(toNum(ing.quantity) * qtyToReverse);
    if (ing.insumoId) {
      deductionByInsumo[ing.insumoId] = (deductionByInsumo[ing.insumoId] || 0) + qtyRev;
    }

    const insumo = ing.insumoId ? await tx.insumo.findUnique({ where: { id: ing.insumoId } }) : null;
    const currentStock = insumo ? toNum(insumo.currentStock) : 10;
    const cost = toNum(ing.costPerUnit) || (insumo ? toNum(insumo.costPerUnit) : 10);

    movements.push({
      id: randomUUID(),
      companyId: order.companyId,
      timestamp: utc,
      date,
      time,
      insumoId: ing.insumoId,
      insumoName: ing.insumoName,
      type: 'ENTRADA_DEVOLUCION_VENTA_POS',
      referenceDoc: `Devolución cocina #${order.ticketNumber} (${qtyToReverse}x ${item.name})`,
      quantity: qtyRev,
      unit: ing.unit,
      unitCost: cost,
      totalCost: round2(qtyRev * cost),
      stockBefore: currentStock,
      stockAfter: round2(currentStock + qtyRev),
      notes: `Devolución automática según Ficha Técnica (${recipe.productName})`,
      clientOpId: randomUUID(),
    });
  }

  if (movements.length > 0) {
    await tx.kardexMovement.createMany({ data: movements });
    for (const insumoId of Object.keys(deductionByInsumo)) {
      const insumo = await tx.insumo.findUnique({ where: { id: insumoId } });
      if (!insumo) continue;
      await tx.insumo.update({
        where: { id: insumoId },
        data: { currentStock: round2(toNum(insumo.currentStock) + deductionByInsumo[insumoId]) },
      });
    }
  }
}

export async function updateItemQuantity(orderId: string, itemId: string, delta: number) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.orderItem.findFirst({ where: { id: itemId, orderId } });
    if (!item) throw new AppError('Ítem no encontrado.', 404, 'ITEM_NOT_FOUND');

    const newQty = round3(toNum(item.quantity) + delta);

    if (item.status === 'en_cocina' && newQty < toNum(item.quantity)) {
      const qtyToReverse = round3(toNum(item.quantity) - Math.max(0, newQty));
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (order) await reverseKitchenForItems(tx, order, item, qtyToReverse);
    }

    if (newQty <= 0) {
      await tx.orderItem.delete({ where: { id: itemId } });
    } else {
      await tx.orderItem.update({ where: { id: itemId }, data: { quantity: newQty } });
    }

    const items = await tx.orderItem.findMany({ where: { orderId } });
    const totals = recalcTotals(items);
    const updated = await tx.order.update({ where: { id: orderId }, data: { ...totals } });
    if (items.length === 0) {
      await vacateOrderAndFreeTable(tx, orderId);
    }
    return { ...updated, items };
  }).then((o) => plain(o));
}

export async function updateItemNotes(orderId: string, itemId: string, notes: string) {
  const item = await prisma.orderItem.findFirst({ where: { id: itemId, orderId } });
  if (!item) throw new AppError('Ítem no encontrado.', 404, 'ITEM_NOT_FOUND');
  return plain(
    await prisma.orderItem.update({
      where: { id: itemId },
      data: { notes: notes.trim() || null },
    })
  );
}

export async function removeItemFromOrder(orderId: string, itemId: string) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.orderItem.findFirst({ where: { id: itemId, orderId } });
    if (!item) throw new AppError('Ítem no encontrado.', 404, 'ITEM_NOT_FOUND');

    if (item.status === 'en_cocina') {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (order) await reverseKitchenForItems(tx, order, item, toNum(item.quantity));
    }

    await tx.orderItem.delete({ where: { id: itemId } });

    const items = await tx.orderItem.findMany({ where: { orderId } });
    const totals = recalcTotals(items);
    const updated = await tx.order.update({ where: { id: orderId }, data: { ...totals } });
    if (items.length === 0) {
      await vacateOrderAndFreeTable(tx, orderId);
    }
    return { ...updated, items };
  }).then((o) => plain(o));
}

// ============================ ENVIO A COCINA + KARDEX ============================

// Motor de deducción Kardex, réplica fiel de la demo: explota la receta de cada ítem
// y descuenta stock de insumos registrando movimientos SALIDA_VENTA_POS.
export async function sendToKitchen(orderId: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: orderId, isDeleted: false },
      include: { items: true },
    });
    if (!order) throw new AppError('Orden no encontrada.', 404, 'NOT_FOUND');
    if (order.status === 'cobrado') throw new AppError('La orden ya fue cobrada.', 409, 'ALREADY_PAID');

    const recipes = await tx.recipe.findMany({ where: { isDeleted: false }, include: { ingredients: true } });
    const { time, date, utc } = nowParts();

    const movements: Prisma.KardexMovementCreateManyInput[] = [];
    const deductionByInsumo: Record<string, number> = {};

    for (const item of order.items) {
      const recipe = recipes.find(
        (r) => r.productId === item.productId || r.productName === item.name
      );
      if (!recipe || recipe.ingredients.length === 0) continue;

      for (const ing of recipe.ingredients) {
        const qtyNeeded = round3(toNum(ing.quantity) * toNum(item.quantity));
        if (ing.insumoId) {
          deductionByInsumo[ing.insumoId] = (deductionByInsumo[ing.insumoId] || 0) + qtyNeeded;
        }

        const insumo = ing.insumoId
          ? await tx.insumo.findUnique({ where: { id: ing.insumoId } })
          : null;
        const currentStock = insumo ? toNum(insumo.currentStock) : 10;
        const cost = toNum(ing.costPerUnit) || (insumo ? toNum(insumo.costPerUnit) : 10);

        movements.push({
          id: randomUUID(),
          companyId: order.companyId,
          timestamp: utc,
          date,
          time,
          insumoId: ing.insumoId,
          insumoName: ing.insumoName,
          type: 'SALIDA_VENTA_POS',
          referenceDoc: `Despacho Cocina #${order.ticketNumber} (${item.quantity}x ${item.name})`,
          quantity: -qtyNeeded,
          unit: ing.unit,
          unitCost: cost,
          totalCost: round2(qtyNeeded * cost),
          stockBefore: currentStock,
          stockAfter: round2(currentStock - qtyNeeded),
          notes: `Consumo automático según Ficha Técnica (${recipe.productName})`,
          clientOpId: randomUUID(),
        });
      }
    }

    if (movements.length > 0) {
      await tx.kardexMovement.createMany({ data: movements });

      for (const insumoId of Object.keys(deductionByInsumo)) {
        const insumo = await tx.insumo.findUnique({ where: { id: insumoId } });
        if (!insumo) continue;
        const newStock = Math.max(0, round2(toNum(insumo.currentStock) - deductionByInsumo[insumoId]));
        await tx.insumo.update({ where: { id: insumoId }, data: { currentStock: newStock } });
      }
    }

    await tx.orderItem.updateMany({ where: { orderId }, data: { status: 'en_cocina' } });
    const updated = await tx.order.update({
      where: { id: orderId },
      data: { status: 'en_cocina' },
      include: { items: true },
    });

    return { order: updated, kardexMovements: movements.length };
  }).then((o) => plain(o));
}

// Marcar mesa + pedido como "por cobrar" (write-through del paso a cobro en POS).
export async function markTableForBilling(tableId: string) {
  return prisma.$transaction(async (tx) => {
    const table = await tx.table.findFirst({ where: { id: tableId, isDeleted: false } });
    if (!table) throw new AppError('Mesa no encontrada.', 404, 'NOT_FOUND');
    if (!table.currentOrderId) throw new AppError('La mesa no tiene pedido activo.', 409, 'NO_ACTIVE_ORDER');

    const order = await tx.order.findUnique({ where: { id: table.currentOrderId } });
    if (!order) throw new AppError('Pedido no encontrado.', 404, 'NOT_FOUND');
    if (order.status === 'cobrado') throw new AppError('La orden ya fue cobrada.', 409, 'ALREADY_PAID');

    const updated = await tx.order.update({
      where: { id: order.id },
      data: { status: 'por_cobrar' },
      include: { items: true },
    });
    if (table.status && table.status !== 'libre') {
      await tx.table.update({ where: { id: table.id }, data: { status: 'por_cobrar' } });
    }

    return updated;
  }).then((o) => plain(o));
}

// ============================ PAGO DE MESA ============================

export interface PayTableInput {
  paymentMethod: string;
  amountReceived: number;
  customPaymentMethodId?: string;
  referenceNumber?: string;
  clientOpId?: string;
}

export async function payTable(tableId: string, input: PayTableInput) {
  return prisma.$transaction(async (tx) => {
    // Idempotencia: si ya se cobró con ese clientOpId, devolver el resultado existente.
    if (input.clientOpId) {
      const existingTxn = await tx.transaction.findFirst({
        where: { clientOpId: input.clientOpId },
      });
      if (existingTxn) {
        const existingOrder = existingTxn.orderId
          ? await tx.order.findFirst({
              where: { id: existingTxn.orderId, isDeleted: false },
              include: { items: true },
            })
          : null;
        if (existingOrder) return { order: existingOrder, transaction: existingTxn };
        throw new AppError('Orden asociada a la transacción no encontrada.', 404, 'NOT_FOUND');
      }
    }

    const table = await tx.table.findFirst({ where: { id: tableId, isDeleted: false } });
    if (!table || !table.currentOrderId) {
      throw new AppError('La mesa no tiene una orden activa para cobrar.', 404, 'ORDER_NOT_FOUND');
    }

    const order = await tx.order.findFirst({
      where: { id: table.currentOrderId, isDeleted: false },
      include: { items: true },
    });
    if (!order) throw new AppError('Orden no encontrada.', 404, 'ORDER_NOT_FOUND');
    if (order.status === 'cobrado') throw new AppError('La orden ya fue cobrada.', 409, 'ALREADY_PAID');

    const change = Math.max(0, round2(input.amountReceived - toNum(order.total)));

    // Método de pago (custom id o por nombre, case-insensitive)
    const methods = await tx.customPaymentMethod.findMany({
      where: { isDeleted: false, OR: [{ companyId: order.companyId }, { companyId: null }] },
      select: { id: true, name: true, bankAccountId: true, bankAccountAlias: true },
    });
    const byId =
      input.customPaymentMethodId
        ? methods.find((m) => m.id === input.customPaymentMethodId)
        : undefined;
    const byName = methods.find(
      (m) => m.name.toLowerCase() === input.paymentMethod.toLowerCase()
    );
    const matchedPm = (byId || byName) ?? null;

    const bankAccountId = matchedPm?.bankAccountId ?? null;
    const bankAccountAlias = matchedPm?.bankAccountAlias ?? null;

    // Abonar a la cuenta bancaria vinculada (si existe)
    if (bankAccountId) {
      await tx.bankAccount.update({
        where: { id: bankAccountId },
        data: { currentBalance: { increment: toNum(order.total) } },
      });
    }

    const { time, date, utc } = nowParts();
    const company = await tx.company.findUnique({ where: { id: order.companyId } });
    const companyShift = await tx.companyShift.findUnique({ where: { companyId: order.companyId } });

    const txType = table.zone === 'Barra' ? 'Venta (Barra)' : 'Venta (Mesa)';
    const description = `Pago ${input.paymentMethod}${bankAccountAlias ? ` (${bankAccountAlias})` : ''} - Ticket #${order.ticketNumber} (${company?.tradeName ?? order.companyId} - ${table.number})`;

    const transaction = await tx.transaction.create({
      data: {
        id: randomUUID(),
        companyId: order.companyId,
        time,
        date,
        timestamp: utc,
        type: txType,
        description,
        amount: toNum(order.total),
        isIncome: true,
        paymentMethod: input.paymentMethod,
        customPaymentMethodId: matchedPm?.id ?? null,
        bankAccountId,
        bankAccountAlias,
        shift: companyShift?.currentShift ?? 'Día',
        referenceNumber: input.referenceNumber ?? null,
        tableNumber: table.number,
        orderId: order.id,
        ticketNumber: order.ticketNumber,
        clientOpId: input.clientOpId ?? randomUUID(),
      },
    });

    await tx.order.update({
      where: { id: order.id },
      data: {
        status: 'cobrado',
        paymentMethod: input.paymentMethod,
        amountReceived: input.amountReceived,
        change,
        closedAt: time,
        closedUtc: utc,
      },
    });

    // Todos los ítems de la comanda quedan servidos al cobrar (cierre del ciclo de venta).
    await tx.orderItem.updateMany({ where: { orderId: order.id }, data: { status: 'servido' } });

    // Liberar mesa
    await tx.table.update({
      where: { id: table.id },
      data: { status: 'libre', occupiedSince: null, minutesElapsed: null, currentOrderId: null, waiter: null },
    });

    const finalized = await tx.order.findUnique({
      where: { id: order.id },
      include: { items: true },
    });

    return { order: finalized, transaction };
  }).then((o) => plain(o));
}

export async function listActiveOrders(companyId?: string) {
  const orders = await prisma.order.findMany({
    where: {
      isDeleted: false,
      status: { not: 'cobrado' },
      ...(companyId ? { companyId } : {}),
    },
    include: { items: true },
    orderBy: { createdUtc: 'desc' },
  });
  return plain(orders);
}