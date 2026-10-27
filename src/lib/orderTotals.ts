import type { Order, OrderItem } from '../types';

type PricedItem = Pick<OrderItem, 'price' | 'quantity'>;

export function orderTotalsFromItems(items: PricedItem[]) {
  const totalCents = Math.round(items.reduce((sum, item) => sum + item.price * item.quantity, 0) * 100);
  const subtotalCents = Math.round(totalCents / 1.18);
  return { subtotal: subtotalCents / 100, igv: (totalCents - subtotalCents) / 100, total: totalCents / 100 };
}

export function normalizeUnpaidOrder(order: Order): Order {
  return order.status === 'cobrado' || order.status === 'anulado'
    ? order
    : { ...order, ...orderTotalsFromItems(order.items) };
}

export function isHistoricalAdditiveOrder(order: Order): boolean {
  return order.status === 'cobrado' && Math.round(order.total * 100) !== Math.round(orderTotalsFromItems(order.items).total * 100);
}
