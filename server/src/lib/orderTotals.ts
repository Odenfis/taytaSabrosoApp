import type { Prisma } from '@prisma/client';
import { toNum } from './utils.js';

type PricedItem = { price: number | Prisma.Decimal; quantity: number | Prisma.Decimal };

export function orderTotalsFromItems(items: PricedItem[]) {
  const totalCents = Math.round(items.reduce((sum, item) => sum + toNum(item.price) * toNum(item.quantity), 0) * 100);
  const subtotalCents = Math.round(totalCents / 1.18);
  return { subtotal: subtotalCents / 100, igv: (totalCents - subtotalCents) / 100, total: totalCents / 100 };
}
