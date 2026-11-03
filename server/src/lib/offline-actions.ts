/** Contrato de "operación lógica" compartido entre el cliente (que firma) y el
 * servidor (que verifica). Cada acción declara las variantes de ruta que
 * puede producir y de dónde sale cada valor firmado.
 *
 * El cliente firma el cuerpo lógico de la petición; el servidor recalcula ese
 * mismo cuerpo lógico a partir de la petición recibida y compara. Si cambia
 * la ruta, la acción o cualquier valor, la prueba deja de servir.
 *
 * Este módulo es puro: lo importan el navegador y el servidor. */

export type OfflineRouteGroup = 'operations' | 'catalogs';
export type OfflineHttpMethod = 'POST' | 'PATCH' | 'DELETE';
/** Tipo de entidad a la que apunta una referencia que puede ser temporal. */
export type OfflineRefKind = 'order' | 'table';

export type OfflineActionVariant = {
  method: OfflineHttpMethod;
  /** Plantilla de ruta Express: '/orders/:id/items'. */
  path: string;
  /** Clave del cuerpo -> origen del valor ('payload.x' o 'op.clientOpId'). */
  body?: Record<string, string>;
  /** Parámetro de ruta -> origen del valor. */
  params?: Record<string, string>;
  /** Clave de la query -> origen del valor. */
  query?: Record<string, string>;
  /** Campos ('body.x' o 'params.x') que son referencias a entidades. */
  refs?: Record<string, OfflineRefKind>;
  /** Claves del cuerpo que fija el servidor y no se comparan. */
  exclude?: string[];
};

export type OfflineAction = {
  id: string;
  group: OfflineRouteGroup;
  variants: OfflineActionVariant[];
};

/** Marcadores de referencia que viajan dentro del documento firmado. */
export const ORDER_REF = 'orderRef';
export const TABLE_REF = 'tableRef';

export type OfflineRefMarker = {
  orderRef?: { openingClientOpId: string };
  tableRef?: { openingClientOpId: string };
};

/** Origen de un valor firmado: 'payload.clave' o 'op.clientOpId'. */
export type OfflineValueSource = string;

export const CLIENT_OP_ID_SOURCE = 'op.clientOpId';

const action = (id: string, group: OfflineRouteGroup, variants: OfflineActionVariant[]): OfflineAction => ({ id, group, variants });

