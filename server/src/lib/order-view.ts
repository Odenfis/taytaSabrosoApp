import { hasPermission } from './permissions.js';

/** Order readers need dishes/prices/totals, not cash receipt details. */
export function orderView<T extends Record<string, unknown>>(order: T, role: string): T | Omit<T, 'paymentMethod' | 'amountReceived' | 'change'> {
  if (hasPermission(role, 'payments.read')) return order;
  const { paymentMethod: _method, amountReceived: _received, change: _change, ...visible } = order;
  return visible;
}
