import { lockInsumos, requireActiveInsumos } from '../lib/inventory.js';
import { randomUUID } from 'node:crypto';
import { matchingRecipe } from '../lib/recipeMatch.js';
import type { Prisma } from '@prisma/client';
import { AppError, plain, round2, round3, toNum } from '../lib/utils.js';
import { prisma } from '../lib/prisma.js';
import { emitKardexChanged, emitTransactionChanged } from '../lib/realtime.js';
import { orderTotalsFromItems } from '../lib/orderTotals.js';
import { isServiceZone } from '../lib/taytaTableLayout.js';

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

async function allocateServiceTable(tx: Prisma.TransactionClient, companyId: string): Promise<string> {
  await tx.numberingSequence.upsert({
    where: { companyId_entity: { companyId, entity: 'service-table' } },
    create: { companyId, entity: 'service-table', lastNumber: 35 },
    update: {},
  });
  const sequence = await tx.numberingSequence.update({
    where: { companyId_entity: { companyId, entity: 'service-table' } },
    data: { lastNumber: { increment: 1 } },
  });
  return String(sequence.lastNumber).padStart(2, '0');
}

function recalcTotals(items: { price: number | Prisma.Decimal; quantity: number | Prisma.Decimal }[]) {
  return orderTotalsFromItems(items);
}

// El bloqueo SQL serializa todos los escritores de una comanda. El rango de
// recibos también protege claves que aún no existen (apertura/cancelación).
const transactionNotices = new WeakMap<Prisma.TransactionClient, (() => void)[]>();
function afterCommit(tx: Prisma.TransactionClient, notice: () => void) { transactionNotices.get(tx)?.push(notice); }
async function orderTransaction<T>(action: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      const notices: (() => void)[] = [];
      const result = await prisma.$transaction((tx) => { transactionNotices.set(tx, notices); return action(tx); }, { timeout: 15000 });
      for (const notice of notices) notice();
      return result;
    }
    catch (error) {
      const failure = error as { code?: string; meta?: { code?: string | number } };
      const deadlock = failure.code === 'P2034' || (failure.code === 'P2010' && String(failure.meta?.code) === '1205');
      if (attempt >= 3 || !deadlock) throw error;
    }
  }
}
async function lockOrder(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT [id] FROM [dbo].[pedidos] WITH (UPDLOCK, HOLDLOCK) WHERE [id] = ${id}`;
}
async function readReceipt(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT [id] FROM [dbo].[resultados_pedidos] WITH (UPDLOCK, HOLDLOCK) WHERE [id] = ${id}`;
  const receipt = await tx.orderOperationResult.findUnique({ where: { id } });
  return receipt ? JSON.parse(receipt.result) : null;
}
async function saveReceipt(tx: Prisma.TransactionClient, id: string, orderId: string | null, result: unknown) {
  await tx.orderOperationResult.upsert({ where: { id }, create: { id, orderId, result: JSON.stringify(plain(result)) }, update: {} });
}
async function findOpeningOrder(tx: Prisma.TransactionClient, clientOpId: string) {
  const alias = await tx.orderOperationResult.findUnique({ where: { id: `alias:${clientOpId}` } });
  if (alias?.orderId) return tx.order.findUnique({ where: { id: alias.orderId }, include: { items: true } });
  return tx.order.findUnique({ where: { clientOpId }, include: { items: true } });
}
async function rememberOpening(tx: Prisma.TransactionClient, clientOpId: string | undefined, order: { id: string }) {
  if (clientOpId) await saveReceipt(tx, `alias:${clientOpId}`, order.id, { orderId: order.id });
}
function assertEditable(order: { status: string; isDeleted: boolean }) {
  if (order.status === 'cobrado') throw new AppError('La orden ya fue cobrada.', 409, 'ALREADY_PAID');
  if (order.isDeleted || order.status === 'anulado') throw new AppError('La orden está anulada.', 409, 'ORDER_CANCELLED');
}
async function editableOrder(tx: Prisma.TransactionClient, id: string) {
  await lockOrder(tx, id);
  const order = await tx.order.findUnique({ where: { id }, include: { items: true } });
  if (!order) throw new AppError('Orden no encontrada.', 404, 'NOT_FOUND');
  assertEditable(order);
  return order;
}

