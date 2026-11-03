import type { PosPermission } from './permissions.js';
import type { RequestHandler } from 'express';
import { hasPermission } from './permissions.js';
import { AppError } from './utils.js';

/** Inventario explícito para las rutas autenticadas. No activa middleware por sí solo. */
type RouteGroup = 'catalogs' | 'operations' | 'reports' | 'sync' | 'users';
export type RoutePermission = { group: RouteGroup; method: 'GET' | 'POST' | 'PATCH' | 'DELETE'; path: string; permission: PosPermission };
const route = (group: RouteGroup, method: RoutePermission['method'], path: string, permission: PosPermission): RoutePermission => ({ group, method, path, permission });
export const ROUTE_PERMISSIONS: readonly RoutePermission[] = [
  route('catalogs', 'GET', '/companies', 'company.read'),
  route('catalogs', 'GET', '/tables', 'tables.read'),
  route('catalogs', 'POST', '/tables/physical', 'tables.manage'),
  route('catalogs', 'POST', '/tables', 'tables.manage'),
  route('catalogs', 'PATCH', '/tables/:id', 'tables.manage'),
  route('catalogs', 'DELETE', '/tables/:id', 'tables.manage'),
  route('catalogs', 'GET', '/products', 'products.sale_read'),
  route('catalogs', 'POST', '/products', 'products.manage'),
  route('catalogs', 'PATCH', '/products/:id', 'products.manage'),
  route('catalogs', 'DELETE', '/products/:id', 'products.manage'),
  route('catalogs', 'GET', '/insumos', 'inventory.read'),
  route('catalogs', 'POST', '/insumos', 'inventory.manage'),
  route('catalogs', 'PATCH', '/insumos/:id', 'inventory.manage'),
  route('catalogs', 'DELETE', '/insumos/:id', 'inventory.manage'),
  route('catalogs', 'GET', '/recipes', 'recipes.manage'),
  route('catalogs', 'POST', '/recipes', 'recipes.manage'),
  route('catalogs', 'PATCH', '/recipes/:id', 'recipes.manage'),
  route('catalogs', 'DELETE', '/recipes/:id', 'recipes.manage'),
  route('catalogs', 'GET', '/bank-accounts', 'banks.manage'),
  route('catalogs', 'POST', '/bank-accounts', 'banks.manage'),
  route('catalogs', 'PATCH', '/bank-accounts/:id', 'banks.manage'),
  route('catalogs', 'DELETE', '/bank-accounts/:id', 'banks.manage'),
  route('catalogs', 'GET', '/payment-methods', 'payments.read'),
  route('catalogs', 'POST', '/payment-methods', 'banks.manage'),
  route('catalogs', 'PATCH', '/payment-methods/:id', 'banks.manage'),
  route('catalogs', 'DELETE', '/payment-methods/:id', 'banks.manage'),
  route('catalogs', 'GET', '/printers', 'printers.read'),
  route('catalogs', 'POST', '/printers', 'printers.manage'),
  route('catalogs', 'PATCH', '/printers/:id', 'printers.manage'),
  route('catalogs', 'DELETE', '/printers/:id', 'printers.manage'),
  route('operations', 'GET', '/orders/:id/bills', 'payments.read'),
  route('operations', 'POST', '/orders/:id/bills', 'payments.collect'),
  route('operations', 'POST', '/bills/:id/pay', 'payments.collect'),
  route('operations', 'GET', '/orders/active', 'orders.read'),
  route('operations', 'POST', '/orders/open', 'orders.modify'),
  route('operations', 'POST', '/orders/opening-items', 'orders.modify'),
  route('operations', 'POST', '/orders/cancel-opening', 'orders.modify'),
  route('operations', 'POST', '/orders/quick-bar', 'orders.modify'),
  route('operations', 'GET', '/orders/:id', 'orders.read'),
  route('operations', 'POST', '/orders/:id/items', 'orders.modify'),
  route('operations', 'PATCH', '/orders/:id/items/:itemId/quantity', 'orders.modify'),
  route('operations', 'PATCH', '/orders/:id/items/:itemId/notes', 'orders.modify'),
  route('operations', 'DELETE', '/orders/:id/items/:itemId', 'orders.modify'),
  route('operations', 'POST', '/orders/:id/send-to-kitchen', 'orders.dispatch'),
  route('operations', 'POST', '/tables/:id/por-cobrar', 'orders.mark_for_billing'),
  route('operations', 'POST', '/tables/:id/pay', 'payments.collect'),
  route('operations', 'GET', '/purchases', 'purchases.read'),
  route('operations', 'POST', '/purchases', 'purchases.manage'),
  route('operations', 'POST', '/purchases/:id/regularize', 'purchases.manage'),
  route('operations', 'GET', '/kardex', 'inventory.read'),
  route('operations', 'POST', '/kardex/adjustments', 'inventory.manage'),
  route('operations', 'GET', '/shifts/records', 'cash.read'),
  route('operations', 'POST', '/shifts/switch', 'cash.close'),
  route('operations', 'GET', '/transactions', 'cash.read'),
  route('operations', 'GET', '/transactions/:id/corrections', 'payments.correct'),
  route('operations', 'POST', '/transactions/:id/corrections', 'payments.correct'),
  route('operations', 'POST', '/transactions', 'cash.manual'),
  route('reports', 'GET', '/reports/ratios', 'reports.financial'),
  route('reports', 'GET', '/reports/summary', 'reports.financial'),
  route('sync', 'GET', '/client-ops', 'security.manage'),
  route('sync', 'GET', '/signing-keys', 'security.manage'),
  route('sync', 'POST', '/signing-keys', 'company.read'),
  route('sync', 'DELETE', '/signing-keys/:id', 'company.read'),
  route('users', 'GET', '/', 'users.manage'),
  route('users', 'POST', '/', 'users.manage'),
  route('users', 'PATCH', '/:id', 'users.manage'),
  route('users', 'POST', '/:id/archive', 'users.manage'),
  route('users', 'POST', '/:id/restore', 'users.manage'),
];
export function permissionForDeclaredRoute(group: RouteGroup, method: string, path: string): PosPermission | undefined {
  return ROUTE_PERMISSIONS.find((entry) => entry.group === group && entry.method === method && entry.path === path)?.permission;
}

