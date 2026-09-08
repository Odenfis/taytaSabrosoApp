import type {
  CompanyId,
  Order,
  OrderItem,
  Transaction,
  TransactionType,
  Purchase,
  PurchaseItem,
  PurchaseCategory,
  PurchaseDocumentStatus,
  KardexMovement,
  KardexMovementType,
  ShiftRecord,
  ShiftType,
} from '../types';
import { toCompanyId } from './catalogMapper';

// ============================ DTOs (contrato API) ============================
// Respuestas crudas de los endpoints de operaciones. Tras `plain()` del backend:
// Decimal → number, Date (DateTimes) → ISO string.

export interface OrderItemDTO {
  id: string;
  orderId: string;
  productId: string | null;
  name: string;
  price: number;
  quantity: number;
  notes: string | null;
  status: string;
  addedAt: string | null;
}

export interface OrderDTO {
  id: string;
  companyId: string;
  ticketNumber: string;
  tableId: string | null;
  tableNumber: string | null;
  zone: string;
  waiter: string;
  createdAt: string;
  createdUtc: string;
  subtotal: number;
  igv: number;
  total: number;
  status: string;
  paymentMethod: string | null;
  amountReceived: number | null;
  change: number | null;
  closedAt: string | null;
  closedUtc: string | null;
  clientOpId: string | null;
  isDeleted?: boolean;
  items: OrderItemDTO[];
}

export interface TransactionDTO {
  id: string;
  companyId: string | null;
  time: string;
  date: string;
  timestamp: string; // ISO (DateTime)
  type: string;
  description: string;
  amount: number;
  isIncome: boolean;
  paymentMethod: string | null;
  customPaymentMethodId: string | null;
  bankAccountId: string | null;
  bankAccountAlias: string | null;
  shift: string | null;
  referenceNumber: string | null;
  tableNumber: string | null;
  orderId: string | null;
  ticketNumber: string | null;
  clientOpId: string | null;
  isDeleted?: boolean;
}

export interface PurchaseItemDTO {
  id: string;
  purchaseId: string;
  insumoId: string | null;
  insumoName: string;
  quantity: number;
  unit: string;
  unitCost: number;
  totalCost: number;
}

export interface PurchaseDTO {
  id: string;
  companyId: string;
  category: string;
  documentStatus: string;
  provisionalNoteNumber: string | null;
  invoiceNumber: string;
  supplierName: string;
  supplierRuc: string;
  date: string;
  time: string;
  purchasedUtc: string;
  shift: string;
  subtotal: number;
  igv: number;
  total: number;
  paymentStatus: string;
  paidFromCash: boolean;
  bankAccountId: string | null;
  bankAccountAlias: string | null;
  notes: string | null;
  regularizedAt: string | null;
  regularizedBy: string | null;
  clientOpId: string | null;
  isDeleted?: boolean;
  items: PurchaseItemDTO[];
}

export interface KardexMovementDTO {
  id: string;
  companyId: string;
  timestamp: string; // ISO (DateTime)
  date: string;
  time: string;
  insumoId: string | null;
  insumoName: string;
  type: string;
  referenceDoc: string;
  quantity: number;
  unit: string;
  unitCost: number;
  totalCost: number;
  stockBefore: number;
  stockAfter: number;
  notes: string | null;
  clientOpId: string | null;
  isDeleted?: boolean;
}

export interface ShiftRecordDTO {
  id: string;
  companyId: string;
  shift: string;
  openedAt: string;
  openedUtc: string;
  closedAt: string | null;
  closedUtc: string | null;
  openedBy: string;
  closedBy: string | null;
  initialCash: number;
  finalCashReported: number | null;
  systemCashExpected: number | null;
  cashDifference: number | null;
  totalSales: number;
  totalExpenses: number;
  cardSales: number;
  digitalWalletSales: number;
  bankTransferSales: number;
  status: string;
  notes: string | null;
}

// ============================ Helpers ============================

const toNum = (v: string | number | null | undefined, fallback = 0): number => {
  if (typeof v === 'number') return v;
  if (!v) return fallback;
  const n = Number(v);
  return Number.isNaN(n) ? fallback : n;
};

// El front usa `timestamp: number` (Date.now()); el API envía ISO string (DateTime).
const utc = (iso?: string | null): number => (iso ? Date.parse(iso) || Date.now() : Date.now());

const str = (v?: string | null): string => (v ?? '').trim();

// ============================ Mappers ============================

export function mapOrderItem(dto: OrderItemDTO, orderId: string, companyId: CompanyId): OrderItem {
  return {
    id: dto.id,
    productId: dto.productId ?? '',
    name: dto.name,
    price: dto.price,
    quantity: dto.quantity,
    notes: dto.notes ?? undefined,
    status: (dto.status as OrderItem['status']) || 'agregado',
    addedAt: dto.addedAt ?? '',
  };
}

