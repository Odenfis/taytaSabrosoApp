import { resolvePaymentMethod } from '../lib/paymentSelection';
import { normalizeUnpaidOrder, orderTotalsFromItems } from '../lib/orderTotals';
import React, { createContext, useContext, useState, useEffect, useMemo, useRef, ReactNode } from 'react';
import {
  User,
  Table,
  Product,
  Order,
  OrderItem,
  Transaction,
  NotificationItem,
  ScreenType,
  PaymentMethod,
  TransactionType,
  Zone,
  CompanyId,
  Company,
  Insumo,
  Recipe,
  Purchase,
  PurchaseItem,
  KardexMovement,
  KardexMovementType,
  PurchaseCategory,
  PurchaseDocumentStatus,
  ExpenseRatioAnalysis,
  BankAccount,
  CustomPaymentMethod,
  ShiftType,
  ShiftRecord,
  ThermalPrinterConfig,
  OfflineSyncState,
  AuthToken,
  LoginResponse,
  MeResponse,
  CompanyShiftDTO,
  CatalogEntity,
  CatalogSyncMeta,
  PendingOpEntity,
  PendingOp,
  ProductCategory,
} from '../types';
import { apiClient, ApiError, getAuthToken, storeAuthToken, clearAuthToken, AUTH_REQUIRED_EVENT } from '../lib/api';
import { getTerminalIdentity } from '../lib/terminal';
import { type InsumoDraft, isInventoryDependencyIssue, isInsumoOp, insumoIdOf, insumoPending, stageInsumo, stageInsumoDelete, overlayInsumos,
  persistInsumoQueue, markInsumoIssue, insumoIsSending, INSUMO_QUEUE_EVENT } from '../lib/insumoCatalog';
import { releaseOrderTable, settleOpening, stageOrderOperation } from '../lib/orderLifecycle';
import { isCashMovement } from '../lib/finance';
import { matchingRecipe } from '../lib/recipeMatch';
import { type ProductDraft, stageProduct, productPending, isProductOp, productIdOf, persistProductQueue,
  markProductIssue, overlayProducts, overlayRecipes, uuid, validateProduct, PRODUCT_QUEUE_EVENT } from '../lib/productCatalog';
import {
  mapTable,
  mapProduct,
  mapInsumo,
  mapRecipe,
  mapBankAccount,
  mapPaymentMethod,
  mapPrinter,
  extractMeta,
  toCompanyId,
  TableDTO,
  ProductDTO,
  InsumoDTO,
  RecipeDTO,
  BankAccountDTO,
  CustomPaymentMethodDTO,
  PrinterDTO,
} from '../lib/catalogMapper';
import {
  mapOrder,
  mapTransaction,
  mapPurchase,
  mapKardexMovement,
  mapShiftRecord,
  OrderDTO,
  OrderItemDTO,
  TransactionDTO,
  PurchaseDTO,
  KardexMovementDTO,
  ShiftRecordDTO,
} from '../lib/operationMapper';
import {
  enqueue as enqueueOp,
  loadQueue,
  removeByClientOpId,
  queueCount,
  getPendingTmpIds,
  getPendingCatalogTmpIds,
  updateQueuedPayload,
} from '../lib/offlineQueue';
import {
  replayCall,
  ReplayDisposition,
  productIsSending,
} from '../lib/replayQueue';
import {
  connectRealtime,
  disconnectRealtime,
  joinRealtimeCompany,
  type RealtimeStatus,
  type TableChangedEvent,
  type OrderChangedEvent,
  type KardexChangedEvent,
  type PurchaseChangedEvent,
  type TransactionChangedEvent,
  type ShiftChangedEvent,
  type RecipeChangedEvent,
  type InsumoChangedEvent,
  type PaymentMethodChangedEvent,
  type PrinterChangedEvent,
  type ProductChangedEvent,
} from '../lib/realtime';
import { round2 } from '../lib/format';
import {
  COMPANIES,
  INITIAL_PRODUCTS,
  INITIAL_TABLES,
  INITIAL_ORDERS,
  INITIAL_TRANSACTIONS,
  INITIAL_INSUMOS,
  INITIAL_RECIPES,
  INITIAL_PURCHASES,
  INITIAL_KARDEX,
  INITIAL_BANK_ACCOUNTS,
  INITIAL_PAYMENT_METHODS,
  INITIAL_PRINTERS,
} from '../data/initialData';

interface POSContextType {
  currentUser: User | null;
  authToken: AuthToken | null;
  isAuthenticating: boolean;
  isSessionInitializing: boolean;
  authNotice: string | null;
  login: (pin: string) => Promise<boolean>;
  logout: () => void;
  // Sync de catálogos (Fase E2) — metadatos para delta-sync posterior (Fase C)
  catalogSyncMeta: CatalogSyncMeta;
  isCatalogsLoading: boolean;
  isOperationsLoading: boolean;
  realtimeStatus: RealtimeStatus;
  // Multiempresa
  companies: Company[];
  activeCompanyId: CompanyId | 'todas';
  setActiveCompanyId: (companyId: CompanyId | 'todas') => void;
  activeCompany: Company;
  // Navigation
  catalogTarget: { productId: string; action: 'createRecipe' | 'viewRecipe' | 'editProduct' } | null;
  setCatalogTarget: (target: { productId: string; action: 'createRecipe' | 'viewRecipe' | 'editProduct' } | null) => void;
  currentScreen: ScreenType;
  setCurrentScreen: (screen: ScreenType) => void;
  selectedTableId: string | null;
  setSelectedTableId: (id: string | null) => void;
  // State
  tables: Table[];
  filteredTables: Table[];
  products: Product[];
  productPendingOps: PendingOp[];
  productIsSending: (id: string) => boolean;
  saveProduct: (draft: ProductDraft, id?: string, expectedVersion?: number) => Promise<'saved' | 'queued'>;
  resolveProductConflict: (id: string, choice: 'server' | 'local') => Promise<void>;
  filteredProducts: Product[];
  orders: Record<string, Order>;
  transactions: Transaction[];
  filteredTransactions: Transaction[];
  notifications: NotificationItem[];
  lastCompletedOrder: Order | null;
  isReceiptModalOpen: boolean;
  setIsReceiptModalOpen: (open: boolean) => void;
  receiptMode: 'preview' | 'paid';
  setReceiptMode: (mode: 'preview' | 'paid') => void;
  // Insumos, Recetas, Compras, Kardex
  insumos: Insumo[];
  recipes: Recipe[];
  purchases: Purchase[];
  kardexMovements: KardexMovement[];
  // Ratios & Financial Control
  expenseAnalysis: ExpenseRatioAnalysis;
  getCompanyAnalysis: (cid: CompanyId | 'todas') => ExpenseRatioAnalysis;
  // Computed Stats
  totalIngresos: number;
  totalEgresos: number;
  saldoActual: number;
  // Cuentas Bancarias & Métodos de Pago
  bankAccounts: BankAccount[];
  filteredBankAccounts: BankAccount[];
  addBankAccount: (acc: Omit<BankAccount, 'id'>) => void;
  updateBankAccount: (id: string, updates: Partial<BankAccount>) => void;
  deleteBankAccount: (id: string) => void;
  paymentMethods: CustomPaymentMethod[];
  filteredPaymentMethods: CustomPaymentMethod[];
  addPaymentMethod: (pm: Omit<CustomPaymentMethod, 'id'>) => void;
  updatePaymentMethod: (id: string, updates: Partial<CustomPaymentMethod>) => void;
  deletePaymentMethod: (id: string) => void;
  // Turnos (Día y Noche)
  companyShifts: Record<CompanyId, ShiftType>;
  companyShiftCash: Record<CompanyId, number>;
  activeShift: ShiftType;
  shiftRecords: ShiftRecord[];
  switchCompanyShift: (
    companyId: CompanyId,
    targetShift: ShiftType,
    reportedCash: number,
    initialCashForNext: number,
    notes?: string
  ) => void;
  isShiftModalOpen: boolean;
  setIsShiftModalOpen: (open: boolean) => void;
  // Actions
  selectAndOpenTable: (tableId: string) => void;
  openQuickOrder: (zone?: Zone) => void;
  addItemToOrder: (tableId: string, product: Product, notes?: string) => void;
  updateItemQuantity: (tableId: string, itemId: string, delta: number) => void;
  updateItemNotes: (tableId: string, itemId: string, notes: string) => void;
  removeItemFromOrder: (tableId: string, itemId: string) => void;
  sendToKitchen: (tableId: string) => Promise<boolean>;
  proceedToPayment: (tableId: string) => void;
  confirmDispatchAndProceed: (tableId: string) => Promise<void>;
  dismissKitchenConfirm: () => void;
  pendingKitchenConfirm: { tableId: string; itemCount: number } | null;
  completePayment: (
    tableId: string,
    paymentMethod: PaymentMethod | string,
    amountReceived: number,
    customPaymentMethodId?: string,
    referenceNumber?: string
  ) => Order | null;
  addManualTransaction: (
    type: TransactionType,
    description: string,
    amount: number,
    isIncome: boolean,
    bankAccountId?: string,
    customPaymentMethodId?: string,
    referenceNumber?: string
  ) => void;
  correctSalePayment: (transaction: Transaction, correctionId: string, newMethodId: string, referenceNumber: string, reason: string, supervisorPin: string) => Promise<void>;
  addNewTable: (number: string, capacity: number, zone: Zone) => void;
  // Compras & Kardex actions
  addPurchase: (newPurchase: Omit<Purchase, 'id' | 'time'>) => void;
  regularizePurchase: (
    purchaseId: string,
    invoiceNumber: string,
    supplierRuc: string,
    notes?: string,
    items?: PurchaseItem[]
  ) => void;
  addKardexAdjustment: (
    insumoId: string,
    quantity: number,
    type: 'AJUSTE_MERMA' | 'ENTRADA_COMPRA',
    reason: string
  ) => void;
  saveRecipe: (recipe: Recipe) => Promise<'saved' | 'queued'>;
  addInsumo: (insumo: Omit<Insumo, 'id' | 'code'>) => Promise<'saved' | 'queued'>;
  saveInsumo: (draft: InsumoDraft, original?: Insumo, id?: string) => Promise<'saved' | 'queued'>;
  deleteInsumo: (insumo: Insumo) => Promise<'saved' | 'queued'>;
  resolveInsumoConflict: (id: string, choice: 'server' | 'local') => Promise<void>;
  discardInventoryDependency: (clientOpId: string) => Promise<void>;
  // Impresoras (Multi-Printer)
  printers: ThermalPrinterConfig[];
  thermalPrinters: ThermalPrinterConfig[];
  addPrinter: (prn: Omit<ThermalPrinterConfig, 'id'>) => void;
  addThermalPrinter: (prn: Omit<ThermalPrinterConfig, 'id'>) => void;
  updatePrinter: (id: string, updates: Partial<ThermalPrinterConfig>) => void;
  updateThermalPrinter: (id: string, updates: Partial<ThermalPrinterConfig>) => void;
  deletePrinter: (id: string) => void;
  deleteThermalPrinter: (id: string) => void;
  testPrint: (printerId: string) => void;
  isPrinterTestModalOpen: boolean;
  setIsPrinterTestModalOpen: (open: boolean) => void;
  lastPrintedTicket: { printerName: string; content: string; timestamp: string } | null;
  // Modo Offline
  offlineState: OfflineSyncState;
  lastSyncResult: { ok: boolean; ts: number; op: string } | null;
  toggleSimulatedOffline: () => void;
  syncOfflineQueue: () => void;
  isOfflineModalOpen: boolean;
  setIsOfflineModalOpen: (open: boolean) => void;
  // Notifications & Reset
  addNotification: (title: string, message: string, type?: 'info' | 'success' | 'warning') => void;
  dismissNotification: (id: string) => void;
  resetToDemoData: () => void;
}

const POSContext = createContext<POSContextType | undefined>(undefined);

const STORAGE_KEYS = {
  USER: 'ts_user_v2',
  ACTIVE_COMPANY: 'ts_active_company_v2',
  TABLES: 'ts_tables_v2',
  ORDERS: 'ts_orders_v2',
  TRANSACTIONS: 'ts_transactions_v2',
  PRODUCTS: 'ts_products_v2',
  INSUMOS: 'ts_insumos_v2',
  RECIPES: 'ts_recipes_v2',
  PURCHASES: 'ts_purchases_v2',
  KARDEX: 'ts_kardex_v2',
  BANK_ACCOUNTS: 'ts_bank_accounts_v2',
  PAYMENT_METHODS: 'ts_payment_methods_v2',
  SHIFTS: 'ts_shifts_v2',
  SHIFT_RECORDS: 'ts_shift_records_v2',
  PRINTERS: 'ts_printers_v2',
  CATALOG_META: 'ts_catalog_meta_v2',
};

