import { hasPermission, type PosPermission } from '../../server/src/lib/permissions';

/** Filtro local orientativo; la autorización definitiva corresponde al servidor. */
const actionPermissions: Record<string, PosPermission> = {
  openOrder: 'orders.modify', quickOrder: 'orders.modify', cancelOpening: 'orders.modify',
  addItem: 'orders.modify', updateItemQuantity: 'orders.modify', updateItemNotes: 'orders.modify', removeItem: 'orders.modify',
  sendToKitchen: 'orders.dispatch', markForBilling: 'orders.mark_for_billing',
  payOrder: 'payments.collect', createDinerBills: 'payments.collect', payDinerBill: 'payments.collect',
  manualTransaction: 'cash.manual', switchShift: 'cash.close', createPurchase: 'purchases.manage', regularizePurchase: 'purchases.manage',
  kardexAdjustment: 'inventory.manage', createInsumo: 'inventory.manage', updateInsumo: 'inventory.manage', deleteInsumo: 'inventory.manage',
  createProduct: 'products.manage', updateProduct: 'products.manage', createTable: 'tables.manage', updateTable: 'tables.manage', deleteTable: 'tables.manage',
  createBankAccount: 'banks.manage', updateBankAccount: 'banks.manage', deleteBankAccount: 'banks.manage',
  createPaymentMethod: 'banks.manage', updatePaymentMethod: 'banks.manage', deletePaymentMethod: 'banks.manage',
  createPrinter: 'printers.manage', updatePrinter: 'printers.manage', deletePrinter: 'printers.manage',
  createRecipe: 'recipes.manage', updateRecipe: 'recipes.manage', deleteRecipe: 'recipes.manage', saveRecipe: 'recipes.manage',
};
export function canReplayAction(role: string, operation: string): boolean {
  const permission = Object.hasOwn(actionPermissions, operation) ? actionPermissions[operation] : undefined;
  return !!permission && hasPermission(role, permission);
}
export interface PendingOperationIdentity {
  authorId?: string;
  companyId?: string;
}
export interface ReplayIdentity {
  userId: string;
  authorizedCompanyIds: readonly string[];
  canPerformAction: boolean;
}
export type PendingAuthorization = 'author' | 'missing_author' | 'missing_company' | 'different_user' | 'company_forbidden' | 'permission_revoked';

export function pendingAuthorization(operation: PendingOperationIdentity, actor: ReplayIdentity): PendingAuthorization {
  if (!operation.authorId) return 'missing_author';
  if (!operation.companyId) return 'missing_company';
  if (operation.authorId !== actor.userId) return 'different_user';
  if (!actor.authorizedCompanyIds.includes(operation.companyId)) return 'company_forbidden';
  if (!actor.canPerformAction) return 'permission_revoked';
  return 'author';
}

/** Declared identity only gates the UI; signatures/server remain authoritative. */
export function orderNeedsOfflineReview(queue: readonly import('../types').PendingOp[], orderId: string | undefined,
  userId: string | undefined, deviceId: string | null): boolean {
  if (!orderId) return false;
  return queue.some(op => {
    const payload = op.payload as Record<string, unknown> | undefined;
    if (payload?.orderId !== orderId && payload?.tmpOrderId !== orderId) return false;
    return !op.authorId || !op.deviceId || op.authorId !== userId || op.deviceId !== deviceId || !!op.conflict || !!op.error;
  });
}