export const OFFLINE_ACTIONS: readonly OfflineAction[] = [
  // ============================ OPERACIONES ============================
  action('orders.open', 'operations', [{
    method: 'POST', path: '/orders/open',
    body: { tableId: 'payload.tableId', waiter: 'payload.waiter', clientOpId: 'op.clientOpId' },
    // El servidor sustituye el mesero por el de la sesión autenticada.
    exclude: ['waiter'],
  }]),
  action('orders.quickBar', 'operations', [{
    method: 'POST', path: '/orders/quick-bar',
    body: { companyId: 'payload.companyId', zone: 'payload.zone', waiter: 'payload.waiter', clientOpId: 'op.clientOpId' },
    exclude: ['waiter'],
  }]),
  action('orders.cancelOpening', 'operations', [{
    method: 'POST', path: '/orders/cancel-opening',
    // La cancelación puede venir de la propia apertura (su identificador) o de
    // una operación de cancelación aparte (el que apunta en el payload).
    body: { openingClientOpId: 'payload.openingClientOpId|op.clientOpId' },
  }]),
  action('orders.openingItems', 'operations', [{
    method: 'POST', path: '/orders/opening-items',
    body: { openingClientOpId: 'op.clientOpId', items: 'payload.items' },
  }]),
  action('orders.addItem', 'operations', [{
    method: 'POST', path: '/orders/:id/items',
    body: { productId: 'payload.productId', quantity: 'payload.quantity', notes: 'payload.notes' },
    params: { id: 'payload.orderId' }, refs: { 'params.id': 'order' },
  }]),
  action('orders.updateItemQuantity', 'operations', [{
    method: 'PATCH', path: '/orders/:id/items/:itemId/quantity',
    body: { delta: 'payload.delta', clientOpId: 'op.clientOpId' },
    params: { id: 'payload.orderId', itemId: 'payload.itemId' }, refs: { 'params.id': 'order' },
  }]),
  action('orders.updateItemNotes', 'operations', [{
    method: 'PATCH', path: '/orders/:id/items/:itemId/notes',
    body: { notes: 'payload.notes' },
    params: { id: 'payload.orderId', itemId: 'payload.itemId' }, refs: { 'params.id': 'order' },
  }]),
  action('orders.removeItem', 'operations', [{
    method: 'DELETE', path: '/orders/:id/items/:itemId',
    query: { clientOpId: 'op.clientOpId' },
    params: { id: 'payload.orderId', itemId: 'payload.itemId' }, refs: { 'params.id': 'order' },
  }]),
  action('orders.sendToKitchen', 'operations', [{
    method: 'POST', path: '/orders/:id/send-to-kitchen',
    body: { clientOpId: 'op.clientOpId' },
    params: { id: 'payload.orderId' }, refs: { 'params.id': 'order' },
  }]),
  action('orders.markForBilling', 'operations', [{
    method: 'POST', path: '/tables/:id/por-cobrar',
    params: { id: 'payload.tableId' }, refs: { 'params.id': 'table' },
  }]),
  action('orders.payTable', 'operations', [{
    method: 'POST', path: '/tables/:id/pay',
    body: {
      paymentMethod: 'payload.paymentMethod', amountReceived: 'payload.amountReceived',
      customPaymentMethodId: 'payload.customPaymentMethodId', referenceNumber: 'payload.referenceNumber',
      clientOpId: 'op.clientOpId',
    },
    params: { id: 'payload.tableId' }, refs: { 'params.id': 'table' },
  }]),
  action('orders.createDinerBills', 'operations', [{
    method: 'POST', path: '/orders/:id/bills',
    body: { bills: 'payload.bills', clientOpId: 'op.clientOpId' },
    params: { id: 'payload.orderId' }, refs: { 'params.id': 'order' },
  }]),
  action('orders.payDinerBill', 'operations', [{
    method: 'POST', path: '/bills/:id/pay',
    body: {
      amount: 'payload.amount', amountReceived: 'payload.amountReceived',
      customPaymentMethodId: 'payload.customPaymentMethodId', referenceNumber: 'payload.referenceNumber',
      contributorName: 'payload.contributorName', clientOpId: 'op.clientOpId',
    },
    params: { id: 'payload.billId' },
  }]),
  action('cash.manual', 'operations', [{
    method: 'POST', path: '/transactions',
    body: {
      companyId: 'payload.companyId', type: 'payload.type', description: 'payload.description',
      amount: 'payload.amount', isIncome: 'payload.isIncome', bankAccountId: 'payload.bankAccountId',
      customPaymentMethodId: 'payload.customPaymentMethodId', referenceNumber: 'payload.referenceNumber',
      clientOpId: 'op.clientOpId',
    },
  }]),
  action('purchases.create', 'operations', [{
    method: 'POST', path: '/purchases',
    body: {
      companyId: 'payload.companyId', category: 'payload.category', supplierName: 'payload.supplierName',
      supplierRuc: 'payload.supplierRuc', invoiceNumber: 'payload.invoiceNumber',
      provisionalNoteNumber: 'payload.provisionalNoteNumber', documentStatus: 'payload.documentStatus',
      shift: 'payload.shift', subtotal: 'payload.subtotal', igv: 'payload.igv', total: 'payload.total',
      paymentStatus: 'payload.paymentStatus', notes: 'payload.notes', paidFromCash: 'payload.paidFromCash',
      bankAccountId: 'payload.bankAccountId', bankAccountAlias: 'payload.bankAccountAlias',
      items: 'payload.items', clientOpId: 'op.clientOpId',
    },
  }]),
  action('purchases.regularize', 'operations', [{
    method: 'POST', path: '/purchases/:id/regularize',
    body: {
      invoiceNumber: 'payload.invoiceNumber', supplierRuc: 'payload.supplierRuc', notes: 'payload.notes',
      items: 'payload.items', clientOpId: 'op.clientOpId',
    },
    params: { id: 'payload.purchaseId' },
  }]),
  action('inventory.kardexAdjustment', 'operations', [{
    method: 'POST', path: '/kardex/adjustments',
    body: {
      insumoId: 'payload.insumoId', quantity: 'payload.quantity', type: 'payload.type',
      reason: 'payload.reason', companyId: 'payload.companyId', clientOpId: 'op.clientOpId',
    },
  }]),
  action('cash.switchShift', 'operations', [{
    method: 'POST', path: '/shifts/switch',
    body: {
      companyId: 'payload.companyId', targetShift: 'payload.targetShift', reportedCash: 'payload.reportedCash',
      initialCashForNext: 'payload.initialCashForNext', notes: 'payload.notes', clientOpId: 'op.clientOpId',
    },
  }]),
  // La corrección de pagos exige PIN de supervisor: nunca viaja por la cola
  // offline, pero la ruta queda declarada para que ninguna escritura quede
  // fuera del contrato.
  action('payments.correction', 'operations', [{
    method: 'POST', path: '/transactions/:id/corrections',
    body: {
      correctionId: 'payload.correctionId', supervisorPin: 'payload.supervisorPin',
      expectedMethodId: 'payload.expectedMethodId', expectedBankAccountId: 'payload.expectedBankAccountId',
      expectedReference: 'payload.expectedReference', newMethodId: 'payload.newMethodId',
      referenceNumber: 'payload.referenceNumber', reason: 'payload.reason',
    },
    params: { id: 'payload.transactionId' },
  }]),
  // ============================ CATÁLOGOS ============================
  action('catalogs.createPhysicalTable', 'catalogs', [{
    method: 'POST', path: '/tables/physical',
    body: { zone: 'payload.zone', capacity: 'payload.capacity' },
  }]),
  action('catalogs.createTable', 'catalogs', [{
    method: 'POST', path: '/tables',
    body: {
      companyId: 'payload.companyId', number: 'payload.number', capacity: 'payload.capacity',
      zone: 'payload.zone', notes: 'payload.notes',
    },
  }]),
  action('catalogs.updateTable', 'catalogs', [{
    method: 'PATCH', path: '/tables/:id',
    body: {
      number: 'payload.number', capacity: 'payload.capacity', zone: 'payload.zone',
      notes: 'payload.notes', status: 'payload.status',
    },
    params: { id: 'payload.id' },
  }]),
  action('catalogs.deleteTable', 'catalogs', [
    { method: 'DELETE', path: '/tables/:id', params: { id: 'payload.id' } },
  ]),
  action('catalogs.createProduct', 'catalogs', [{
    method: 'POST', path: '/products',
    body: {
      id: 'payload.id', companyId: 'payload.companyId', name: 'payload.name', description: 'payload.description',
      price: 'payload.price', category: 'payload.category', image: 'payload.image', available: 'payload.available',
      clientOpId: 'op.clientOpId',
    },
  }]),
  action('catalogs.updateProduct', 'catalogs', [{
    method: 'PATCH', path: '/products/:id',
    body: {
      name: 'payload.name', description: 'payload.description', price: 'payload.price', category: 'payload.category',
      image: 'payload.image', available: 'payload.available', expectedVersion: 'payload.expectedVersion',
      clientOpId: 'op.clientOpId',
    },
    params: { id: 'payload.id' },
  }]),
  action('catalogs.deleteProduct', 'catalogs', [
    { method: 'DELETE', path: '/products/:id', params: { id: 'payload.id' } },
  ]),
  action('catalogs.createInsumo', 'catalogs', [{
    method: 'POST', path: '/insumos',
    body: {
      id: 'payload.id', companyId: 'payload.companyId', name: 'payload.name', category: 'payload.category',
      unit: 'payload.unit', currentStock: 'payload.currentStock', minStock: 'payload.minStock',
      costPerUnit: 'payload.costPerUnit', lastPurchaseDate: 'payload.lastPurchaseDate', clientOpId: 'op.clientOpId',
    },
  }]),
  action('catalogs.updateInsumo', 'catalogs', [{
    method: 'PATCH', path: '/insumos/:id',
    body: {
      name: 'payload.name', category: 'payload.category', unit: 'payload.unit', minStock: 'payload.minStock',
      costPerUnit: 'payload.costPerUnit', expectedVersion: 'payload.expectedVersion', clientOpId: 'op.clientOpId',
    },
    params: { id: 'payload.id' },
  }]),
  action('catalogs.deleteInsumo', 'catalogs', [{
    method: 'DELETE', path: '/insumos/:id',
    query: { expectedVersion: 'payload.expectedVersion' },
    params: { id: 'payload.id' },
  }]),
  // La ficha se intenta como PATCH y, si el servidor responde 404, como POST.
  // Ambas variantes comparten acción y cada una lleva su propia prueba.
  action('catalogs.saveRecipe', 'catalogs', [
    {
      method: 'PATCH', path: '/recipes/:id',
      body: {
        productId: 'payload.productId', productName: 'payload.productName', category: 'payload.category',
        portions: 'payload.portions', salePrice: 'payload.salePrice', totalCost: 'payload.totalCost',
        theoreticalFoodCostPct: 'payload.theoreticalFoodCostPct', preparationNotes: 'payload.preparationNotes',
        ingredients: 'payload.ingredients',
      },
      params: { id: 'payload.id' },
    },
    {
      method: 'POST', path: '/recipes',
      body: {
        id: 'payload.id', companyId: 'payload.companyId', productId: 'payload.productId',
        productName: 'payload.productName', category: 'payload.category', portions: 'payload.portions',
        salePrice: 'payload.salePrice', totalCost: 'payload.totalCost',
        theoreticalFoodCostPct: 'payload.theoreticalFoodCostPct', preparationNotes: 'payload.preparationNotes',
        ingredients: 'payload.ingredients',
      },
    },
  ]),
  action('catalogs.deleteRecipe', 'catalogs', [
    { method: 'DELETE', path: '/recipes/:id', params: { id: 'payload.id' } },
  ]),
  action('catalogs.createBankAccount', 'catalogs', [{
    method: 'POST', path: '/bank-accounts',
    body: {
      companyId: 'payload.companyId', bankName: 'payload.bankName', accountNumber: 'payload.accountNumber',
      cci: 'payload.cci', accountType: 'payload.accountType', currency: 'payload.currency',
      holderName: 'payload.holderName', alias: 'payload.alias', currentBalance: 'payload.currentBalance',
      notes: 'payload.notes',
    },
  }]),
  action('catalogs.updateBankAccount', 'catalogs', [{
    method: 'PATCH', path: '/bank-accounts/:id',
    body: {
      bankName: 'payload.bankName', accountNumber: 'payload.accountNumber', cci: 'payload.cci',
      accountType: 'payload.accountType', currency: 'payload.currency', holderName: 'payload.holderName',
      alias: 'payload.alias', currentBalance: 'payload.currentBalance', notes: 'payload.notes',
      isActive: 'payload.isActive',
    },
    params: { id: 'payload.id' },
  }]),
  action('catalogs.deleteBankAccount', 'catalogs', [
    { method: 'DELETE', path: '/bank-accounts/:id', params: { id: 'payload.id' } },
  ]),
  action('catalogs.createPaymentMethod', 'catalogs', [{
    method: 'POST', path: '/payment-methods',
    body: {
      companyId: 'payload.companyId', name: 'payload.name', category: 'payload.category',
      bankAccountId: 'payload.bankAccountId', commissionPct: 'payload.commissionPct',
      requiresReferenceNumber: 'payload.requiresReferenceNumber', icon: 'payload.icon',
    },
  }]),
  action('catalogs.updatePaymentMethod', 'catalogs', [{
    method: 'PATCH', path: '/payment-methods/:id',
    body: {
      companyId: 'payload.companyId', name: 'payload.name', category: 'payload.category',
      bankAccountId: 'payload.bankAccountId', commissionPct: 'payload.commissionPct',
      requiresReferenceNumber: 'payload.requiresReferenceNumber', icon: 'payload.icon', isActive: 'payload.isActive',
    },
    params: { id: 'payload.id' },
  }]),
  action('catalogs.deletePaymentMethod', 'catalogs', [
    { method: 'DELETE', path: '/payment-methods/:id', params: { id: 'payload.id' } },
  ]),
  action('catalogs.createPrinter', 'catalogs', [{
    method: 'POST', path: '/printers',
    body: {
      companyId: 'payload.companyId', name: 'payload.name', role: 'payload.role',
      connectionType: 'payload.connectionType', ipAddress: 'payload.ipAddress', port: 'payload.port',
      paperWidth: 'payload.paperWidth', autoCut: 'payload.autoCut', beepOnPrint: 'payload.beepOnPrint',
      categories: 'payload.categories',
    },
  }]),
  action('catalogs.updatePrinter', 'catalogs', [{
    method: 'PATCH', path: '/printers/:id',
    body: {
      name: 'payload.name', role: 'payload.role', connectionType: 'payload.connectionType',
      ipAddress: 'payload.ipAddress', port: 'payload.port', paperWidth: 'payload.paperWidth',
      autoCut: 'payload.autoCut', beepOnPrint: 'payload.beepOnPrint', categories: 'payload.categories',
      status: 'payload.status', isEnabled: 'payload.isEnabled',
    },
    params: { id: 'payload.id' },
  }]),
  action('catalogs.deletePrinter', 'catalogs', [
    { method: 'DELETE', path: '/printers/:id', params: { id: 'payload.id' } },
  ]),
];