function safeParse<T>(key: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return fallback;
    const parsed = JSON.parse(saved);
    if (Array.isArray(fallback)) {
      return (Array.isArray(parsed) ? parsed : fallback) as unknown as T;
    }
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

export const POSProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // La sesión ahora es por token (API real). currentUser se puebla tras login o
  // restauración vía GET /api/auth/me; nunca se confía en localStorage solo.
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [authToken, setAuthToken] = useState<AuthToken | null>(() => getAuthToken());
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isSessionInitializing, setIsSessionInitializing] = useState(true);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [isCatalogsLoading, setIsCatalogsLoading] = useState(false);
  const [isOperationsLoading, setIsOperationsLoading] = useState(false);
  // Tiempo real (Fase D acotada): estado del socket mesas/órdenes.
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('disconnected');

  // Metadatos de catálogos cargados desde el API (para delta-sync Fase C).
  const [catalogSyncMeta, setCatalogSyncMeta] = useState<CatalogSyncMeta>(() =>
    safeParse(STORAGE_KEYS.CATALOG_META, {})
  );

  // Empresas: catálogo real del backend (login / me). Fallback al demo local.
  const [companies, setCompanies] = useState<Company[]>(import.meta.env.PROD ? [] : COMPANIES);

  const [activeCompanyId, setActiveCompanyId] = useState<CompanyId | 'todas'>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.ACTIVE_COMPANY);
    return (saved as CompanyId | 'todas') || 'el-tayta';
  });

  const [catalogTarget, setCatalogTarget] = useState<{ productId: string; action: 'createRecipe' | 'viewRecipe' | 'editProduct' } | null>(null);
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('mesas');
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);

  const [tables, setTables] = useState<Table[]>(() => {
    return safeParse(STORAGE_KEYS.TABLES, import.meta.env.PROD ? [] : INITIAL_TABLES);
  });

  const [products, setProducts] = useState<Product[]>(() => {
    return overlayProducts(safeParse(STORAGE_KEYS.PRODUCTS, import.meta.env.PROD ? [] : INITIAL_PRODUCTS), []);
  });

  const [productPendingOps, setProductPendingOps] = useState<PendingOp[]>(productPending);
  const productSyncRequestedRef = useRef(false);
  useEffect(() => {
    const update = () => { setProductPendingOps(productPending()); syncPendingCount(); };
    window.addEventListener(PRODUCT_QUEUE_EVENT, update);
    window.addEventListener('storage', update);
    return () => { window.removeEventListener(PRODUCT_QUEUE_EVENT, update); window.removeEventListener('storage', update); };
  }, []);

  const [orders, setOrders] = useState<Record<string, Order>>(() => {
    const stored = safeParse<Record<string, Order>>(STORAGE_KEYS.ORDERS, import.meta.env.PROD ? {} : INITIAL_ORDERS);
    return Object.fromEntries(Object.entries(stored).map(([id, order]) => [id, normalizeUnpaidOrder(order)]));
  });

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    return safeParse(STORAGE_KEYS.TRANSACTIONS, import.meta.env.PROD ? [] : INITIAL_TRANSACTIONS);
  });

  const [insumos, setInsumos] = useState<Insumo[]>(() => {
    return safeParse(STORAGE_KEYS.INSUMOS, import.meta.env.PROD ? [] : INITIAL_INSUMOS);
  });

  const [recipes, setRecipes] = useState<Recipe[]>(() => {
    return overlayRecipes(safeParse(STORAGE_KEYS.RECIPES, import.meta.env.PROD ? [] : INITIAL_RECIPES), []);
  });

  const [purchases, setPurchases] = useState<Purchase[]>(() => {
    return safeParse(STORAGE_KEYS.PURCHASES, import.meta.env.PROD ? [] : INITIAL_PURCHASES);
  });

  const [kardexMovements, setKardexMovements] = useState<KardexMovement[]>(() => {
    return safeParse(STORAGE_KEYS.KARDEX, import.meta.env.PROD ? [] : INITIAL_KARDEX);
  });

  // Cuentas Bancarias
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>(() => {
    return safeParse(STORAGE_KEYS.BANK_ACCOUNTS, import.meta.env.PROD ? [] : INITIAL_BANK_ACCOUNTS);
  });

  // Métodos de Pago Personalizables
  const [paymentMethods, setPaymentMethods] = useState<CustomPaymentMethod[]>(() => {
    return safeParse(STORAGE_KEYS.PAYMENT_METHODS, import.meta.env.PROD ? [] : INITIAL_PAYMENT_METHODS);
  });

  // Turnos por empresa (El cliente sólo maneja 2 turnos: Día y Noche)
  const [companyShifts, setCompanyShifts] = useState<Record<CompanyId, ShiftType>>(() => {
    return safeParse(STORAGE_KEYS.SHIFTS, { 'el-tayta': 'Día', 'el-sabroso': 'Día' });
  });

  // Caja inicial vigente por empresa (turnos_empresa.caja_inicial del server).
  // Alimenta el saldo "Efectivo en Caja" del Libro de Caja.
  const [companyShiftCash, setCompanyShiftCash] = useState<Record<CompanyId, number>>({
    'el-tayta': import.meta.env.PROD ? 0 : 350,
    'el-sabroso': import.meta.env.PROD ? 0 : 350,
  });
  const [companyShiftOpenedUtc, setCompanyShiftOpenedUtc] = useState<Record<CompanyId, number>>({
    'el-tayta': 0, 'el-sabroso': 0,
  });

  const [shiftRecords, setShiftRecords] = useState<ShiftRecord[]>(() => {
    return safeParse(STORAGE_KEYS.SHIFT_RECORDS, import.meta.env.PROD ? [] : [
      {
        id: 'shift-rec-01',
        companyId: 'el-tayta',
        shiftType: 'Día',
        openedAt: 'Hoy 07:30 AM',
        closedAt: 'Hoy 03:00 PM',
        openedBy: 'Carlos M.',
        closedBy: 'Carlos M.',
        initialCash: 350.0,
        systemCashExpected: 1420.0,
        reportedCash: 1420.0,
        difference: 0,
        totalSales: 2890.0,
        cashSales: 1070.0,
        cardSales: 1220.0,
        walletSales: 600.0,
        totalExpenses: 0,
        notes: 'Turno día cerrado conforme sin diferencias.',
        status: 'cerrado',
      },
    ]);
  });

  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);

  // Configuración de Impresoras Térmicas
  const [printers, setPrinters] = useState<ThermalPrinterConfig[]>(() => {
    return safeParse(STORAGE_KEYS.PRINTERS, import.meta.env.PROD ? [] : INITIAL_PRINTERS);
  });

  const [isPrinterTestModalOpen, setIsPrinterTestModalOpen] = useState(false);
  const [lastPrintedTicket, setLastPrintedTicket] = useState<{
    printerName: string;
    content: string;
    timestamp: string;
  } | null>(null);

  // Modo Offline (IndexedDB / Local PWA State)
  const [offlineState, setOfflineState] = useState<OfflineSyncState>({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isSimulatedOffline: false,
    pendingSyncCount: 0,
    lastSyncTime: 'Hoy 12:45 PM',
    queuedOrdersCount: 0,
    queuedPurchasesCount: 0,
  });
  const [isOfflineModalOpen, setIsOfflineModalOpen] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<{
    ok: boolean;
    ts: number;
    op: string;
  } | null>(null);

  const [notifications, setNotifications] = useState<NotificationItem[]>([
    {
      id: 'notif-1',
      title: 'Sistema Multiempresa Activo',
      message: 'Holding Gastronómico: El Tayta & El Sabroso conectados en tiempo real.',
      time: '12:45 PM',
      type: 'info',
    },
    {
      id: 'notif-2',
      title: 'Cuentas & Turnos Habilitados',
      message: 'Manejo de cuentas bancarias por empresa, métodos de pago y turnos Día/Noche.',
      time: '12:40 PM',
      type: 'success',
    },
  ]);

  const [lastCompletedOrder, setLastCompletedOrder] = useState<Order | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [receiptMode, setReceiptMode] = useState<'preview' | 'paid'>('paid');
  // Regla "no cobrar sin despacho": modal de confirmación pendiente {tableId, itemCount}.
  const [pendingKitchenConfirm, setPendingKitchenConfirm] = useState<{ tableId: string; itemCount: number } | null>(null);

  // Convierte el arreglo de turnos del API ({companyId, currentShift, ...}) al
  // mapa local Record<CompanyId, ShiftType> que usa la UI.
  const mapCompanyShifts = (shifts: CompanyShiftDTO[]): Record<CompanyId, ShiftType> => {
    const result: Record<CompanyId, ShiftType> = { 'el-tayta': 'Día', 'el-sabroso': 'Día' };
    shifts.forEach((s) => {
      if (s && s.companyId) {
        result[s.companyId as CompanyId] = s.currentShift as ShiftType;
      }
    });
    return result;
  };

  // Convierte el arreglo de turnos del API al mapa de caja inicial vigente
  // (turnos_empresa.caja_inicial) que alimenta "Efectivo en Caja".
  const mapCompanyShiftCash = (shifts: CompanyShiftDTO[]): Record<CompanyId, number> => {
    const result: Record<CompanyId, number> = { 'el-tayta': 350, 'el-sabroso': 350 };
    shifts.forEach((s) => {
      if (s && s.companyId && typeof s.initialCash === 'number') {
        result[s.companyId as CompanyId] = s.initialCash;
      }
    });
    return result;
  };
  const mapCompanyShiftOpened = (shifts: CompanyShiftDTO[]): Record<CompanyId, number> => {
    const result: Record<CompanyId, number> = { 'el-tayta': 0, 'el-sabroso': 0 };
    shifts.forEach((s) => { if (s?.companyId) result[s.companyId as CompanyId] = Date.parse(s.openedUtc) || 0; });
    return result;
  };

  // Descarga todos los catálogos del API y los aplica al estado (Fase E2, solo lectura).
  // Sin filtro companyId: trae AMBAS empresas para que el modo "todas" y el switcher
  // sigan funcionando client-side. Falla parcial → conserva el dato actual (mock/cache).
  const loadCatalogs = async (): Promise<void> => {
    setIsCatalogsLoading(true);
    const results = await Promise.allSettled([
      apiClient.get<TableDTO[]>('/catalogs/tables'),
      apiClient.get<ProductDTO[]>('/catalogs/products'),
      apiClient.get<InsumoDTO[]>('/catalogs/insumos'),
      apiClient.get<RecipeDTO[]>('/catalogs/recipes'),
      apiClient.get<BankAccountDTO[]>('/catalogs/bank-accounts'),
      apiClient.get<CustomPaymentMethodDTO[]>('/catalogs/payment-methods'),
      apiClient.get<PrinterDTO[]>('/catalogs/printers'),
    ]);
    setIsCatalogsLoading(false);

    const metaUpdates: CatalogSyncMeta = {};
    let failedCount = 0;
    // Fase E5: altas de catálogos creadas offline y aún no reconciliadas sobreviven
    // a la recarga de catálogos (igual que E4-b con órdenes/mesas temporales).
    const catalogTmpIds = getPendingCatalogTmpIds();
    const withTemps = <T extends { id: string }>(items: T[], prev: T[]): T[] => {
      if (catalogTmpIds.size === 0) return items;
      const temps = prev.filter((p) => catalogTmpIds.has(p.id));
      return temps.length > 0 ? [...items, ...temps] : items;
    };

    const settle = <T,>(r: PromiseSettledResult<T>, onOk: (value: T) => void) => {
      if (r.status === 'fulfilled') {
        onOk(r.value);
      } else {
        failedCount += 1;
      }
    };

    settle(results[0], (dtos) => {
      const items = dtos.map(mapTable);
      // Fase E4-b: preservar mesas temporales/ocupadas localmente si la cola aún las referencia
      // (para que el replay al reconectar no pierda órdenes/mesas abiertas offline).
      const { orderTmpIds, tmpTableIds } = getPendingTmpIds();
      setTables((prev) => {
        const merged = items.map((t) => {
          const local = prev.find((p) => p.id === t.id);
          if (local && local.currentOrderId && orderTmpIds.has(local.currentOrderId)) {
            return { ...t, status: 'ocupada', currentOrderId: local.currentOrderId, waiter: local.waiter };
          }
          return t;
        });
        for (const t of prev) {
          if (tmpTableIds.has(t.id) && !merged.some((m) => m.id === t.id)) merged.push(t);
        }
        // Fase E5: mesas creadas en catálogos offline (t-custom-*) también sobreviven.
        for (const t of prev) {
          if (catalogTmpIds.has(t.id) && !merged.some((m) => m.id === t.id)) merged.push(t);
        }
        return merged;
      });
      metaUpdates.tables = extractMeta('tables', items);
    });
    settle(results[1], (dtos) => {
      const items = dtos.map(mapProduct);
      setProducts((prev) => overlayProducts(items, prev));
      metaUpdates.products = extractMeta('products', items);
    });
    settle(results[2], (dtos) => {
      const items = dtos.map(mapInsumo);
      setInsumos((prev) => overlayInsumos(withTemps(items, prev), prev));
      metaUpdates.insumos = extractMeta('insumos', items);
    });
    settle(results[3], (dtos) => {
      const items = dtos.map(mapRecipe);
      setRecipes((prev) => overlayRecipes(withTemps(items, prev), prev));
      metaUpdates.recipes = extractMeta('recipes', items);
    });
    settle(results[4], (dtos) => {
      const items = dtos.map(mapBankAccount);
      setBankAccounts((prev) => withTemps(items, prev));
      metaUpdates.bankAccounts = extractMeta('bankAccounts', items);
    });
    settle(results[5], (dtos) => {
      const items = dtos.map(mapPaymentMethod);
      setPaymentMethods((prev) => withTemps(items, prev));
      metaUpdates.paymentMethods = extractMeta('paymentMethods', items);
    });
    settle(results[6], (dtos) => {
      const items = dtos.map(mapPrinter);
      setPrinters((prev) => withTemps(items, prev));
      metaUpdates.printers = extractMeta('printers', items);
    });

    if (Object.keys(metaUpdates).length > 0) {
      setCatalogSyncMeta((prev) => ({ ...prev, ...metaUpdates }));
    }

    if (failedCount === 0) {
      addNotification(
        'Catálogos Sincronizados',
        'Mesas, productos, insumos, recetas, cuentas y métodos de pago cargados desde la API.',
        'success'
      );
    } else {
      addNotification(
        'Catálogos parciales',
        `${failedCount} de 7 catálogos no se pudieron cargar; se mantiene la información local.`,
        'warning'
      );
    }
  };

  // UUID para clientOpId (idempotencia / cola de sync). Fallback portable.
  const newUuid = (): string => {
    try {
      const c = globalThis.crypto;
      if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    } catch {
      /* ignore */
    }
    return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  };

  // Ítems agregados a una orden temporal (apertura en curso) para flushear al server al resolver.
  const tmpOrderItemsRef = useRef<Record<string, OrderItem[]>>({});
  const activeOrderRequestsRef = useRef(new Set<string>());
  const closedOrderIdsRef = useRef(new Set<string>());

  const reconcileOrderResult = (dto: OrderDTO) => {
    if (dto.isDeleted || dto.status === 'anulado') {
      closedOrderIdsRef.current.add(dto.id);
      setOrders((prev) => { const next = { ...prev }; delete next[dto.id]; return next; });
      setTables((prev) => prev.map((t) => releaseOrderTable(t, dto.id)));
      return;
    }
    if (closedOrderIdsRef.current.has(dto.id)) return;
    setOrders((prev) => ({ ...prev, [dto.id]: mapOrder(dto) }));
    // Una cancelación optimista puede encontrar productos agregados desde otro equipo.
    setTables((prev) => prev.map((t) => t.id === dto.tableId && !t.currentOrderId && dto.items.length
      ? { ...t, currentOrderId: dto.id, status: 'ocupada', waiter: dto.waiter } : t));
  };

  const finishOpening = async (dto: OrderDTO, tmpOrderId: string, tmpTableId?: string): Promise<OrderDTO | null> => {
    const desiredItems = () => tmpOrderItemsRef.current[tmpOrderId] ?? ordersRef.current[tmpOrderId]?.items ?? [];
    const openingClientOpId = tmpOrderOpRef.current[tmpOrderId] ?? loadQueue().find((op) => (op.payload as Record<string, unknown>)?.tmpOrderId === tmpOrderId)?.clientOpId ?? dto.clientOpId;
    if (!openingClientOpId) throw new Error('La apertura no tiene identificador.');
    const settled = await settleOpening(openingClientOpId, desiredItems);
    if (settled.cancelled || !settled.order) {
      if (settled.order) reconcileOrderResult(settled.order);
      setOrders((prev) => { const next = { ...prev }; delete next[tmpOrderId]; return next; });
      setTables((prev) => prev.map((t) => releaseOrderTable(t, tmpOrderId)));
      delete tmpOrderItemsRef.current[tmpOrderId];
      delete tmpOrderOpRef.current[tmpOrderId];
      return null;
    }
    const result = settled.order;
    if (closedOrderIdsRef.current.has(result.id)) return null;
    const serverOrder = mapOrder(result);
    setOrders((prev) => { const next = { ...prev }; delete next[tmpOrderId]; next[serverOrder.id] = serverOrder; return next; });
    setTables((prev) => {
      if (tmpTableId) {
        // No quitar una mesa temporal que ya se reutilizó para otra comanda.
        const local = prev.find((t) => t.id === tmpTableId);
        const rest = local?.currentOrderId === tmpOrderId ? prev.filter((t) => t.id !== tmpTableId) : prev;
        if (rest.some((t) => t.id === serverOrder.tableId)) return rest.map((t) => t.id === serverOrder.tableId && (!t.currentOrderId || t.currentOrderId === serverOrder.id)
          ? { ...t, status: 'ocupada', currentOrderId: serverOrder.id, waiter: serverOrder.waiter } : t);
        return [...rest, { id: serverOrder.tableId, companyId: serverOrder.companyId, number: serverOrder.tableNumber, capacity: 1,
          zone: serverOrder.zone, status: 'ocupada', currentOrderId: serverOrder.id, waiter: serverOrder.waiter } as Table];
      }
      return prev.map((t) => t.currentOrderId === tmpOrderId ? { ...t, currentOrderId: serverOrder.id } : t);
    });
    if (tmpTableId) setSelectedTableId((current) => current === tmpTableId ? serverOrder.tableId : current);
    delete tmpOrderItemsRef.current[tmpOrderId];
    delete tmpOrderOpRef.current[tmpOrderId];
    return result;
  };

  // clientOpId de la op `openOrder`/`quickOrder` encolada por cada orden temporal
  // (para poder retirarla de la cola si la comanda se abandona offline).
  const tmpOrderOpRef = useRef<Record<string, string>>({});
  // Fase E5: clientOpId de la op `create*` encolada por cada catálogo temporal
  // (para parchear el payload si se edita antes de sincronizar, o retirarlo si se borra).
  const tmpCatalogOpRef = useRef<Record<string, string>>({});
  // Guard de replay: evita corridas concurrentes (eventos online + toggle + montaje).
  const isReplayingRef = useRef(false);
  // Ref de la función de replay para usarla desde listeners estables (evento online/offline).
  const replayRef = useRef<() => void>(() => {});
  // Ref de loadOperations para refrescar al terminar el replay sin dependencias viejas.
  const loadOperationsRef = useRef<() => Promise<void>>(() => Promise.resolve());
  // Ref de loadCatalogs para el resync al reconectar el socket (tablas).
  const loadCatalogsRef = useRef<() => Promise<void>>(() => Promise.resolve());
  // Refs vivas para los handlers estables del socket (evitan cierres rancios).
  const tablesRef = useRef<Table[]>([]);
  const ordersRef = useRef<Record<string, Order>>({});
  const selectedTableIdRef = useRef<string | null>(null);
  tablesRef.current = tables;
  ordersRef.current = orders;
  selectedTableIdRef.current = selectedTableId;
  loadCatalogsRef.current = loadCatalogs;

  // Refreshers granulares de operaciones (el server hace efectos colaterales: Kardex, libros, saldos).
  const refreshKardex = async (): Promise<void> => {
    try {
      const dtos = await apiClient.get<KardexMovementDTO[]>('/operations/kardex');
      setKardexMovements(dtos.map(mapKardexMovement));
    } catch {
      /* conservar lo local */
    }
  };
  const refreshInsumos = async (): Promise<void> => {
    try {
      const dtos = await apiClient.get<InsumoDTO[]>('/catalogs/insumos');
      setInsumos((prev) => overlayInsumos(dtos.map(mapInsumo), prev));
    } catch {
      /* conservar lo local */
    }
  };
  const refreshTransactions = async (): Promise<void> => {
    try {
      const dtos = await apiClient.get<TransactionDTO[]>('/operations/transactions');
      setTransactions(dtos.map(mapTransaction));
    } catch {
      /* conservar lo local */
    }
  };
  const refreshBankAccounts = async (): Promise<void> => {
    try {
      const dtos = await apiClient.get<BankAccountDTO[]>('/catalogs/bank-accounts');
      setBankAccounts(dtos.map(mapBankAccount));
    } catch {
      /* conservar lo local */
    }
  };
  const refreshShiftRecords = async (): Promise<void> => {
    try {
      const dtos = await apiClient.get<ShiftRecordDTO[]>('/operations/shifts/records');
      setShiftRecords(dtos.map(mapShiftRecord));
    } catch {
      /* conservar lo local */
    }
  };

  // Hidrata las operaciones reales del API (órdenes activas, compras, kardex, turnos y caja).
  // Fuego parcial → conserva lo local + warning.
  const loadOperations = async (): Promise<void> => {
    setIsOperationsLoading(true);
    const results = await Promise.allSettled([
      apiClient.get<OrderDTO[]>('/operations/orders/active'),
      apiClient.get<PurchaseDTO[]>('/operations/purchases'),
      apiClient.get<KardexMovementDTO[]>('/operations/kardex'),
      apiClient.get<ShiftRecordDTO[]>('/operations/shifts/records'),
      apiClient.get<TransactionDTO[]>('/operations/transactions'),
    ]);
    setIsOperationsLoading(false);

    let failedCount = 0;
    const settle = <T,>(r: PromiseSettledResult<T>, onOk: (value: T) => void) => {
      if (r.status === 'fulfilled') onOk(r.value);
      else failedCount += 1;
    };

    settle(results[0], (dtos) => {
      const items = dtos.filter((dto) => !closedOrderIdsRef.current.has(dto.id)).map(mapOrder);
      const merged = Object.fromEntries(items.map((o) => [o.id, o]));
      // Fase E4-b: no sobrescribir órdenes temporales que la cola aún referencia.
      const { orderTmpIds } = getPendingTmpIds();
      setOrders((prev) => {
        const next = { ...merged };
        for (const id of orderTmpIds) {
          if (prev[id]) next[id] = prev[id];
        }
        return next;
      });
    });
    settle(results[1], (dtos) => setPurchases(dtos.map(mapPurchase)));
    settle(results[2], (dtos) => setKardexMovements(dtos.map(mapKardexMovement)));
    settle(results[3], (dtos) => setShiftRecords(dtos.map(mapShiftRecord)));
    settle(results[4], (dtos) => setTransactions(dtos.map(mapTransaction)));

    if (failedCount > 0) {
      addNotification(
        'Operaciones parciales',
        `${failedCount} de 5 fuentes de operaciones no se pudieron cargar; se mantiene información local.`,
        'warning'
      );
    }
  };
  loadOperationsRef.current = loadOperations;

  const syncPendingCount = () => {
    setOfflineState((prev) => ({ ...prev, pendingSyncCount: queueCount() }));
  };