// Solo elimina físicamente borradores con historial conocido y sin despacho/pago.
async function finishEmptyOrder(tx: Prisma.TransactionClient, orderId: string) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true, transactions: { select: { id: true } } } });
  if (order.items.length) return order;
  assertEditable(order);
  const { transactions, ...snapshot } = order;
  const final = { ...snapshot, status: 'anulado', isDeleted: true, subtotal: 0, igv: 0, total: 0, closedUtc: new Date(), closedAt: nowParts().time };
  if (order.tableId) {
    await tx.table.updateMany({ where: { id: order.tableId, currentOrderId: order.id },
      data: { status: 'libre', occupiedSince: null, minutesElapsed: null, currentOrderId: null, waiter: null,
        isDeleted: isServiceZone(order.zone) } });
  }
  if (order.dispatchHistoryKnown && !order.firstDispatchedUtc && order.status === 'abierto' && transactions.length === 0) {
    await saveReceipt(tx, `cancelled:${order.id}`, order.id, final);
    await saveReceipt(tx, `opening:${order.clientOpId}`, order.id, final);
    await tx.order.delete({ where: { id: order.id } });
    return final;
  }
  const updated = await tx.order.update({ where: { id: order.id }, data: {
    status: 'anulado', isDeleted: true, subtotal: 0, igv: 0, total: 0, closedUtc: final.closedUtc, closedAt: final.closedAt,
  }, include: { items: true } });
  await saveReceipt(tx, `cancelled:${order.id}`, order.id, updated);
  await saveReceipt(tx, `opening:${order.clientOpId}`, order.id, updated);
  return updated;
}

// Aporte inicial de una apertura: se reconcilia bajo el mismo bloqueo que su
// cancelación. Guarda cantidades propias para no retirar adiciones de otra terminal.
export async function syncOpeningItems(clientOpId: string, items: { productId: string; quantity: number; notes?: string }[]) {
  return orderTransaction(async (tx) => {
    if (await readReceipt(tx, `opening:${clientOpId}`)) throw new AppError('La apertura fue cancelada.', 409, 'ORDER_CANCELLED');
    const found = await findOpeningOrder(tx, clientOpId);
    if (!found) throw new AppError('Apertura no encontrada.', 404, 'NOT_FOUND');
    const order = await editableOrder(tx, found.id);
    if (order.firstDispatchedUtc || order.status !== 'abierto') throw new AppError('El pedido ya fue despachado.', 409, 'ALREADY_DISPATCHED');
    const key = `draft:${clientOpId}`;
    const previous = await tx.orderOperationResult.findUnique({ where: { id: key } });
    const contributions: { id: string; quantity: number }[] = previous ? JSON.parse(previous.result) : [];
    for (const contribution of contributions) {
      const item = await tx.orderItem.findUnique({ where: { id: contribution.id } });
      if (!item) continue;
      const remaining = Math.max(0, toNum(item.quantity) - contribution.quantity);
      if (remaining) await tx.orderItem.update({ where: { id: item.id }, data: { quantity: remaining } });
      else await tx.orderItem.delete({ where: { id: item.id } });
    }
    const owned: { id: string; quantity: number }[] = [];
    for (const input of items) {
      const product = await tx.product.findUnique({ where: { id: input.productId } });
      if (!product || product.isDeleted || !product.available) throw new AppError('Producto no disponible.', 409, 'PRODUCT_UNAVAILABLE');
      if (product.companyId !== order.companyId) throw new AppError('Producto de otra empresa.', 409, 'PRODUCT_COMPANY_MISMATCH');
      const notes = input.notes?.trim() || null;
      const existing = await tx.orderItem.findFirst({ where: { orderId: order.id, productId: product.id, notes, status: 'agregado' } });
      const item = existing
        ? await tx.orderItem.update({ where: { id: existing.id }, data: { quantity: { increment: input.quantity } } })
        : await tx.orderItem.create({ data: { id: randomUUID(), orderId: order.id, productId: product.id, name: product.name,
          price: product.price, quantity: input.quantity, notes, status: 'agregado', addedAt: nowParts().time } });
      const same = owned.find((entry) => entry.id === item.id);
      if (same) same.quantity += input.quantity;
      else owned.push({ id: item.id, quantity: input.quantity });
    }
    await tx.orderOperationResult.upsert({ where: { id: key }, create: { id: key, orderId: order.id, result: JSON.stringify(owned) }, update: { result: JSON.stringify(owned) } });
    const currentItems = await tx.orderItem.findMany({ where: { orderId: order.id } });
    return tx.order.update({ where: { id: order.id }, data: recalcTotals(currentItems), include: { items: true } });
  }).then(plain);
}