/** Asociación entre una operación de la cola y las acciones que la autorizan. */
export type OfflineActionBinding = {
  actionId: string;
  /** Variantes aplicables (por índice). Si se omite, todas las de la acción. */
  variants?: number[];
};

const OP_BINDINGS: Record<string, OfflineActionBinding[]> = {
  openOrder: [{ actionId: 'orders.open' }, { actionId: 'orders.openingItems' }, { actionId: 'orders.cancelOpening' }],
  quickOrder: [{ actionId: 'orders.quickBar' }, { actionId: 'orders.openingItems' }, { actionId: 'orders.cancelOpening' }],
  cancelOpening: [{ actionId: 'orders.cancelOpening' }],
  addItem: [{ actionId: 'orders.addItem' }],
  updateItemQuantity: [{ actionId: 'orders.updateItemQuantity' }],
  updateItemNotes: [{ actionId: 'orders.updateItemNotes' }],
  removeItem: [{ actionId: 'orders.removeItem' }],
  sendToKitchen: [{ actionId: 'orders.sendToKitchen' }],
  markForBilling: [{ actionId: 'orders.markForBilling' }],
  payOrder: [{ actionId: 'orders.payTable' }],
  createDinerBills: [{ actionId: 'orders.createDinerBills' }],
  payDinerBill: [{ actionId: 'orders.payDinerBill' }],
  manualTransaction: [{ actionId: 'cash.manual' }],
  createPurchase: [{ actionId: 'purchases.create' }],
  regularizePurchase: [{ actionId: 'purchases.regularize' }],
  switchShift: [{ actionId: 'cash.switchShift' }],
  kardexAdjustment: [{ actionId: 'inventory.kardexAdjustment' }],
  createProduct: [{ actionId: 'catalogs.createProduct' }],
  updateProduct: [{ actionId: 'catalogs.updateProduct' }],
  createTable: [{ actionId: 'catalogs.createTable' }],
  updateTable: [{ actionId: 'catalogs.updateTable' }],
  deleteTable: [{ actionId: 'catalogs.deleteTable' }],
  createBankAccount: [{ actionId: 'catalogs.createBankAccount' }],
  updateBankAccount: [{ actionId: 'catalogs.updateBankAccount' }],
  deleteBankAccount: [{ actionId: 'catalogs.deleteBankAccount' }],
  createPaymentMethod: [{ actionId: 'catalogs.createPaymentMethod' }],
  updatePaymentMethod: [{ actionId: 'catalogs.updatePaymentMethod' }],
  deletePaymentMethod: [{ actionId: 'catalogs.deletePaymentMethod' }],
  createPrinter: [{ actionId: 'catalogs.createPrinter' }],
  updatePrinter: [{ actionId: 'catalogs.updatePrinter' }],
  deletePrinter: [{ actionId: 'catalogs.deletePrinter' }],
  createRecipe: [{ actionId: 'catalogs.saveRecipe', variants: [1] }],
  updateRecipe: [{ actionId: 'catalogs.saveRecipe', variants: [0] }],
  saveRecipe: [{ actionId: 'catalogs.saveRecipe' }],
  deleteRecipe: [{ actionId: 'catalogs.deleteRecipe' }],
  createInsumo: [{ actionId: 'catalogs.createInsumo' }],
  updateInsumo: [{ actionId: 'catalogs.updateInsumo' }],
  deleteInsumo: [{ actionId: 'catalogs.deleteInsumo' }],
};

