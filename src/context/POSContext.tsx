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
  KardexMovement,
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
} from '../types';
import { apiClient, ApiError, getAuthToken, storeAuthToken, clearAuthToken } from '../lib/api';
import {
  mapTable,
  mapProduct,
  mapInsumo,
  mapRecipe,
  mapBankAccount,
  mapPaymentMethod,
  mapPrinter,
  extractMeta,
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
} from '../lib/replayQueue';
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
  login: (pin: string) => Promise<boolean>;
  logout: () => void;
  // Sync de catálogos (Fase E2) — metadatos para delta-sync posterior (Fase C)
  catalogSyncMeta: CatalogSyncMeta;
  isCatalogsLoading: boolean;
  isOperationsLoading: boolean;
  // Multiempresa
  companies: Company[];
  activeCompanyId: CompanyId | 'todas';
  setActiveCompanyId: (companyId: CompanyId | 'todas') => void;
  activeCompany: Company;
  // Navigation
  currentScreen: ScreenType;
  setCurrentScreen: (screen: ScreenType) => void;
  selectedTableId: string | null;
  setSelectedTableId: (id: string | null) => void;
  // State
  tables: Table[];
  filteredTables: Table[];
  products: Product[];
  filteredProducts: Product[];
  orders: Record<string, Order>;
  transactions: Transaction[];
  filteredTransactions: Transaction[];
  notifications: NotificationItem[];
  lastCompletedOrder: Order | null;
  isReceiptModalOpen: boolean;
  setIsReceiptModalOpen: (open: boolean) => void;
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
  sendToKitchen: (tableId: string) => void;
  proceedToPayment: (tableId: string) => void;
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
  addNewTable: (number: string, capacity: number, zone: Zone) => void;
  // Compras & Kardex actions
  addPurchase: (newPurchase: Omit<Purchase, 'id' | 'time'>) => void;
  regularizePurchase: (
    purchaseId: string,
    invoiceNumber: string,
    supplierRuc: string,
    notes?: string
  ) => void;
  addKardexAdjustment: (
    insumoId: string,
    quantity: number,
    type: 'AJUSTE_MERMA' | 'ENTRADA_COMPRA',
    reason: string
  ) => void;
  saveRecipe: (recipe: Recipe) => void;
  addInsumo: (insumo: Omit<Insumo, 'id' | 'code'>) => void;
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
  const [isCatalogsLoading, setIsCatalogsLoading] = useState(false);
  const [isOperationsLoading, setIsOperationsLoading] = useState(false);

  // Metadatos de catálogos cargados desde el API (para delta-sync Fase C).
  const [catalogSyncMeta, setCatalogSyncMeta] = useState<CatalogSyncMeta>(() =>
    safeParse(STORAGE_KEYS.CATALOG_META, {})
  );

  // Empresas: catálogo real del backend (login / me). Fallback al demo local.
  const [companies, setCompanies] = useState<Company[]>(COMPANIES);

  const [activeCompanyId, setActiveCompanyId] = useState<CompanyId | 'todas'>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.ACTIVE_COMPANY);
    return (saved as CompanyId | 'todas') || 'el-tayta';
  });

  const [currentScreen, setCurrentScreen] = useState<ScreenType>('mesas');
  const [selectedTableId, setSelectedTableId] = useState<string | null>('t-02');

  const [tables, setTables] = useState<Table[]>(() => {
    return safeParse(STORAGE_KEYS.TABLES, INITIAL_TABLES);
  });

  const [products, setProducts] = useState<Product[]>(() => {
    return safeParse(STORAGE_KEYS.PRODUCTS, INITIAL_PRODUCTS);
  });

  const [orders, setOrders] = useState<Record<string, Order>>(() => {
    return safeParse(STORAGE_KEYS.ORDERS, INITIAL_ORDERS);
  });

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    return safeParse(STORAGE_KEYS.TRANSACTIONS, INITIAL_TRANSACTIONS);
  });

  const [insumos, setInsumos] = useState<Insumo[]>(() => {
    return safeParse(STORAGE_KEYS.INSUMOS, INITIAL_INSUMOS);
  });

  const [recipes, setRecipes] = useState<Recipe[]>(() => {
    return safeParse(STORAGE_KEYS.RECIPES, INITIAL_RECIPES);
  });

  const [purchases, setPurchases] = useState<Purchase[]>(() => {
    return safeParse(STORAGE_KEYS.PURCHASES, INITIAL_PURCHASES);
  });

  const [kardexMovements, setKardexMovements] = useState<KardexMovement[]>(() => {
    return safeParse(STORAGE_KEYS.KARDEX, INITIAL_KARDEX);
  });

  // Cuentas Bancarias
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>(() => {
    return safeParse(STORAGE_KEYS.BANK_ACCOUNTS, INITIAL_BANK_ACCOUNTS);
  });

  // Métodos de Pago Personalizables
  const [paymentMethods, setPaymentMethods] = useState<CustomPaymentMethod[]>(() => {
    return safeParse(STORAGE_KEYS.PAYMENT_METHODS, INITIAL_PAYMENT_METHODS);
  });

  // Turnos por empresa (El cliente sólo maneja 2 turnos: Día y Noche)
  const [companyShifts, setCompanyShifts] = useState<Record<CompanyId, ShiftType>>(() => {
    return safeParse(STORAGE_KEYS.SHIFTS, { 'el-tayta': 'Día', 'el-sabroso': 'Día' });
  });

  const [shiftRecords, setShiftRecords] = useState<ShiftRecord[]>(() => {
    return safeParse(STORAGE_KEYS.SHIFT_RECORDS, [
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
    return safeParse(STORAGE_KEYS.PRINTERS, INITIAL_PRINTERS);
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
      setProducts(items);
      metaUpdates.products = extractMeta('products', items);
    });
    settle(results[2], (dtos) => {
      const items = dtos.map(mapInsumo);
      setInsumos((prev) => withTemps(items, prev));
      metaUpdates.insumos = extractMeta('insumos', items);
    });
    settle(results[3], (dtos) => {
      const items = dtos.map(mapRecipe);
      setRecipes((prev) => withTemps(items, prev));
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
      setInsumos(dtos.map(mapInsumo));
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
      const items = dtos.map(mapOrder);
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
  const replayOfflineQueue = async (): Promise<void> => {
    if (isReplayingRef.current) return;
    const queue = loadQueue();
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

    const flushTmpItems = async (serverOrderId: string, tmpOrderId: string): Promise<Order> => {
      const tmpOrder = orders[tmpOrderId];
      const refreshed = serverOrderId;
      if (tmpOrder && tmpOrder.items.length > 0) {
        for (const it of tmpOrder.items) {
          await apiClient.post(`/operations/orders/${refreshed}/items`, {
            productId: it.productId,
            quantity: it.quantity,
            notes: it.notes || undefined,
          });
        }
      }
      const dto = await apiClient.get<OrderDTO>(`/operations/orders/${refreshed}`);
      return mapOrder(dto);
    };

    const migrateTmpOrder = (serverOrder: Order, tmpOrderId: string, tmpTableId?: string) => {
      setOrders((prev) => {
        const next = { ...prev };
        delete next[tmpOrderId];
        next[serverOrder.id] = serverOrder;
        return next;
      });
      setTables((prev) => {
        if (tmpTableId) {
          const rest = prev.filter((t) => t.id !== tmpTableId);
          const existing = rest.find((t) => t.id === serverOrder.tableId);
          if (existing) {
            return rest.map((t) =>
              t.id === existing.id ? { ...t, status: 'ocupada', currentOrderId: serverOrder.id, waiter: serverOrder.waiter } : t
            );
          }
          return [
            ...rest,
            {
              id: serverOrder.tableId,
              companyId: serverOrder.companyId as CompanyId,
              number: serverOrder.tableNumber,
              capacity: 2,
              zone: serverOrder.zone,
              status: 'ocupada',
              currentOrderId: serverOrder.id,
              waiter: serverOrder.waiter,
            } as Table,
          ];
        }
        return prev.map((t) =>
          t.currentOrderId === tmpOrderId ? { ...t, currentOrderId: serverOrder.id } : t
        );
      });
      setSelectedTableId((prevId) =>
        prevId !== null && (prevId === tmpOrderId || prevId === tmpTableId) ? serverOrder.tableId : prevId
      );
      delete tmpOrderItemsRef.current[tmpOrderId];
      delete tmpOrderOpRef.current[tmpOrderId];
    };

    // Fase E5: reconcilia un alta de catálogo aplicada en el replay (reemplaza el id
    // temporal por el id real del server). Para recetas conserva ingredientes locales
    // si el PATCH del server no los devuelve (updateRecipe no incluye `ingredients`).
    const reconcileCatalogCreate = (op: string, tempId: string | undefined, data: unknown) => {
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
      } else if (op === 'createInsumo') {
        const server = mapInsumo(data as InsumoDTO);
        setInsumos((prev) => {
          const next = prev.filter((i) => i.id !== tempId);
          return next.some((i) => i.id === server.id) ? next : [...next, server];
        });
      }
    };

    for (const opItem of queue) {
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
        const tmpOrder = tmpOrderId ? orders[tmpOrderId] : undefined;
        if (!tmpOrder) {
          // La comanda temporal se abandonó offline (mesa liberada al vaciarla) → no crear orden fantasma.
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
        const reconciled = await flushTmpItems(serverOrder.id, tmpOrderId);
        migrateTmpOrder(reconciled, tmpOrderId, tmpTableId);
        removeByClientOpId(opItem.clientOpId);
        synced += 1;
        setLastSyncResult({ ok: true, ts: Date.now(), op: opItem.op });
        continue;
      }

      const result = await replayCall(opItem, payload);
      if (result.disposition === 'ok') {
        if (opItem.entity === 'catalog') {
          reconcileCatalogCreate(opItem.op, payload.tempId as string | undefined, result.data);
        }
        removeByClientOpId(opItem.clientOpId);
        synced += 1;
      } else if (result.disposition === 'retry') {
        stuck += 1;
        stuckNetwork = stuckNetwork || result.network === true;
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
      addNotification(
        'Sincronización interrumpida',
        'Hubo un problema al sincronizar; las operaciones siguen en cola y se reintentarán al reconectar.',
        'warning'
      );
    } finally {
      isReplayingRef.current = false;
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
  }): Promise<void> => {
    if (offlineState.isSimulatedOffline) {
      enqueueOp({
        clientOpId: params.clientOpId,
        entity: params.entity,
        op: params.op,
        payload: params.queuePayload,
        createdAt: new Date().toISOString(),
      });
      syncPendingCount();
      return;
    }
    try {
      await params.endpointOp();
      setLastSyncResult({ ok: true, ts: Date.now(), op: params.op });
    } catch (err) {
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        if (err.status === 401 && err.isUnauthorized) {
          setLastSyncResult({ ok: false, ts: Date.now(), op: params.op });
          addNotification(
            'Sesión expirada',
            'Su sesión venció. Por favor, vuelva a iniciar sesión.',
            'warning'
          );
          logout();
          return;
        }
        params.rollback?.();
        setLastSyncResult({ ok: false, ts: Date.now(), op: params.op });
        addNotification('Operación rechazada por el servidor', `${params.op}: ${err.message}`, 'warning');
        loadOperations();
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
      }
    }
  };

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
        deviceCode: 'TERM-CENTRAL-01',
        terminalName: 'Terminal Central 01',
      });
      storeAuthToken({ token: res.token, expiresAt: res.expiresAt });
      setAuthToken({ token: res.token, expiresAt: res.expiresAt });
      setCurrentUser(res.user);
      setCompanies(res.companies);
      setCompanyShifts(mapCompanyShifts(res.companyShifts));

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

  const logout = () => {
    const auth = getAuthToken();
    if (auth) {
      apiClient.post<unknown>('/auth/logout').catch(() => undefined);
    }
    clearAuthToken();
    setAuthToken(null);
    setCurrentUser(null);
    setCurrentScreen('mesas');
    setSelectedTableId(null);
    addNotification('Sesión cerrada', 'Se invalidó el token en el servidor.', 'info');
  };

  // Active Company Definition
  const activeCompany = useMemo(() => {
    if (activeCompanyId === 'todas') {
      return {
        id: 'el-tayta' as CompanyId,
        name: 'Grupo Gastronómico Tayta & Sabroso',
        tradeName: 'Tayta & Sabroso Holding',
        ruc: '20601234567 / 20609876543',
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
    const subtotal = order.items.reduce(
      (acc, item) => acc + item.price * item.quantity,
      0
    );
    const igv = +(subtotal * 0.18).toFixed(2);
    const total = +(subtotal + igv).toFixed(2);
    return {
      ...order,
      subtotal: +subtotal.toFixed(2),
      igv,
      total,
    };
  };

  // KARDEX DEDUCTION ENGINE: Explode recipe and deduct ingredients
  const deductIngredientsForOrder = (order: Order, reasonLabel: string) => {
    const newKardexItems: KardexMovement[] = [];
    const stockDeductions: Record<string, number> = {};

    order.items.forEach((item) => {
      // Find matching recipe for the product
      const recipe = recipes.find(
        (r) => r.productId === item.productId || r.productName === item.name
      );
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
            const newStock = Math.max(0, +(ins.currentStock - stockDeductions[ins.id]).toFixed(2));
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
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const tmpOrderId = `order-tmp-${Date.now()}`;
      const clientOpId = newUuid();

      const newOrder: Order = {
        id: tmpOrderId,
        companyId: table.companyId,
        ticketNumber: `${Math.floor(10000 + Math.random() * 90000)}`,
        tableId: table.id,
        tableNumber: table.number,
        zone: table.zone,
        waiter: currentUser?.name || 'Carlos M.',
        items: [],
        createdAt: timeStr,
        subtotal: 0,
        igv: 0,
        total: 0,
        status: 'abierto',
      };

      setOrders((prev) => ({ ...prev, [tmpOrderId]: newOrder }));
      setTables((prev) =>
        prev.map((t) =>
          t.id === tableId
            ? {
                ...t,
                status: 'ocupada',
                occupiedSince: timeStr,
                minutesElapsed: 1,
                currentOrderId: tmpOrderId,
                waiter: currentUser?.name || 'Carlos M.',
              }
            : t
        )
      );

      setCurrentScreen('pedido');
      addNotification(`Mesa ${table.number} Abierta`, 'Se inició una nueva comanda.', 'info');

      // Write-through (Fase E3): abre la orden real en el server y reconcilia ids.
      // (tmpOrderId viaja en el payload para que el replay E4 refluya los ítems si se encoló offline.)
      tmpOrderOpRef.current[tmpOrderId] = clientOpId;
      attemptMutation({
        clientOpId,
        entity: 'order',
        op: 'openOrder',
        queuePayload: { tableId, waiter: newOrder.waiter, clientOpId, tmpOrderId },
        endpointOp: async () => {
          const res = await apiClient.post<OrderDTO>('/operations/orders/open', {
            tableId,
            waiter: newOrder.waiter,
            clientOpId,
          });
          const serverOrder = mapOrder(res);
          const pendingItems = tmpOrderItemsRef.current[tmpOrderId] ?? [];
          delete tmpOrderItemsRef.current[tmpOrderId];
          delete tmpOrderOpRef.current[tmpOrderId];
          setOrders((prev) => {
            const next = { ...prev };
            delete next[tmpOrderId];
            next[serverOrder.id] = serverOrder;
            return next;
          });
          setTables((prev) =>
            prev.map((t) => (t.id === tableId ? { ...t, currentOrderId: serverOrder.id } : t))
          );
          if (pendingItems.length > 0) {
            for (const it of pendingItems) {
              await apiClient.post(`/operations/orders/${serverOrder.id}/items`, {
                productId: it.productId,
                quantity: it.quantity,
                notes: it.notes || undefined,
              });
            }
            const refreshed = await apiClient.get<OrderDTO>(`/operations/orders/${serverOrder.id}`);
            setOrders((prev) => ({ ...prev, [serverOrder.id]: mapOrder(refreshed) }));
          }
        },
        rollback: () => {
          delete tmpOrderItemsRef.current[tmpOrderId];
          delete tmpOrderOpRef.current[tmpOrderId];
          setOrders((prev) => {
            const next = { ...prev };
            delete next[tmpOrderId];
            return next;
          });
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
        },
      });
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

      const tmpOrderId = `order-tmp-${Date.now()}`;
      const clientOpId = newUuid();
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const tmpOrder: Order = {
        id: tmpOrderId,
        companyId: compId,
        ticketNumber: `${Math.floor(10000 + Math.random() * 90000)}`,
        tableId: newId,
        tableNumber: newNum,
        zone: 'Barra',
        waiter: currentUser?.name || 'Carlos M.',
        items: [],
        createdAt: timeStr,
        subtotal: 0,
        igv: 0,
        total: 0,
        status: 'abierto',
      };

      setOrders((prev) => ({ ...prev, [tmpOrderId]: tmpOrder }));
      setTables((prev) =>
        prev.map((t) =>
          t.id === newId
            ? {
                ...t,
                status: 'ocupada',
                occupiedSince: timeStr,
                minutesElapsed: 1,
                currentOrderId: tmpOrderId,
                waiter: currentUser?.name || 'Carlos M.',
              }
            : t
        )
      );
      setSelectedTableId(newId);
      setCurrentScreen('pedido');
      addNotification(`Mesa ${newNum} Abierta`, 'Comanda rápida de Barra.', 'info');

      // Write-through (Fase E3): el server crea la mesa de barra y la orden.
      // (tmpOrderId/tmpTableId viajan en el payload para el replay E4.)
      tmpOrderOpRef.current[tmpOrderId] = clientOpId;
      attemptMutation({
        clientOpId,
        entity: 'order',
        op: 'quickOrder',
        queuePayload: {
          companyId: compId,
          waiter: tmpOrder.waiter,
          clientOpId,
          tmpOrderId,
          tmpTableId: newId,
        },
        endpointOp: async () => {
          const res = await apiClient.post<OrderDTO>('/operations/orders/quick-bar', {
            companyId: compId,
            waiter: tmpOrder.waiter,
            clientOpId,
          });
          const serverOrder = mapOrder(res);
          const pendingItems = tmpOrderItemsRef.current[tmpOrderId] ?? [];
          delete tmpOrderItemsRef.current[tmpOrderId];
          delete tmpOrderOpRef.current[tmpOrderId];
          setOrders((prev) => {
            const next = { ...prev };
            delete next[tmpOrderId];
            next[serverOrder.id] = serverOrder;
            return next;
          });
          setTables((prev) => {
            const withoutTmp = prev.filter((t) => t.id !== newId);
            const serverTable: Table = {
              id: serverOrder.tableId,
              companyId: compId,
              number: serverOrder.tableNumber,
              capacity: 2,
              zone: serverOrder.zone,
              status: 'ocupada',
              occupiedSince: timeStr,
              minutesElapsed: 1,
              currentOrderId: serverOrder.id,
              waiter: serverOrder.waiter,
            };
            return [...withoutTmp, serverTable];
          });
          setSelectedTableId(serverOrder.tableId);
          if (pendingItems.length > 0) {
            for (const it of pendingItems) {
              await apiClient.post(`/operations/orders/${serverOrder.id}/items`, {
                productId: it.productId,
                quantity: it.quantity,
                notes: it.notes || undefined,
              });
            }
            const refreshed = await apiClient.get<OrderDTO>(`/operations/orders/${serverOrder.id}`);
            setOrders((prev) => ({ ...prev, [serverOrder.id]: mapOrder(refreshed) }));
          }
        },
        rollback: () => {
          delete tmpOrderItemsRef.current[tmpOrderId];
          delete tmpOrderOpRef.current[tmpOrderId];
          setOrders((prev) => {
            const next = { ...prev };
            delete next[tmpOrderId];
            return next;
          });
          setTables((prev) => prev.filter((t) => t.id !== newId));
          setSelectedTableId(null);
        },
      });
    }
  };

  // Add Item to Order
  const addItemToOrder = (tableId: string, product: Product, notes: string = '') => {
    const table = tables.find((t) => t.id === tableId);
    if (!table) return;

    let orderId = table.currentOrderId;
    let currentOrder = orderId ? orders[orderId] : null;

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (!currentOrder) {
      // Gap #4 fix: nunca fabricar `order-<table>-...` (404 garantizado en el
      // server). Se crea `order-tmp-*` y se dispara el openOrder real con flush,
      // igual que selectAndOpenTable. El guard serverIssued de abajo queda para
      // órdenes ya reconciliadas.
      const tmpOrderId = `order-tmp-${Date.now()}`;
      const tmpClientOpId = newUuid();
      const ticketNumber = `${Math.floor(10000 + Math.random() * 90000)}`;
      const baseOrder: Order = {
        id: tmpOrderId,
        companyId: table.companyId,
        ticketNumber,
        tableId: table.id,
        tableNumber: table.number,
        zone: table.zone,
        waiter: currentUser?.name || 'Carlos M.',
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
      setOrders((prev) => ({ ...prev, [tmpOrderId]: createdOrder }));
      setTables((prev) =>
        prev.map((t) =>
          t.id === tableId
            ? {
                ...t,
                status: t.status === 'libre' ? 'ocupada' : t.status,
                currentOrderId: tmpOrderId,
                occupiedSince: t.occupiedSince || timeStr,
              }
            : t
        )
      );
      tmpOrderItemsRef.current[tmpOrderId] = createdOrder.items;
      tmpOrderOpRef.current[tmpOrderId] = tmpClientOpId;
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
          const serverOrder = mapOrder(res);
          const pendingItems = tmpOrderItemsRef.current[tmpOrderId] ?? [];
          delete tmpOrderItemsRef.current[tmpOrderId];
          delete tmpOrderOpRef.current[tmpOrderId];
          setOrders((prev) => {
            const next = { ...prev };
            delete next[tmpOrderId];
            next[serverOrder.id] = serverOrder;
            return next;
          });
          setTables((prev) =>
            prev.map((t) => (t.id === tableId ? { ...t, currentOrderId: serverOrder.id } : t))
          );
          if (pendingItems.length > 0) {
            for (const it of pendingItems) {
              await apiClient.post(`/operations/orders/${serverOrder.id}/items`, {
                productId: it.productId,
                quantity: it.quantity,
                notes: it.notes || undefined,
              });
            }
            const refreshed = await apiClient.get<OrderDTO>(`/operations/orders/${serverOrder.id}`);
            setOrders((prev) => ({ ...prev, [serverOrder.id]: mapOrder(refreshed) }));
          }
        },
        rollback: () => {
          delete tmpOrderItemsRef.current[tmpOrderId];
          delete tmpOrderOpRef.current[tmpOrderId];
          setOrders((prev) => {
            const next = { ...prev };
            delete next[tmpOrderId];
            return next;
          });
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
          setOrders((prev) => ({ ...prev, [res.id]: mapOrder(res) }));
        },
      });
    } else if (orderId) {
      tmpOrderItemsRef.current[orderId] = updatedOrder.items;
    }
  };

  const vacateTableState = (tableId: string, orderId: string) => {
    const table = tables.find((t) => t.id === tableId);
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
    setOrders((prev) => {
      const next = { ...prev };
      delete next[orderId];
      return next;
    });
    setSelectedTableId(null);
    setCurrentScreen('mesas');
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

    const orderId = table.currentOrderId;
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
      vacateTableState(tableId, orderId);
      // Write-through (Fase E3): solo si la orden ya existe en el server.
      if (!orderId.startsWith('order-tmp-')) {
        attemptMutation({
          clientOpId: newUuid(),
          entity: 'orderItem',
          op: 'updateItemQuantity',
          queuePayload: { orderId, itemId, delta },
          endpointOp: async () => {
            const res = await apiClient.patch<OrderDTO>(
              `/operations/orders/${orderId}/items/${itemId}/quantity`,
              { delta }
            );
            // El server libera la mesa y soft-deletea la orden cuando no quedan ítems.
            // Refrescamos para reflejar la verdad del servidor.
            if (res.isDeleted) {
              vacateTableState(tableId, orderId);
            } else {
              setOrders((prev) => ({ ...prev, [res.id]: mapOrder(res) }));
            }
          },
          rollback: () => {
            setTables((prev) =>
              prev.map((t) => (t.id === tableId ? { ...t, ...prevTableIdFields } : t))
            );
            setOrders((prev) => ({ ...prev, [orderId]: currentOrder }));
            setSelectedTableId(prevSelectedTableId);
            setCurrentScreen(prevScreen);
          },
        });
      } else {
        // Orden temporal abandonada offline => retirar de la cola la op de apertura encolada.
        const openOpId = tmpOrderOpRef.current[orderId];
        if (openOpId) {
          removeByClientOpId(openOpId);
          delete tmpOrderOpRef.current[orderId];
        }
      }
      return;
    }

    setOrders((prev) => ({ ...prev, [orderId]: updatedOrder }));

    // Write-through (Fase E3): solo si la orden ya existe en el server.
    if (orderId && !orderId.startsWith('order-tmp-')) {
      attemptMutation({
        clientOpId: newUuid(),
        entity: 'orderItem',
        op: 'updateItemQuantity',
        queuePayload: { orderId, itemId, delta },
        endpointOp: async () => {
          const res = await apiClient.patch<OrderDTO>(
            `/operations/orders/${orderId}/items/${itemId}/quantity`,
            { delta }
          );
          setOrders((prev) => ({ ...prev, [res.id]: mapOrder(res) }));
        },
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

    const orderId = table.currentOrderId;
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
      vacateTableState(tableId, orderId);
      // Write-through (Fase E3): solo si la orden ya existe en el server.
      if (!orderId.startsWith('order-tmp-')) {
        attemptMutation({
          clientOpId: newUuid(),
          entity: 'orderItem',
          op: 'removeItem',
          queuePayload: { orderId, itemId },
          endpointOp: async () => {
            const res = await apiClient.del<OrderDTO>(`/operations/orders/${orderId}/items/${itemId}`);
            // El server libera la mesa y soft-deletea la orden cuando no quedan ítems.
            // Refrescamos para reflejar la verdad del servidor.
            if (res.isDeleted) {
              vacateTableState(tableId, orderId);
            } else {
              setOrders((prev) => ({ ...prev, [res.id]: mapOrder(res) }));
            }
          },
          rollback: () => {
            setTables((prev) =>
              prev.map((t) => (t.id === tableId ? { ...t, ...prevTableIdFields } : t))
            );
            setOrders((prev) => ({ ...prev, [orderId]: currentOrder }));
            setSelectedTableId(prevSelectedTableId);
            setCurrentScreen(prevScreen);
          },
        });
      } else {
        // Orden temporal abandonada offline => retirar de la cola la op de apertura encolada.
        const openOpId = tmpOrderOpRef.current[orderId];
        if (openOpId) {
          removeByClientOpId(openOpId);
          delete tmpOrderOpRef.current[orderId];
        }
      }
      return;
    }

    setOrders((prev) => ({ ...prev, [orderId]: updatedOrder }));

    // Write-through (Fase E3): solo si la orden ya existe en el server.
    if (orderId && !orderId.startsWith('order-tmp-')) {
      attemptMutation({
        clientOpId: newUuid(),
        entity: 'orderItem',
        op: 'removeItem',
        queuePayload: { orderId, itemId },
        endpointOp: async () => {
          const res = await apiClient.del<OrderDTO>(`/operations/orders/${orderId}/items/${itemId}`);
          setOrders((prev) => ({ ...prev, [res.id]: mapOrder(res) }));
        },
      });
    }
  };

  // Send to kitchen (Triggers Recipe Kardex deduction)
  const sendToKitchen = (tableId: string) => {
    const table = tables.find((t) => t.id === tableId);
    if (!table || !table.currentOrderId) return;

    const currentOrder = orders[table.currentOrderId];
    if (!currentOrder || currentOrder.items.length === 0) {
      addNotification('Comanda Vacía', 'Agrega productos antes de enviar a cocina.', 'warning');
      return;
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
    if (orderId && (!orderId.startsWith('order-tmp-') || offlineState.isSimulatedOffline)) {
      const clientOpId = newUuid();
      attemptMutation({
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

    addNotification(
      'Comanda Enviada a Cocina',
      `Mesa ${table.number} (${table.companyId === 'el-tayta' ? 'El Tayta' : 'El Sabroso'}) • Insumos rebajados de Kardex.`,
      'success'
    );
  };

  const proceedToPayment = (tableId: string) => {
    const table = tables.find((t) => t.id === tableId);
    if (!table || !table.currentOrderId) return;

    const currentOrder = orders[table.currentOrderId];
    if (!currentOrder || currentOrder.items.length === 0) {
      addNotification('Sin productos', 'No hay ítems para cobrar en esta mesa.', 'warning');
      return;
    }

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

    setOrders((prev) => ({
      ...prev,
      [table.currentOrderId!]: {
        ...currentOrder,
        status: 'por_cobrar',
      },
    }));

    setSelectedTableId(tableId);
    setCurrentScreen('cobro');

    // Write-through (Fase E3): persiste el estado "por cobrar" en el server.
    // (E4: también se encola si la orden es temporal y estamos offline.)
    const orderId = table.currentOrderId;
    if (orderId && (!orderId.startsWith('order-tmp-') || offlineState.isSimulatedOffline)) {
      const prevTableStatus = table.status;
      const prevOrderStatus = currentOrder.status;
      attemptMutation({
        clientOpId: newUuid(),
        entity: 'order',
        op: 'markForBilling',
        queuePayload: { orderId, tableId, tmpTableId: orderId.startsWith('order-tmp-') ? tableId : undefined },
        endpointOp: async () => {
          const res = await apiClient.post<OrderDTO>(`/operations/tables/${tableId}/por-cobrar`);
          setOrders((prev) => ({ ...prev, [res.id]: mapOrder(res) }));
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
    const matchedPm = paymentMethods.find(
      (p) =>
        (customPaymentMethodId && p.id === customPaymentMethodId) ||
        p.name.toLowerCase() === (paymentMethod as string).toLowerCase()
    );

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
    if (!orderId.startsWith('order-tmp-') || offlineState.isSimulatedOffline) {
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
          setLastCompletedOrder(serverOrder);
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
        totalCost: Number(i.totalCost) || 0,
      })),
    };

    setPurchases((prev) => [completedPurchase, ...prev]);

    // 1. Add Kardex Entrada for each item
    const newKardexEntries: KardexMovement[] = completedPurchase.items.map((item) => {
      const existingInsumo = insumos.find((i) => i.id === item.insumoId);
      const stockBefore = existingInsumo ? existingInsumo.currentStock : 0;
      const stockAfter = +(stockBefore + item.quantity).toFixed(2);

      return {
        id: `kdx-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
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
        unitCost: item.unitCost,
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
          const totalNewCost = itemPurchased.quantity * itemPurchased.unitCost;
          const newTotalStock = ins.currentStock + itemPurchased.quantity;
          const weightedCost =
            newTotalStock > 0
              ? +((totalOldCost + totalNewCost) / newTotalStock).toFixed(2)
              : itemPurchased.unitCost;

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
        documentStatus: completedPurchase.documentStatus,
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
          documentStatus: completedPurchase.documentStatus,
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
      `${completedPurchase.documentStatus === 'provisional' ? 'Vale provisional' : 'Factura'} #${completedPurchase.invoiceNumber || completedPurchase.provisionalNoteNumber} ingresada al Kardex (+${completedPurchase.items.length} insumos).`,
      'success'
    );
  };

  // Regularize Purchase (pasar a limpio vale con factura/boleta formal)
  const regularizePurchase = (
    purchaseId: string,
    invoiceNumber: string,
    supplierRuc: string,
    notes?: string
  ) => {
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
      queuePayload: { purchaseId, invoiceNumber: invoiceNumber.trim(), supplierRuc: supplierRuc.trim(), notes, clientOpId },
      endpointOp: async () => {
        const res = await apiClient.post<PurchaseDTO>(`/operations/purchases/${purchaseId}/regularize`, {
          invoiceNumber: invoiceNumber.trim(),
          supplierRuc: supplierRuc.trim(),
          notes: notes || undefined,
        });
        const serverPurchase = mapPurchase(res);
        setPurchases((prev) =>
          prev.map((p) => (p.id === serverPurchase.id ? serverPurchase : p))
        );
        void refreshKardex();
        void refreshTransactions();
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
      (t) => t.companyId === companyId && (!t.shift || t.shift === currentShift)
    );

    const cashSales = compTxs
      .filter((t) => t.isIncome && (t.paymentMethod === 'Efectivo' || !t.bankAccountId))
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
      .filter((t) => !t.isIncome)
      .reduce((sum, t) => sum + t.amount, 0);

    // Gap #6 fix: caja inicial desde el último arqueo local (el server usa su
    // companyShift.initialCash como verdad y el refresh post-write la impone).
    // Además se calcula bankTransferSales en vez de dejarlo en 0.
    const lastRecord = shiftRecords.find((r) => r.companyId === companyId);
    const initialCash = lastRecord ? lastRecord.initialCash : 350.0;
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
    const systemCashExpected = +(initialCash + cashSales - totalExpenses).toFixed(2);
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
    const stockAfter = Math.max(0, +(stockBefore + stockDelta).toFixed(2));
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
  const saveRecipe = (recipe: Recipe) => {
    const existed = recipes.some((r) => r.id === recipe.id);
    const queuedOp = tmpCatalogOpRef.current[recipe.id];
    setRecipes((prev) => {
      const idx = prev.findIndex((r) => r.id === recipe.id);
      if (idx > -1) {
        const copy = [...prev];
        copy[idx] = recipe;
        return copy;
      }
      return [recipe, ...prev];
    });

    const serverBody = {
      companyId: recipe.companyId,
      productId: recipe.productId || undefined,
      productName: recipe.productName,
      category: recipe.category,
      portions: recipe.portions,
      salePrice: recipe.salePrice,
      totalCost: recipe.totalCost,
      theoreticalFoodCostPct: recipe.theoreticalFoodCostPct,
      preparationNotes: recipe.preparationNotes,
      ingredients: recipe.ingredients.map((ing) => ({
        insumoId: ing.insumoId || null,
        insumoName: ing.insumoName,
        quantity: ing.quantity,
        unit: ing.unit,
        costPerUnit: ing.costPerUnit,
        subtotalCost: ing.subtotalCost,
      })),
    };

    // Edición de un alta aún no sincronizada: se parchea el save encolado.
    if (queuedOp) {
      updateQueuedPayload(queuedOp, { ...serverBody });
      addNotification('Receta Guardada', `Ficha técnica de "${recipe.productName}" actualizada.`, 'success');
      return;
    }

    const clientOpId = newUuid();
    if (!existed) tmpCatalogOpRef.current[recipe.id] = clientOpId;
    attemptMutation({
      clientOpId,
      entity: 'catalog',
      op: 'saveRecipe',
      queuePayload: { id: recipe.id, ...serverBody, ...(!existed ? { tempId: recipe.id } : {}) },
      endpointOp: async () => {
        let res: RecipeDTO;
        try {
          res = await apiClient.patch<RecipeDTO>(`/catalogs/recipes/${recipe.id}`, serverBody);
        } catch (err) {
          if (err instanceof ApiError && err.status === 404) {
            res = await apiClient.post<RecipeDTO>('/catalogs/recipes', serverBody);
          } else {
            throw err;
          }
        }
        const mapped = mapRecipe(res);
        const full: Recipe =
          mapped.ingredients.length === 0 && recipe.ingredients.length > 0
            ? { ...mapped, ingredients: recipe.ingredients }
            : mapped;
        delete tmpCatalogOpRef.current[recipe.id];
        setRecipes((prev) => {
          const next = prev.filter((r) => r.id !== recipe.id);
          return next.some((r) => r.id === full.id) ? next : [full, ...next];
        });
      },
      rollback: () => {
        delete tmpCatalogOpRef.current[recipe.id];
        if (!existed) {
          setRecipes((prev) => prev.filter((r) => r.id !== recipe.id));
        }
      },
    });

    addNotification('Receta Guardada', `Ficha técnica de "${recipe.productName}" actualizada.`, 'success');
  };

  // Add Insumo (Fase E5: write-through a POST /catalogs/insumos; el server asigna
  // id/code reales — se reemplazan al reconciliar, F5 persiste)
  const addInsumo = (insumoData: Omit<Insumo, 'id' | 'code'>) => {
    const tempId = `ins-${Date.now()}`;
    const clientOpId = newUuid();
    const newCode = `INS-${String(insumos.length + 1).padStart(3, '0')}`;
    const newInsumo: Insumo = { ...insumoData, id: tempId, code: newCode };
    setInsumos((prev) => [...prev, newInsumo]);
    tmpCatalogOpRef.current[tempId] = clientOpId;
    attemptMutation({
      clientOpId,
      entity: 'catalog',
      op: 'createInsumo',
      queuePayload: {
        companyId: insumoData.companyId === 'ambas' ? null : insumoData.companyId,
        name: insumoData.name,
        category: insumoData.category,
        unit: insumoData.unit,
        currentStock: insumoData.currentStock,
        minStock: insumoData.minStock,
        costPerUnit: insumoData.costPerUnit,
        lastPurchaseDate: insumoData.lastPurchaseDate,
        tempId,
      },
      endpointOp: async () => {
        const res = await apiClient.post<InsumoDTO>('/catalogs/insumos', {
          companyId: insumoData.companyId === 'ambas' ? null : insumoData.companyId,
          name: insumoData.name,
          category: insumoData.category,
          unit: insumoData.unit,
          currentStock: insumoData.currentStock,
          minStock: insumoData.minStock,
          costPerUnit: insumoData.costPerUnit,
          lastPurchaseDate: insumoData.lastPurchaseDate,
        });
        const server = mapInsumo(res);
        delete tmpCatalogOpRef.current[tempId];
        setInsumos((prev) => {
          const next = prev.filter((i) => i.id !== tempId);
          return next.some((i) => i.id === server.id) ? next : [...next, server];
        });
      },
      rollback: () => {
        delete tmpCatalogOpRef.current[tempId];
        setInsumos((prev) => prev.filter((i) => i.id !== tempId));
      },
    });
    addNotification('Insumo Creado', `Insumo "${newInsumo.name}" registrado en Kardex.`, 'success');
  };

  // Reset to Demo Data
  const resetToDemoData = () => {
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
  const { totalIngresos, totalEgresos, saldoActual } = useMemo(() => {
    let ingresos = 0;
    let egresos = 0;

    filteredTransactions.forEach((tx) => {
      if (tx.isIncome) {
        ingresos += tx.amount;
      } else {
        egresos += tx.amount;
      }
    });

    return {
      totalIngresos: +ingresos.toFixed(2),
      totalEgresos: +egresos.toFixed(2),
      saldoActual: +(ingresos - egresos).toFixed(2),
    };
  }, [filteredTransactions]);

  // FINANCIAL RATIOS & EXPENSE RATIOS ENGINE ("¿Se está pasando de gastos?")
  const getCompanyAnalysis = (cid: CompanyId | 'todas'): ExpenseRatioAnalysis => {
    const txs = cid === 'todas' ? transactions : transactions.filter((t) => t.companyId === cid);
    const purs = cid === 'todas' ? purchases : purchases.filter((p) => p.companyId === cid);
    const ords = (Object.values(orders) as Order[]).filter(
      (o) => cid === 'todas' || o.companyId === cid
    );

    const totalSales = txs.filter((t) => t.isIncome).reduce((sum, t) => sum + t.amount, 0);
    const totalPurchases = purs.reduce((sum, p) => sum + p.total, 0);
    const operatingExpenses = txs
      .filter((t) => !t.isIncome && t.type !== 'Pago Proveedor')
      .reduce((sum, t) => sum + t.amount, 0);

    // Calculate theoretical cost of sold dishes from recipes
    let totalTheoreticalCost = 0;
    ords
      .filter((o) => o.status === 'cobrado' || o.status === 'en_cocina')
      .forEach((o) => {
        o.items.forEach((item) => {
          const rec = recipes.find(
            (r) => r.productId === item.productId || r.productName === item.name
          );
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
        login,
        logout,
        catalogSyncMeta,
        isCatalogsLoading,
        isOperationsLoading,
        companies,
        activeCompanyId,
        setActiveCompanyId,
        activeCompany,
        currentScreen,
        setCurrentScreen,
        selectedTableId,
        setSelectedTableId,
        tables,
        filteredTables,
        products,
        filteredProducts,
        orders,
        transactions,
        filteredTransactions,
        notifications,
        lastCompletedOrder,
        isReceiptModalOpen,
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
        completePayment,
        addManualTransaction,
        addNewTable,
        addPurchase,
        regularizePurchase,
        addKardexAdjustment,
        saveRecipe,
        addInsumo,
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