// Herramienta administrativa separada: revalida bajo bloqueo y nunca elimina
// pedidos antiguos inciertos, despachados, cobrados o modificados desde la revisión.
export async function cleanupEmptyDraft(orderId: string) {
  return orderTransaction(async (tx) => {
    await lockOrder(tx, orderId);
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true, transactions: true } });
    if (!order || order.isDeleted || !order.dispatchHistoryKnown || order.firstDispatchedUtc || order.status !== 'abierto' || order.items.length || order.transactions.length) {
      return { id: orderId, skipped: true };
    }
    return finishEmptyOrder(tx, orderId);
  }).then(plain);
}

// Resuelve aperturas cuya respuesta se perdió, sin volver a crear un pedido.
export async function cancelOrderOpening(clientOpId: string) {
  return orderTransaction(async (tx) => {
    const key = `opening:${clientOpId}`;
    const receipt = await readReceipt(tx, key);
    if (receipt) return receipt;
    const order = await findOpeningOrder(tx, clientOpId);
    if (!order) {
      const result = { cancelled: true };
      await saveReceipt(tx, key, null, result);
      return result;
    }
    await lockOrder(tx, order.id);
    const current = await tx.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } });
    if (current.status !== 'abierto' || current.isDeleted || current.firstDispatchedUtc) return current;
    const contribution = await tx.orderOperationResult.findUnique({ where: { id: `draft:${clientOpId}` } });
    const owned: { id: string; quantity: number }[] = contribution ? JSON.parse(contribution.result) : [];
    for (const entry of owned) {
      const item = current.items.find((item) => item.id === entry.id);
      if (!item || item.status !== 'agregado') continue;
      const remaining = Math.max(0, toNum(item.quantity) - entry.quantity);
      if (remaining) await tx.orderItem.update({ where: { id: item.id }, data: { quantity: remaining } });
      else await tx.orderItem.delete({ where: { id: item.id } });
    }
    const items = await tx.orderItem.findMany({ where: { orderId: current.id } });
    if (!items.length) return finishEmptyOrder(tx, current.id);
    // Otra terminal conserva productos: bloquear replays de esta apertura,
    // manteniendo el pedido compartido y su mesa.
    const result = await tx.order.update({ where: { id: current.id }, data: recalcTotals(items), include: { items: true } });
    await saveReceipt(tx, key, current.id, { cancelled: true });
    return result;
  }).then(plain);
}

// ============================ APERTURA DE MESA / ORDEN ============================

