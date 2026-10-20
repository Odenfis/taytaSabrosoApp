// Tiempo real mesas/órdenes (Fase D acotada).
// Socket.io sobre el mismo :4000. Auth con JWT del handshake.
// Rooms: `company:<companyId>` (el-tayta / el-sabroso). `todas` = ambas.
// Los eventos son avisos; la verdad sigue en REST (el front reconcilia con GET).
import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { prisma } from './prisma';
import { verifyAccessToken } from './auth';

export interface TableChangedPayload {
  tableId: string;
  companyId: string;
  status: string;
  currentOrderId: string | null;
  orderStatus?: string | null;
  ticketNumber?: string | null;
  total?: number | null;
  itemsCount?: number | null;
  waiter?: string | null;
  updatedAt: string;
}

export interface OrderChangedPayload {
  orderId: string;
  tableId: string | null;
  companyId: string;
  status: string;
  total?: number | null;
  itemsCount?: number | null;
  updatedAt: string;
}

export interface KardexChangedPayload {
  insumoId: string | null;
  insumoName: string;
  companyId: string;
  type: string;
  quantity: number;
  unit: string;
  unitCost: number;
  totalCost: number;
  stockBefore: number;
  stockAfter: number;
  referenceDoc: string;
  updatedAt: string;
}

let io: Server | null = null;

const roomOf = (companyId: string) => `company:${companyId}`;

function targetRooms(companyId: string): string[] {
  return [roomOf(companyId)];
}

export function emitTableChanged(companyId: string, payload: TableChangedPayload): void {
  try {
    io?.to(targetRooms(companyId)).emit('table:changed', payload);
  } catch {
    /* realtime best-effort: nunca romper la operación */
  }
}

export function emitOrderChanged(companyId: string, payload: OrderChangedPayload): void {
  try {
    io?.to(targetRooms(companyId)).emit('order:changed', payload);
  } catch {
    /* best-effort */
  }
}

export function emitKardexChanged(companyId: string, payload: KardexChangedPayload): void {
  try {
    io?.to(targetRooms(companyId)).emit('kardex:changed', payload);
  } catch {
    /* realtime best-effort: nunca romper la operación */
  }
}

export interface PurchaseChangedPayload {
  purchaseId: string;
  companyId: string;
  documentStatus: string;
  invoiceNumber: string;
  provisionalNoteNumber: string | null;
  supplierName: string;
  supplierRuc: string;
  total: number;
  category: string;
  updatedAt: string;
}

export function emitPurchaseChanged(companyId: string, payload: PurchaseChangedPayload): void {
  try {
    io?.to(targetRooms(companyId)).emit('purchase:changed', payload);
  } catch {
    /* realtime best-effort: nunca romper la operación */
  }
}

// Aviso de movimiento en el Libro de Caja (Fase D extendida): venta de mesa/barra
// cobrada, transacción manual, pago de compra o regularización. La verdad sigue en
// REST: el front reconcilia refrescando transacciones + cuentas bancarias.
export interface TransactionChangedPayload {
  transactionId?: string;
  companyId: string;
  type: string;
  amount: number;
  isIncome: boolean;
  paymentMethod: string;
  bankAccountId: string | null;
  bankAccountAlias: string | null;
  shift: string;
  tableNumber: string | null;
  updatedAt: string;
}

export function emitTransactionChanged(companyId: string, payload: TransactionChangedPayload): void {
  try {
    io?.to(targetRooms(companyId)).emit('transaction:changed', payload);
  } catch {
    /* realtime best-effort: nunca romper la operación */
  }
}

// Aviso de arqueo/cierre de turno: propaga la nueva caja inicial (initialCash)
// para que las otras terminales no queden con la gaveta desfasada.
export interface ShiftChangedPayload {
  companyId: string;
  closedShift: string;
  newShift: string;
  initialCash: number;
  reportedCash: number | null;
  systemCashExpected: number | null;
  difference: number | null;
  updatedAt: string;
}

