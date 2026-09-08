export type Role = 'Cajero' | 'Mesero' | 'Administrador' | 'Jefe de Cocina';

export type CompanyId = 'el-tayta' | 'el-sabroso';

export interface Company {
  id: CompanyId;
  name: string;
  tradeName: string;
  ruc: string;
  specialty: string;
  themeColor: string;
  accentColor: string;
  badgeText: string;
  address: string;
}

export interface User {
  id: string;
  name: string;
  role: Role;
  terminal: string;
  avatarUrl?: string;
  companyId?: string | null;
  assignedCompanyId?: string | null;
  isActive?: boolean;
  isDeleted?: boolean;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
}

// ============================ API ============================
// Contrato con el backend Express (`server/`). El JSON de la API queda en inglés.

export interface AuthToken {
  token: string;
  expiresAt: string;
}

export interface DeviceDTO {
  id: string;
  companyId: string | null;
  name: string;
  terminalCode: string;
  lastSeenAt: string;
  isActive: boolean;
}

export type CompanyShiftName = 'Día' | 'Noche';

export interface CompanyShiftDTO {
  companyId: string;
  currentShift: CompanyShiftName;
  openedAt: string;
  openedUtc: string;
  openedBy: string;
  initialCash: number;
  updatedAt: string;
}

export interface LoginInput {
  pin: string;
  deviceCode?: string;
  terminalName?: string;
}

export interface LoginResponse {
  token: string;
  expiresAt: string;
  user: User;
  device: DeviceDTO;
  companies: Company[];
  companyShifts: CompanyShiftDTO[];
}

export interface MeResponse {
  user: User;
  companies: Company[];
  companyShifts: CompanyShiftDTO[];
}

export interface ApiErrorPayload {
  code: string;
  message: string;
}

export interface ApiErrorResponse {
  error: ApiErrorPayload;
}

export type TableStatus = 'libre' | 'ocupada' | 'por_cobrar';

export type Zone = 'Salón Principal' | 'Terraza' | 'Barra' | 'Zona Brasas';

export interface Table {
  id: string;
  companyId: CompanyId;
  number: string;
  capacity: number;
  zone: Zone;
  status: TableStatus;
  occupiedSince?: string;
  minutesElapsed?: number;
  currentOrderId?: string;
  waiter?: string;
  notes?: string;
  version?: number;
  updatedAt?: string;
  createdAt?: string;
  isDeleted?: boolean;
}

export type ProductCategory = 'platos' | 'entradas' | 'bebidas' | 'postres' | 'brasas';

export interface Product {
  id: string;
  companyId: CompanyId;
  name: string;
  description: string;
  price: number;
  category: ProductCategory;
  image: string;
  available: boolean;
  hasRecipe?: boolean;
  version?: number;
  updatedAt?: string;
  createdAt?: string;
  isDeleted?: boolean;
}

export interface OrderItem {
  id: string;
  productId: string;
  name: string;
  price: number;
  quantity: number;
  notes?: string;
  status: 'agregado' | 'en_cocina' | 'servido';
  addedAt: string;
}

export interface Order {
  id: string;
  companyId: CompanyId;
  ticketNumber: string;
  tableId: string;
  tableNumber: string;
  zone: Zone;
  waiter: string;
  items: OrderItem[];
  createdAt: string;
  subtotal: number;
  igv: number;
  total: number;
  status: 'abierto' | 'en_cocina' | 'por_cobrar' | 'cobrado';
  paymentMethod?: PaymentMethod;
  amountReceived?: number;
  change?: number;
  closedAt?: string;
  clientOpId?: string;
}

export type TransactionType =
  | 'Venta (Mesa)'
  | 'Venta (Barra)'
  | 'Pago Proveedor'
  | 'Caja Chica'
  | 'Retiro de Caja'
  | 'Ingreso Extra'
  | 'Ajuste de Saldo';

export type PaymentMethod = 'Efectivo' | 'Tarjeta' | 'Yape / Plin';

export interface Transaction {
  id: string;
  companyId?: CompanyId;
  time: string;
  date: string;
  timestamp: number;
  type: TransactionType;
  description: string;
  amount: number;
  isIncome: boolean;
  paymentMethod?: PaymentMethod | string;
  customPaymentMethodId?: string;
  bankAccountId?: string;
  bankAccountAlias?: string;
  shift?: ShiftType;
  referenceNumber?: string;
  tableNumber?: string;
  orderId?: string;
  ticketNumber?: string;
  clientOpId?: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  time: string;
  type: 'info' | 'success' | 'warning';
}

export type ScreenType =
  | 'mesas'
  | 'pedido'
  | 'cobro'
  | 'kardex'
  | 'compras'
  | 'recetas'
  | 'ratios'
  | 'movimientos'
  | 'bancos'
  | 'reportes'
  | 'configuracion';