/** Solo coincide con rutas registradas; un recurso desconocido no recibe permiso. */
export function permissionForRequest(group: RouteGroup, method: string, path: string): PosPermission | undefined {
  if (!path.startsWith('/') || path.includes('?') || path.includes('#') || /%2f|%5c/i.test(path)) return undefined;
  const segments = path.replace(/\/$/, '').split('/').slice(1);
  const candidates = ROUTE_PERMISSIONS.filter((entry) => {
    if (entry.group !== group || entry.method !== method.toUpperCase()) return false;
    const parts = entry.path.replace(/\/$/, '').split('/').slice(1);
    return parts.length === segments.length && parts.every((part, index) => part.startsWith(':') ? !!segments[index] : part === segments[index]);
  });
  // Una ruta literal tiene prioridad sobre otra que capture su nombre como ID.
  candidates.sort((a, b) => a.path.split('/:').length - b.path.split('/:').length);
  return candidates[0]?.permission;
}

/** Se monta después de requireAuth; toda ruta sin política explícita se rechaza. */
export function enforceRoutePermission(group: RouteGroup): RequestHandler {
  return (req, _res, next) => {
    const user = req.auth?.user;
    if (!user) return next(new AppError('No autorizado.', 401, 'UNAUTHORIZED'));
    const permission = permissionForRequest(group, req.method, req.path);
    if (!permission || !hasPermission(user.role, permission)) return next(new AppError('No tiene permiso para esta operación.', 403, 'FORBIDDEN'));
    next();
  };
}