export async function openOrderForTable(
  tableId: string,
  input: { waiter?: string; clientOpId?: string }
) {
  return orderTransaction(async (tx) => {
    if (input.clientOpId) {
      const cancelled = await readReceipt(tx, `opening:${input.clientOpId}`);
      if (cancelled) throw new AppError('La apertura fue cancelada.', 409, 'ORDER_CANCELLED');
    }
    await tx.$queryRaw`SELECT [id] FROM [dbo].[mesas] WITH (UPDLOCK, HOLDLOCK) WHERE [id] = ${tableId}`;
    const table = await tx.table.findFirst({ where: { id: tableId, isDeleted: false } });
    if (!table) throw new AppError('Mesa no encontrada.', 404, 'NOT_FOUND');

    // Idempotencia (contrato de sync): si el cliente reenvía el mismo clientOpId, devolver la orden existente.
    if (input.clientOpId) {
      const alias = await tx.orderOperationResult.findUnique({ where: { id: `alias:${input.clientOpId}` } });
      const existing = await findOpeningOrder(tx, input.clientOpId);
      if (existing) { assertEditable(existing); return existing; }
      if (alias) throw new AppError('La apertura fue cancelada.', 409, 'ORDER_CANCELLED');
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
        await rememberOpening(tx, input.clientOpId, existing);
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

    await rememberOpening(tx, input.clientOpId, order);
    return order;
  }).then((o) => plain(o));
}

// Pedido rápido en barra (reutiliza mesa libre de barra o crea una nueva).
export async function createQuickBarOrder(input: { companyId: string; zone?: 'Barra' | 'Delivery' | 'Llevar'; waiter?: string; clientOpId?: string }) {
  const companyId = input.companyId;
  const zone = input.zone ?? 'Barra';
  return orderTransaction(async (tx) => {
    if (input.clientOpId) {
      const cancelled = await readReceipt(tx, `opening:${input.clientOpId}`);
      if (cancelled) throw new AppError('La apertura fue cancelada.', 409, 'ORDER_CANCELLED');
      const existing = await findOpeningOrder(tx, input.clientOpId);
      if (existing) { assertEditable(existing); return existing; }
      const alias = await tx.orderOperationResult.findUnique({ where: { id: `alias:${input.clientOpId}` } });
      if (alias) throw new AppError('La apertura fue cancelada.', 409, 'ORDER_CANCELLED');
    }
    if (isServiceZone(zone) && companyId !== 'el-tayta') throw new AppError('Este ambiente solo está disponible en El Tayta.', 409, 'SERVICE_ZONE_COMPANY');
    const freeBarra = isServiceZone(zone) ? [] : await tx.$queryRaw<{ id: string }[]>`
      SELECT TOP (1) [id] FROM [dbo].[mesas] WITH (UPDLOCK, HOLDLOCK)
      WHERE [empresa_id] = ${companyId} AND [esta_eliminado] = 0 AND [estado] = N'libre' AND [zona] = N'Barra'
      ORDER BY [numero]`;
    let table = freeBarra[0] ? await tx.table.findUnique({ where: { id: freeBarra[0].id } }) : null;
    if (isServiceZone(zone)) {
      table = await tx.table.create({ data: {
        id: randomUUID(), companyId, number: await allocateServiceTable(tx, companyId), capacity: 1, zone, status: 'libre',
      } });
    } else if (!table && companyId === 'el-tayta') {
      throw new AppError('Las ocho sillas de Barra están ocupadas.', 409, 'BAR_FULL');
    } else if (!table) {
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
  await tx.$queryRaw`SELECT [id] FROM [dbo].[mesas] WITH (UPDLOCK, HOLDLOCK) WHERE [id] = ${tableId}`;
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
      await rememberOpening(tx, clientOpId, existing);
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

  await rememberOpening(tx, clientOpId, order);
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
  return orderTransaction(async (tx) => {
    const order = await editableOrder(tx, orderId);

    const product = await tx.product.findFirst({ where: { id: input.productId, isDeleted: false } });
    if (!product) throw new AppError('Producto no encontrado.', 404, 'PRODUCT_NOT_FOUND');
    if (product.companyId !== order.companyId) throw new AppError('El producto pertenece a otra empresa.', 409, 'PRODUCT_COMPANY_MISMATCH');
    if (!product.available) throw new AppError('Este producto no está disponible.', 409, 'PRODUCT_UNAVAILABLE');

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
  const recipe = matchingRecipe(recipes, order.companyId, item);
  if (!recipe || recipe.ingredients.length === 0) return;

  await lockInsumos(tx, recipe.ingredients.map((i) => i.insumoId));
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

    for (const m of movements) {
      afterCommit(tx, () => emitKardexChanged(order.companyId, {
        insumoId: m.insumoId ?? null,
        insumoName: m.insumoName,
        companyId: order.companyId,
        type: m.type,
        quantity: toNum(m.quantity),
        unit: m.unit,
        unitCost: toNum(m.unitCost),
        totalCost: toNum(m.totalCost),
        stockBefore: toNum(m.stockBefore),
        stockAfter: toNum(m.stockAfter),
        referenceDoc: m.referenceDoc,
        updatedAt: utc.toISOString(),
      }));
    }

    for (const insumoId of Object.keys(deductionByInsumo)) {
      const insumo = await tx.insumo.findUnique({ where: { id: insumoId } });
      if (!insumo) continue;
      await tx.insumo.update({
        where: { id: insumoId },
        data: { currentStock: round2(toNum(insumo.currentStock) + deductionByInsumo[insumoId]), version: { increment: 1 } },
      });
    }
  }
}

export async function updateItemQuantity(orderId: string, itemId: string, delta: number, clientOpId?: string) {
  return orderTransaction(async (tx) => {
    const key = clientOpId ? `quantity:${clientOpId}` : null;
    if (key) { const previous = await readReceipt(tx, key); if (previous) return previous; }
    await lockOrder(tx, orderId);
    const cancelled = await tx.orderOperationResult.findUnique({ where: { id: `cancelled:${orderId}` } });
    if (cancelled) {
      if (delta > 0) throw new AppError('La orden está anulada.', 409, 'ORDER_CANCELLED');
      return JSON.parse(cancelled.result);
    }
    const order = await editableOrder(tx, orderId);
    const item = order.items.find((item) => item.id === itemId);
    if (!item) {
      if (delta <= 0) return order;
      throw new AppError('Ítem no encontrado.', 404, 'ITEM_NOT_FOUND');
    }

    if (delta > 0) {
      const product = item.productId ? await tx.product.findUnique({ where: { id: item.productId } }) : null;
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!product || product.isDeleted || !product.available) throw new AppError('Este producto no está disponible.', 409, 'PRODUCT_UNAVAILABLE');
      if (product.companyId !== order?.companyId) throw new AppError('El producto pertenece a otra empresa.', 409, 'PRODUCT_COMPANY_MISMATCH');
    }
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
    const result = items.length === 0 ? await finishEmptyOrder(tx, orderId) : { ...updated, items };
    if (key) await saveReceipt(tx, key, orderId, result);
    return result;
  }).then((o) => plain(o));
}

export async function updateItemNotes(orderId: string, itemId: string, notes: string) {
  return orderTransaction(async (tx) => {
    await editableOrder(tx, orderId);
    const item = await tx.orderItem.findFirst({ where: { id: itemId, orderId } });
    if (!item) throw new AppError('Ítem no encontrado.', 404, 'ITEM_NOT_FOUND');
    return tx.orderItem.update({ where: { id: itemId }, data: { notes: notes.trim() || null } });
  }).then(plain);
}

export async function removeItemFromOrder(orderId: string, itemId: string, clientOpId?: string) {
  return orderTransaction(async (tx) => {
    const key = clientOpId ? `remove:${clientOpId}` : null;
    if (key) { const previous = await readReceipt(tx, key); if (previous) return previous; }
    await lockOrder(tx, orderId);
    const cancelled = await tx.orderOperationResult.findUnique({ where: { id: `cancelled:${orderId}` } });
    if (cancelled) return JSON.parse(cancelled.result);
    const order = await editableOrder(tx, orderId);
    const item = order.items.find((item) => item.id === itemId);
    if (!item) {
      if (true) return order;
      throw new AppError('Ítem no encontrado.', 404, 'ITEM_NOT_FOUND');
    }

    if (item.status === 'en_cocina') {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (order) await reverseKitchenForItems(tx, order, item, toNum(item.quantity));
    }

    await tx.orderItem.delete({ where: { id: itemId } });

    const items = await tx.orderItem.findMany({ where: { orderId } });
    const totals = recalcTotals(items);
    const updated = await tx.order.update({ where: { id: orderId }, data: { ...totals } });
    const result = items.length === 0 ? await finishEmptyOrder(tx, orderId) : { ...updated, items };
    if (key) await saveReceipt(tx, key, orderId, result);
    return result;
  }).then((o) => plain(o));
}

// ============================ ENVIO A COCINA + KARDEX ============================

// Motor de deducción Kardex, réplica fiel de la demo: explota la receta de cada ítem
// y descuenta stock de insumos registrando movimientos SALIDA_VENTA_POS.
export async function sendToKitchen(orderId: string, input?: { clientOpId?: string }) {
  return orderTransaction(async (tx) => {
    const order = await editableOrder(tx, orderId);
    if (!order.items.length) throw new AppError('La comanda está vacía.', 409, 'EMPTY_ORDER');
    if (!order.firstDispatchedUtc) await tx.order.update({ where: { id: orderId }, data: { firstDispatchedUtc: new Date() } });

    // Idempotencia (fix 2026-10-12): solo se deducen ítems en `agregado`. Los ítems
    // `en_cocina`/`servido` ya fueron rebajados por un despacho previo, así que un
    // reintento o replay llega aquí sin nada que deducir → no-op `replayed:true`.
    // (El intento E4 de reusar un único clientOpId por despacho chocaba con la
    // UNIQUE de kardexMovement.clientOpId cuando había 2+ movimientos; cada
    // movimiento vuelve a llevar su propio UUID.)
    const pendingItems = order.items.filter((i) => i.status === 'agregado');
    if (pendingItems.length === 0) {
      const current = await tx.order.update({
        where: { id: orderId },
        data: { status: 'en_cocina' },
        include: { items: true },
      });
      await tx.orderItem.updateMany({ where: { orderId }, data: { status: 'en_cocina' } });
      return { order: current, kardexMovements: 0, replayed: true };
    }

    const recipes = await tx.recipe.findMany({ where: { isDeleted: false }, include: { ingredients: true } });
    const selectedRecipes = pendingItems.map((item) => matchingRecipe(recipes, order.companyId, item)).filter((recipe) => !!recipe);
    await requireActiveInsumos(tx, selectedRecipes.flatMap((recipe) => recipe.ingredients.map((i) => i.insumoId)), order.companyId);
    const { time, date, utc } = nowParts();

    const movements: Prisma.KardexMovementCreateManyInput[] = [];
    const deductionByInsumo: Record<string, number> = {};

    for (const item of pendingItems) {
      const recipe = matchingRecipe(recipes, order.companyId, item);
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

      for (const m of movements) {
        afterCommit(tx, () => emitKardexChanged(order.companyId, {
          insumoId: m.insumoId ?? null,
          insumoName: m.insumoName,
          companyId: order.companyId,
          type: m.type,
          quantity: toNum(m.quantity),
          unit: m.unit,
          unitCost: toNum(m.unitCost),
          totalCost: toNum(m.totalCost),
          stockBefore: toNum(m.stockBefore),
          stockAfter: toNum(m.stockAfter),
          referenceDoc: m.referenceDoc,
          updatedAt: utc.toISOString(),
        }));
      }

      for (const insumoId of Object.keys(deductionByInsumo)) {
        const insumo = await tx.insumo.findUnique({ where: { id: insumoId } });
        if (!insumo) continue;
        const newStock = round2(toNum(insumo.currentStock) - deductionByInsumo[insumoId]);
        await tx.insumo.update({ where: { id: insumoId }, data: { currentStock: newStock, version: { increment: 1 } } });
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
  return orderTransaction(async (tx) => {
    const table = await tx.table.findFirst({ where: { id: tableId, isDeleted: false } });
    if (!table) throw new AppError('Mesa no encontrada.', 404, 'NOT_FOUND');
    if (!table.currentOrderId) throw new AppError('La mesa no tiene pedido activo.', 409, 'NO_ACTIVE_ORDER');

    await lockOrder(tx, table.currentOrderId);
    const order = await tx.order.findUnique({
      where: { id: table.currentOrderId },
      include: { items: true },
    });
    if (!order) throw new AppError('Pedido no encontrado.', 404, 'NOT_FOUND');
    if (order.status === 'cobrado') throw new AppError('La orden ya fue cobrada.', 409, 'ALREADY_PAID');

    assertEditable(order);
    if (!order.items.length) throw new AppError('La comanda está vacía.', 409, 'EMPTY_ORDER');
    assertKitchenDispatched(order.items);

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

// Regla de negocio: no se puede pasar a cobro ni pagar si hay ítems sin despachar
// (estado 'agregado' = nunca enviados a cocina = Kardex sin descontar).
function assertKitchenDispatched(
  items: { status: string }[]
): void {
  const pending = items.filter((i) => i.status === 'agregado').length;
  if (pending > 0) {
    throw new AppError(
      `Hay ${pending} ítem(s) sin enviar a cocina. El Kardex no fue descontado; ejecute el despacho antes de continuar al cobro.`,
      409,
      'PENDING_KITCHEN'
    );
  }
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
  return orderTransaction(async (tx) => {
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

    await lockOrder(tx, table.currentOrderId);
    const order = await tx.order.findFirst({
      where: { id: table.currentOrderId, isDeleted: false },
      include: { items: true },
    });
    if (!order) throw new AppError('Orden no encontrada.', 404, 'ORDER_NOT_FOUND');
    if (order.status === 'cobrado') throw new AppError('La orden ya fue cobrada.', 409, 'ALREADY_PAID');

    assertEditable(order);
    if (!order.items.length) throw new AppError('La comanda está vacía.', 409, 'EMPTY_ORDER');
    assertKitchenDispatched(order.items);

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
      data: { status: 'libre', occupiedSince: null, minutesElapsed: null, currentOrderId: null, waiter: null,
        isDeleted: isServiceZone(table.zone) },
    });

    const finalized = await tx.order.findUnique({
      where: { id: order.id },
      include: { items: true },
    });

    // Aviso realtime Libro de Caja: la venta (caja/banco) ya está registrada.
    afterCommit(tx, () => emitTransactionChanged(order.companyId, {
      transactionId: transaction.id,
      companyId: order.companyId,
      type: txType,
      amount: toNum(transaction.amount),
      isIncome: true,
      paymentMethod: input.paymentMethod,
      bankAccountId: bankAccountId,
      bankAccountAlias: bankAccountAlias,
      shift: companyShift?.currentShift ?? 'Día',
      tableNumber: table.number,
      updatedAt: utc.toISOString(),
    }));

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