// Cuentas Bancarias por Empresa
export interface BankAccount {
  id: string;
  companyId: CompanyId;
  bankName: string; // ej. BCP, BBVA, Interbank, Scotiabank, Banco de la Nación
  accountNumber: string;
  cci?: string;
  accountType: 'Corriente' | 'Ahorros';
  currency: 'PEN' | 'USD';
  holderName: string;
  alias: string; // ej. 'BCP Soles El Tayta Operaciones'
  currentBalance: number;
  isActive: boolean;
  notes?: string;
  version?: number;
  updatedAt?: string;
  createdAt?: string;
  isDeleted?: boolean;
}

// Métodos de Pago Personalizados vinculados a Cuentas Bancarias
export type PaymentCategory =
  | 'Efectivo'
  | 'Billetera Digital'
  | 'Tarjeta / POS'
  | 'Transferencia Bancaria'
  | 'Crédito';

export interface CustomPaymentMethod {
  id: string;
  companyId: CompanyId | 'ambas';
  name: string; // ej. 'Efectivo en Caja', 'Yape BCP', 'Plin BBVA', 'POS Niubiz (Visa/MC)'
  category: PaymentCategory;
  bankAccountId?: string; // Cuenta bancaria a la que ingresan los fondos
  bankAccountAlias?: string;
  commissionPct?: number; // ej. 3.5% para tarjetas, 0% para efectivo
  requiresReferenceNumber: boolean; // ¿requiere ingresar N° de operación/voucher?
  icon: string;
  isActive: boolean;
  version?: number;
  updatedAt?: string;
  createdAt?: string;
  isDeleted?: boolean;
}

// Manejo de Turnos (Día y Noche)
export type ShiftType = 'Día' | 'Noche';

export interface ShiftRecord {
  id: string;
  companyId: CompanyId;
  shift: ShiftType;
  openedAt: string;
  closedAt?: string;
  openedBy: string;
  closedBy?: string;
  initialCash: number;
  finalCashReported?: number;
  systemCashExpected?: number;
  cashDifference?: number;
  totalSales: number;
  totalExpenses: number;
  cardSales: number;
  digitalWalletSales: number;
  bankTransferSales: number;
  status: 'abierto' | 'cerrado';
  notes?: string;
}

// Configuración de Impresoras Ticketeras (Multi-Printer)
export type PrinterRole = 'cocina_fria' | 'cocina_caliente' | 'barra' | 'caja';
export type PrinterConnectionType = 'LAN_TCP' | 'USB' | 'BLUETOOTH' | 'BROWSER_PRINT';

export interface ThermalPrinterConfig {
  id: string;
  companyId: CompanyId | 'ambas';
  name: string;
  role: PrinterRole;
  connectionType: PrinterConnectionType;
  ipAddress?: string;
  port?: number;
  paperWidth: '80mm' | '58mm';
  autoCut: boolean;
  beepOnPrint: boolean;
  categoriesMapped: string[];
  status: 'online' | 'offline';
  isEnabled: boolean;
  version?: number;
  updatedAt?: string;
  createdAt?: string;
  isDeleted?: boolean;
}

// Modo Offline y Resiliencia
export interface OfflineSyncState {
  isSimulatedOffline: boolean;
  isOnline: boolean;
  pendingSyncCount: number;
  lastSyncTime: string;
  queuedOrdersCount: number;
  queuedPurchasesCount: number;
}

// Insumos e Inventario
export interface Insumo {
  id: string;
  companyId: CompanyId | 'ambas';
  code: string;
  name: string;
  category:
    | 'Carnes & Aves'
    | 'Pescados & Mariscos'
    | 'Verduras & Frutas'
    | 'Abarrotes & Especias'
    | 'Bebidas & Licores'
    | 'Lácteos & Huevos';
  unit: 'kg' | 'g' | 'L' | 'ml' | 'un' | 'bot';
  currentStock: number;
  minStock: number;
  costPerUnit: number; // S/
  lastPurchaseDate: string;
  version?: number;
  updatedAt?: string;
  createdAt?: string;
  isDeleted?: boolean;
}

// Recetas (Ficha Técnica / Bill of Materials)
export interface RecipeIngredient {
  insumoId: string;
  insumoName: string;
  quantity: number; // cantidad por porción
  unit: string;
  costPerUnit: number;
  subtotalCost: number;
}

export interface Recipe {
  id: string;
  companyId: CompanyId;
  productId: string;
  productName: string;
  category: string;
  portions: number;
  salePrice: number;
  ingredients: RecipeIngredient[];
  totalCost: number; // Costo por porción
  theoreticalFoodCostPct: number; // (totalCost / salePrice) * 100
  preparationNotes?: string;
  version?: number;
  updatedAt?: string;
  createdAt?: string;
  isDeleted?: boolean;
}

