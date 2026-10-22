// Cliente realtime mesas/órdenes (Fase D acotada).
// Singleton socket.io-client. Los eventos son avisos; la verdad se reconcilia
// con REST en POSContext (merge de mesa + GET de orden si la tengo abierta).
import { io, type Socket } from 'socket.io-client';
import { requireAuthentication } from './api';

export interface TableChangedEvent {
  tableId: string;
  companyId: string;
  status: string;
  currentOrderId: string | null;
  orderStatus?: string | null;
  sourceOrderId?: string;
  ticketNumber?: string | null;
  total?: number | null;
  itemsCount?: number | null;
  waiter?: string | null;
  updatedAt: string;
}

export interface OrderChangedEvent {
  orderId: string;
  tableId: string | null;
  companyId: string;
  status: string;
  isDeleted?: boolean;
  total?: number | null;
  itemsCount?: number | null;
  updatedAt: string;
}

export interface KardexChangedEvent {
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

export interface PurchaseChangedEvent {
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

export interface RecipeChangedEvent {
  recipeId: string;
  companyId: string;
  action: 'create' | 'update' | 'delete';
  productName: string;
  category: string;
  updatedAt: string;
}

export interface InsumoChangedEvent {
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

export interface PaymentMethodChangedEvent {
  paymentMethodId: string;
  companyId: string | null;
  action: 'create' | 'update' | 'delete';
  name: string;
  category: string;
  icon: string;
  updatedAt: string;
}

export interface PrinterChangedEvent {
  printerId: string;
  companyId: string | null;
  action: 'create' | 'update' | 'delete';
  name: string;
  role: string;
  connectionType: string;
  ipAddress: string | null;
  updatedAt: string;
}

export interface ProductChangedEvent {
  productId: string;
  companyId: string;
  action: 'create' | 'update' | 'delete';
  name: string;
  price: number;
  category: string;
  hasRecipe: boolean;
  updatedAt: string;
}

// Aviso Libro de Caja (venta cobrada, transacción manual, compra, arqueo):
// la verdad se reconcilia con REST refrescando transacciones/cuentas/turnos.
export interface TransactionChangedEvent {
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

export interface ShiftChangedEvent {
  companyId: string;
  closedShift: string;
  newShift: string;
  initialCash: number;
  reportedCash: number | null;
  systemCashExpected: number | null;
  difference: number | null;
  updatedAt: string;
}

export type RealtimeStatus = 'connected' | 'connecting' | 'disconnected';

let socket: Socket | null = null;
let lastToken: string | null = null;
let lastCompany: string | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

export function isRealtimeConnected(): boolean {
  return !!socket?.connected;
}

export function connectRealtime(opts: {
  token: string;
  companyId: string;
  onTableChanged: (e: TableChangedEvent) => void;
  onOrderChanged: (e: OrderChangedEvent) => void;
  onKardexChanged: (e: KardexChangedEvent) => void;
  onPurchaseChanged: (e: PurchaseChangedEvent) => void;
  onRecipeChanged: (e: RecipeChangedEvent) => void;
  onInsumoChanged: (e: InsumoChangedEvent) => void;
  onPaymentMethodChanged: (e: PaymentMethodChangedEvent) => void;
  onPrinterChanged: (e: PrinterChangedEvent) => void;
  onProductChanged: (e: ProductChangedEvent) => void;
  onTransactionChanged: (e: TransactionChangedEvent) => void;
  onShiftChanged: (e: ShiftChangedEvent) => void;
  onStatus: (s: RealtimeStatus) => void;
}): void {
  const { token, companyId, onTableChanged, onOrderChanged, onKardexChanged, onPurchaseChanged, onRecipeChanged, onInsumoChanged, onPaymentMethodChanged, onPrinterChanged, onProductChanged, onTransactionChanged, onShiftChanged, onStatus } = opts;
  const same = socket && lastToken === token;
  if (same && socket) {
    if (lastCompany !== companyId) {
      lastCompany = companyId;
      socket.emit('join-company', { companyId });
    }
    return;
  }
  disconnectRealtime();
  lastToken = token;
  lastCompany = companyId;
  onStatus('connecting');
  // Mismo origen (en dev Vite proxyea /socket.io → :4000).
  socket = io({ auth: { token }, reconnection: true, reconnectionDelayMax: 5000 });
  const currentSocket = socket;
  const retryAuthentication = () => {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      if (socket === currentSocket && !currentSocket.connected) currentSocket.connect();
    }, 5000);
  };
  const handleAuthError = (code?: string) => {
    onStatus('disconnected');
    if (code === 'UNAUTHORIZED') {
      clearTimeout(reconnectTimer);
      currentSocket.disconnect();
      requireAuthentication(token, 'Su sesión ya no es válida. Vuelva a iniciar sesión; las operaciones pendientes se conservan.');
    } else {
      // Un fallo de SQL/infraestructura conserva el token y permite reintentar.
      retryAuthentication();
    }
  };
  socket.on('connect_error', (error: Error & { data?: { code?: string } }) => handleAuthError(error.data?.code));
  socket.on('session:error', (error: { code?: string }) => handleAuthError(error.code));
  socket.on('connect', () => {
    clearTimeout(reconnectTimer);
    onStatus('connected');
    socket?.emit('join-company', { companyId: lastCompany });
  });
  socket.on('disconnect', () => onStatus('disconnected'));
  socket.io.on('reconnect_attempt', () => onStatus('connecting'));
  socket.io.on('reconnect', () => {
    onStatus('connected');
    socket?.emit('join-company', { companyId: lastCompany });
  });
  socket.on('table:changed', (e: TableChangedEvent) => onTableChanged(e));
  socket.on('order:changed', (e: OrderChangedEvent) => onOrderChanged(e));
  socket.on('kardex:changed', (e: KardexChangedEvent) => onKardexChanged(e));
  socket.on('purchase:changed', (e: PurchaseChangedEvent) => onPurchaseChanged(e));
  socket.on('recipe:changed', (e: RecipeChangedEvent) => onRecipeChanged(e));
  socket.on('insumo:changed', (e: InsumoChangedEvent) => onInsumoChanged(e));
  socket.on('paymentMethod:changed', (e: PaymentMethodChangedEvent) => onPaymentMethodChanged(e));
  socket.on('printer:changed', (e: PrinterChangedEvent) => onPrinterChanged(e));
  socket.on('product:changed', (e: ProductChangedEvent) => onProductChanged(e));
  socket.on('transaction:changed', (e: TransactionChangedEvent) => onTransactionChanged(e));
  socket.on('shift:changed', (e: ShiftChangedEvent) => onShiftChanged(e));
}

export function joinRealtimeCompany(companyId: string): void {
  lastCompany = companyId;
  socket?.emit('join-company', { companyId });
}

export function disconnectRealtime(): void {
  clearTimeout(reconnectTimer);
  try {
    socket?.removeAllListeners();
    socket?.disconnect();
  } catch {
    /* ignore */
  }
  socket = null;
  lastToken = null;
  lastCompany = null;
}