// Replay de la cola offline (Fase E4): reenvía en orden FIFO las operaciones pendientes
  // de ts_pending_queue_v2 al API al reconectar. Idempotente por clientOpId del lado server.
  // NOTA: el guard de "modo offline simulado" vive en los disparadores (no aquí) para que
  // el toggle a online funcione aunque el estado React aún no se aplicó.
  const catalogRefreshGeneration = useRef(0);
  const refreshProductCatalog = async () => {
    const generation = ++catalogRefreshGeneration.current;
    const [productDTOs, recipeDTOs] = await Promise.all([
      apiClient.get<ProductDTO[]>('/catalogs/products'), apiClient.get<RecipeDTO[]>('/catalogs/recipes'),
    ]);
    if (generation !== catalogRefreshGeneration.current) return;
    setProducts((prev) => overlayProducts(productDTOs.map(mapProduct), prev));
    setRecipes((prev) => overlayRecipes(recipeDTOs.map(mapRecipe), prev));
  };
  const refreshProductCatalogRef = useRef(refreshProductCatalog);
  refreshProductCatalogRef.current = refreshProductCatalog;

  const syncProductOperation = async (op: PendingOp): Promise<'saved' | 'queued'> => {
    if (op.conflict || op.error) return 'queued';
    const result = await replayCall(op, op.payload as Record<string, unknown>);
    if (result.disposition === 'ok') {
      persistProductQueue(loadQueue().filter((item) => item.clientOpId !== op.clientOpId));
      const server = mapProduct(result.data as ProductDTO);
      setProducts((prev) => overlayProducts([...prev.filter((p) => p.id !== server.id), server], prev));
      await refreshProductCatalogRef.current().catch(() => undefined);
      return 'saved';
    }
    if (result.disposition === 'conflict' || result.disposition === 'business' || result.disposition === 'gone') {
      markProductIssue(op, result.message ?? 'No se pudo guardar este producto. Revise sus datos.', result.disposition === 'conflict');
    }
    return 'queued';
  };

  const saveProduct = async (draft: ProductDraft, id?: string, expectedVersion?: number): Promise<'saved' | 'queued'> => {
    if (id && productIsSending(id)) throw new Error('El producto se está sincronizando. Espere un momento.');
    const current = id ? products.find((p) => p.id === id) : undefined;
    if (current && current.companyId !== draft.companyId) throw new Error('No se puede cambiar la empresa de un producto existente.');
    const op = stageProduct(draft, current && expectedVersion !== undefined ? { ...current, version: expectedVersion } : current, id);
    setProducts((prev) => overlayProducts(prev, prev));
    setRecipes((prev) => overlayRecipes(prev, prev));
    if (offlineState.isSimulatedOffline || !getAuthToken()) return 'queued';
    if (isReplayingRef.current) { productSyncRequestedRef.current = true; return 'queued'; }
    if (loadQueue()[0]?.clientOpId !== op.clientOpId) { replayRef.current(); return 'queued'; }
    const outcome = await syncProductOperation(op);
    const pending = productPending().find((item) => item.clientOpId === op.clientOpId);
    if (pending?.error) throw new Error(pending.error);
    if (outcome === 'saved' && queueCount()) replayRef.current();
    return outcome;
  };

  const resolveProductConflict = async (id: string, choice: 'server' | 'local') => {
    if (offlineState.isSimulatedOffline) throw new Error('Restablezca la conexión para revisar el producto.');
    if (productIsSending(id)) throw new Error('Espere a que termine la sincronización.');
    const all = await apiClient.get<ProductDTO[]>('/catalogs/products');
    const server = all.map(mapProduct).find((p) => p.id === id);
    if (!server) throw new Error('El producto fue retirado del servidor. Revise su uso antes de descartar el cambio.');
    const queue = loadQueue();
    const op = queue.find((item) => isProductOp(item) && productIdOf(item) === id);
    if (!op) { await refreshProductCatalog(); return; }
    if (server.companyId !== (op.payload as ProductDraft).companyId) throw new Error('La empresa del producto no coincide.');
    const next = choice === 'server' ? queue.filter((item) => item.clientOpId !== op.clientOpId)
      : queue.map((item) => item.clientOpId !== op.clientOpId ? item : { ...item, op: 'updateProduct',
        clientOpId: newUuid(), error: undefined, conflict: undefined,
        payload: { ...(item.payload as object), expectedVersion: server.version } });
    persistProductQueue(next);
    setProducts((prev) => overlayProducts(all.map(mapProduct), prev));
    await refreshProductCatalog();
    replayRef.current();
  };

  const replayOfflineQueue = async (): Promise<void> => {
    if (isReplayingRef.current) return;
    // Las altas deben existir antes de que una apertura haga flush de sus ítems.
    const queue = loadQueue().sort((a, b) => Number(['createProduct', 'createInsumo'].includes(b.op)) - Number(['createProduct', 'createInsumo'].includes(a.op)));
    if (queue.length === 0) {
      syncPendingCount();
      return;
    }
    isReplayingRef.current = true;
    try {
    const tmpToOrder = new Map<string, string>();
    const tmpToTable = new Map<string, string>();
    const deadTmpOrder = new Set<string>();
    const deadTmpTable = new Set<string>();
    let synced = 0;
    let dropped = 0;
    let stuck = 0;
    let stuckNetwork = false;
    let needsAuthentication = false;

    // Fase E5: reconcilia un alta de catálogo aplicada en el replay (reemplaza el id
    // temporal por el id real del server). Para recetas conserva ingredientes locales
    // si el PATCH del server no los devuelve (updateRecipe no incluye `ingredients`).
    const reconcileCatalogCreate = (op: string, tempId: string | undefined, data: unknown, tempProductId?: string) => {
      if (!tempId) return;
      delete tmpCatalogOpRef.current[tempId];
      if (op === 'createTable' || op === 'quickOrder') {
        const server = mapTable(data as TableDTO);
        setTables((prev) => {
          const next = prev.filter((t) => t.id !== tempId);
          return next.some((t) => t.id === server.id) ? next : [...next, server];
        });
      } else if (op === 'createBankAccount') {
        const server = mapBankAccount(data as BankAccountDTO);
        setBankAccounts((prev) => {
          const next = prev.filter((a) => a.id !== tempId);
          return next.some((a) => a.id === server.id) ? next : [...next, server];
        });
      } else if (op === 'createPaymentMethod') {
        const server = mapPaymentMethod(data as CustomPaymentMethodDTO);
        setPaymentMethods((prev) => {
          const next = prev.filter((p) => p.id !== tempId);
          return next.some((p) => p.id === server.id) ? next : [...next, server];
        });
      } else if (op === 'createPrinter') {
        const server = mapPrinter(data as PrinterDTO);
        setPrinters((prev) => {
          const next = prev.filter((p) => p.id !== tempId);
          return next.some((p) => p.id === server.id) ? next : [...next, server];
        });
      } else if (op === 'createRecipe' || op === 'saveRecipe') {
        const server = mapRecipe(data as RecipeDTO);
        setRecipes((prev) => {
          const local = prev.find((r) => r.id === tempId);
          const full: Recipe =
            server.ingredients.length === 0 && local && local.ingredients.length > 0
              ? { ...server, ingredients: local.ingredients }
              : server;
          const next = prev.filter((r) => r.id !== tempId);
          return next.some((r) => r.id === full.id) ? next : [full, ...next];
        });
        // Remapea el producto local creado desde la ficha (id temporal) al id real
        // que asignó el server, para que el plato siga apuntando en mesas sin duplicarse.
        if (tempProductId && server.productId) {
          setProducts((prev) =>
            prev.map((p) =>
              p.id === tempProductId
                ? {
                    ...p,
                    id: server.productId,
                    name: server.productName,
                    price: server.salePrice,
                    category: server.category as ProductCategory,
                    hasRecipe: true,
                  }
                : p
            )
          );
        }
      } else if (op === 'createInsumo') {
        const server = mapInsumo(data as InsumoDTO);
        setInsumos((prev) => {
          const next = prev.filter((i) => i.id !== tempId);
          return next.some((i) => i.id === server.id) ? next : [...next, server];
        });
      }
    };

    for (const opItem of queue) {
      if (activeOrderRequestsRef.current.has(opItem.clientOpId) || !loadQueue().some((op) => op.clientOpId === opItem.clientOpId)) continue;
      if (isInsumoOp(opItem)) {
        if (await syncInsumoOperation(opItem) === 'saved') synced++;
        else { stuck++; needsAuthentication = !getAuthToken(); break; }
        continue;
      }
      if (isProductOp(opItem)) {
        const fresh = loadQueue().find((op) => op.clientOpId === opItem.clientOpId);
        if (!fresh) continue;
        if (await syncProductOperation(fresh) === 'saved') synced++;
        else { stuck++; needsAuthentication = !getAuthToken(); break; }
        continue;
      }
      if (opItem.conflict || opItem.error) { stuck++; break; }
      const payload = { ...((opItem.payload ?? {}) as Record<string, unknown>) };
      if (typeof payload.orderId === 'string' && tmpToOrder.has(payload.orderId)) {
        payload.orderId = tmpToOrder.get(payload.orderId);
      }
      if (typeof payload.tableId === 'string' && tmpToTable.has(payload.tableId)) {
        payload.tableId = tmpToTable.get(payload.tableId);
      }

      if (
        deadTmpOrder.has(payload.orderId as string) ||
        deadTmpTable.has(payload.tableId as string)
      ) {
        removeByClientOpId(opItem.clientOpId);
        dropped += 1;
        continue;
      }

      if (opItem.op === 'openOrder' || opItem.op === 'quickOrder') {
        const tmpOrderId = payload.tmpOrderId as string;
        const tmpTableId = (payload.tmpTableId as string) ?? undefined;
        const tmpOrder = tmpOrderId ? ordersRef.current[tmpOrderId] : undefined;
        if (!tmpOrder) {
          // La apertura pudo llegar al servidor aunque se perdiera su respuesta.
          const cancelled = await replayCall({ ...opItem, op: 'cancelOpening' }, { openingClientOpId: opItem.clientOpId });
          if (cancelled.disposition === 'retry') { stuck++; needsAuthentication = cancelled.unauthorized === true; break; }
          if (cancelled.disposition === 'ok' && (cancelled.data as OrderDTO)?.id) reconcileOrderResult(cancelled.data as OrderDTO);
          deadTmpOrder.add(tmpOrderId);
          if (tmpTableId) deadTmpTable.add(tmpTableId);
          removeByClientOpId(opItem.clientOpId);
          dropped += 1;
          continue;
        }
        const result = await replayCall(opItem, payload);
        if (result.disposition === 'retry') {
          stuck += 1;
          stuckNetwork = stuckNetwork || result.network === true;
          needsAuthentication = result.unauthorized === true;
          break;
        }
        if (result.disposition !== 'ok') {
          removeByClientOpId(opItem.clientOpId);
          dropped += 1;
          if (result.disposition === 'business' && result.message) {
            addNotification('Replay omitido', `${opItem.op}: ${result.message}`, 'warning');
          }
          continue;
        }
        const serverOrder = mapOrder(result.data as OrderDTO);
        tmpToOrder.set(tmpOrderId, serverOrder.id);
        if (tmpTableId) tmpToTable.set(tmpTableId, serverOrder.tableId);
        await finishOpening(result.data as OrderDTO, tmpOrderId, tmpTableId);
        removeByClientOpId(opItem.clientOpId);
        synced += 1;
        setLastSyncResult({ ok: true, ts: Date.now(), op: opItem.op });
        continue;
      }

      const result = await replayCall(opItem, payload);
      if (result.disposition === 'conflict') {
        markInsumoIssue(opItem, result.message ?? 'Revise el insumo vinculado a esta operación.');
        addNotification('Operación pendiente de revisión', result.message ?? opItem.op, 'warning');
        stuck++; break;
      }
      if (result.disposition === 'ok') {
        if ((result.data as OrderDTO)?.id && (opItem.entity === 'orderItem' || opItem.op === 'cancelOpening')) reconcileOrderResult(result.data as OrderDTO);
        if (opItem.entity === 'catalog') {
          reconcileCatalogCreate(
            opItem.op,
            payload.tempId as string | undefined,
            result.data,
            payload.tempProductId as string | undefined
          );
        }
        removeByClientOpId(opItem.clientOpId);
        synced += 1;
      } else if (result.disposition === 'retry') {
        stuck += 1;
        stuckNetwork = stuckNetwork || result.network === true;
        needsAuthentication = result.unauthorized === true;
        break;
      } else if (result.disposition === 'business') {
        removeByClientOpId(opItem.clientOpId);
        dropped += 1;
        addNotification('Replay omitido', `${opItem.op}: ${result.message}`, 'warning');
      } else {
        removeByClientOpId(opItem.clientOpId);
        dropped += 1;
      }
    }

    syncPendingCount();
    const remaining = queueCount();
    setLastSyncResult({ ok: stuck === 0, ts: Date.now(), op: 'replayQueue' });
    if (needsAuthentication) return; // No retirar pendientes ni refrescar sin sesión.
    if (stuck > 0) {
      if (stuckNetwork) setOfflineState((prev) => ({ ...prev, isOnline: false }));
      addNotification(
        'Sincronización parcial',
        `${synced} operaciones sincronizadas, ${remaining} en cola (se reintentará al reconectar).`,
        'warning'
      );
    } else {
      addNotification(
        'Sincronización completada',
        `${synced} operaciones sincronizadas${dropped > 0 ? `, ${dropped} omitidas por no aplicables` : ''}.`,
        dropped > 0 ? 'warning' : 'success'
      );
    }

    await loadOperationsRef.current();
    const refreshOps = [refreshKardex(), refreshInsumos(), refreshTransactions(),
      refreshBankAccounts(), refreshShiftRecords()];
    await Promise.allSettled(refreshOps);
    // Fase E5: si todo sincronizó, converge catálogos con la verdad del server
    // (los reconciliados ya llevan id real; esto actualiza version/updatedAt/meta).
    if (stuck === 0) {
      await loadCatalogs();
    }
    } catch (err) {
      syncPendingCount();
      setLastSyncResult({ ok: false, ts: Date.now(), op: 'replayQueue' });
      if (err instanceof ApiError && err.isUnauthorized) return;
      addNotification(
        'Sincronización interrumpida',
        'Hubo un problema al sincronizar; las operaciones siguen en cola y se reintentarán al reconectar.',
        'warning'
      );
    } finally {
      isReplayingRef.current = false;
      if (productSyncRequestedRef.current) {
        productSyncRequestedRef.current = false;
        if (!offlineState.isSimulatedOffline && getAuthToken()) queueMicrotask(() => replayRef.current());
      }
    }
  };

  // Replay siempre apunta a la versión más reciente de la función (listeners estables).
  replayRef.current = () => {
    void replayOfflineQueue();
  };

  // Write-through unificado (contrato de sync mínimo, E3):
  //   - Offline simulado → aplica local + encola (sin llamar al API).
  //   - Éxito → el endpointOp reconcilia local con la respuesta del server.
  //   - Error de red/5xx → conserva lo local + encola la op.
  //   - Error de negocio 4xx → resincroniza la verdad (loadOperations) + aviso.
  const attemptMutation = async (params: {
    clientOpId: string;
    entity: PendingOpEntity;
    op: string;
    queuePayload: unknown;
    endpointOp: () => Promise<void>;
    rollback?: () => void;
  }): Promise<'ok' | 'queued' | 'rejected'> => {
    if (offlineState.isSimulatedOffline || (['order', 'orderItem'].includes(params.entity) && productPending().length > 0)) {
      enqueueOp({
        clientOpId: params.clientOpId,
        entity: params.entity,
        op: params.op,
        payload: params.queuePayload,
        createdAt: new Date().toISOString(),
      });
      syncPendingCount();
      if (!offlineState.isSimulatedOffline && getAuthToken()) queueMicrotask(() => replayRef.current());
      return 'queued';
    }
    activeOrderRequestsRef.current.add(params.clientOpId);
    try {
      await params.endpointOp();
      setLastSyncResult({ ok: true, ts: Date.now(), op: params.op });
      return 'ok';
    } catch (err) {
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        if (err.status === 401 && err.isUnauthorized) {
          setLastSyncResult({ ok: false, ts: Date.now(), op: params.op });
          enqueueOp({
            clientOpId: params.clientOpId,
            entity: params.entity,
            op: params.op,
            payload: params.queuePayload,
            createdAt: new Date().toISOString(),
          });
          syncPendingCount();
          return 'queued';
        }
        if (err.code.startsWith('INSUMO_')) {
          const op: PendingOp = { clientOpId: params.clientOpId, entity: params.entity, op: params.op, payload: params.queuePayload,
            createdAt: new Date().toISOString(), error: err.message, conflict: true };
          persistInsumoQueue([...loadQueue().filter((item) => item.clientOpId !== op.clientOpId), op]);
          syncPendingCount();
          addNotification('Operación pendiente de revisión', err.message, 'warning');
          return 'queued';
        }
        params.rollback?.();
        setLastSyncResult({ ok: false, ts: Date.now(), op: params.op });
        addNotification('Operación rechazada por el servidor', `${params.op}: ${err.message}`, 'warning');
        loadOperations();
        return 'rejected';
      } else {
        setLastSyncResult({ ok: false, ts: Date.now(), op: params.op });
        enqueueOp({
          clientOpId: params.clientOpId,
          entity: params.entity,
          op: params.op,
          payload: params.queuePayload,
          createdAt: new Date().toISOString(),
        });
        syncPendingCount();
        addNotification(
          'Sin conexión - Operación en cola',
          `${params.op} se guardó localmente y se sincronizará cuando haya conexión.`,
          'warning'
        );
        return 'queued';
      }
    } finally {
      activeOrderRequestsRef.current.delete(params.clientOpId);
    }
  };

  // Los 401 de HTTP y Socket.IO comparten este flujo; no envía un logout redundante.
  useEffect(() => {
    const onAuthenticationRequired = (event: Event) => {
      disconnectRealtime();
      setRealtimeStatus('disconnected');
      setAuthToken(null);
      setCurrentUser(null);
      setCurrentScreen('mesas');
      setSelectedTableId(null);
      setAuthNotice((event as CustomEvent<{ message: string }>).detail.message);
    };
    window.addEventListener(AUTH_REQUIRED_EVENT, onAuthenticationRequired);
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, onAuthenticationRequired);
  }, []);

  // Restauración de sesión al montar: valida contra GET /api/auth/me si hay token.
  useEffect(() => {
    const auth = getAuthToken();
    if (!auth) {
      setAuthToken(null);
      setCurrentUser(null);
      setIsSessionInitializing(false);
      return;
    }
    let cancelled = false;
    apiClient
      .get<MeResponse>('/auth/me')
      .then((res) => {
        if (cancelled) return;
        setCurrentUser(res.user);
        setCompanies(res.companies);
        setCompanyShifts(mapCompanyShifts(res.companyShifts));
        setCompanyShiftCash(mapCompanyShiftCash(res.companyShifts));
        setCompanyShiftOpenedUtc(mapCompanyShiftOpened(res.companyShifts));
        loadCatalogs();
        loadOperations();
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.isUnauthorized) {
          clearAuthToken();
          setAuthToken(null);
          setCurrentUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) setIsSessionInitializing(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fase E4 — detecta reconexión real y dispara el replay automático de la cola.
  // Solo cuando el navegador reporta online Y no estamos en modo offline simulado.
  useEffect(() => {
    const goOnline = () => setOfflineState((prev) => ({ ...prev, isOnline: true }));
    const goOffline = () => setOfflineState((prev) => ({ ...prev, isOnline: false }));
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  useEffect(() => {
    if (currentUser && offlineState.isOnline && !offlineState.isSimulatedOffline) {
      void replayRef.current();
    }
  }, [currentUser, offlineState.isOnline, offlineState.isSimulatedOffline]);

  // Tiempo real (Fase D acotada): handlers estables que delegan vía refs.
  // - table:changed → merge de mesa (sin pisar mis tmps offline) + fetch de la
  //   orden si es nueva para mí; si liberaron, retira mi copia local real.
  // - order:changed → refresca la orden vía GET si la tengo o la estoy mirando.
  const kardexHandlerRef = useRef<(e: KardexChangedEvent) => void>(() => undefined);
  const purchaseHandlerRef = useRef<(e: PurchaseChangedEvent) => void>(() => undefined);
  const transactionHandlerRef = useRef<(e: TransactionChangedEvent) => void>(() => undefined);
  const shiftRealtimeHandlerRef = useRef<(e: ShiftChangedEvent) => void>(() => undefined);
  const recipeHandlerRef = useRef<(e: RecipeChangedEvent) => void>(() => undefined);
  const insumoHandlerRef = useRef<(e: InsumoChangedEvent) => void>(() => undefined);
  const paymentMethodHandlerRef = useRef<(e: PaymentMethodChangedEvent) => void>(() => undefined);
  const printerHandlerRef = useRef<(e: PrinterChangedEvent) => void>(() => undefined);
  const productHandlerRef = useRef<(e: ProductChangedEvent) => void>(() => undefined);
  const tableHandlerRef = useRef<(e: TableChangedEvent) => void>(() => undefined);
  const orderHandlerRef = useRef<(e: OrderChangedEvent) => void>(() => undefined);
  tableHandlerRef.current = (e) => {
    if (!e || !e.tableId) return;
    if (offlineState.isSimulatedOffline) return;
    const local = tablesRef.current.find((t) => t.id === e.tableId);
    if (e.status === 'libre' && e.sourceOrderId && local?.currentOrderId && local.currentOrderId !== e.sourceOrderId) return;
    if (!local) {
      // Mesa creada por otro terminal (barra quick-bar): agregarla si aplica.
      if (e.companyId !== activeCompanyId && activeCompanyId !== 'todas') return;
        const incoming: Table = {
        id: e.tableId,
        companyId: e.companyId as CompanyId,
        number: e.tableId.slice(-2),
        capacity: 2,
        zone: 'Barra',
        status: (e.status as Table['status']) ?? 'ocupada',
        currentOrderId: e.currentOrderId ?? undefined,
        waiter: e.waiter ?? undefined,
      };
      setTables((prev) => (prev.some((t) => t.id === e.tableId) ? prev : [...prev, incoming]));
    } else {
      // No pisar mi trabajo offline pendiente ni mis mesas temporales locales.
      if (local.id.startsWith('t-express-') || local.id.startsWith('t-custom-')) return;
      const { orderTmpIds } = getPendingTmpIds();
      if (local.currentOrderId && orderTmpIds.has(local.currentOrderId)) return;
      const oldOrderId = local.currentOrderId;
      setTables((prev) =>
        prev.map((t) =>
          t.id === e.tableId
            ? {
                ...t,
                status: (e.status as Table['status']) ?? t.status,
                currentOrderId: e.currentOrderId ?? undefined,
                waiter: e.waiter ?? t.waiter,
                occupiedSince: e.status === 'libre' ? undefined : (t.occupiedSince ?? e.updatedAt),
                minutesElapsed: e.status === 'libre' ? undefined : (t.minutesElapsed ?? 1),
              }
            : t
        )
      );
      if (e.status === 'libre' && oldOrderId && !oldOrderId.startsWith('order-tmp-')) {
        setOrders((prev) => {
          if (!prev[oldOrderId]) return prev;
          const next = { ...prev };
          delete next[oldOrderId];
          return next;
        });
      }
    }
    if (e.currentOrderId && !e.currentOrderId.startsWith('order-tmp-') && !ordersRef.current[e.currentOrderId]) {
      void apiClient
        .get<OrderDTO>(`/operations/orders/${e.currentOrderId}`)
        .then(reconcileOrderResult)
        .catch(() => undefined);
    }
  };
  orderHandlerRef.current = (e) => {
    if (!e || !e.orderId || e.orderId.startsWith('order-tmp-')) return;
    if (offlineState.isSimulatedOffline) return;
    if (e.isDeleted || e.status === 'anulado') {
      closedOrderIdsRef.current.add(e.orderId);
      setOrders((prev) => { const next = { ...prev }; delete next[e.orderId]; return next; });
      // La mesa se reconcilia con table:changed, que contiene su vínculo actual.
      return;
    }
    if (closedOrderIdsRef.current.has(e.orderId)) return;
    const selectedId = selectedTableIdRef.current;
    const selectedOrderId = selectedId
      ? tablesRef.current.find((t) => t.id === selectedId)?.currentOrderId
      : undefined;
    const watching = selectedOrderId === e.orderId || !!ordersRef.current[e.orderId];
    const tablePointsHere = e.tableId
      ? tablesRef.current.find((t) => t.id === e.tableId)?.currentOrderId !== e.orderId
      : false;
    if (watching || tablePointsHere) {
      void apiClient
        .get<OrderDTO>(`/operations/orders/${e.orderId}`)
        .then(reconcileOrderResult)
        .catch(() => undefined);
    }
  };

  kardexHandlerRef.current = (e) => {
    if (!e || !e.insumoId) return;
    if (offlineState.isSimulatedOffline) return;
    const movement: KardexMovement = {
      id: `kdx-rt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      companyId: toCompanyId(e.companyId),
      timestamp: Date.parse(e.updatedAt) || Date.now(),
      date: 'Hoy',
      time: new Date(Date.parse(e.updatedAt) || Date.now()).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
      insumoId: e.insumoId,
      insumoName: e.insumoName,
      type: e.type as KardexMovementType,
      referenceDoc: e.referenceDoc,
      quantity: e.quantity,
      unit: e.unit,
      unitCost: e.unitCost,
      totalCost: e.totalCost,
      stockBefore: e.stockBefore,
      stockAfter: e.stockAfter,
      notes: undefined,
      clientOpId: undefined,
    };
    // Evita duplicar el movimiento si ya llegó (eco del socket o resync REST posterior).
    setKardexMovements((prev) => {
      const exists = prev.some(
        (m) => m.referenceDoc === e.referenceDoc && m.insumoId === e.insumoId
      );
      if (exists) return prev;
      return [movement, ...prev];
    });
    // Refleja el nuevo saldo del insumo afectado.
    setInsumos((prev) =>
      prev.map((ins) => (ins.id === e.insumoId ? { ...ins, currentStock: e.stockAfter } : ins))
    );
  };

  // Replica compras/facturas en tiempo real: alta de compra o regularización de vale.
  purchaseHandlerRef.current = (e) => {
    if (!e || !e.purchaseId) return;
    if (offlineState.isSimulatedOffline) return;
    const mapped: Purchase = {
      id: e.purchaseId,
      companyId: toCompanyId(e.companyId),
      category: (e.category || 'insumos') as PurchaseCategory,
      documentStatus: (e.documentStatus || 'provisional') as PurchaseDocumentStatus,
      provisionalNoteNumber: e.provisionalNoteNumber ?? undefined,
      invoiceNumber: e.invoiceNumber,
      supplierName: e.supplierName,
      supplierRuc: e.supplierRuc,
      date: 'Hoy',
      time: new Date(Date.parse(e.updatedAt) || Date.now()).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
      shift: 'Día',
      items: [],
      subtotal: e.total,
      igv: 0,
      total: e.total,
      paymentStatus: undefined,
      paidFromCash: undefined,
      bankAccountId: undefined,
      bankAccountAlias: undefined,
      notes: undefined,
      regularizedAt: undefined,
      regularizedBy: undefined,
      clientOpId: undefined,
    };
    // Evita duplicar si ya llegó por REST; si ya existe, actualiza en su lugar.
    setPurchases((prev) => {
      const exists = prev.find((p) => p.id === e.purchaseId);
      if (exists) {
        return prev.map((p) => (p.id === e.purchaseId ? mapped : p));
      }
      return [mapped, ...prev];
    });
    // Refresca kardex e insumos para reflejar la entrada de stock si aplica.
    void refreshKardex();
    void refreshInsumos();
  };

  // Los eventos son invalidaciones: REST devuelve ingredientes, vínculos y precios completos.
  recipeHandlerRef.current = (e) => {
    if (!e?.recipeId || offlineState.isSimulatedOffline) return;
    void refreshProductCatalogRef.current().catch(() => undefined);
  };

  // Replica insumos en tiempo real: creación, edición o eliminación.
  insumoHandlerRef.current = (e) => {
    if (!e?.insumoId || offlineState.isSimulatedOffline) return;
    void refreshInsumos();
  };

  // Replica métodos de pago en tiempo real: creación, edición o eliminación.
  paymentMethodHandlerRef.current = (e) => {
    if (!e || !e.paymentMethodId) return;
    if (offlineState.isSimulatedOffline) return;
    const mapped: CustomPaymentMethod = {
      id: e.paymentMethodId,
      companyId: (e.companyId as CustomPaymentMethod['companyId']) || 'ambas',
      name: e.name,
      category: e.category,
      bankAccountId: undefined,
      commissionPct: 0,
      requiresReferenceNumber: false,
      icon: e.icon,
      isActive: true,
    };
    setPaymentMethods((prev) => {
      if (e.action === 'delete') {
        return prev.filter((p) => p.id !== e.paymentMethodId);
      }
      const exists = prev.find((p) => p.id === e.paymentMethodId);
      if (exists) {
        return prev.map((p) => (p.id === e.paymentMethodId ? mapped : p));
      }
      return [mapped, ...prev];
    });
  };

  // Replica impresoras en tiempo real: creación, edición o eliminación.
  printerHandlerRef.current = (e) => {
    if (!e || !e.printerId) return;
    if (offlineState.isSimulatedOffline) return;
    const mapped: ThermalPrinterConfig = {
      id: e.printerId,
      companyId: (e.companyId as ThermalPrinterConfig['companyId']) || 'ambas',
      name: e.name,
      role: e.role,
      connectionType: e.connectionType,
      ipAddress: e.ipAddress || undefined,
      port: 9100,
      paperWidth: '80mm',
      autoCut: true,
      beepOnPrint: false,
      categoriesMapped: [],
      isEnabled: true,
      status: 'online',
    };
    setPrinters((prev) => {
      if (e.action === 'delete') {
        return prev.filter((p) => p.id !== e.printerId);
      }
      const exists = prev.find((p) => p.id === e.printerId);
      if (exists) {
        return prev.map((p) => (p.id === e.printerId ? mapped : p));
      }
      return [mapped, ...prev];
    });
  };

  productHandlerRef.current = (e) => {
    if (!e?.productId || offlineState.isSimulatedOffline) return;
    void refreshProductCatalogRef.current().catch(() => undefined);
  };

  // Libro de Caja en vivo (Fase D extendida): venta cobrada, transacción manual,
  // pago/regularización de compra. La verdad va en REST: refresco transacciones y
  // bancos (todo cambio de saldo bancario viaja con una fila en transacciones).
  transactionHandlerRef.current = (e) => {
    if (!e || !e.companyId) return;
    if (offlineState.isSimulatedOffline) return;
    void Promise.all([refreshTransactions(), refreshBankAccounts()]);
  };

  // Cierre/arqueo de turno hecho en OTRA terminal: alinea turnos, transacciones y
  // la caja inicial vigente (companyShiftCash) para que la gaveta no quede desfasada.
  shiftRealtimeHandlerRef.current = (e) => {
    if (!e || !e.companyId) return;
    if (offlineState.isSimulatedOffline) return;
    setCompanyShiftCash((prev) => ({
      ...prev,
      [toCompanyId(e.companyId)]: e.initialCash,
    }));
    setCompanyShiftOpenedUtc((prev) => ({ ...prev, [toCompanyId(e.companyId)]: Date.parse(e.updatedAt) || Date.now() }));
    void Promise.all([refreshShiftRecords(), refreshTransactions()]);
  };

  // Conexión del socket: con sesión válida y red real (no simulada).
  // Al reconectar, resync contra REST (verdad del server, preserva tmps).
  useEffect(() => {
    if (!currentUser || !authToken) {
      disconnectRealtime();
      setRealtimeStatus('disconnected');
      return;
    }
    if (offlineState.isSimulatedOffline || !offlineState.isOnline) {
      disconnectRealtime();
      setRealtimeStatus('disconnected');
      return;
    }
    connectRealtime({
      token: authToken.token,
      companyId: activeCompanyId,
      onTableChanged: (e) => tableHandlerRef.current(e),
      onOrderChanged: (e) => orderHandlerRef.current(e),
      onKardexChanged: (e) => kardexHandlerRef.current(e),
      onPurchaseChanged: (e) => purchaseHandlerRef.current(e),
      onRecipeChanged: (e) => recipeHandlerRef.current(e),
      onInsumoChanged: (e) => insumoHandlerRef.current(e),
      onPaymentMethodChanged: (e) => paymentMethodHandlerRef.current(e),
      onPrinterChanged: (e) => printerHandlerRef.current(e),
      onProductChanged: (e) => productHandlerRef.current(e),
      onTransactionChanged: (e) => transactionHandlerRef.current(e),
      onShiftChanged: (e) => shiftRealtimeHandlerRef.current(e),
      onStatus: (s) => {
        setRealtimeStatus(s);
        if (s === 'connected') {
          void loadOperationsRef.current();
          void loadCatalogsRef.current();
        }
      },
    });
    // Sin disconnect en cleanup: el cambio de empresa hace join, no reconexión.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, authToken, activeCompanyId, offlineState.isSimulatedOffline, offlineState.isOnline]);

  // Sync to Local Storage
  useEffect(() => {
    if (currentUser) localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(currentUser));
    else localStorage.removeItem(STORAGE_KEYS.USER);
  }, [currentUser]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_COMPANY, activeCompanyId);
  }, [activeCompanyId]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.TABLES, JSON.stringify(tables));
  }, [tables]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders));
  }, [orders]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
  }, [transactions]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.INSUMOS, JSON.stringify(insumos));
  }, [insumos]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.RECIPES, JSON.stringify(recipes));
  }, [recipes]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.PURCHASES, JSON.stringify(purchases));
  }, [purchases]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.KARDEX, JSON.stringify(kardexMovements));
  }, [kardexMovements]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.BANK_ACCOUNTS, JSON.stringify(bankAccounts));
  }, [bankAccounts]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.PAYMENT_METHODS, JSON.stringify(paymentMethods));
  }, [paymentMethods]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify(companyShifts));
  }, [companyShifts]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SHIFT_RECORDS, JSON.stringify(shiftRecords));
  }, [shiftRecords]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.PRINTERS, JSON.stringify(printers));
  }, [printers]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.CATALOG_META, JSON.stringify(catalogSyncMeta));
  }, [catalogSyncMeta]);

  // Notifications helper
  const addNotification = (
    title: string,
    message: string,
    type: 'info' | 'success' | 'warning' = 'info'
  ) => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const newNotif: NotificationItem = {
      id: `notif-${Date.now()}-${Math.random()}`,
      title,
      message,
      time: timeStr,
      type,
    };
    setNotifications((prev) => [newNotif, ...prev.slice(0, 9)]);
  };

  const dismissNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  // Auth — POST /api/auth/login (API real + JWT)
  const login = async (pin: string): Promise<boolean> => {
    setIsAuthenticating(true);
    try {
      const res = await apiClient.post<LoginResponse>('/auth/login', {
        pin,
        ...getTerminalIdentity(),
      });
      storeAuthToken({ token: res.token, expiresAt: res.expiresAt });
      setAuthToken({ token: res.token, expiresAt: res.expiresAt });
      setCurrentUser(res.user);
      setAuthNotice(null);
      setCompanies(res.companies);
      setCompanyShifts(mapCompanyShifts(res.companyShifts));
      setCompanyShiftCash(mapCompanyShiftCash(res.companyShifts));
      setCompanyShiftOpenedUtc(mapCompanyShiftOpened(res.companyShifts));

      // Mantiene la empresa activa si sigue existiendo; si no, prioriza la
      // empresa asignada al usuario (o la primera del catálogo).
      const savedCompany = localStorage.getItem(STORAGE_KEYS.ACTIVE_COMPANY) as
        | CompanyId
        | 'todas'
        | null;
      const stillExists = savedCompany && res.companies.some((c) => c.id === savedCompany);
      const assignedExists =
        res.user.assignedCompanyId &&
        res.companies.some((c) => c.id === res.user.assignedCompanyId);
      const nextCompany = stillExists
        ? savedCompany!
        : assignedExists
          ? (res.user.assignedCompanyId as CompanyId)
          : (res.companies[0]?.id as CompanyId) || 'el-tayta';
      setActiveCompanyId(nextCompany);

      addNotification(
        'Sesión Iniciada',
        `Bienvenido ${res.user.name} - Conexión con la API real activa.`,
        'success'
      );

      // Carga catálogos reales en segundo plano (Fase E2).
      loadCatalogs();
      // Carga operaciones reales en segundo plano (Fase E3).
      loadOperations();

      return true;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError('No se pudo conectar con la API. Verifique el servidor.', 'NETWORK_ERROR', 0);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const logout = async () => {
    const auth = getAuthToken();
    // Captura/inicia la petición antes de borrar el token local.
    const revocation = auth ? apiClient.post<{ ok: boolean }>('/auth/logout') : null;
    disconnectRealtime();
    setRealtimeStatus('disconnected');
    clearAuthToken();
    setAuthToken(null);
    setCurrentUser(null);
    setCurrentScreen('mesas');
    setSelectedTableId(null);
    setAuthNotice('Sesión cerrada en este equipo. Confirmando el cierre en el servidor…');
    try {
      const result = await revocation;
      if (!getAuthToken()) setAuthNotice(result?.ok
        ? 'Sesión cerrada e invalidada en el servidor.'
        : 'Sesión cerrada en este equipo.');
    } catch (err) {
      if (!getAuthToken()) setAuthNotice(err instanceof ApiError && err.isUnauthorized
        ? 'Sesión cerrada. El servidor ya no acepta esta sesión.'
        : 'Sesión cerrada en este equipo. No se pudo confirmar la revocación en el servidor.');
    }
  };

  // Active Company Definition
  const activeCompany = useMemo(() => {
    if (activeCompanyId === 'todas') {
      return {
        id: 'el-tayta' as CompanyId,
        name: 'Grupo Gastronómico Tayta & Sabroso',
        tradeName: 'Tayta & Sabroso Holding',
        ruc: companies.map((company) => company.ruc).join(' / '),
        specialty: 'Gestión Consolidada de Ambas Empresas',
        themeColor: '#ffb597',
        accentColor: '#823b19',
        badgeText: 'Multiempresa',
        address: 'Sedes Lima Metrópolis',
      };
    }
    return (
      companies.find((c) => c.id === activeCompanyId) || companies[0]
    );
  }, [activeCompanyId, companies]);

  // Filtered views by active company
  const filteredTables = useMemo(() => {
    if (activeCompanyId === 'todas') return tables;
    return tables.filter((t) => t.companyId === activeCompanyId);
  }, [tables, activeCompanyId]);

  const filteredProducts = useMemo(() => {
    if (activeCompanyId === 'todas') return products;
    return products.filter((p) => p.companyId === activeCompanyId);
  }, [products, activeCompanyId]);

  const filteredTransactions = useMemo(() => {
    if (activeCompanyId === 'todas') return transactions;
    return transactions.filter(
      (t) => !t.companyId || t.companyId === activeCompanyId
    );
  }, [transactions, activeCompanyId]);

  const filteredBankAccounts = useMemo(() => {
    if (activeCompanyId === 'todas') return bankAccounts;
    return bankAccounts.filter((b) => b.companyId === activeCompanyId);
  }, [bankAccounts, activeCompanyId]);

  const filteredPaymentMethods = useMemo(() => {
    if (activeCompanyId === 'todas') return paymentMethods;
    return paymentMethods.filter((p) => p.companyId === activeCompanyId);
  }, [paymentMethods, activeCompanyId]);

  const activeShift = useMemo<ShiftType>(() => {
    if (activeCompanyId === 'el-sabroso') return companyShifts['el-sabroso'] || 'Día';
    return companyShifts['el-tayta'] || 'Día';
  }, [activeCompanyId, companyShifts]);

  // Recalculate Order Subtotal, IGV and Total
  const recalculateOrder = (order: Order): Order => {
    return { ...order, ...orderTotalsFromItems(order.items) };
  };

  // KARDEX DEDUCTION ENGINE: Explode recipe and deduct ingredients
  const deductIngredientsForOrder = (order: Order, reasonLabel: string) => {
    const newKardexItems: KardexMovement[] = [];
    const stockDeductions: Record<string, number> = {};

    order.items.forEach((item) => {
      // Find matching recipe for the product
      const recipe = matchingRecipe<Recipe>(recipes, order.companyId, item);
      if (recipe && recipe.ingredients.length > 0) {
        recipe.ingredients.forEach((ing) => {
          const qtyNeeded = +(ing.quantity * item.quantity).toFixed(3);
          stockDeductions[ing.insumoId] =
            (stockDeductions[ing.insumoId] || 0) + qtyNeeded;

          const currentIns = insumos.find((i) => i.id === ing.insumoId);
          const currentStock = currentIns ? currentIns.currentStock : 10;
          const cost = ing.costPerUnit || (currentIns ? currentIns.costPerUnit : 10);

          newKardexItems.push({
            id: `kdx-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            companyId: order.companyId,
            timestamp: Date.now(),
            date: 'Hoy',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            insumoId: ing.insumoId,
            insumoName: ing.insumoName,
            type: 'SALIDA_VENTA_POS',
            referenceDoc: `${reasonLabel} #${order.ticketNumber} (${item.quantity}x ${item.name})`,
            quantity: -qtyNeeded,
            unit: ing.unit,
            unitCost: cost,
            totalCost: +(qtyNeeded * cost).toFixed(2),
            stockBefore: currentStock,
            stockAfter: +(currentStock - qtyNeeded).toFixed(2),
            notes: `Consumo automático según Ficha Técnica (${recipe.productName})`,
          });
        });
      }
    });

    if (newKardexItems.length > 0) {
      // Update Kardex log
      setKardexMovements((prev) => [...newKardexItems, ...prev]);

      // Deduct from Insumos currentStock
      setInsumos((prev) =>
        prev.map((ins) => {
          if (stockDeductions[ins.id]) {
            const newStock = +(ins.currentStock - stockDeductions[ins.id]).toFixed(2);
            return {
              ...ins,
              currentStock: newStock,
            };
          }
          return ins;
        })
      );

      addNotification(
        'Kardex Actualizado',
        `Se descontaron ${newKardexItems.length} insumos según las recetas de la comanda #${order.ticketNumber}.`,
        'success'
      );
    }
  };

  // Select and Open Table
  const selectAndOpenTable = (tableId: string) => {
    const table = tables.find((t) => t.id === tableId);
    if (!table) return;

    setSelectedTableId(tableId);

    if (table.status === 'libre') {
      // Apertura perezosa: entrar a mirar NO ocupa ni crea orden en BD.
      // La orden real se crea al agregar el primer producto (addItemToOrder).
      // Si quedó un currentOrderId huérfano de una versión anterior, se conserva
      // para mostrar sus ítems; si no hay orden, simplemente se selecciona.
      setSelectedTableId(tableId);
      setCurrentScreen('pedido');
      if (!table.currentOrderId || !orders[table.currentOrderId]) {
        addNotification(
          `Mesa ${table.number} lista`,
          'Agrega productos para abrir la comanda.',
          'info'
        );
      }
    } else if (table.status === 'ocupada') {
      setCurrentScreen('pedido');
    } else if (table.status === 'por_cobrar') {
      setCurrentScreen('cobro');
    }
  };

  const openQuickOrder = (zone: Zone = 'Barra') => {
    const compId = activeCompanyId === 'todas' ? 'el-tayta' : activeCompanyId;
    const freeBarra =
      tables.find(
        (t) => t.companyId === compId && t.zone === zone && t.status === 'libre'
      ) ||
      tables.find((t) => t.companyId === compId && t.status === 'libre');

    if (freeBarra) {
      selectAndOpenTable(freeBarra.id);
    } else {
      const newNum = `B${tables.filter((t) => t.zone === 'Barra').length + 1}`;
      const newId = `t-express-${Date.now()}`;
      const newTable: Table = {
        id: newId,
        companyId: compId,
        number: newNum,
        capacity: 2,
        zone: 'Barra',
        status: 'libre',
      };
      setTables((prev) => [...prev, newTable]);
      setSelectedTableId(newId);
      setCurrentScreen('pedido');
      addNotification(`Mesa ${newNum} lista`, 'Agrega productos para abrir la comanda de barra.', 'info');
    }
  };

  // Add Item to Order
  const addItemToOrder = (tableId: string, product: Product, notes: string = '') => {
    const targetTable = tables.find((t) => t.id === tableId);
    const currentProduct = products.find((p) => p.id === product.id);
    if (!currentProduct?.available || currentProduct.isDeleted || currentProduct.companyId !== targetTable?.companyId) {
      addNotification('Producto no disponible', 'El producto no está disponible para esta mesa.', 'warning');
      return;
    }
    product = currentProduct;
    const table = tables.find((t) => t.id === tableId);
    if (!table) return;

    let orderId = table.currentOrderId;
    let currentOrder = orderId ? orders[orderId] : null;

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (!currentOrder) {
      // Apertura perezosa: la orden real se crea recién al primer producto.
      // Mesas normales → POST /operations/orders/open.
      // Mesas temporales de barra (t-express-*) → POST /operations/orders/quick-bar
      // (el server crea la mesa real y la orden; se migra el tmp local).
      const isExpressTmp = table.id.startsWith('t-express-');
      const tmpOrderId = `order-tmp-${Date.now()}`;
      const tmpClientOpId = newUuid();
      const ticketNumber = `${Math.floor(10000 + Math.random() * 90000)}`;
      const waiterName = currentUser?.name || 'Carlos M.';
      const baseOrder: Order = {
        id: tmpOrderId,
        companyId: table.companyId,
        ticketNumber,
        tableId: table.id,
        tableNumber: table.number,
        zone: table.zone,
        waiter: waiterName,
        items: [],
        createdAt: timeStr,
        subtotal: 0,
        igv: 0,
        total: 0,
        status: 'abierto',
      };
      const firstItem: OrderItem = {
        id: `item-${Date.now()}-${Math.random()}`,
        productId: product.id,
        name: product.name,
        price: product.price,
        quantity: 1,
        notes: notes || undefined,
        status: 'agregado',
        addedAt: timeStr,
      };
      const createdOrder = recalculateOrder({ ...baseOrder, items: [firstItem] });
      orderId = tmpOrderId;
      currentOrder = createdOrder;
      const openingOp: PendingOp = { clientOpId: tmpClientOpId, entity: 'order', op: isExpressTmp ? 'quickOrder' : 'openOrder',
        payload: isExpressTmp ? { companyId: table.companyId, waiter: waiterName, clientOpId: tmpClientOpId, tmpOrderId, tmpTableId: tableId }
          : { tableId, waiter: waiterName, clientOpId: tmpClientOpId, tmpOrderId }, createdAt: new Date().toISOString() };
      try { stageOrderOperation(openingOp); }
      catch (error) { addNotification('No se pudo guardar el pedido', (error as Error).message, 'warning'); return; }
      syncPendingCount();
      setOrders((prev) => ({ ...prev, [tmpOrderId]: createdOrder }));
      setTables((prev) =>
        prev.map((t) =>
          t.id === tableId
            ? {
                ...t,
                status: t.status === 'libre' ? 'ocupada' : t.status,
                currentOrderId: tmpOrderId,
                occupiedSince: t.occupiedSince || timeStr,
                minutesElapsed: t.minutesElapsed ?? 1,
                waiter: t.waiter || waiterName,
              }
            : t
        )
      );
      tmpOrderItemsRef.current[tmpOrderId] = createdOrder.items;
      tmpOrderOpRef.current[tmpOrderId] = tmpClientOpId;
      if (isExpressTmp) {
        attemptMutation({
          clientOpId: tmpClientOpId,
          entity: 'order',
          op: 'quickOrder',
          queuePayload: { companyId: table.companyId, waiter: waiterName, clientOpId: tmpClientOpId, tmpOrderId, tmpTableId: tableId },
          endpointOp: async () => {
            const res = await apiClient.post<OrderDTO>('/operations/orders/quick-bar', {
              companyId: table.companyId,
              waiter: waiterName,
              clientOpId: tmpClientOpId,
            });
            await finishOpening(res, tmpOrderId, tableId);
            removeByClientOpId(tmpClientOpId);
            syncPendingCount();
          },
          rollback: () => {
            removeByClientOpId(tmpClientOpId);
            syncPendingCount();
            delete tmpOrderItemsRef.current[tmpOrderId];
            delete tmpOrderOpRef.current[tmpOrderId];
            setOrders((prev) => {
              const next = { ...prev };
              delete next[tmpOrderId];
              return next;
            });
            setTables((prev) => prev.filter((t) => t.id !== tableId || t.currentOrderId !== tmpOrderId));
            setSelectedTableId(null);
          },
        });
        return;
      }
      attemptMutation({
        clientOpId: tmpClientOpId,
        entity: 'order',
        op: 'openOrder',
        queuePayload: { tableId, waiter: createdOrder.waiter, clientOpId: tmpClientOpId, tmpOrderId },
        endpointOp: async () => {
          const res = await apiClient.post<OrderDTO>('/operations/orders/open', {
            tableId,
            waiter: createdOrder.waiter,
            clientOpId: tmpClientOpId,
          });
          await finishOpening(res, tmpOrderId);
          removeByClientOpId(tmpClientOpId);
          syncPendingCount();
        },
        rollback: () => {
          removeByClientOpId(tmpClientOpId);
          syncPendingCount();
          delete tmpOrderItemsRef.current[tmpOrderId];
          delete tmpOrderOpRef.current[tmpOrderId];
          setOrders((prev) => {
            const next = { ...prev };
            delete next[tmpOrderId];
            return next;
          });
          setTables((prev) =>
            prev.map((t) =>
              t.id === tableId && t.currentOrderId === tmpOrderId
                ? {
                    ...t,
                    status: 'libre',
                    occupiedSince: undefined,
                    minutesElapsed: undefined,
                    currentOrderId: undefined,
                    waiter: undefined,
                  }
                : t
            )
          );
        },
      });
      return;
    }

    const existingIndex = currentOrder.items.findIndex(
      (item) => item.productId === product.id && (item.notes || '') === (notes || '')
    );

    let updatedItems: OrderItem[];
    if (existingIndex > -1) {
      updatedItems = currentOrder.items.map((item, idx) =>
        idx === existingIndex ? { ...item, quantity: item.quantity + 1 } : item
      );
    } else {
      const newItem: OrderItem = {
        id: `item-${Date.now()}-${Math.random()}`,
        productId: product.id,
        name: product.name,
        price: product.price,
        quantity: 1,
        notes: notes || undefined,
        status: 'agregado',
        addedAt: timeStr,
      };
      updatedItems = [...currentOrder.items, newItem];
    }

    const updatedOrder = recalculateOrder({
      ...currentOrder,
      items: updatedItems,
    });

    setOrders((prev) => ({ ...prev, [orderId!]: updatedOrder }));
    setTables((prev) =>
      prev.map((t) =>
        t.id === tableId
          ? {
              ...t,
              status: t.status === 'libre' ? 'ocupada' : t.status,
              currentOrderId: orderId,
              occupiedSince: t.occupiedSince || timeStr,
            }
          : t
      )
    );

    // Write-through (Fase E3): si la orden ya existe en el server, agrega el ítem real.
    // La apertura (orden temporal) hará flush de ítems al resolverse en el server.
    // Nota gap #5: quantity:1 es el DELTA de este click (el server hace merge por
    // producto+nota con increment). El flush de tmp (openOrder/quickOrder/replay)
    // sí envía la cantidad acumulada por línea. No cambiar a acumulado aquí.
    const serverIssued = !!orderId && !orderId.startsWith('order-tmp-');
    if (serverIssued) {
      attemptMutation({
        clientOpId: newUuid(),
        entity: 'orderItem',
        op: 'addItem',
        queuePayload: {
          orderId,
          productId: product.id,
          quantity: 1,
          notes: notes || undefined,
        },
        endpointOp: async () => {
          const res = await apiClient.post<OrderDTO>(`/operations/orders/${orderId}/items`, {
            productId: product.id,
            quantity: 1,
            notes: notes || undefined,
          });
          reconcileOrderResult(res);
        },
      });
    } else if (orderId) {
      tmpOrderItemsRef.current[orderId] = updatedOrder.items;
    }
  };

  const abandonOpening = (orderId: string): boolean => {
    const openingClientOpId = tmpOrderOpRef.current[orderId] ?? loadQueue().find((op) => (op.payload as Record<string, unknown>)?.tmpOrderId === orderId)?.clientOpId;
    if (!openingClientOpId) return false;
    const cancelOp: PendingOp = { clientOpId: newUuid(), entity: 'order', op: 'cancelOpening', payload: { openingClientOpId }, createdAt: new Date().toISOString() };
    try { stageOrderOperation(cancelOp, openingClientOpId); }
    catch (error) { addNotification('No se pudo guardar la cancelación', (error as Error).message, 'warning'); return false; }
    // [] es una marca explícita mientras la petición de apertura está en vuelo.
    tmpOrderItemsRef.current[orderId] = [];
    syncPendingCount();
    void attemptMutation({ clientOpId: cancelOp.clientOpId, entity: 'order', op: 'cancelOpening', queuePayload: cancelOp.payload,
      endpointOp: async () => {
        const result = await apiClient.post<OrderDTO | { cancelled: true }>('/operations/orders/cancel-opening', { openingClientOpId });
        if ('id' in result) reconcileOrderResult(result);
        removeByClientOpId(cancelOp.clientOpId);
        syncPendingCount();
      },
    });
    return true;
  };

  const vacateTableState = (tableId: string, orderId: string) => {
    const table = tables.find((t) => t.id === tableId);
    setTables((prev) =>
      prev.map((t) =>
        t.id === tableId && t.currentOrderId === orderId
          ? {
              ...t,
              status: 'libre',
              occupiedSince: undefined,
              minutesElapsed: undefined,
              currentOrderId: undefined,
              waiter: undefined,
            }
          : t
      )
    );
    setOrders((prev) => {
      const next = { ...prev };
      delete next[orderId];
      return next;
    });
    if (tablesRef.current.find((t) => t.id === tableId)?.currentOrderId === orderId) {
      setSelectedTableId(null);
      setCurrentScreen('mesas');
    }
    if (table) {
      addNotification(
        'Mesa Liberada',
        `Comanda vacía en mesa ${table.number}: la mesa quedó libre.`,
        'info'
      );
    }
  };

  const updateItemQuantity = (tableId: string, itemId: string, delta: number) => {
    const table = tables.find((t) => t.id === tableId);
    if (!table || !table.currentOrderId) return;

    const currentOrder = orders[table.currentOrderId];
    if (!currentOrder) return;

    if (delta > 0) {
      const item = currentOrder.items.find((i) => i.id === itemId);
      const product = products.find((p) => p.id === item?.productId);
      if (!product || !product.available || product.isDeleted || product.companyId !== table.companyId) {
        addNotification('Producto no disponible', 'No se pueden agregar unidades de este producto.', 'warning');
        return;
      }
    }

    const updatedItems = currentOrder.items
      .map((item) => {
        if (item.id === itemId) {
          const newQty = item.quantity + delta;
          return newQty > 0 ? { ...item, quantity: newQty } : null;
        }
        return item;
      })
      .filter(Boolean) as OrderItem[];

    const updatedOrder = recalculateOrder({
      ...currentOrder,
      items: updatedItems,
    });

    const mutationId = newUuid();
    const orderId = table.currentOrderId;
    if (!orderId.startsWith('order-tmp-')) {
      try { stageOrderOperation({ clientOpId: mutationId, entity: 'orderItem', op: 'updateItemQuantity', payload: { orderId, itemId, delta }, createdAt: new Date().toISOString() }); }
      catch (error) { addNotification('No se pudo guardar el cambio', (error as Error).message, 'warning'); return; }
      syncPendingCount();
    }
    const becomingEmpty = updatedItems.length === 0;
    const prevTableIdFields = {
      status: table.status,
      occupiedSince: table.occupiedSince,
      minutesElapsed: table.minutesElapsed,
      currentOrderId: table.currentOrderId,
      waiter: table.waiter,
    };

    if (becomingEmpty) {
      const prevScreen = currentScreen;
      const prevSelectedTableId = selectedTableId;
      if (orderId.startsWith('order-tmp-') && !abandonOpening(orderId)) return;
      vacateTableState(tableId, orderId);
      // Write-through (Fase E3): solo si la orden ya existe en el server.
      if (!orderId.startsWith('order-tmp-')) {
        attemptMutation({
          clientOpId: mutationId,
          entity: 'orderItem',
          op: 'updateItemQuantity',
          queuePayload: { orderId, itemId, delta },
          endpointOp: async () => {
            const res = await apiClient.patch<OrderDTO>(
              `/operations/orders/${orderId}/items/${itemId}/quantity`,
              { delta, clientOpId: mutationId }
            );
            // El servidor devuelve el estado definitivo del pedido vacío.
            // Refrescamos para reflejar la verdad del servidor.
            reconcileOrderResult(res);
            removeByClientOpId(mutationId);
            syncPendingCount();
          },
          rollback: () => {
            removeByClientOpId(mutationId);
            syncPendingCount();
            setTables((prev) =>
              prev.map((t) => (t.id === tableId && (!t.currentOrderId || t.currentOrderId === orderId) ? { ...t, ...prevTableIdFields } : t))
            );
            setOrders((prev) => ({ ...prev, [orderId]: currentOrder }));
            const current = tablesRef.current.find((t) => t.id === tableId)?.currentOrderId;
            if (!current || current === orderId) {
              setSelectedTableId(prevSelectedTableId);
              setCurrentScreen(prevScreen);
            }
          },
        });
      }
      return;
    }

    if (orderId.startsWith('order-tmp-')) tmpOrderItemsRef.current[orderId] = updatedItems;
    setOrders((prev) => ({ ...prev, [orderId]: updatedOrder }));

    // Write-through (Fase E3): solo si la orden ya existe en el server.
    if (orderId && !orderId.startsWith('order-tmp-')) {
      attemptMutation({
        clientOpId: mutationId,
        entity: 'orderItem',
        op: 'updateItemQuantity',
        queuePayload: { orderId, itemId, delta },
        endpointOp: async () => {
          const res = await apiClient.patch<OrderDTO>(
            `/operations/orders/${orderId}/items/${itemId}/quantity`,
            { delta, clientOpId: mutationId }
          );
          reconcileOrderResult(res);
          removeByClientOpId(mutationId);
          syncPendingCount();
        },
        rollback: () => { removeByClientOpId(mutationId); syncPendingCount(); },
      });
    }
  };

  const updateItemNotes = (tableId: string, itemId: string, notes: string) => {
    const table = tables.find((t) => t.id === tableId);
    if (!table || !table.currentOrderId) return;

    const currentOrder = orders[table.currentOrderId];
    if (!currentOrder) return;

    const updatedItems = currentOrder.items.map((item) =>
      item.id === itemId ? { ...item, notes } : item
    );

    const updatedOrder = { ...currentOrder, items: updatedItems };
    if (table.currentOrderId.startsWith('order-tmp-')) tmpOrderItemsRef.current[table.currentOrderId] = updatedItems;
    setOrders((prev) => ({ ...prev, [table.currentOrderId!]: updatedOrder }));
    addNotification('Nota actualizada', 'Nota guardada para el pedido.', 'info');

    // Write-through (Fase E3): solo si la orden ya existe en el server.
    const orderId = table.currentOrderId;
    if (orderId && !orderId.startsWith('order-tmp-')) {
      attemptMutation({
        clientOpId: newUuid(),
        entity: 'orderItem',
        op: 'updateItemNotes',
        queuePayload: { orderId, itemId, notes },
        endpointOp: async () => {
          const res = await apiClient.patch<OrderItemDTO>(`/operations/orders/${orderId}/items/${itemId}/notes`, {
            notes: notes || undefined,
          });
          setOrders((prev) => {
            const target = prev[orderId];
            if (!target) return prev;
            return {
              ...prev,
              [orderId]: {
                ...target,
                items: target.items.map((i) => (i.id === itemId ? { ...i, notes: res.notes || notes } : i)),
              },
            };
          });
        },
      });
    }
  };

  const removeItemFromOrder = (tableId: string, itemId: string) => {
    const table = tables.find((t) => t.id === tableId);
    if (!table || !table.currentOrderId) return;

    const currentOrder = orders[table.currentOrderId];
    if (!currentOrder) return;

    const updatedItems = currentOrder.items.filter((item) => item.id !== itemId);
    const updatedOrder = recalculateOrder({
      ...currentOrder,
      items: updatedItems,
    });

    const mutationId = newUuid();
    const orderId = table.currentOrderId;
    if (!orderId.startsWith('order-tmp-')) {
      try { stageOrderOperation({ clientOpId: mutationId, entity: 'orderItem', op: 'removeItem', payload: { orderId, itemId }, createdAt: new Date().toISOString() }); }
      catch (error) { addNotification('No se pudo guardar el cambio', (error as Error).message, 'warning'); return; }
      syncPendingCount();
    }
    const becomingEmpty = updatedItems.length === 0;
    const prevTableIdFields = {
      status: table.status,
      occupiedSince: table.occupiedSince,
      minutesElapsed: table.minutesElapsed,
      currentOrderId: table.currentOrderId,
      waiter: table.waiter,
    };

    if (becomingEmpty) {
      const prevScreen = currentScreen;
      const prevSelectedTableId = selectedTableId;
      if (orderId.startsWith('order-tmp-') && !abandonOpening(orderId)) return;
      vacateTableState(tableId, orderId);
      // Write-through (Fase E3): solo si la orden ya existe en el server.
      if (!orderId.startsWith('order-tmp-')) {
        attemptMutation({
          clientOpId: mutationId,
          entity: 'orderItem',
          op: 'removeItem',
          queuePayload: { orderId, itemId },
          endpointOp: async () => {
            const res = await apiClient.del<OrderDTO>(`/operations/orders/${orderId}/items/${itemId}?clientOpId=${encodeURIComponent(mutationId)}`);
            // El servidor devuelve el estado definitivo del pedido vacío.
            // Refrescamos para reflejar la verdad del servidor.
            reconcileOrderResult(res);
            removeByClientOpId(mutationId);
            syncPendingCount();
          },
          rollback: () => {
            removeByClientOpId(mutationId);
            syncPendingCount();
            setTables((prev) =>
              prev.map((t) => (t.id === tableId && (!t.currentOrderId || t.currentOrderId === orderId) ? { ...t, ...prevTableIdFields } : t))
            );
            setOrders((prev) => ({ ...prev, [orderId]: currentOrder }));
            const current = tablesRef.current.find((t) => t.id === tableId)?.currentOrderId;
            if (!current || current === orderId) {
              setSelectedTableId(prevSelectedTableId);
              setCurrentScreen(prevScreen);
            }
          },
        });
      }
      return;
    }

    if (orderId.startsWith('order-tmp-')) tmpOrderItemsRef.current[orderId] = updatedItems;
    setOrders((prev) => ({ ...prev, [orderId]: updatedOrder }));

    // Write-through (Fase E3): solo si la orden ya existe en el server.
    if (orderId && !orderId.startsWith('order-tmp-')) {
      attemptMutation({
        clientOpId: mutationId,
        entity: 'orderItem',
        op: 'removeItem',
        queuePayload: { orderId, itemId },
        endpointOp: async () => {
          const res = await apiClient.del<OrderDTO>(`/operations/orders/${orderId}/items/${itemId}?clientOpId=${encodeURIComponent(mutationId)}`);
          reconcileOrderResult(res);
          removeByClientOpId(mutationId);
          syncPendingCount();
        },
        rollback: () => { removeByClientOpId(mutationId); syncPendingCount(); },
      });
    }
  };

  // Send to kitchen (Triggers Recipe Kardex deduction)
  // Regla "no cobrar sin despacho": retorna true si el despacho quedó confirmado
  // ('ok') o encolado offline ('queued'); false si fue rechazado o no procede.
  const sendToKitchen = async (tableId: string): Promise<boolean> => {
    const table = tables.find((t) => t.id === tableId);
    if (!table || !table.currentOrderId) return false;

    const currentOrder = orders[table.currentOrderId];
    if (!currentOrder || currentOrder.items.length === 0) {
      addNotification('Comanda Vacía', 'Agrega productos antes de enviar a cocina.', 'warning');
      return false;
    }

    const updatedItems: OrderItem[] = currentOrder.items.map((item) => ({
      ...item,
      status: 'en_cocina',
    }));

    const updatedOrder: Order = {
      ...currentOrder,
      status: 'en_cocina',
      items: updatedItems,
    };

    // Snapshot para rollback (gap #2): si el server rechaza con 4xx se revierte
    // el pase a en_cocina + la deducción local de kardex/stock.
    const prevOrderStatus = currentOrder.status;
    const prevItemsStatus = currentOrder.items.map((i) => ({ id: i.id, status: i.status }));
    const prevStocks = new Map(insumos.map((i) => [i.id, i.currentStock]));
    const prevKardexLen = kardexMovements.length;
    const prevTableStatus = table.status;

    setOrders((prev) => ({ ...prev, [table.currentOrderId!]: updatedOrder }));
    setTables((prev) =>
      prev.map((t) =>
        t.id === tableId
          ? {
              ...t,
              status: 'ocupada',
            }
          : t
      )
    );

    // Auto-deduct from Kardex on kitchen dispatch
    deductIngredientsForOrder(updatedOrder, 'Despacho Cocina');

    // Write-through (Fase E3): descuenta en el server + refresca coloniales (Kardex/insumos).
    // En modo offline la deducción local queda y la op se encola.
    // (E4: también se encola si la orden es temporal y estamos offline — el replay la re-resuelve.)
    const orderId = table.currentOrderId;
    let outcome: 'ok' | 'queued' | 'rejected' = 'ok';
    if (orderId && (!orderId.startsWith('order-tmp-') || offlineState.isSimulatedOffline || loadQueue().some((op) => (op.payload as { tmpOrderId?: string }).tmpOrderId === orderId))) {
      const clientOpId = newUuid();
      outcome = await attemptMutation({
        clientOpId,
        entity: 'order',
        op: 'sendToKitchen',
        queuePayload: { orderId, clientOpId },
        endpointOp: async () => {
          const res = await apiClient.post<{ order: OrderDTO; kardexMovements?: number }>(
            `/operations/orders/${orderId}/send-to-kitchen`,
            { clientOpId }
          );
          setOrders((prev) => {
            const serverOrder = mapOrder(res.order);
            const prevItems = prev[orderId]?.items;
            return {
              ...prev,
              [orderId]:
                serverOrder.items.length > 0 ? serverOrder : { ...serverOrder, items: prevItems ?? [] },
            };
          });
          await Promise.all([refreshKardex(), refreshInsumos()]);
        },
        rollback: () => {
          setOrders((prev) => {
            const target = prev[orderId];
            if (!target) return prev;
            return {
              ...prev,
              [orderId]: {
                ...target,
                status: prevOrderStatus,
                items: target.items.map((it) => {
                  const snap = prevItemsStatus.find((s) => s.id === it.id);
                  return snap ? { ...it, status: snap.status } : it;
                }),
              },
            };
          });
          setTables((prev) =>
            prev.map((t) => (t.id === tableId ? { ...t, status: prevTableStatus } : t))
          );
          setInsumos((prev) =>
            prev.map((ins) => {
              const snap = prevStocks.get(ins.id);
              return snap !== undefined ? { ...ins, currentStock: snap } : ins;
            })
          );
          // Revierte la deducción optimista (los ítems nuevos se prependean).
          setKardexMovements((prev) => prev.slice(Math.max(0, prev.length - prevKardexLen)));
        },
      });
    }

    if (outcome !== 'rejected') {
      addNotification(
        'Comanda Enviada a Cocina',
        `Mesa ${table.number} (${table.companyId === 'el-tayta' ? 'El Tayta' : 'El Sabroso'}) • Insumos rebajados de Kardex.`,
        'success'
      );
    }

    return outcome !== 'rejected';
  };

  // Regla "no cobrar sin despacho": si hay ítems 'agregado' (nunca enviados a
  // cocina → Kardex sin descontar) se abre el modal de confirmación en vez de
  // navegar al cobro. Las lecturas van por refs para evitar cierres stale.
  const proceedToPayment = (tableId: string) => {
    const table = tablesRef.current.find((t) => t.id === tableId);
    if (!table || !table.currentOrderId) return;

    const currentOrder = ordersRef.current[table.currentOrderId];
    if (!currentOrder || currentOrder.items.length === 0) {
      addNotification('Sin productos', 'No hay ítems para cobrar en esta mesa.', 'warning');
      return;
    }

    const pendingCount = currentOrder.items.filter((i) => i.status === 'agregado').length;
    if (pendingCount > 0) {
      setPendingKitchenConfirm({ tableId, itemCount: pendingCount });
      return;
    }
    finishProceedToPayment(tableId);
  };

  // Navega al cobro (solo llamado cuando la comanda ya está despachada).
  const finishProceedToPayment = (tableId: string) => {
    const table = tablesRef.current.find((t) => t.id === tableId);
    if (!table || !table.currentOrderId) return;

    const orderId = table.currentOrderId;
    const currentOrder = ordersRef.current[orderId];
    if (!currentOrder) return;

    setTables((prev) =>
      prev.map((t) =>
        t.id === tableId
          ? {
              ...t,
              status: 'por_cobrar',
            }
          : t
      )
    );

    // Se usa el updater (estado fresco) para no pisar los ítems ya despachados
    // con una copia stale de `currentOrder`.
    setOrders((prev) => {
      const target = prev[orderId];
      if (!target) return prev;
      return { ...prev, [orderId]: { ...target, status: 'por_cobrar' } };
    });

    setSelectedTableId(tableId);
    setCurrentScreen('cobro');
    setPendingKitchenConfirm(null);

    // Nuevo orden: la BOLETA de la cuenta se muestra ANTES del cobro para que
    // el cliente la revise/imprima/comparta; el botón "Continuar al pago" cierra
    // el modal y queda en la pantalla de Resumen + Método de Pago.
    setReceiptMode('preview');
    setLastCompletedOrder({ ...currentOrder });
    setIsReceiptModalOpen(true);

    // Write-through (Fase E3): persiste el estado "por cobrar" en el server.
    // (E4: también se encola si la orden es temporal y estamos offline.)
    if (orderId && (!orderId.startsWith('order-tmp-') || offlineState.isSimulatedOffline || loadQueue().some((op) => (op.payload as { tmpOrderId?: string }).tmpOrderId === orderId))) {
      const prevTableStatus = table.status;
      const prevOrderStatus = currentOrder.status;
      attemptMutation({
        clientOpId: newUuid(),
        entity: 'order',
        op: 'markForBilling',
        queuePayload: { orderId, tableId, tmpTableId: orderId.startsWith('order-tmp-') ? tableId : undefined },
        endpointOp: async () => {
          const res = await apiClient.post<OrderDTO>(`/operations/tables/${tableId}/por-cobrar`);
          reconcileOrderResult(res);
        },
        rollback: () => {
          setTables((prev) =>
            prev.map((t) => (t.id === tableId ? { ...t, status: prevTableStatus } : t))
          );
          setOrders((prev) => {
            const target = prev[orderId];
            if (!target) return prev;
            return { ...prev, [orderId]: { ...target, status: prevOrderStatus } };
          });
        },
      });
    }
  };

  // Acción del modal híbrido: despacha a cocina (Kardex queda descontado) y,
  // si todo va bien ('ok' online / 'queued' offline), continúa al cobro.
  const confirmDispatchAndProceed = async (tableId: string) => {
    const dispatched = await sendToKitchen(tableId);
    if (!dispatched) {
      // Rechazado por el server (4xx): rollback ya restauró la comanda y
      // attemptMutation avisó. No navegamos al cobro.
      setPendingKitchenConfirm(null);
      return;
    }
    finishProceedToPayment(tableId);
  };

  const dismissKitchenConfirm = () => setPendingKitchenConfirm(null);

  // Complete Payment
  const completePayment = (
    tableId: string,
    paymentMethod: PaymentMethod | string,
    amountReceived: number,
    customPaymentMethodId?: string,
    referenceNumber?: string
  ): Order | null => {
    const table = tables.find((t) => t.id === tableId);
    if (!table || !table.currentOrderId) return null;

    const currentOrder = orders[table.currentOrderId];
    if (!currentOrder) return null;

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const change = Math.max(0, +(amountReceived - currentOrder.total).toFixed(2));

    // Look up custom payment method to find associated bank account if any
    const matchedPm = resolvePaymentMethod(paymentMethods, table.companyId, paymentMethod, customPaymentMethodId);
    // A stale explicit ID must never silently route the payment by name.
    if (customPaymentMethodId && !matchedPm) return null;

    const bankAccountId = matchedPm?.bankAccountId;
    const bankAccountAlias = matchedPm?.bankAccountAlias;

    // Update bank account balance if connected
    if (bankAccountId) {
      setBankAccounts((prev) =>
        prev.map((acc) =>
          acc.id === bankAccountId
            ? { ...acc, currentBalance: +(acc.currentBalance + currentOrder.total).toFixed(2) }
            : acc
        )
      );
    }

    const currentCompanyShift =
      companyShifts[table.companyId as CompanyId] || 'Día';

    const finalizedOrder: Order = {
      ...currentOrder,
      status: 'cobrado',
      paymentMethod,
      amountReceived,
      change,
      closedAt: timeStr,
    };

    // 1. Transaction in ledger
    const isBarra = table.zone === 'Barra';
    const txType: TransactionType = isBarra ? 'Venta (Barra)' : 'Venta (Mesa)';
    const newTransaction: Transaction = {
      id: `tx-${Date.now()}`,
      companyId: table.companyId,
      time: timeStr,
      date: 'Hoy',
      timestamp: Date.now(),
      type: txType,
      description: `Pago ${paymentMethod}${bankAccountAlias ? ` (${bankAccountAlias})` : ''} - Ticket #${finalizedOrder.ticketNumber} (${table.companyId === 'el-tayta' ? 'El Tayta' : 'El Sabroso'} - ${table.number})`,
      amount: finalizedOrder.total,
      isIncome: true,
      paymentMethod,
      tableNumber: table.number,
      orderId: finalizedOrder.id,
      ticketNumber: finalizedOrder.ticketNumber,
      bankAccountId,
      bankAccountAlias,
      referenceNumber: referenceNumber || undefined,
      shift: currentCompanyShift,
    };

    setTransactions((prev) => [newTransaction, ...prev]);

    // 2. Free Table
    setTables((prev) =>
      prev.map((t) =>
        t.id === tableId
          ? {
              ...t,
              status: 'libre',
              occupiedSince: undefined,
              minutesElapsed: undefined,
              currentOrderId: undefined,
              waiter: undefined,
            }
          : t
      )
    );

    // 3. Save finalized order
    setOrders((prev) => ({ ...prev, [finalizedOrder.id]: finalizedOrder }));
    setReceiptMode('paid');
    setLastCompletedOrder(finalizedOrder);
    setIsReceiptModalOpen(true);

    addNotification(
      'Pago Confirmado y Mesa Liberada',
      `Mesa ${table.number} cobrada: S/ ${finalizedOrder.total.toFixed(2)} (${paymentMethod}${bankAccountAlias ? ` → ${bankAccountAlias}` : ''}).`,
      'success'
    );

    // Write-through (Fase E3): registra el pago real (marca cobrado + transacción de caja).
    // (E4: también se encola si la orden es temporal y estamos offline.)
    const orderId = table.currentOrderId;
    if (!orderId.startsWith('order-tmp-') || offlineState.isSimulatedOffline || loadQueue().some((op) => (op.payload as { tmpOrderId?: string }).tmpOrderId === orderId)) {
      const clientOpId = newUuid();
      attemptMutation({
        clientOpId,
        entity: 'order',
        op: 'payOrder',
        queuePayload: {
          orderId,
          tableId,
          tmpTableId: orderId.startsWith('order-tmp-') ? tableId : undefined,
          paymentMethod: paymentMethod as string,
          amountReceived,
          customPaymentMethodId,
          referenceNumber: referenceNumber || undefined,
          clientOpId,
        },
        endpointOp: async () => {
          const res = await apiClient.post<{ order: OrderDTO; transaction: TransactionDTO }>(
            `/operations/tables/${table.id}/pay`,
            {
              paymentMethod: paymentMethod as string,
              amountReceived,
              customPaymentMethodId,
              referenceNumber: referenceNumber || undefined,
              clientOpId,
            }
          );
          const serverOrder = mapOrder(res.order);
          const serverTx = mapTransaction(res.transaction);
          setOrders((prev) => ({ ...prev, [serverOrder.id]: serverOrder }));
          setTransactions((prev) =>
            prev.some((t) => t.id === serverTx.id)
              ? prev
              : [serverTx, ...prev]
          );
          // Voucher siempre: re-afirma el modal con los datos reales del server
          // (belt & suspenders: sobrevive a cualquier cierre intermedio).
          setReceiptMode('paid');
          setLastCompletedOrder(serverOrder);
          setIsReceiptModalOpen(true);
          await Promise.all([refreshTransactions(), refreshBankAccounts()]);
        },
        rollback: () => {
          if (bankAccountId) {
            setBankAccounts((prev) =>
              prev.map((acc) =>
                acc.id === bankAccountId
                  ? { ...acc, currentBalance: +(acc.currentBalance - currentOrder.total).toFixed(2) }
                  : acc
              )
            );
          }
          // Gap #3 fix: rollback completo — quitar tx optimista, revertir orden a
          // por_cobrar, cerrar recibo. La mesa vuelve a por_cobrar vinculada.
          setTransactions((prev) => prev.filter((t) => t.id !== newTransaction.id));
          setOrders((prev) => {
            const target = prev[currentOrder.id];
            if (!target) return prev;
            return { ...prev, [currentOrder.id]: { ...target, status: 'por_cobrar' } };
          });
          setLastCompletedOrder(null);
          setIsReceiptModalOpen(false);
          setTables((prev) =>
            prev.map((t) =>
              t.id === tableId
                ? {
                    ...t,
                    status: 'por_cobrar',
                    occupiedSince: undefined,
                    minutesElapsed: undefined,
                    currentOrderId: currentOrder.id,
                    waiter: currentOrder.waiter,
                  }
                : t
            )
          );
        },
      });
    }

    return finalizedOrder;
  };

  // Add Manual Transaction
  const addManualTransaction = (
    type: TransactionType,
    description: string,
    amount: number,
    isIncome: boolean,
    bankAccountId?: string,
    _customPaymentMethodId?: string,
    referenceNumber?: string
  ) => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const compId = activeCompanyId === 'todas' ? 'el-tayta' : activeCompanyId;
    const currentCompanyShift = companyShifts[compId] || 'Día';

    let bankAccountAlias: string | undefined = undefined;
    if (bankAccountId) {
      const acc = bankAccounts.find((b) => b.id === bankAccountId);
      if (acc) {
        bankAccountAlias = acc.accountAlias;
        setBankAccounts((prev) =>
          prev.map((b) =>
            b.id === bankAccountId
              ? {
                  ...b,
                  currentBalance: +(
                    b.currentBalance + (isIncome ? amount : -amount)
                  ).toFixed(2),
                }
              : b
          )
        );
      }
    }

    const newTx: Transaction = {
      id: `tx-${Date.now()}`,
      companyId: compId,
      time: timeStr,
      date: 'Hoy',
      timestamp: Date.now(),
      type,
      description: `${description} (${compId === 'el-tayta' ? 'El Tayta' : 'El Sabroso'})${bankAccountAlias ? ` • ${bankAccountAlias}` : ''}`,
      amount: +amount.toFixed(2),
      isIncome,
      bankAccountId,
      bankAccountAlias,
      referenceNumber,
      shift: currentCompanyShift,
    };

    setTransactions((prev) => [newTx, ...prev]);

    // Write-through (Fase E3): registra el movimiento real de caja.
    const optimisticTxId = newTx.id;
    const clientOpId = newUuid();
    attemptMutation({
      clientOpId,
      entity: 'transaction',
      op: 'manualTransaction',
      queuePayload: {
        companyId: compId,
        type,
        description,
        amount: +amount.toFixed(2),
        isIncome,
        bankAccountId: bankAccountId || undefined,
        customPaymentMethodId: _customPaymentMethodId || undefined,
        referenceNumber: referenceNumber || undefined,
        clientOpId,
      },
      endpointOp: async () => {
        const res = await apiClient.post<TransactionDTO>('/operations/transactions', {
          companyId: compId,
          type,
          description,
          amount: +amount.toFixed(2),
          isIncome,
          bankAccountId: bankAccountId || undefined,
          customPaymentMethodId: _customPaymentMethodId || undefined,
          referenceNumber: referenceNumber || undefined,
          clientOpId,
        });
        const serverTx = mapTransaction(res);
        setTransactions((prev) =>
          prev.map((t) => (t.id === optimisticTxId ? serverTx : t))
        );
        if (bankAccountId) await refreshBankAccounts();
        else await refreshTransactions();
      },
    });

    addNotification(
      'Movimiento Registrado',
      `${isIncome ? 'Ingreso' : 'Egreso'}: S/ ${amount.toFixed(2)} (${description}${bankAccountAlias ? ` • ${bankAccountAlias}` : ''})`,
      'success'
    );
  };

  // Sensitive financial correction: server-only, never queued or applied optimistically.
  const correctSalePayment = async (
    transaction: Transaction, correctionId: string, newMethodId: string, referenceNumber: string, reason: string, supervisorPin: string
  ): Promise<void> => {
    if (!offlineState.isOnline || offlineState.isSimulatedOffline) throw new Error('Esta corrección requiere conexión con el servidor.');
    await apiClient.post(`/operations/transactions/${encodeURIComponent(transaction.id)}/corrections`, {
      correctionId, supervisorPin, expectedMethodId: transaction.customPaymentMethodId ?? null,
      expectedBankAccountId: transaction.bankAccountId ?? null, expectedReference: transaction.referenceNumber ?? null,
      newMethodId, referenceNumber: referenceNumber.trim() || null, reason: reason.trim(),
    });
    await Promise.all([refreshTransactions(), refreshBankAccounts()]);
    const correctedMethod = paymentMethods.find((method) => method.id === newMethodId);
    if (correctedMethod && lastCompletedOrder?.id === transaction.orderId) {
      setLastCompletedOrder((previous) => previous?.id === transaction.orderId ? {
        ...previous, paymentMethod: correctedMethod.name, amountReceived: transaction.amount, change: 0,
      } : previous);
    }
  };

  // Add New Table (Fase E5: write-through a POST /catalogs/tables; F5 persiste)
  const addNewTable = (number: string, capacity: number, zone: Zone) => {
    const compId = activeCompanyId === 'todas' ? 'el-tayta' : activeCompanyId;
    const tempId = `t-custom-${Date.now()}`;
    const clientOpId = newUuid();
    const newTable: Table = {
      id: tempId,
      companyId: compId,
      number: number.trim(),
      capacity,
      zone,
      status: 'libre',
    };
    setTables((prev) => [...prev, newTable]);
    tmpCatalogOpRef.current[tempId] = clientOpId;
    attemptMutation({
      clientOpId,
      entity: 'catalog',
      op: 'createTable',
      queuePayload: { companyId: compId, number: newTable.number, capacity, zone, tempId },
      endpointOp: async () => {
        const res = await apiClient.post<TableDTO>('/catalogs/tables', {
          companyId: compId,
          number: newTable.number,
          capacity,
          zone,
        });
        const server = mapTable(res);
        delete tmpCatalogOpRef.current[tempId];
        setTables((prev) => {
          const next = prev.filter((t) => t.id !== tempId);
          return next.some((t) => t.id === server.id) ? next : [...next, server];
        });
        setCatalogSyncMeta((prev) => ({
          ...prev,
          tables: extractMeta('tables', [...tables.filter((t) => t.id !== tempId), server]),
        }));
      },
      rollback: () => {
        delete tmpCatalogOpRef.current[tempId];
        setTables((prev) => prev.filter((t) => t.id !== tempId));
      },
    });
    addNotification('Mesa Creada', `Mesa ${number} agregada para ${compId === 'el-tayta' ? 'El Tayta' : 'El Sabroso'}.`, 'info');
  };

  // Add Purchase (Compras -> Kardex & Cash Ledger Sync)
  const addPurchase = (newPurchaseData: Omit<Purchase, 'id' | 'time'>) => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const purchaseId = `pur-${Date.now()}`;

    const completedPurchase: Purchase = {
      ...newPurchaseData,
      id: purchaseId,
      time: timeStr,
      items: newPurchaseData.items.map((i) => ({
        ...i,
        quantity: Number(i.quantity) || 0,
        unitCost: Number(i.unitCost) || 0,
        discount: Number(i.discount) || 0,
        totalCost: Number(i.totalCost) || 0,
      })),
    };

    setPurchases((prev) => [completedPurchase, ...prev]);

    // 1. Add Kardex Entrada for each item
    const newKardexEntries: KardexMovement[] = completedPurchase.items.map((item) => {
      const effectiveUnitCost = item.quantity ? item.totalCost / item.quantity : 0;
      const existingInsumo = insumos.find((i) => i.id === item.insumoId);
      const stockBefore = existingInsumo ? existingInsumo.currentStock : 0;
      const stockAfter = +(stockBefore + item.quantity).toFixed(2);

      return {
        id: `kdx-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        purchaseId: completedPurchase.id,
        companyId: completedPurchase.companyId,
        timestamp: Date.now(),
        date: 'Hoy',
        time: timeStr,
        insumoId: item.insumoId,
        insumoName: item.insumoName,
        type: 'ENTRADA_COMPRA',
        referenceDoc: `Compra Factura #${completedPurchase.invoiceNumber} (${completedPurchase.supplierName})`,
        quantity: item.quantity,
        unit: item.unit,
        unitCost: effectiveUnitCost,
        totalCost: item.totalCost,
        stockBefore,
        stockAfter,
        notes: completedPurchase.notes,
      };
    });

    setKardexMovements((prev) => [...newKardexEntries, ...prev]);

    // 2. Update Insumos stock and unit cost (Weighted average cost)
    setInsumos((prev) =>
      prev.map((ins) => {
        const itemPurchased = completedPurchase.items.find((i) => i.insumoId === ins.id);
        if (itemPurchased) {
          const totalOldCost = ins.currentStock * ins.costPerUnit;
          const totalNewCost = itemPurchased.totalCost;
          const newTotalStock = ins.currentStock + itemPurchased.quantity;
          const weightedCost =
            ins.currentStock > 0 && newTotalStock > 0
              ? +((totalOldCost + totalNewCost) / newTotalStock).toFixed(2)
              : (itemPurchased.quantity ? itemPurchased.totalCost / itemPurchased.quantity : 0);

          return {
            ...ins,
            currentStock: +(ins.currentStock + itemPurchased.quantity).toFixed(2),
            costPerUnit: weightedCost,
            lastPurchaseDate: `Hoy ${timeStr}`,
          };
        }
        return ins;
      })
    );

    // 3. Record expense transaction
    const currentCompShift = companyShifts[completedPurchase.companyId] || 'Día';
    if (completedPurchase.paidFromCash) {
      const newTx: Transaction = {
        id: `tx-pur-${Date.now()}`,
        companyId: completedPurchase.companyId,
        time: timeStr,
        date: 'Hoy',
        timestamp: Date.now(),
        type: 'Pago Proveedor',
        description: `Compra Factura #${completedPurchase.invoiceNumber} - ${completedPurchase.supplierName}`,
        amount: completedPurchase.total,
        isIncome: false,
        shift: currentCompShift,
      };
      setTransactions((prev) => [newTx, ...prev]);
    } else if (completedPurchase.bankAccountId) {
      const bankAcc = bankAccounts.find((b) => b.id === completedPurchase.bankAccountId);
      if (bankAcc) {
        setBankAccounts((prev) =>
          prev.map((b) =>
            b.id === completedPurchase.bankAccountId
              ? { ...b, currentBalance: +(b.currentBalance - completedPurchase.total).toFixed(2) }
              : b
          )
        );
      }
      const newTx: Transaction = {
        id: `tx-pur-${Date.now()}`,
        companyId: completedPurchase.companyId,
        time: timeStr,
        date: 'Hoy',
        timestamp: Date.now(),
        type: 'Pago Proveedor',
        description: `Compra Factura #${completedPurchase.invoiceNumber} - ${completedPurchase.supplierName} (${completedPurchase.bankAccountAlias || bankAcc?.accountAlias || 'Banco'})`,
        amount: completedPurchase.total,
        isIncome: false,
        bankAccountId: completedPurchase.bankAccountId,
        bankAccountAlias: completedPurchase.bankAccountAlias || bankAcc?.accountAlias,
        shift: currentCompShift,
      };
      setTransactions((prev) => [newTx, ...prev]);
    }

    // Write-through (Fase E3): registra la compra real (Kardex ENTRADA + movimiento de caja en el server).
    const clientOpId = newUuid();
    attemptMutation({
      clientOpId,
      entity: 'purchase',
      op: 'createPurchase',
      queuePayload: {
        companyId: completedPurchase.companyId,
        category: completedPurchase.category,
        supplierName: completedPurchase.supplierName,
        supplierRuc: completedPurchase.supplierRuc || undefined,
        invoiceNumber: completedPurchase.invoiceNumber || undefined,
        provisionalNoteNumber: completedPurchase.provisionalNoteNumber,
        documentStatus: completedPurchase.documentStatus,
        subtotal: completedPurchase.subtotal,
        igv: completedPurchase.igv,
        paymentStatus: completedPurchase.paymentStatus,
        notes: completedPurchase.notes || undefined,
        paidFromCash: completedPurchase.paidFromCash,
        bankAccountId: completedPurchase.bankAccountId || undefined,
        bankAccountAlias: completedPurchase.bankAccountAlias || undefined,
        items: completedPurchase.items.map((i) => ({
          insumoId: i.insumoId,
          insumoName: i.insumoName,
          quantity: i.quantity,
          unit: i.unit,
          unitCost: i.unitCost,
          discount: i.discount ?? 0,
          totalCost: i.totalCost,
        })),
        total: completedPurchase.total,
        clientOpId,
      },
      endpointOp: async () => {
        await apiClient.post<PurchaseDTO>('/operations/purchases', {
          companyId: completedPurchase.companyId,
          category: completedPurchase.category,
          supplierName: completedPurchase.supplierName,
          supplierRuc: completedPurchase.supplierRuc || undefined,
          invoiceNumber: completedPurchase.invoiceNumber || undefined,
          provisionalNoteNumber: completedPurchase.provisionalNoteNumber,
          documentStatus: completedPurchase.documentStatus,
          subtotal: completedPurchase.subtotal,
          igv: completedPurchase.igv,
          paymentStatus: completedPurchase.paymentStatus,
          notes: completedPurchase.notes || undefined,
          paidFromCash: completedPurchase.paidFromCash,
          bankAccountId: completedPurchase.bankAccountId || undefined,
          bankAccountAlias: completedPurchase.bankAccountAlias || undefined,
          items: completedPurchase.items.map((i) => ({
            insumoId: i.insumoId,
            insumoName: i.insumoName,
            quantity: i.quantity,
            unit: i.unit,
            unitCost: i.unitCost,
            discount: i.discount ?? 0,
            totalCost: i.totalCost,
          })),
          total: completedPurchase.total,
          clientOpId,
        });
        setPurchases((prev) => prev.filter((p) => p.id !== purchaseId));
        await Promise.all([refreshInsumos(), refreshKardex(), refreshTransactions(), refreshBankAccounts()]);
        const purchases = await apiClient
          .get<PurchaseDTO[]>('/operations/purchases')
          .then((d) => d.map(mapPurchase));
        setPurchases(purchases);
      },
    });

    addNotification(
      'Compra Registrada con Éxito',
      `${completedPurchase.documentStatus === 'provisional' ? 'Vale provisional' : 'Factura'} #${completedPurchase.provisionalNoteNumber || completedPurchase.invoiceNumber} registrada. ${completedPurchase.items.length ? `Kardex: +${completedPurchase.items.length} insumos.` : 'Insumos pendientes de regularización.'}`,
      'success'
    );
  };

  // Regularize Purchase (pasar a limpio vale con factura/boleta formal)
  const regularizePurchase = (
    purchaseId: string,
    invoiceNumber: string,
    supplierRuc: string,
    notes?: string,
    items?: PurchaseItem[]
  ) => {
    const previousPurchase = purchases.find((purchase) => purchase.id === purchaseId);
    if (previousPurchase && items && previousPurchase.items.length > 0) {
      const deltas = new Map<string, number>();
      for (const item of items) {
        const old = previousPurchase.items.find((row) => row.id === item.id);
        if (!old) continue;
        deltas.set(item.insumoId, (deltas.get(item.insumoId) || 0) + item.totalCost - old.totalCost);
      }
      setInsumos((prev) => prev.map((insumo) => {
        const delta = deltas.get(insumo.id) || 0;
        if (!delta) return insumo;
        const revised = items.find((item) => item.insumoId === insumo.id);
        return { ...insumo, costPerUnit: insumo.currentStock > 0
          ? +(insumo.costPerUnit + delta / insumo.currentStock).toFixed(2)
          : revised ? +(revised.totalCost / revised.quantity).toFixed(2) : insumo.costPerUnit };
      }));
      setKardexMovements((prev) => {
        const used = new Set<string>();
        return prev.map((movement) => {
          if (movement.purchaseId !== previousPurchase.id) return movement;
          const old = previousPurchase.items.find((row) => !used.has(row.id || '') && row.insumoId === movement.insumoId &&
            row.totalCost === movement.totalCost && row.quantity === movement.quantity);
          const matching = items.find((item) => item.id && item.id === old?.id);
          if (!matching || !old) return movement;
          used.add(old.id || '');
          return { ...movement, totalCost: matching.totalCost, unitCost: matching.totalCost / matching.quantity };
        });
      });
    }
    if (previousPurchase && items && previousPurchase.items.length === 0) {
      const now = Date.now();
      setInsumos((prev) => prev.map((insumo) => {
        const added = items.filter((item) => item.insumoId === insumo.id);
        if (!added.length) return insumo;
        const quantity = added.reduce((sum, item) => sum + item.quantity, 0);
        const cost = added.reduce((sum, item) => sum + item.totalCost, 0);
        const stock = insumo.currentStock + quantity;
        return { ...insumo, currentStock: stock,
          costPerUnit: insumo.currentStock > 0 && stock > 0 ? +((insumo.currentStock * insumo.costPerUnit + cost) / stock).toFixed(2) : +(cost / quantity).toFixed(2) };
      }));
      setKardexMovements((prev) => [...items.map((item, index) => {
        const insumo = insumos.find((row) => row.id === item.insumoId);
        const stockBefore = insumo?.currentStock ?? 0;
        return {
          id: `kdx-reg-${purchaseId}-${index}`, purchaseId,
          companyId: previousPurchase.companyId, timestamp: now, date: 'Hoy', time: new Date(now).toLocaleTimeString(),
          insumoId: item.insumoId, insumoName: item.insumoName, type: 'ENTRADA_COMPRA' as const,
          referenceDoc: `Compra Factura #${invoiceNumber} (${previousPurchase.supplierName})`,
          quantity: item.quantity, unit: item.unit, unitCost: item.totalCost / item.quantity,
          totalCost: item.totalCost, stockBefore, stockAfter: stockBefore + item.quantity,
        };
      }), ...prev]);
    }
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setPurchases((prev) =>
      prev.map((p) => {
        if (p.id === purchaseId) {
          return {
            ...p,
            documentStatus: 'regularizado',
            invoiceNumber: invoiceNumber.trim(),
            supplierRuc: supplierRuc.trim(),
            regularizedAt: `Hoy ${timeStr}`,
            regularizedBy: currentUser?.name || 'Carlos M.',
            items: items ?? p.items,
            notes: notes ? `${p.notes || ''} [Regularizado: ${notes}]` : p.notes,
          };
        }
        return p;
      })
    );
    addNotification(
      'Compra Regularizada',
      `Documento ${invoiceNumber} registrado formalmente. Compra pasada a limpio.`,
      'success'
    );

    // Write-through (Fase E3): regulariza el vale provisional en el server.
    const clientOpId = newUuid();
    attemptMutation({
      clientOpId,
      entity: 'purchase',
      op: 'regularizePurchase',
      queuePayload: { purchaseId, invoiceNumber: invoiceNumber.trim(), supplierRuc: supplierRuc.trim(), notes, items, clientOpId },
      endpointOp: async () => {
        const res = await apiClient.post<PurchaseDTO>(`/operations/purchases/${purchaseId}/regularize`, {
          invoiceNumber: invoiceNumber.trim(),
          supplierRuc: supplierRuc.trim(),
          notes: notes || undefined,
          items,
          clientOpId,
        });
        const serverPurchase = mapPurchase(res);
        setPurchases((prev) =>
          prev.map((p) => (p.id === serverPurchase.id ? serverPurchase : p))
        );
        void Promise.all([refreshInsumos(), refreshKardex(), refreshTransactions(), refreshBankAccounts()]);
      },
    });
  };

  // Turnos: Cierre y Cambio de Turno (Día <-> Noche) por Empresa
  const switchCompanyShift = (
    companyId: CompanyId,
    targetShift: ShiftType,
    reportedCash: number,
    initialCashForNext: number,
    notes?: string
  ) => {
    const currentShift = companyShifts[companyId];
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const compTxs = transactions.filter(
      (t) => t.companyId === companyId && t.timestamp >= companyShiftOpenedUtc[companyId] && (!t.shift || t.shift === currentShift)
    );

    const cashSales = compTxs
      .filter((t) => t.isIncome && t.type.startsWith('Venta (') && isCashMovement(t))
      .reduce((sum, t) => sum + t.amount, 0);
    const cashIncome = compTxs
      .filter((t) => t.isIncome && t.type !== 'Reclasificación de Pago' && isCashMovement(t))
      .reduce((sum, t) => sum + t.amount, 0);

    const cardSales = compTxs
      .filter(
        (t) =>
          t.isIncome &&
          (t.paymentMethod === 'Tarjeta' ||
            (t.description && t.description.toLowerCase().includes('tarjeta')))
      )
      .reduce((sum, t) => sum + t.amount, 0);

    const walletSales = compTxs
      .filter(
        (t) =>
          t.isIncome &&
          (t.paymentMethod === 'Billetera Digital' ||
            (t.description &&
              (t.description.toLowerCase().includes('yape') ||
                t.description.toLowerCase().includes('plin'))))
      )
      .reduce((sum, t) => sum + t.amount, 0);

    const totalSales = cashSales + cardSales + walletSales;

    const totalExpenses = compTxs
      .filter((t) => !t.isIncome && t.type !== 'Reclasificación de Pago')
      .reduce((sum, t) => sum + t.amount, 0);

    // Regla de gaveta: solo los egresos SIN cuenta bancaria salen de la caja
    // efectivo (los pagados desde banco no tocan la gaveta).
    const cashExpenses = compTxs
      .filter((t) => !t.isIncome && t.type !== 'Reclasificación de Pago' && isCashMovement(t))
      .reduce((sum, t) => sum + t.amount, 0);

    // Gap #6 fix: caja inicial desde el último arqueo local (el server usa su
    // companyShift.initialCash como verdad y el refresh post-write la impone).
    // Además se calcula bankTransferSales en vez de dejarlo en 0.
    const lastRecord = shiftRecords.find((r) => r.companyId === companyId);
    const initialCash = companyShiftCash[companyId] ?? (lastRecord ? lastRecord.initialCash : 350.0);
    const bankTransferSales = compTxs
      .filter(
        (t) =>
          t.isIncome &&
          !!t.bankAccountId &&
          t.paymentMethod !== 'Efectivo' &&
          t.paymentMethod !== 'Tarjeta' &&
          t.paymentMethod !== 'Billetera Digital' &&
          t.paymentMethod !== 'Yape / Plin'
      )
      .reduce((sum, t) => sum + t.amount, 0);
    const reclassificationCash = compTxs.filter((t) => t.type === 'Reclasificación de Pago' && isCashMovement(t))
      .reduce((sum, t) => sum + (t.isIncome ? t.amount : -t.amount), 0);
    const systemCashExpected = +(initialCash + cashIncome - cashExpenses + reclassificationCash).toFixed(2);
    const difference = +(reportedCash - systemCashExpected).toFixed(2);

    const newRecord: ShiftRecord = {
      id: `shift-${Date.now()}`,
      companyId,
      shift: currentShift,
      openedAt: `Hoy ${currentShift === 'Día' ? '07:30 AM' : '03:00 PM'}`,
      closedAt: `Hoy ${timeStr}`,
      openedBy: currentUser?.name || 'Carlos M.',
      closedBy: currentUser?.name || 'Carlos M.',
      initialCash,
      systemCashExpected,
      finalCashReported: reportedCash,
      cashDifference: difference,
      totalSales: +totalSales.toFixed(2),
      totalExpenses: +totalExpenses.toFixed(2),
      cardSales: +cardSales.toFixed(2),
      digitalWalletSales: +walletSales.toFixed(2),
      bankTransferSales: +bankTransferSales.toFixed(2),
      notes: notes || `Cierre de turno ${currentShift} realizado.`,
      status: 'cerrado',
    };

    setShiftRecords((prev) => [newRecord, ...prev]);

    setCompanyShifts((prev) => ({
      ...prev,
      [companyId]: targetShift,
    }));

    // El fondo inicial del turno nuevo pasa a ser la caja vigente de la gaveta.
    setCompanyShiftCash((prev) => ({
      ...prev,
      [companyId]: initialCashForNext,
    }));
    setCompanyShiftOpenedUtc((prev) => ({ ...prev, [companyId]: now.getTime() }));

    if (difference !== 0) {
      const diffTx: Transaction = {
        id: `tx-diff-${Date.now()}`,
        companyId,
        time: timeStr,
        date: 'Hoy',
        timestamp: Date.now(),
        type: 'Ajuste de Saldo',
        description: `Diferencia arqueo ${currentShift} (${difference > 0 ? 'Sobrante' : 'Faltante'})`,
        amount: Math.abs(difference),
        isIncome: difference > 0,
        shift: currentShift,
      };
      setTransactions((prev) => [diffTx, ...prev]);
    }

    addNotification(
      'Turno Cerrado y Arqueado',
      `${companyId === 'el-tayta' ? 'El Tayta' : 'El Sabroso'}: Turno ${currentShift} cerrado. Pasó a Turno ${targetShift} con fondo inicial S/ ${initialCashForNext.toFixed(2)}.`,
      difference === 0 ? 'success' : 'warning'
    );

    // Write-through (Fase E3): registra el arqueo real + ajuste de saldo idempotente.
    const clientOpId = newUuid();
    attemptMutation({
      clientOpId,
      entity: 'shift',
      op: 'switchShift',
      queuePayload: {
        companyId,
        targetShift,
        reportedCash,
        initialCashForNext,
        notes: notes || undefined,
        clientOpId,
      },
      endpointOp: async () => {
        await apiClient.post('/operations/shifts/switch', {
          companyId,
          targetShift,
          reportedCash,
          initialCashForNext,
          notes: notes || undefined,
          clientOpId,
        });
        await Promise.all([refreshShiftRecords(), refreshTransactions()]);
      },
    });
  };

  // Cuentas Bancarias CRUD (Fase E5: write-through a /catalogs/bank-accounts; F5 persiste)
  const addBankAccount = (acc: Omit<BankAccount, 'id'>) => {
    const tempId = `bank-${Date.now()}`;
    const clientOpId = newUuid();
    const newAccount: BankAccount = { ...acc, id: tempId };
    setBankAccounts((prev) => [...prev, newAccount]);
    tmpCatalogOpRef.current[tempId] = clientOpId;
    attemptMutation({
      clientOpId,
      entity: 'catalog',
      op: 'createBankAccount',
      queuePayload: {
        companyId: acc.companyId,
        bankName: acc.bankName,
        accountNumber: acc.accountNumber,
        cci: acc.cci,
        accountType: acc.accountType,
        currency: acc.currency,
        holderName: acc.holderName,
        alias: acc.alias,
        currentBalance: acc.currentBalance,
        notes: acc.notes,
        tempId,
      },
      endpointOp: async () => {
        const res = await apiClient.post<BankAccountDTO>('/catalogs/bank-accounts', {
          companyId: acc.companyId,
          bankName: acc.bankName,
          accountNumber: acc.accountNumber,
          cci: acc.cci,
          accountType: acc.accountType,
          currency: acc.currency,
          holderName: acc.holderName,
          alias: acc.alias,
          currentBalance: acc.currentBalance,
          notes: acc.notes,
        });
        const server = mapBankAccount(res);
        delete tmpCatalogOpRef.current[tempId];
        setBankAccounts((prev) => {
          const next = prev.filter((a) => a.id !== tempId);
          return next.some((a) => a.id === server.id) ? next : [...next, server];
        });
      },
      rollback: () => {
        delete tmpCatalogOpRef.current[tempId];
        setBankAccounts((prev) => prev.filter((a) => a.id !== tempId));
      },
    });
    addNotification('Cuenta Bancaria Agregada', `${acc.bankName} - ${acc.alias} registrada.`, 'success');
  };

  const updateBankAccount = (id: string, updates: Partial<BankAccount>) => {
    // Edición de un alta aún no sincronizada: se parchea el create encolado.
    const queuedOp = tmpCatalogOpRef.current[id];
    if (queuedOp) {
      setBankAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, ...updates } : a)));
      updateQueuedPayload(queuedOp, {
        ...(updates.bankName !== undefined ? { bankName: updates.bankName } : {}),
        ...(updates.accountNumber !== undefined ? { accountNumber: updates.accountNumber } : {}),
        ...(updates.cci !== undefined ? { cci: updates.cci } : {}),
        ...(updates.accountType !== undefined ? { accountType: updates.accountType } : {}),
        ...(updates.currency !== undefined ? { currency: updates.currency } : {}),
        ...(updates.holderName !== undefined ? { holderName: updates.holderName } : {}),
        ...(updates.alias !== undefined ? { alias: updates.alias } : {}),
        ...(updates.currentBalance !== undefined ? { currentBalance: updates.currentBalance } : {}),
        ...(updates.notes !== undefined ? { notes: updates.notes } : {}),
      });
      addNotification('Cuenta Bancaria Actualizada', 'Datos de cuenta bancaria modificados.', 'info');
      return;
    }
    const prev = bankAccounts.find((a) => a.id === id);
    setBankAccounts((prevList) => prevList.map((a) => (a.id === id ? { ...a, ...updates } : a)));
    attemptMutation({
      clientOpId: newUuid(),
      entity: 'catalog',
      op: 'updateBankAccount',
      queuePayload: {
        id,
        ...(updates.bankName !== undefined ? { bankName: updates.bankName } : {}),
        ...(updates.accountNumber !== undefined ? { accountNumber: updates.accountNumber } : {}),
        ...(updates.cci !== undefined ? { cci: updates.cci } : {}),
        ...(updates.accountType !== undefined ? { accountType: updates.accountType } : {}),
        ...(updates.currency !== undefined ? { currency: updates.currency } : {}),
        ...(updates.holderName !== undefined ? { holderName: updates.holderName } : {}),
        ...(updates.alias !== undefined ? { alias: updates.alias } : {}),
        ...(updates.currentBalance !== undefined ? { currentBalance: updates.currentBalance } : {}),
        ...(updates.isActive !== undefined ? { isActive: updates.isActive } : {}),
        ...(updates.notes !== undefined ? { notes: updates.notes } : {}),
      },
      endpointOp: async () => {
        const res = await apiClient.patch<BankAccountDTO>(`/catalogs/bank-accounts/${id}`, {
          ...(updates.bankName !== undefined ? { bankName: updates.bankName } : {}),
          ...(updates.accountNumber !== undefined ? { accountNumber: updates.accountNumber } : {}),
          ...(updates.cci !== undefined ? { cci: updates.cci } : {}),
          ...(updates.accountType !== undefined ? { accountType: updates.accountType } : {}),
          ...(updates.currency !== undefined ? { currency: updates.currency } : {}),
          ...(updates.holderName !== undefined ? { holderName: updates.holderName } : {}),
          ...(updates.alias !== undefined ? { alias: updates.alias } : {}),
          ...(updates.currentBalance !== undefined ? { currentBalance: updates.currentBalance } : {}),
          ...(updates.isActive !== undefined ? { isActive: updates.isActive } : {}),
          ...(updates.notes !== undefined ? { notes: updates.notes } : {}),
        });
        const server = mapBankAccount(res);
        setBankAccounts((prevList) => prevList.map((a) => (a.id === id ? server : a)));
      },
      rollback: () => {
        if (prev) setBankAccounts((prevList) => prevList.map((a) => (a.id === id ? prev : a)));
      },
    });
    addNotification('Cuenta Bancaria Actualizada', 'Datos de cuenta bancaria modificados.', 'info');
  };

  const deleteBankAccount = (id: string) => {
    // Borrado de un alta aún no sincronizada: se retira el create encolado.
    const queuedOp = tmpCatalogOpRef.current[id];
    if (queuedOp) {
      delete tmpCatalogOpRef.current[id];
      removeByClientOpId(queuedOp);
      syncPendingCount();
      setBankAccounts((prev) => prev.filter((a) => a.id !== id));
      addNotification('Cuenta Eliminada', 'La cuenta bancaria fue retirada.', 'info');
      return;
    }
    const prev = bankAccounts.find((a) => a.id === id);
    setBankAccounts((prevList) => prevList.filter((a) => a.id !== id));
    attemptMutation({
      clientOpId: newUuid(),
      entity: 'catalog',
      op: 'deleteBankAccount',
      queuePayload: { id },
      endpointOp: async () => {
        await apiClient.del(`/catalogs/bank-accounts/${id}`);
      },
      rollback: () => {
        if (prev) setBankAccounts((prevList) => [...prevList, prev]);
      },
    });
    addNotification('Cuenta Eliminada', 'La cuenta bancaria fue retirada.', 'info');
  };

  // Métodos de Pago CRUD (Fase E5: write-through a /catalogs/payment-methods; F5 persiste)
  const addPaymentMethod = (pm: Omit<CustomPaymentMethod, 'id'>) => {
    const tempId = `pm-${Date.now()}`;
    const clientOpId = newUuid();
    const newPm: CustomPaymentMethod = { ...pm, id: tempId };
    setPaymentMethods((prev) => [...prev, newPm]);
    tmpCatalogOpRef.current[tempId] = clientOpId;
    attemptMutation({
      clientOpId,
      entity: 'catalog',
      op: 'createPaymentMethod',
      queuePayload: {
        companyId: pm.companyId === 'ambas' ? null : pm.companyId,
        name: pm.name,
        category: pm.category,
        bankAccountId: pm.bankAccountId,
        commissionPct: pm.commissionPct,
        requiresReferenceNumber: pm.requiresReferenceNumber,
        icon: pm.icon,
        tempId,
      },
      endpointOp: async () => {
        const res = await apiClient.post<CustomPaymentMethodDTO>('/catalogs/payment-methods', {
          companyId: pm.companyId === 'ambas' ? null : pm.companyId,
          name: pm.name,
          category: pm.category,
          bankAccountId: pm.bankAccountId,
          commissionPct: pm.commissionPct,
          requiresReferenceNumber: pm.requiresReferenceNumber,
          icon: pm.icon,
        });
        const server = mapPaymentMethod(res);
        delete tmpCatalogOpRef.current[tempId];
        setPaymentMethods((prev) => {
          const next = prev.filter((p) => p.id !== tempId);
          return next.some((p) => p.id === server.id) ? next : [...next, server];
        });
      },
      rollback: () => {
        delete tmpCatalogOpRef.current[tempId];
        setPaymentMethods((prev) => prev.filter((p) => p.id !== tempId));
      },
    });
    addNotification('Método de Pago Agregado', `${pm.name} habilitado para ventas.`, 'success');
  };

  const updatePaymentMethod = (id: string, updates: Partial<CustomPaymentMethod>) => {
    const queuedOp = tmpCatalogOpRef.current[id];
    if (queuedOp) {
      setPaymentMethods((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
      updateQueuedPayload(queuedOp, {
        ...(updates.name !== undefined ? { name: updates.name } : {}),
        ...(updates.category !== undefined ? { category: updates.category } : {}),
        ...(updates.bankAccountId !== undefined ? { bankAccountId: updates.bankAccountId } : {}),
        ...(updates.commissionPct !== undefined ? { commissionPct: updates.commissionPct } : {}),
        ...(updates.requiresReferenceNumber !== undefined ? { requiresReferenceNumber: updates.requiresReferenceNumber } : {}),
        ...(updates.icon !== undefined ? { icon: updates.icon } : {}),
      });
      addNotification('Método de Pago Actualizado', 'Configuración de cobro guardada.', 'info');
      return;
    }
    const prev = paymentMethods.find((p) => p.id === id);
    setPaymentMethods((prevList) => prevList.map((p) => (p.id === id ? { ...p, ...updates } : p)));
    attemptMutation({
      clientOpId: newUuid(),
      entity: 'catalog',
      op: 'updatePaymentMethod',
      queuePayload: {
        id,
        ...(updates.companyId !== undefined ? { companyId: updates.companyId === 'ambas' ? null : updates.companyId } : {}),
        ...(updates.name !== undefined ? { name: updates.name } : {}),
        ...(updates.category !== undefined ? { category: updates.category } : {}),
        ...(updates.bankAccountId !== undefined ? { bankAccountId: updates.bankAccountId } : {}),
        ...(updates.commissionPct !== undefined ? { commissionPct: updates.commissionPct } : {}),
        ...(updates.requiresReferenceNumber !== undefined ? { requiresReferenceNumber: updates.requiresReferenceNumber } : {}),
        ...(updates.icon !== undefined ? { icon: updates.icon } : {}),
        ...(updates.isActive !== undefined ? { isActive: updates.isActive } : {}),
      },
      endpointOp: async () => {
        const res = await apiClient.patch<CustomPaymentMethodDTO>(`/catalogs/payment-methods/${id}`, {
          ...(updates.companyId !== undefined ? { companyId: updates.companyId === 'ambas' ? null : updates.companyId } : {}),
          ...(updates.name !== undefined ? { name: updates.name } : {}),
          ...(updates.category !== undefined ? { category: updates.category } : {}),
          ...(updates.bankAccountId !== undefined ? { bankAccountId: updates.bankAccountId } : {}),
          ...(updates.commissionPct !== undefined ? { commissionPct: updates.commissionPct } : {}),
          ...(updates.requiresReferenceNumber !== undefined ? { requiresReferenceNumber: updates.requiresReferenceNumber } : {}),
          ...(updates.icon !== undefined ? { icon: updates.icon } : {}),
          ...(updates.isActive !== undefined ? { isActive: updates.isActive } : {}),
        });
        const server = mapPaymentMethod(res);
        setPaymentMethods((prevList) => prevList.map((p) => (p.id === id ? server : p)));
      },
      rollback: () => {
        if (prev) setPaymentMethods((prevList) => prevList.map((p) => (p.id === id ? prev : p)));
      },
    });
    addNotification('Método de Pago Actualizado', 'Configuración de cobro guardada.', 'info');
  };

  const deletePaymentMethod = (id: string) => {
    const queuedOp = tmpCatalogOpRef.current[id];
    if (queuedOp) {
      delete tmpCatalogOpRef.current[id];
      removeByClientOpId(queuedOp);
      syncPendingCount();
      setPaymentMethods((prev) => prev.filter((p) => p.id !== id));
      addNotification('Método de Pago Eliminado', 'Se retiró el método de pago.', 'info');
      return;
    }
    const prev = paymentMethods.find((p) => p.id === id);
    setPaymentMethods((prevList) => prevList.filter((p) => p.id !== id));
    attemptMutation({
      clientOpId: newUuid(),
      entity: 'catalog',
      op: 'deletePaymentMethod',
      queuePayload: { id },
      endpointOp: async () => {
        await apiClient.del(`/catalogs/payment-methods/${id}`);
      },
      rollback: () => {
        if (prev) setPaymentMethods((prevList) => [...prevList, prev]);
      },
    });
    addNotification('Método de Pago Eliminado', 'Se retiró el método de pago.', 'info');
  };

  // Multi-Printer CRUD & ESC/POS Simulation (Fase E5: write-through a /catalogs/printers)
  const addPrinter = (prn: Omit<ThermalPrinterConfig, 'id'>) => {
    const tempId = `prn-${Date.now()}`;
    const clientOpId = newUuid();
    const newPrinter: ThermalPrinterConfig = { ...prn, id: tempId };
    setPrinters((prev) => [...prev, newPrinter]);
    tmpCatalogOpRef.current[tempId] = clientOpId;
    attemptMutation({
      clientOpId,
      entity: 'catalog',
      op: 'createPrinter',
      queuePayload: {
        companyId: prn.companyId === 'ambas' ? null : prn.companyId,
        name: prn.name,
        role: prn.role,
        connectionType: prn.connectionType,
        ipAddress: prn.ipAddress,
        port: prn.port,
        paperWidth: prn.paperWidth,
        autoCut: prn.autoCut,
        beepOnPrint: prn.beepOnPrint,
        categories: prn.categoriesMapped,
        tempId,
      },
      endpointOp: async () => {
        const res = await apiClient.post<PrinterDTO>('/catalogs/printers', {
          companyId: prn.companyId === 'ambas' ? null : prn.companyId,
          name: prn.name,
          role: prn.role,
          connectionType: prn.connectionType,
          ipAddress: prn.ipAddress,
          port: prn.port,
          paperWidth: prn.paperWidth,
          autoCut: prn.autoCut,
          beepOnPrint: prn.beepOnPrint,
          categories: prn.categoriesMapped,
        });
        const server = mapPrinter(res);
        delete tmpCatalogOpRef.current[tempId];
        setPrinters((prev) => {
          const next = prev.filter((p) => p.id !== tempId);
          return next.some((p) => p.id === server.id) ? next : [...next, server];
        });
      },
      rollback: () => {
        delete tmpCatalogOpRef.current[tempId];
        setPrinters((prev) => prev.filter((p) => p.id !== tempId));
      },
    });
    addNotification('Ticketera Agregada', `${prn.name} (${prn.ipAddress || prn.connectionType}) conectada.`, 'success');
  };

  const updatePrinter = (id: string, updates: Partial<ThermalPrinterConfig>) => {
    const queuedOp = tmpCatalogOpRef.current[id];
    if (queuedOp) {
      setPrinters((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
      updateQueuedPayload(queuedOp, {
        ...(updates.name !== undefined ? { name: updates.name } : {}),
        ...(updates.role !== undefined ? { role: updates.role } : {}),
        ...(updates.connectionType !== undefined ? { connectionType: updates.connectionType } : {}),
        ...(updates.ipAddress !== undefined ? { ipAddress: updates.ipAddress } : {}),
        ...(updates.port !== undefined ? { port: updates.port } : {}),
        ...(updates.paperWidth !== undefined ? { paperWidth: updates.paperWidth } : {}),
        ...(updates.autoCut !== undefined ? { autoCut: updates.autoCut } : {}),
        ...(updates.beepOnPrint !== undefined ? { beepOnPrint: updates.beepOnPrint } : {}),
        ...(updates.categoriesMapped !== undefined ? { categories: updates.categoriesMapped } : {}),
      });
      addNotification('Ticketera Actualizada', 'Ajustes de impresora guardados.', 'info');
      return;
    }
    const prev = printers.find((p) => p.id === id);
    setPrinters((prevList) => prevList.map((p) => (p.id === id ? { ...p, ...updates } : p)));
    attemptMutation({
      clientOpId: newUuid(),
      entity: 'catalog',
      op: 'updatePrinter',
      queuePayload: {
        id,
        ...(updates.name !== undefined ? { name: updates.name } : {}),
        ...(updates.role !== undefined ? { role: updates.role } : {}),
        ...(updates.connectionType !== undefined ? { connectionType: updates.connectionType } : {}),
        ...(updates.ipAddress !== undefined ? { ipAddress: updates.ipAddress } : {}),
        ...(updates.port !== undefined ? { port: updates.port } : {}),
        ...(updates.paperWidth !== undefined ? { paperWidth: updates.paperWidth } : {}),
        ...(updates.autoCut !== undefined ? { autoCut: updates.autoCut } : {}),
        ...(updates.beepOnPrint !== undefined ? { beepOnPrint: updates.beepOnPrint } : {}),
        ...(updates.status !== undefined ? { status: updates.status } : {}),
        ...(updates.isEnabled !== undefined ? { isEnabled: updates.isEnabled } : {}),
        ...(updates.categoriesMapped !== undefined ? { categories: updates.categoriesMapped } : {}),
      },
      endpointOp: async () => {
        const res = await apiClient.patch<PrinterDTO>(`/catalogs/printers/${id}`, {
          ...(updates.name !== undefined ? { name: updates.name } : {}),
          ...(updates.role !== undefined ? { role: updates.role } : {}),
          ...(updates.connectionType !== undefined ? { connectionType: updates.connectionType } : {}),
          ...(updates.ipAddress !== undefined ? { ipAddress: updates.ipAddress } : {}),
          ...(updates.port !== undefined ? { port: updates.port } : {}),
          ...(updates.paperWidth !== undefined ? { paperWidth: updates.paperWidth } : {}),
          ...(updates.autoCut !== undefined ? { autoCut: updates.autoCut } : {}),
          ...(updates.beepOnPrint !== undefined ? { beepOnPrint: updates.beepOnPrint } : {}),
          ...(updates.status !== undefined ? { status: updates.status } : {}),
          ...(updates.isEnabled !== undefined ? { isEnabled: updates.isEnabled } : {}),
          ...(updates.categoriesMapped !== undefined ? { categories: updates.categoriesMapped } : {}),
        });
        const server = mapPrinter(res);
        setPrinters((prevList) => prevList.map((p) => (p.id === id ? server : p)));
      },
      rollback: () => {
        if (prev) setPrinters((prevList) => prevList.map((p) => (p.id === id ? prev : p)));
      },
    });
    addNotification('Ticketera Actualizada', 'Ajustes de impresora guardados.', 'info');
  };

  const deletePrinter = (id: string) => {
    const queuedOp = tmpCatalogOpRef.current[id];
    if (queuedOp) {
      delete tmpCatalogOpRef.current[id];
      removeByClientOpId(queuedOp);
      syncPendingCount();
      setPrinters((prev) => prev.filter((p) => p.id !== id));
      addNotification('Ticketera Eliminada', 'Impresora retirada.', 'info');
      return;
    }
    const prev = printers.find((p) => p.id === id);
    setPrinters((prevList) => prevList.filter((p) => p.id !== id));
    attemptMutation({
      clientOpId: newUuid(),
      entity: 'catalog',
      op: 'deletePrinter',
      queuePayload: { id },
      endpointOp: async () => {
        await apiClient.del(`/catalogs/printers/${id}`);
      },
      rollback: () => {
        if (prev) setPrinters((prevList) => [...prevList, prev]);
      },
    });
    addNotification('Ticketera Eliminada', 'Impresora retirada.', 'info');
  };

  const testPrint = (printerId: string) => {
    const prn = printers.find((p) => p.id === printerId);
    if (!prn) return;
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const content = `
========================================
       PRUEBA DE IMPRESIÓN ESC/POS      
   ${prn.name.toUpperCase()} (${prn.role.toUpperCase()})
========================================
Empresa: ${activeCompany.tradeName}
Destino: ${prn.ipAddress || 'Puerto Directo'} [${prn.connectionType}]
Ancho de Papel: ${prn.paperWidth}
Auto-Corte: ${prn.autoCut ? 'HABILITADO' : 'MANUAL'}
Gaveta de Dinero: ${prn.role === 'caja' ? 'PULSO 24V ACTIVO' : 'DESACTIVADA'}
Fecha / Hora: ${now.toLocaleDateString()} ${timeStr}

----------------------------------------
Comprobación de Fuentes Térmicas:
Normal: ABCDEFGHIJKLMNOPQRSTUVWXYZ 123456
Negrita: [MODO DESTACADO ACTIVO]
Doble Alto: PEDIDO EXPRESS #8841
----------------------------------------
   ¡CONEXIÓN LOCAL EXITOSA!
========================================
`.trim();

    setLastPrintedTicket({
      printerName: prn.name,
      content,
      timestamp: timeStr,
    });
    setIsPrinterTestModalOpen(true);
    addNotification('Prueba Enviada a Ticketera', `Ticket de prueba emitido en ${prn.name}.`, 'success');
  };

  // Modo Offline (IndexedDB / Local PWA State)
  const toggleSimulatedOffline = () => {
    setOfflineState((prev) => {
      const nextSim = !prev.isSimulatedOffline;
      const isOnline = !nextSim;
      // Al volver a online, dispara el replay real de la cola (Fase E4).
      if (!nextSim) {
        setTimeout(() => void replayOfflineQueue(), 0);
      }
      addNotification(
        nextSim ? 'Modo Offline Activado' : 'Conexión Restablecida (Online)',
        nextSim
          ? 'El sistema opera en almacenamiento local seguro (IndexedDB). Comandas y cobros se guardan en el dispositivo.'
          : `Reconectado al servidor central. ${queueCount()} operaciones pendientes de sincronizar.`,
        nextSim ? 'warning' : 'success'
      );
      return {
        ...prev,
        isSimulatedOffline: nextSim,
        isOnline,
        pendingSyncCount: queueCount(),
      };
    });
  };

  const syncOfflineQueue = () => {
    // Replay real de la cola (Fase E4). Si está simulado offline solo muestra el estado.
    if (offlineState.isSimulatedOffline) {
      syncPendingCount();
      addNotification('Estado de Sincronización', `${queueCount()} operaciones en la cola local (modo offline simulado).`, 'info');
      return;
    }
    setOfflineState((prev) => ({
      ...prev,
      lastSyncTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }));
    void replayOfflineQueue();
  };

  // Add Kardex Adjustment / Merma
  const addKardexAdjustment = (
    insumoId: string,
    quantity: number,
    type: 'AJUSTE_MERMA' | 'ENTRADA_COMPRA',
    reason: string
  ) => {
    const insumo = insumos.find((i) => i.id === insumoId);
    if (!insumo) return;

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const stockBefore = insumo.currentStock;
    const stockDelta = type === 'AJUSTE_MERMA' ? -Math.abs(quantity) : Math.abs(quantity);
    const stockAfter = +(stockBefore + stockDelta).toFixed(2);
    const totalCost = +(Math.abs(quantity) * insumo.costPerUnit).toFixed(2);

    const compId: CompanyId =
      insumo.companyId === 'ambas'
        ? activeCompanyId === 'todas'
          ? 'el-tayta'
          : activeCompanyId
        : insumo.companyId;

    const newKardex: KardexMovement = {
      id: `kdx-${Date.now()}`,
      companyId: compId,
      timestamp: Date.now(),
      date: 'Hoy',
      time: timeStr,
      insumoId: insumo.id,
      insumoName: insumo.name,
      type,
      referenceDoc: `Ajuste manual: ${reason}`,
      quantity: stockDelta,
      unit: insumo.unit,
      unitCost: insumo.costPerUnit,
      totalCost,
      stockBefore,
      stockAfter,
      notes: reason,
    };

    setKardexMovements((prev) => [newKardex, ...prev]);
    setInsumos((prev) =>
      prev.map((i) => (i.id === insumoId ? { ...i, currentStock: stockAfter } : i))
    );

    // Write-through (Fase E3): registra el ajuste real en el server (Kardex idempotente).
    const clientOpId = newUuid();
    attemptMutation({
      clientOpId,
      entity: 'kardexMovement',
      op: 'kardexAdjustment',
      queuePayload: {
        companyId: compId,
        insumoId,
        type,
        reason,
        quantity: stockDelta,
        clientOpId,
      },
      endpointOp: async () => {
        await apiClient.post('/operations/kardex/adjustments', {
          companyId: compId,
          insumoId,
          type,
          reason,
          quantity: stockDelta,
          clientOpId,
        });
        await Promise.all([refreshKardex(), refreshInsumos()]);
      },
    });

    addNotification(
      type === 'AJUSTE_MERMA' ? 'Merma / Ajuste Registrado' : 'Entrada de Insumo Registrada',
      `${insumo.name}: Stock actualizado de ${stockBefore} a ${stockAfter} ${insumo.unit}.`,
      'info'
    );
  };

  // Save / Update Recipe (Fase E5: upsert a /catalogs/recipes; F5 persiste).
  // El server genera el id real al crear; el id local se reemplaza al reconciliar.
  const saveRecipe = async (recipe: Recipe): Promise<'saved' | 'queued'> => {
    const linked = products.find((p) => p.id === recipe.productId);
    if (linked && linked.companyId !== recipe.companyId) throw new Error('El producto y la ficha deben pertenecer a la misma empresa.');
    if (linked && productIsSending(linked.id)) throw new Error('Espere a que termine de sincronizar el producto.');
    const pendingProduct = productPending().find((op) => productIdOf(op) === linked?.id);
    if (pendingProduct?.error) throw new Error('Revise el cambio pendiente del producto antes de guardar su ficha.');
    const stableProductId = linked?.id ?? (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(recipe.productId) ? recipe.productId : uuid());
    const data = validateProduct({ companyId: recipe.companyId, name: recipe.productName,
      price: round2(Number(recipe.salePrice)), category: recipe.category as ProductCategory,
      image: linked?.image ?? '', description: linked?.description ?? '', available: linked?.available ?? true });
    const normalized: Recipe = { ...recipe, productId: stableProductId, productName: data.name,
      salePrice: data.price, totalCost: round2(recipe.totalCost),
      theoreticalFoodCostPct: round2(recipe.totalCost / data.price * 100),
      ingredients: recipe.ingredients.map((i) => ({ ...i, quantity: round2(Number(i.quantity)),
        costPerUnit: round2(Number(i.costPerUnit)), subtotalCost: round2(Number(i.subtotalCost)) })) };
    const body = { ...normalized, id: recipe.id, tempId: recipe.id,
      ingredients: normalized.ingredients.map((i) => ({ ...i, insumoId: i.insumoId || null })) };
    const queue = loadQueue();
    const index = queue.findIndex((op) => op.op === 'saveRecipe' && (op.payload as { id?: string }).id === recipe.id);
    const op: PendingOp = { clientOpId: uuid(), entity: 'catalog', op: 'saveRecipe', payload: body,
      createdAt: index >= 0 ? queue[index].createdAt : new Date().toISOString() };
    if (index >= 0) queue[index] = op; else queue.push(op);
    persistProductQueue(queue);
    const previousRecipe = recipes.find((r) => r.id === recipe.id);
    setRecipes((prev) => overlayRecipes([...prev.filter((r) => r.id !== recipe.id), normalized], prev));
    setProducts((prev) => overlayProducts([...prev.filter((p) => p.id !== stableProductId), {
      ...linked, ...data, id: stableProductId, hasRecipe: true,
    }], prev));
    if (offlineState.isSimulatedOffline || !getAuthToken() || queue[0].clientOpId !== op.clientOpId || isReplayingRef.current) {
      if (!offlineState.isSimulatedOffline && getAuthToken()) {
        if (isReplayingRef.current) productSyncRequestedRef.current = true;
        else queueMicrotask(() => replayRef.current());
      }
      addNotification('Ficha pendiente', 'El cambio se guardó en este equipo y se sincronizará en orden.', 'info');
      return 'queued';
    }
    const result = await replayCall(op, body);
    if (result.disposition === 'ok') {
      persistProductQueue(loadQueue().filter((item) => item.clientOpId !== op.clientOpId));
      const full = mapRecipe(result.data as RecipeDTO);
      setRecipes((prev) => [...prev.filter((r) => r.id !== recipe.id), full]);
      await refreshProductCatalogRef.current().catch(() => undefined);
      addNotification('Ficha guardada', 'Producto y ficha técnica actualizados.', 'success');
      return 'saved';
    }
    if (result.disposition === 'retry') return 'queued';
    if (result.disposition === 'conflict') { markInsumoIssue(op, result.message ?? 'Revise el insumo vinculado.'); throw new Error(result.message); }
    persistProductQueue(loadQueue().filter((item) => item.clientOpId !== op.clientOpId));
    setRecipes((prev) => [...prev.filter((r) => r.id !== recipe.id), ...(previousRecipe ? [previousRecipe] : [])]);
    setProducts((prev) => [...prev.filter((p) => p.id !== stableProductId), ...(linked ? [linked] : [])]);
    throw new Error(result.message ?? 'No se pudo guardar la ficha.');
  };

  const syncInsumoOperation = async (op: PendingOp): Promise<'saved' | 'queued'> => {
    if (op.conflict || op.error) return 'queued';
    if (!insumoIdOf(op)) {
      markInsumoIssue(op, 'Este pendiente fue creado por una versión anterior. Revise el catálogo antes de volver a registrarlo para evitar duplicados.');
      return 'queued';
    }
    const result = await replayCall(op, op.payload as Record<string, unknown>);
    setLastSyncResult({ ok: result.disposition === 'ok', ts: Date.now(), op: op.op });
    if (result.disposition === 'ok') {
      persistInsumoQueue(loadQueue().filter((item) => item.clientOpId !== op.clientOpId));
      const dto = result.data as InsumoDTO;
      setInsumos((prev) => overlayInsumos([...prev.filter((i) => i.id !== dto.id), mapInsumo(dto)], prev));
      syncPendingCount();
      await Promise.allSettled([refreshInsumos(), refreshProductCatalogRef.current()]);
      return 'saved';
    }
    if (['conflict', 'business', 'gone'].includes(result.disposition)) markInsumoIssue(op, result.message ?? 'Revise los datos del insumo.');
    syncPendingCount(); return 'queued';
  };
  const submitInsumoOperation = async (op: PendingOp): Promise<'saved' | 'queued'> => {
    setInsumos((prev) => overlayInsumos(prev, prev)); syncPendingCount();
    if (offlineState.isSimulatedOffline || !getAuthToken()) return 'queued';
    if (isReplayingRef.current) { productSyncRequestedRef.current = true; return 'queued'; }
    if (loadQueue()[0]?.clientOpId !== op.clientOpId) { replayRef.current(); return 'queued'; }
    const result = await syncInsumoOperation(op);
    const pending = loadQueue().find((item) => item.clientOpId === op.clientOpId);
    if (pending?.error) throw new Error(pending.error);
    return result;
  };
  const saveInsumo = async (draft: InsumoDraft, original?: Insumo, id?: string) => {
    const stableId = id ?? original?.id;
    if (stableId && insumoIsSending(stableId)) throw new Error('Espere a que termine la sincronización.');
    return submitInsumoOperation(stageInsumo(draft, original, stableId));
  };
  const addInsumo = (draft: Omit<Insumo, 'id' | 'code'>) => saveInsumo(draft);
  const deleteInsumo = async (insumo: Insumo) => {
    if (insumoIsSending(insumo.id)) throw new Error('Espere a que termine la sincronización.');
    return submitInsumoOperation(stageInsumoDelete(insumo));
  };
  const resolveInsumoConflict = async (id: string, choice: 'server' | 'local') => {
    if (offlineState.isSimulatedOffline) throw new Error('Restablezca la conexión para revisar.');
    const all = await apiClient.get<InsumoDTO[]>('/catalogs/insumos');
    const server = all.find((i) => i.id === id);
    const op = insumoPending().find((item) => insumoIdOf(item) === id);
    if (!op) return;
    if (choice === 'local' && !server) throw new Error('El insumo fue eliminado. Descarte el cambio pendiente.');
    persistInsumoQueue(choice === 'server' ? loadQueue().filter((item) => item.clientOpId !== op.clientOpId)
      : loadQueue().map((item) => item.clientOpId !== op.clientOpId ? item : { ...item, clientOpId: newUuid(), error: undefined, conflict: undefined,
        payload: { ...(item.payload as object), expectedVersion: server!.version } }));
    setInsumos((prev) => overlayInsumos(all.map(mapInsumo), prev)); syncPendingCount();
    if (choice === 'local') replayRef.current();
  };
  const discardInventoryDependency = async (clientOpId: string) => {
    const op = loadQueue().find((item) => item.clientOpId === clientOpId);
    if (!op || !isInventoryDependencyIssue(op)) return;
    if (offlineState.isSimulatedOffline || !getAuthToken()) throw new Error('Restablezca la conexión para recuperar los datos confirmados.');
    persistInsumoQueue(loadQueue().filter((item) => item.clientOpId !== clientOpId));
    await Promise.allSettled([loadOperations(), loadCatalogs(), refreshProductCatalogRef.current()]);
    syncPendingCount();
  };
  useEffect(() => {
    const refresh = () => syncPendingCount();
    window.addEventListener(INSUMO_QUEUE_EVENT, refresh);
    return () => window.removeEventListener(INSUMO_QUEUE_EVENT, refresh);
  }, []);

  // Reset to Demo Data
  const resetToDemoData = () => {
    if (import.meta.env.PROD) return;
    setTables(INITIAL_TABLES);
    setProducts(INITIAL_PRODUCTS);
    setOrders(INITIAL_ORDERS);
    setTransactions(INITIAL_TRANSACTIONS);
    setInsumos(INITIAL_INSUMOS);
    setRecipes(INITIAL_RECIPES);
    setPurchases(INITIAL_PURCHASES);
    setKardexMovements(INITIAL_KARDEX);
    setBankAccounts(INITIAL_BANK_ACCOUNTS);
    setPaymentMethods(INITIAL_PAYMENT_METHODS);
    setCompanyShifts({ 'el-tayta': 'Día', 'el-sabroso': 'Día' });
    setPrinters(INITIAL_PRINTERS);
    setActiveCompanyId('el-tayta');
    setSelectedTableId('t-02');
    setCurrentScreen('mesas');
    addNotification(
      'Datos Restaurados',
      'Se reiniciaron los datos demo multiempresa de El Tayta y El Sabroso.',
      'info'
    );
  };

  // Dynamic Cash Ledger Calculations
  // - totalIngresos/totalEgresos: facturación general (todas las cuentas, caja + bancos).
  // - saldoActual ("Efectivo en Caja"): SOLO movimientos de gaveta (!bankAccountId)
  //   + caja inicial vigente del turno (regla: un movimiento toca la gaveta ⇔ sin banco).
  const { totalIngresos, totalEgresos, saldoActual } = useMemo(() => {
    let ingresos = 0;
    let egresos = 0;
    let cashIngresos = 0;
    let cashEgresos = 0;

    filteredTransactions.forEach((tx) => {
      const isReclassification = tx.type === 'Reclasificación de Pago';
      const inCurrentShift = !tx.companyId || tx.timestamp >= companyShiftOpenedUtc[tx.companyId];
      if (tx.isIncome) {
        if (!isReclassification) ingresos += tx.amount;
        if (inCurrentShift && isCashMovement(tx)) cashIngresos += tx.amount;
      } else {
        if (!isReclassification) egresos += tx.amount;
        if (inCurrentShift && isCashMovement(tx)) cashEgresos += tx.amount;
      }
    });

    const cashCompanies: CompanyId[] =
      activeCompanyId === 'todas' ? ['el-tayta', 'el-sabroso'] : [activeCompanyId as CompanyId];
    const initialCash = cashCompanies.reduce(
      (sum, cid) => sum + (companyShiftCash[cid] ?? 0),
      0
    );

    return {
      totalIngresos: +ingresos.toFixed(2),
      totalEgresos: +egresos.toFixed(2),
      saldoActual: +(initialCash + cashIngresos - cashEgresos).toFixed(2),
    };
  }, [filteredTransactions, activeCompanyId, companyShiftCash, companyShiftOpenedUtc]);

  // FINANCIAL RATIOS & EXPENSE RATIOS ENGINE ("¿Se está pasando de gastos?")
  const getCompanyAnalysis = (cid: CompanyId | 'todas'): ExpenseRatioAnalysis => {
    const txs = cid === 'todas' ? transactions : transactions.filter((t) => t.companyId === cid);
    const purs = cid === 'todas' ? purchases : purchases.filter((p) => p.companyId === cid);
    const ords = (Object.values(orders) as Order[]).filter(
      (o) => cid === 'todas' || o.companyId === cid
    );

    const totalSales = txs.filter((t) => t.isIncome && t.type !== 'Reclasificación de Pago').reduce((sum, t) => sum + t.amount, 0);
    const totalPurchases = purs.reduce((sum, p) => sum + p.total, 0);
    const operatingExpenses = txs
      .filter((t) => !t.isIncome && t.type !== 'Pago Proveedor' && t.type !== 'Reclasificación de Pago')
      .reduce((sum, t) => sum + t.amount, 0);

    // Calculate theoretical cost of sold dishes from recipes
    let totalTheoreticalCost = 0;
    ords
      .filter((o) => o.status === 'cobrado' || o.status === 'en_cocina')
      .forEach((o) => {
        o.items.forEach((item) => {
          const rec = matchingRecipe<Recipe>(recipes, o.companyId, item);
          if (rec) {
            totalTheoreticalCost += rec.totalCost * item.quantity;
          }
        });
      });

    // Base fallback if sales exist in transactions from morning shift
    if (totalTheoreticalCost === 0 && totalSales > 0) {
      totalTheoreticalCost = totalSales * 0.28; // ~28% industry theoretical standard
    }

    const safeSales = totalSales > 0 ? totalSales : 1;
    const foodCostPctReal = +((totalPurchases / safeSales) * 100).toFixed(1);
    const foodCostPctTheoretical = +((totalTheoreticalCost / safeSales) * 100).toFixed(1);
    const operatingExpenseRatio = +(
      ((totalPurchases + operatingExpenses) / safeSales) *
      100
    ).toFixed(1);
    const variancePct = +(foodCostPctReal - foodCostPctTheoretical).toFixed(1);

    // Status Semaphore:
    let status: 'optimo' | 'alerta' | 'critico' = 'optimo';
    let message = '';
    const recommendations: string[] = [];

    if (foodCostPctReal > 38.0 || operatingExpenseRatio > 45.0) {
      status = 'critico';
      message =
        '¡Alerta Crítica de Gastos! Los costos de insumos y compras superan el 38% de las ventas. Se están generando sobrecostos importantes.';
      recommendations.push(
        'Revisar las compras recientes de proteínas de alto valor (lomo, cortes o mariscos).'
      );
      recommendations.push(
        'Auditar porciones en cocina: la merma o porcionado excede la Ficha Técnica oficial.'
      );
      recommendations.push(
        'Negociar precios o volumen con proveedores principales de insumos críticos.'
      );
    } else if (foodCostPctReal >= 32.5 || operatingExpenseRatio >= 38.0) {
      status = 'alerta';
      message =
        'Atención: El ratio de gastos en insumos se encuentra en zona de precaución (33% - 38%). Margen bajo supervisión.';
      recommendations.push(
        'Verificar el stock físico en Kardex frente a compras para detectar posibles fugas.'
      );
      recommendations.push(
        'Priorizar en el POS la venta de platos con menor Food Cost Teórico (Ají de Gallina, Chicha, etc.).'
      );
    } else {
      status = 'optimo';
      message =
        'Excelente desempeño financiero: El ratio de gastos se mantiene dentro de los márgenes saludables de rentabilidad (< 32%).';
      recommendations.push(
        'Mantener el control estricto de recetas y registrar las entradas puntuales en compras.'
      );
      recommendations.push(
        'Las compras están equilibradas con el ritmo actual de comandas y facturación del turno.'
      );
    }

    return {
      companyId: cid,
      totalSales: +totalSales.toFixed(2),
      totalPurchases: +totalPurchases.toFixed(2),
      totalTheoreticalCost: +totalTheoreticalCost.toFixed(2),
      operatingExpenses: +operatingExpenses.toFixed(2),
      foodCostPctReal,
      foodCostPctTheoretical,
      operatingExpenseRatio,
      variancePct,
      status,
      message,
      recommendations,
    };
  };

  const expenseAnalysis = useMemo(() => {
    return getCompanyAnalysis(activeCompanyId);
  }, [activeCompanyId, transactions, purchases, orders, recipes]);

  return (
    <POSContext.Provider
      value={{
        currentUser,
        authToken,
        isAuthenticating,
        isSessionInitializing,
        authNotice,
        login,
        logout,
        catalogSyncMeta,
        isCatalogsLoading,
        isOperationsLoading,
        realtimeStatus,
        companies,
        activeCompanyId,
        setActiveCompanyId,
        activeCompany,
        currentScreen,
        setCurrentScreen,
        catalogTarget,
        setCatalogTarget,
        selectedTableId,
        setSelectedTableId,
        tables,
        filteredTables,
        products,
        productPendingOps,
        productIsSending,
        saveProduct,
        resolveProductConflict,
        filteredProducts,
        orders,
        transactions,
        filteredTransactions,
        notifications,
        lastCompletedOrder,
        isReceiptModalOpen,
        receiptMode,
        setReceiptMode,
        setIsReceiptModalOpen,
        insumos,
        recipes,
        purchases,
        kardexMovements,
        expenseAnalysis,
        getCompanyAnalysis,
        totalIngresos,
        totalEgresos,
        saldoActual,
        // Cuentas Bancarias & Métodos de Pago
        bankAccounts,
        filteredBankAccounts,
        addBankAccount,
        updateBankAccount,
        deleteBankAccount,
        paymentMethods,
        filteredPaymentMethods,
        addPaymentMethod,
        updatePaymentMethod,
        deletePaymentMethod,
        // Turnos (Día y Noche)
        companyShifts,
        companyShiftCash,
        activeShift,
        shiftRecords,
        switchCompanyShift,
        isShiftModalOpen,
        setIsShiftModalOpen,
        // Actions
        selectAndOpenTable,
        openQuickOrder,
        addItemToOrder,
        updateItemQuantity,
        updateItemNotes,
        removeItemFromOrder,
        sendToKitchen,
        proceedToPayment,
        confirmDispatchAndProceed,
        dismissKitchenConfirm,
        pendingKitchenConfirm,
        completePayment,
        addManualTransaction,
        correctSalePayment,
        addNewTable,
        addPurchase,
        regularizePurchase,
        addKardexAdjustment,
        saveRecipe,
        addInsumo,
        saveInsumo,
        deleteInsumo,
        resolveInsumoConflict,
        discardInventoryDependency,
        // Impresoras
        printers,
        thermalPrinters: printers,
        addPrinter,
        addThermalPrinter: addPrinter,
        updatePrinter,
        updateThermalPrinter: updatePrinter,
        deletePrinter,
        deleteThermalPrinter: deletePrinter,
        testPrint,
        isPrinterTestModalOpen,
        setIsPrinterTestModalOpen,
        lastPrintedTicket,
// Modo Offline
    offlineState,
    lastSyncResult,
    toggleSimulatedOffline,
        syncOfflineQueue,
        isOfflineModalOpen,
        setIsOfflineModalOpen,
        // Notifications & Reset
        addNotification,
        dismissNotification,
        resetToDemoData,
      }}
    >
      {children}
    </POSContext.Provider>
  );
};

export const usePOS = () => {
  const context = useContext(POSContext);
  if (!context) {
    throw new Error('usePOS must be used within a POSProvider');
  }
  return context;
};