export function mapOrder(dto: OrderDTO): Order {
  const companyId = toCompanyId(dto.companyId);
  return {
    id: dto.id,
    companyId,
    ticketNumber: dto.ticketNumber,
    tableId: dto.tableId ?? '',
    tableNumber: dto.tableNumber ?? '',
    zone: dto.zone as Order['zone'],
    waiter: dto.waiter,
    items: (dto.items || []).map((i) => mapOrderItem(i, dto.id, companyId)),
    createdAt: dto.createdAt,
    subtotal: dto.subtotal,
    igv: dto.igv,
    total: dto.total,
    status: (dto.status as Order['status']) || 'abierto',
    paymentMethod: (dto.paymentMethod as Order['paymentMethod']) || undefined,
    amountReceived: dto.amountReceived ?? undefined,
    change: dto.change ?? undefined,
    closedAt: dto.closedAt ?? undefined,
    clientOpId: dto.clientOpId ?? undefined,
  };
}

export function mapTransaction(dto: TransactionDTO): Transaction {
  const cid = dto.companyId;
  return {
    id: dto.id,
    companyId: cid === 'el-tayta' || cid === 'el-sabroso' ? (cid as CompanyId) : undefined,
    time: dto.time,
    date: dto.date,
    timestamp: utc(dto.timestamp),
    type: dto.type as TransactionType,
    description: dto.description,
    amount: dto.amount,
    isIncome: dto.isIncome,
    paymentMethod: dto.paymentMethod ?? undefined,
    customPaymentMethodId: dto.customPaymentMethodId ?? undefined,
    bankAccountId: dto.bankAccountId ?? undefined,
    bankAccountAlias: dto.bankAccountAlias ?? undefined,
    shift: (dto.shift as ShiftType) || undefined,
    referenceNumber: dto.referenceNumber ?? undefined,
    tableNumber: dto.tableNumber ?? undefined,
    orderId: dto.orderId ?? undefined,
    ticketNumber: dto.ticketNumber ?? undefined,
    clientOpId: dto.clientOpId ?? undefined,
  };
}

export function mapPurchaseItem(dto: PurchaseItemDTO): PurchaseItem {
  return {
    insumoId: dto.insumoId ?? '',
    insumoName: dto.insumoName,
    quantity: dto.quantity,
    unit: dto.unit,
    unitCost: dto.unitCost,
    totalCost: dto.totalCost,
  };
}

export function mapPurchase(dto: PurchaseDTO): Purchase {
  return {
    id: dto.id,
    companyId: toCompanyId(dto.companyId),
    category: (dto.category || 'insumos') as PurchaseCategory,
    documentStatus: (dto.documentStatus || 'provisional') as PurchaseDocumentStatus,
    provisionalNoteNumber: dto.provisionalNoteNumber ?? undefined,
    invoiceNumber: dto.invoiceNumber,
    supplierName: dto.supplierName,
    supplierRuc: dto.supplierRuc,
    date: dto.date,
    time: dto.time,
    shift: (dto.shift as ShiftType) || 'Día',
    items: (dto.items || []).map(mapPurchaseItem),
    subtotal: toNum(dto.subtotal),
    igv: toNum(dto.igv),
    total: toNum(dto.total),
    paymentStatus: (dto.paymentStatus as Purchase['paymentStatus']) || 'Pagado (Caja)',
    paidFromCash: dto.paidFromCash,
    bankAccountId: dto.bankAccountId ?? undefined,
    bankAccountAlias: dto.bankAccountAlias ?? undefined,
    notes: dto.notes ?? undefined,
    regularizedAt: dto.regularizedAt ?? undefined,
    regularizedBy: dto.regularizedBy ?? undefined,
    clientOpId: dto.clientOpId ?? undefined,
  };
}

export function mapKardexMovement(dto: KardexMovementDTO): KardexMovement {
  return {
    id: dto.id,
    companyId: toCompanyId(dto.companyId),
    timestamp: utc(dto.timestamp),
    date: dto.date,
    time: dto.time,
    insumoId: dto.insumoId ?? '',
    insumoName: dto.insumoName,
    type: (dto.type as KardexMovementType) || 'AJUSTE_MERMA',
    referenceDoc: dto.referenceDoc,
    quantity: dto.quantity,
    unit: dto.unit,
    unitCost: dto.unitCost,
    totalCost: dto.totalCost,
    stockBefore: dto.stockBefore,
    stockAfter: dto.stockAfter,
    notes: str(dto.notes) || undefined,
    clientOpId: dto.clientOpId ?? undefined,
  };
}

export function mapShiftRecord(dto: ShiftRecordDTO): ShiftRecord {
  return {
    id: dto.id,
    companyId: toCompanyId(dto.companyId),
    shift: (dto.shift as ShiftType) || 'Día',
    openedAt: dto.openedAt,
    closedAt: dto.closedAt ?? undefined,
    openedBy: dto.openedBy,
    closedBy: dto.closedBy ?? undefined,
    initialCash: dto.initialCash,
    finalCashReported: dto.finalCashReported ?? undefined,
    systemCashExpected: dto.systemCashExpected ?? undefined,
    cashDifference: dto.cashDifference ?? undefined,
    totalSales: dto.totalSales,
    totalExpenses: dto.totalExpenses,
    cardSales: dto.cardSales,
    digitalWalletSales: dto.digitalWalletSales,
    bankTransferSales: dto.bankTransferSales,
    status: (dto.status as ShiftRecord['status']) || 'cerrado',
    notes: str(dto.notes) || undefined,
  };
}