export function emitShiftChanged(companyId: string, payload: ShiftChangedPayload): void {
  try {
    io?.to(targetRooms(companyId)).emit('shift:changed', payload);
  } catch {
    /* realtime best-effort: nunca romper la operación */
  }
}

export interface RecipeChangedPayload {
  recipeId: string;
  companyId: string;
  action: 'create' | 'update' | 'delete';
  productName: string;
  category: string;
  updatedAt: string;
}

export function emitRecipeChanged(companyId: string, payload: RecipeChangedPayload): void {
  try {
    io?.to(targetRooms(companyId)).emit('recipe:changed', payload);
  } catch {
    /* realtime best-effort: nunca romper la operación */
  }
}

export interface InsumoChangedPayload {
  insumoId: string;
  companyId: string | null;
  action: 'create' | 'update' | 'delete';
  name: string;
  category: string;
  unit: string;
  currentStock: number;
  costPerUnit: number;
  updatedAt: string;
}

export function emitInsumoChanged(companyId: string | null, payload: InsumoChangedPayload): void {
  const rooms = payload.companyId ? [roomOf(payload.companyId)] : [roomOf('el-tayta'), roomOf('el-sabroso')];
  try {
    for (const r of rooms) io?.to(r).emit('insumo:changed', payload);
  } catch {
    /* realtime best-effort: nunca romper la operación */
  }
}

export interface PaymentMethodChangedPayload {
  paymentMethodId: string;
  companyId: string | null;
  action: 'create' | 'update' | 'delete';
  name: string;
  category: string;
  icon: string;
  updatedAt: string;
}

export function emitPaymentMethodChanged(companyId: string | null, payload: PaymentMethodChangedPayload): void {
  const rooms = payload.companyId ? [roomOf(payload.companyId)] : [roomOf('el-tayta'), roomOf('el-sabroso')];
  try {
    for (const r of rooms) io?.to(r).emit('paymentMethod:changed', payload);
  } catch {
    /* realtime best-effort: nunca romper la operación */
  }
}

export interface PrinterChangedPayload {
  printerId: string;
  companyId: string | null;
  action: 'create' | 'update' | 'delete';
  name: string;
  role: string;
  connectionType: string;
  ipAddress: string | null;
  updatedAt: string;
}

export function emitPrinterChanged(companyId: string | null, payload: PrinterChangedPayload): void {
  const rooms = payload.companyId ? [roomOf(payload.companyId)] : [roomOf('el-tayta'), roomOf('el-sabroso')];
  try {
    for (const r of rooms) io?.to(r).emit('printer:changed', payload);
  } catch {
    /* realtime best-effort: nunca romper la operación */
  }
}

export interface ProductChangedPayload {
  productId: string;
  companyId: string;
  action: 'create' | 'update' | 'delete';
  name: string;
  price: number;
  category: string;
  hasRecipe: boolean;
  updatedAt: string;
}

export function emitProductChanged(companyId: string | null, payload: ProductChangedPayload): void {
  const rooms = payload.companyId ? [roomOf(payload.companyId)] : [roomOf('el-tayta'), roomOf('el-sabroso')];
  try {
    for (const r of rooms) io?.to(r).emit('product:changed', payload);
  } catch {
    /* realtime best-effort: nunca romper la operación */
  }
}

export function emitOrderTable(
  companyId: string,
  table: { id: string; status?: string | null; currentOrderId?: string | null; waiter?: string | null } | null,
  order: { id: string; status?: string | null; ticketNumber?: string | number | null; total?: unknown; items?: { quantity?: unknown }[] | null } | null
): void {
  const now = new Date().toISOString();
  const toNum = (v: unknown): number | null => {
    const n = Number((v as { toString?: () => string })?.toString?.() ?? v);
    return Number.isFinite(n) ? n : null;
  };
  const itemsCount = order?.items?.reduce((acc, i) => acc + (Number(i.quantity) || 0), 0) ?? null;
  if (table) {
    emitTableChanged(companyId, {
      tableId: table.id,
      companyId,
      status: table.status ?? 'ocupada',
      currentOrderId: table.currentOrderId ?? order?.id ?? null,
      orderStatus: order?.status ?? null,
      ticketNumber: order?.ticketNumber != null ? String(order.ticketNumber) : null,
      total: order ? toNum(order.total) : null,
      itemsCount,
      waiter: table.waiter ?? null,
      updatedAt: now,
    });
  }
  if (order) {
    emitOrderChanged(companyId, {
      orderId: order.id,
      tableId: table?.id ?? null,
      companyId,
      status: order.status ?? 'abierto',
      total: toNum(order.total),
      itemsCount,
      updatedAt: now,
    });
  }
}

