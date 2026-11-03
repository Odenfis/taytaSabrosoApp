/** Matriz de capacidades compartida por servidor y cliente. La activación de
 * controles de acceso requiere migración, revisión de usuarios y cola offline. */
export const POS_ROLES = ['Administrador', 'Jefe de restaurante', 'Cajero', 'Mesero'] as const;
export type PosRole = typeof POS_ROLES[number];

export const POS_PERMISSIONS = [
  'tables.read', 'tables.manage', 'orders.read', 'orders.modify', 'orders.dispatch', 'orders.mark_for_billing',
  'payments.read', 'payments.collect', 'payments.correct',
  'cash.read', 'cash.manual', 'cash.close',
  'purchases.read', 'purchases.manage', 'inventory.read', 'inventory.manage',
  'products.sale_read', 'products.manage', 'recipes.manage',
  'banks.manage', 'reports.financial', 'users.manage', 'security.manage', 'company.read', 'printers.read', 'printers.manage',
] as const;
export type PosPermission = typeof POS_PERMISSIONS[number];

const manager: readonly PosPermission[] = [
  'tables.read', 'tables.manage', 'orders.read', 'orders.modify', 'orders.dispatch', 'orders.mark_for_billing',
  'payments.read', 'payments.collect', 'payments.correct', 'cash.read', 'cash.manual', 'cash.close',
  'purchases.read', 'purchases.manage', 'inventory.read', 'inventory.manage',
  'products.sale_read', 'products.manage', 'recipes.manage', 'company.read', 'printers.read',
];
const cashier: readonly PosPermission[] = [
  'tables.read', 'orders.read', 'products.sale_read', 'payments.read', 'payments.collect', 'payments.correct',
  'cash.read', 'cash.manual', 'cash.close', 'company.read', 'printers.read',
];
const waiter: readonly PosPermission[] = [
  'tables.read', 'orders.read', 'orders.modify', 'orders.dispatch', 'orders.mark_for_billing', 'products.sale_read', 'company.read', 'printers.read',
];
const rolePermissions: Record<PosRole, readonly PosPermission[]> = {
  Administrador: POS_PERMISSIONS,
  'Jefe de restaurante': manager,
  Cajero: cashier,
  Mesero: waiter,
};

/** Unknown and legacy roles do not implicitly inherit a privileged profile. */
export function hasPermission(role: string | null | undefined, permission: PosPermission): boolean {
  return !!role && Object.hasOwn(rolePermissions, role) && rolePermissions[role as PosRole].includes(permission);
}
export function permissionsForRole(role: string | null | undefined): readonly PosPermission[] {
  return role && Object.hasOwn(rolePermissions, role) ? [...rolePermissions[role as PosRole]] : [];
}
/** Both restrictions must hold if both legacy company columns are populated. */
export function canAccessCompany(user: { companyId: string | null; assignedCompanyId: string | null }, companyId: string): boolean {
  return !!companyId && (!user.companyId || user.companyId === companyId) && (!user.assignedCompanyId || user.assignedCompanyId === companyId);
}
