import type {
  CompanyId,
  Table,
  Product,
  Insumo,
  Recipe,
  BankAccount,
  CustomPaymentMethod,
  ThermalPrinterConfig,
  CatalogEntity,
  CatalogMeta,
} from '../types';

// ============================ DTOs (contrato API) ============================
// Respuesta cruda de GET /api/catalogs/* (el backend envía JSON legible tras `plain()`:
// Decimal → number, Date → ISO string). El JSON de la API queda en inglés.

export interface TableDTO {
  id: string;
  companyId: string;
  number: string;
  capacity: number;
  zone: string;
  status: string;
  occupiedSince?: string | null;
  minutesElapsed?: number | null;
  currentOrderId?: string | null;
  waiter?: string | null;
  notes?: string | null;
  isDeleted?: boolean;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductDTO {
  id: string;
  companyId: string;
  name: string;
  description: string;
  price: number;
  category: string;
  image: string;
  available: boolean;
  hasRecipe?: boolean;
  isDeleted?: boolean;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface InsumoDTO {
  id: string;
  companyId: string | null; // null = 'ambas' (compartido)
  code: string;
  name: string;
  category: string;
  unit: string;
  currentStock: number;
  minStock: number;
  costPerUnit: number;
  lastPurchaseDate?: string | null;
  lastPurchaseUtc?: string | null;
  isDeleted?: boolean;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface RecipeIngredientDTO {
  id: string;
  recipeId: string;
  insumoId?: string | null;
  insumoName: string;
  quantity: number;
  unit: string;
  costPerUnit: number;
  subtotalCost: number;
}

export interface RecipeDTO {
  id: string;
  companyId: string;
  productId?: string | null;
  productName: string;
  category: string;
  portions: number;
  salePrice: number;
  totalCost: number;
  theoreticalFoodCostPct: number;
  preparationNotes?: string | null;
  isDeleted?: boolean;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
  ingredients: RecipeIngredientDTO[];
}

export interface BankAccountDTO {
  id: string;
  companyId: string;
  bankName: string;
  accountNumber: string;
  cci?: string | null;
  accountType: string;
  currency: string;
  holderName: string;
  alias: string;
  currentBalance: number;
  isActive: boolean;
  notes?: string | null;
  isDeleted?: boolean;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface CustomPaymentMethodDTO {
  id: string;
  companyId: string | null; // null = 'ambas' (compartido)
  name: string;
  category: string;
  bankAccountId?: string | null;
  bankAccountAlias?: string | null;
  commissionPct?: number | null;
  requiresReferenceNumber: boolean;
  icon: string;
  isActive: boolean;
  isDeleted?: boolean;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface PrinterCategoryDTO {
  id: string;
  printerId: string;
  category: string;
  idx: number;
}

export interface PrinterDTO {
  id: string;
  companyId: string | null; // null = 'ambas' (compartido)
  name: string;
  role: string;
  connectionType: string;
  ipAddress?: string | null;
  port?: number | null;
  paperWidth: string;
  autoCut: boolean;
  beepOnPrint: boolean;
  status: string;
  isEnabled: boolean;
  isDeleted?: boolean;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
  categories: PrinterCategoryDTO[];
}

// ============================ Mappers ============================

export const toCompanyId = (id: string | null | undefined, fallback: CompanyId = 'el-tayta'): CompanyId =>
  (id && (id === 'el-tayta' || id === 'el-sabroso') ? id : fallback) as CompanyId;

export const toAmbasCompanyId = (
  id: string | null | undefined
): CompanyId | 'ambas' =>
  id === 'el-tayta' || id === 'el-sabroso' ? (id as CompanyId) : 'ambas';

export function mapTable(dto: TableDTO): Table {
  return {
    id: dto.id,
    companyId: toCompanyId(dto.companyId),
    number: dto.number,
    capacity: dto.capacity,
    zone: dto.zone as Table['zone'],
    status: dto.status as Table['status'],
    occupiedSince: dto.occupiedSince ?? undefined,
    minutesElapsed: dto.minutesElapsed ?? undefined,
    currentOrderId: dto.currentOrderId ?? undefined,
    waiter: dto.waiter ?? undefined,
    notes: dto.notes ?? undefined,
    version: dto.version,
    updatedAt: dto.updatedAt,
    createdAt: dto.createdAt,
    isDeleted: dto.isDeleted,
  };
}

export function mapProduct(dto: ProductDTO): Product {
  return {
    id: dto.id,
    companyId: toCompanyId(dto.companyId),
    name: dto.name,
    description: dto.description,
    price: dto.price,
    category: dto.category as Product['category'],
    image: dto.image,
    available: dto.available,
    hasRecipe: dto.hasRecipe ?? false,
    version: dto.version,
    updatedAt: dto.updatedAt,
    createdAt: dto.createdAt,
    isDeleted: dto.isDeleted,
  };
}

export function mapInsumo(dto: InsumoDTO): Insumo {
  return {
    id: dto.id,
    companyId: toAmbasCompanyId(dto.companyId),
    code: dto.code,
    name: dto.name,
    category: dto.category as Insumo['category'],
    unit: dto.unit as Insumo['unit'],
    currentStock: dto.currentStock,
    minStock: dto.minStock,
    costPerUnit: dto.costPerUnit,
    lastPurchaseDate: dto.lastPurchaseDate ?? '',
    version: dto.version,
    updatedAt: dto.updatedAt,
    createdAt: dto.createdAt,
    isDeleted: dto.isDeleted,
  };
}

export function mapRecipe(dto: RecipeDTO): Recipe {
  return {
    id: dto.id,
    companyId: toCompanyId(dto.companyId ?? 'el-tayta'),
    productId: dto.productId ?? '',
    productName: dto.productName,
    category: dto.category,
    portions: dto.portions,
    salePrice: dto.salePrice,
    totalCost: dto.totalCost,
    theoreticalFoodCostPct: dto.theoreticalFoodCostPct,
    preparationNotes: dto.preparationNotes ?? undefined,
    ingredients: (dto.ingredients || []).map((ing) => ({
      insumoId: ing.insumoId ?? '',
      insumoName: ing.insumoName,
      quantity: ing.quantity,
      unit: ing.unit,
      costPerUnit: ing.costPerUnit,
      subtotalCost: ing.subtotalCost,
    })),
    version: dto.version,
    updatedAt: dto.updatedAt,
    createdAt: dto.createdAt,
    isDeleted: dto.isDeleted,
  };
}

export function mapBankAccount(dto: BankAccountDTO): BankAccount {
  return {
    id: dto.id,
    companyId: toCompanyId(dto.companyId),
    bankName: dto.bankName,
    accountNumber: dto.accountNumber,
    cci: dto.cci ?? undefined,
    accountType: dto.accountType as BankAccount['accountType'],
    currency: dto.currency as BankAccount['currency'],
    holderName: dto.holderName,
    alias: dto.alias,
    currentBalance: dto.currentBalance,
    isActive: dto.isActive,
    notes: dto.notes ?? undefined,
    version: dto.version,
    updatedAt: dto.updatedAt,
    createdAt: dto.createdAt,
    isDeleted: dto.isDeleted,
  };
}

export function mapPaymentMethod(dto: CustomPaymentMethodDTO): CustomPaymentMethod {
  return {
    id: dto.id,
    companyId: toAmbasCompanyId(dto.companyId),
    name: dto.name,
    category: dto.category as CustomPaymentMethod['category'],
    bankAccountId: dto.bankAccountId ?? undefined,
    bankAccountAlias: dto.bankAccountAlias ?? undefined,
    commissionPct: dto.commissionPct ?? undefined,
    requiresReferenceNumber: dto.requiresReferenceNumber,
    icon: dto.icon,
    isActive: dto.isActive,
    version: dto.version,
    updatedAt: dto.updatedAt,
    createdAt: dto.createdAt,
    isDeleted: dto.isDeleted,
  };
}

export function mapPrinter(dto: PrinterDTO): ThermalPrinterConfig {
  return {
    id: dto.id,
    companyId: toAmbasCompanyId(dto.companyId),
    name: dto.name,
    role: dto.role as ThermalPrinterConfig['role'],
    connectionType: dto.connectionType as ThermalPrinterConfig['connectionType'],
    ipAddress: dto.ipAddress ?? undefined,
    port: dto.port ?? undefined,
    paperWidth: dto.paperWidth as ThermalPrinterConfig['paperWidth'],
    autoCut: dto.autoCut,
    beepOnPrint: dto.beepOnPrint,
    categoriesMapped: (dto.categories || [])
      .slice()
      .sort((a, b) => a.idx - b.idx)
      .map((c) => c.category),
    status: dto.status as ThermalPrinterConfig['status'],
    isEnabled: dto.isEnabled,
    version: dto.version,
    updatedAt: dto.updatedAt,
    createdAt: dto.createdAt,
    isDeleted: dto.isDeleted,
  };
}

// ============================ Meta ============================

// Extrae el CatalogMeta de una entidad a partir de los ítems ya mapeados.
// Para el delta-sync (Fase C) nos interesa el `updatedAt`/`version` más reciente.
export function extractMeta<T extends { updatedAt?: string; version?: number }>(
  entity: CatalogEntity,
  items: T[]
): CatalogMeta {
  let updatedAt = '';
  let version = 1;
  items.forEach((item) => {
    if (item.updatedAt && item.updatedAt > updatedAt) updatedAt = item.updatedAt;
    if (item.version && item.version > version) version = item.version;
  });
  return {
    entity,
    updatedAt,
    version,
    count: items.length,
    fetchedAtUtc: new Date().toISOString(),
  };
}