// Compras a Proveedores
export type PurchaseCategory = 'insumos' | 'productos_reventa' | 'gastos_operativos';
export type PurchaseDocumentStatus = 'provisional' | 'regularizado';

export interface PurchaseItem {
  insumoId: string;
  insumoName: string;
  quantity: number;
  unit: string;
  unitCost: number;
  totalCost: number;
}

export interface Purchase {
  id: string;
  companyId: CompanyId;
  category: PurchaseCategory;
  documentStatus: PurchaseDocumentStatus;
  provisionalNoteNumber?: string; // ej. 'VALE-042' o 'Ticket Provisorio'
  invoiceNumber: string; // ej. 'F001-4421' o 'PENDIENTE-FACTURA'
  supplierName: string;
  supplierRuc: string;
  date: string;
  time: string;
  shift: ShiftType;
  items: PurchaseItem[];
  subtotal: number;
  igv: number;
  total: number;
  paymentStatus: 'Pagado (Caja)' | 'Transferencia Bancaria' | 'Crédito 15 días' | 'Billetera Digital';
  paidFromCash: boolean;
  bankAccountId?: string;
  bankAccountAlias?: string;
  notes?: string;
  regularizedAt?: string;
  regularizedBy?: string;
  clientOpId?: string;
}

// Kardex (Movimientos físicos y valorados)
export type KardexMovementType =
  | 'ENTRADA_COMPRA'
  | 'SALIDA_VENTA_POS'
  | 'AJUSTE_MERMA'
  | 'INVENTARIO_INICIAL';

export interface KardexMovement {
  id: string;
  companyId: CompanyId;
  timestamp: number;
  date: string;
  time: string;
  insumoId: string;
  insumoName: string;
  type: KardexMovementType;
  referenceDoc: string; // ej. "Venta Ticket #84918" o "Compra Factura #F01-4421"
  quantity: number; // positivo para entrada, negativo o absoluto según contexto
  unit: string;
  unitCost: number;
  totalCost: number;
  stockBefore: number;
  stockAfter: number;
  notes?: string;
  clientOpId?: string;
}

// Ratios e Indicadores de Control de Gastos
export interface ExpenseRatioAnalysis {
  companyId: CompanyId | 'todas';
  totalSales: number;
  totalPurchases: number;
  totalTheoreticalCost: number;
  operatingExpenses: number;
  foodCostPctReal: number; // (Compras / Ventas) * 100
  foodCostPctTheoretical: number; // (Costo recetas vendidas / Ventas) * 100
  operatingExpenseRatio: number; // ((Compras + Egresos) / Ventas) * 100
  variancePct: number; // Diferencia entre real y teórico (merma/desvío)
  status: 'optimo' | 'alerta' | 'critico';
  message: string;
  recommendations: string[];
}

// ============================ CATÁLOGOS / SYNC ============================
// Metadatos de catálogos cargados desde la API (base para el delta-sync de Fase C).

export type CatalogEntity =
  | 'tables'
  | 'products'
  | 'insumos'
  | 'recipes'
  | 'bankAccounts'
  | 'paymentMethods'
  | 'printers';

export interface CatalogMeta {
  entity: CatalogEntity;
  updatedAt: string; // ISO del `updatedAt` más reciente observado
  version: number; // `version` más reciente observado
  count: number; // nº de registros cargados
  fetchedAtUtc: string; // ISO de cuándo se descargó
}

export type CatalogSyncMeta = Partial<Record<CatalogEntity, CatalogMeta>>;

// ============================ OPERACIONES / COLADE SYNC (E3) ============================

// Entidades que pueden originar operaciones pendientes de sync (base para E4 / Fase C).
export type PendingOpEntity =
  | 'order'
  | 'orderItem'
  | 'transaction'
  | 'purchase'
  | 'kardexMovement'
  | 'shift';

// Operación local que aún no se sincronizó con la API (write-through fallido o creada offline).
export interface PendingOp {
  clientOpId: string;
  entity: PendingOpEntity;
  op: string; // ej. 'openOrder', 'quickBar', 'payTable', 'createPurchase', 'kardexAdjustment', 'switchShift', 'manualTransaction'
  payload: unknown; // cuerpo que se reenviará al endpoint corresponciente (E4)
  createdAt: string; // ISO
}

// Input de transacción manual de Caja (POST /api/operations/transactions).
export interface ManualTransactionInput {
  companyId: CompanyId | 'todas';
  type: TransactionType;
  description: string;
  amount: number;
  isIncome: boolean;
  bankAccountId?: string;
  customPaymentMethodId?: string;
  referenceNumber?: string;
  clientOpId?: string;
}