interface JoinMsg {
  companyId?: string;
}

// Lee el estado fresco de orden+mesa y lo emite (best-effort, no bloquea la API).
// Cubre vaciados (orden soft-deleted → mesa libre) y pagos (mesa libre).
export async function notifyOrderState(orderId: string): Promise<void> {
  try {
    if (!io) return;
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) return;
    const table = order.tableId
      ? await prisma.table.findFirst({ where: { id: order.tableId, isDeleted: false } })
      : null;
    const companyId = order.companyId;
    const toNum = (v: unknown): number | null => {
      const n = Number((v as { toString?: () => string })?.toString?.() ?? v);
      return Number.isFinite(n) ? n : null;
    };
    const now = new Date().toISOString();
    const itemsCount = order.items?.reduce((acc, i) => acc + (Number(i.quantity) || 0), 0) ?? 0;
    if (table) {
      emitTableChanged(companyId, {
        tableId: table.id,
        companyId,
        status: table.status ?? 'libre',
        currentOrderId: table.currentOrderId ?? null,
        orderStatus: order.isDeleted ? 'cobrado' : order.status,
        ticketNumber: order.ticketNumber != null ? String(order.ticketNumber) : null,
        total: toNum(order.total),
        itemsCount,
        waiter: table.waiter ?? null,
        updatedAt: now,
      });
    }
    emitOrderChanged(companyId, {
      orderId: order.id,
      tableId: order.tableId,
      companyId,
      status: order.isDeleted ? 'cobrado' : order.status,
      total: toNum(order.total),
      itemsCount,
      updatedAt: now,
    });
  } catch {
    /* best-effort */
  }
}

export async function notifyTableState(tableId: string): Promise<void> {
  try {
    if (!io) return;
    const table = await prisma.table.findFirst({ where: { id: tableId, isDeleted: false } });
    if (!table) return;
    const order = table.currentOrderId
      ? await prisma.order.findFirst({
          where: { id: table.currentOrderId, isDeleted: false },
          include: { items: true },
        })
      : null;
    emitOrderTable(table.companyId, table, order);
  } catch {
    /* best-effort */
  }
}

export function initRealtime(httpServer: HttpServer): Server {
  const corsOrigin = process.env.CORS_ORIGIN?.split(',') ?? true;
  io = new Server(httpServer, { cors: { origin: corsOrigin as never } });

  io.use(async (socket: Socket, next) => {
    try {
      const raw =
        (socket.handshake.auth?.token as string | undefined) ??
        (typeof socket.handshake.headers.authorization === 'string'
          ? socket.handshake.headers.authorization.replace(/^Bearer\s+/i, '')
          : undefined);
      if (!raw) return next(new Error('UNAUTHORIZED'));
      const payload = verifyAccessToken(raw);
      const user = await prisma.user.findFirst({
        where: { id: payload.sub, isActive: true, isDeleted: false },
      });
      if (!user) return next(new Error('UNAUTHORIZED'));
      socket.data.userId = user.id;
      socket.data.deviceId = payload.deviceId;
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket: Socket) => {
    socket.on('join-company', (msg: JoinMsg) => {
      const id = msg?.companyId;
      const rooms = id === 'todas' ? [roomOf('el-tayta'), roomOf('el-sabroso')] : id ? [roomOf(id)] : [];
      // Salir de rooms previos de empresa para no mezclar.
      for (const r of socket.rooms) {
        if (r.startsWith('company:') && !rooms.includes(r)) socket.leave(r);
      }
      for (const r of rooms) socket.join(r);
    });
  });

  return io;
}