/** Acciones (y variantes) que autorizan una operación de la cola. */
export function offlineBindingsForOp(op: { op: string }): OfflineActionBinding[] {
  return OP_BINDINGS[op.op] ?? [];
}

/** Operaciones de la cola que el contrato declara. */
export function offlineOpNames(): string[] {
  return Object.keys(OP_BINDINGS);
}

export function offlineActionById(id: string): OfflineAction | undefined {
  return OFFLINE_ACTIONS.find((entry) => entry.id === id);
}

/** Resuelve la acción y la variante que corresponden a una ruta real. */
export function offlineActionForRequest(
  group: OfflineRouteGroup, method: string, path: string,
): { action: OfflineAction; variant: OfflineActionVariant; variantIndex: number; params: Record<string, string> } | undefined {
  if (!path.startsWith('/') || path.includes('?') || path.includes('#')) return undefined;
  const segments = path.replace(/\/$/, '').split('/').slice(1);
  for (const candidate of OFFLINE_ACTIONS) {
    if (candidate.group !== group) continue;
    for (let index = 0; index < candidate.variants.length; index += 1) {
      const variant = candidate.variants[index];
      if (variant.method !== method.toUpperCase()) continue;
      const parts = variant.path.replace(/\/$/, '').split('/').slice(1);
      if (parts.length !== segments.length) continue;
      const params: Record<string, string> = {};
      let matches = true;
      for (let partIndex = 0; partIndex < parts.length; partIndex += 1) {
        const part = parts[partIndex];
        if (part.startsWith(':')) params[part.slice(1)] = decodeURIComponent(segments[partIndex]);
        else if (part !== segments[partIndex]) { matches = false; break; }
      }
      if (matches) return { action: candidate, variant, variantIndex: index, params };
    }
  }
  return undefined;
}

/** JSON estable (claves ordenadas) para comparar documentos y cuerpos. */
export function canonicalJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
}

/** Identificadores temporales del cliente (no existen todavía en el servidor). */
export function isTemporaryOrderId(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('order-tmp-');
}
/** Las mesas express del servidor usan 't-express-' + 26 hex; las del cliente, un UUID. */
export function isTemporaryTableId(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('t-express-') && !/^t-express-[0-9a-f]{26}$/.test(value);
}

/** Extrae el valor de un origen firmado ('payload.x' u 'op.clientOpId'). Varios
 * orígenes separados por '|' significan alternativas: se usa el primero que
 * esté definido (por ejemplo, la apertura puede firmarse tanto por su propio
 * identificador como por el que apunta en el payload). */
export function offlineSourceValue(
  source: OfflineValueSource,
  op: { clientOpId: string },
  payload: Record<string, unknown>,
): unknown {
  for (const candidate of source.split('|')) {
    if (candidate === CLIENT_OP_ID_SOURCE) return op.clientOpId;
    if (candidate.startsWith('payload.')) {
      const value = payload[candidate.slice('payload.'.length)];
      if (value !== undefined) return value;
    }
  }
  return undefined;
}
