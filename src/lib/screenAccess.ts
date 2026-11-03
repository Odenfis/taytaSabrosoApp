import { hasPermission, type PosPermission } from '../../server/src/lib/permissions';
import type { ScreenType } from '../types';

const permissions: Record<ScreenType, PosPermission> = {
  mesas: 'tables.read', pedido: 'orders.read', cobro: 'payments.collect',
  kardex: 'inventory.read', compras: 'purchases.read', productos: 'products.manage',
  recetas: 'recipes.manage', ratios: 'reports.financial', movimientos: 'cash.read',
  bancos: 'banks.manage', reportes: 'reports.financial', configuracion: 'security.manage',
};
export function canOpenScreen(role: string, screen: ScreenType): boolean {
  return !!permissions[screen] && hasPermission(role, permissions[screen]);
}
