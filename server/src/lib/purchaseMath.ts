import { AppError, round2 } from './utils.js';

export type PurchaseLine = { quantity: number; unitCost: number; discount?: number; totalCost: number };

export function checkedPurchaseLine(item: PurchaseLine) {
  const discount = item.discount ?? 0;
  const values = [item.quantity, item.unitCost, discount, item.totalCost];
  const gross = round2(item.quantity * item.unitCost);
  if (values.some((value) => !Number.isFinite(value)) || item.quantity <= 0 || item.unitCost < 0 ||
      discount < 0 || round2(discount) !== discount || discount > gross) {
    throw new AppError('Cantidad, costo o descuento inválido.', 400, 'PURCHASE_ITEM_INVALID');
  }
  const net = round2(gross - discount);
  if (net !== round2(item.totalCost)) {
    throw new AppError('El costo del detalle es inconsistente.', 400, 'PURCHASE_ITEM_TOTAL_MISMATCH');
  }
  return { discount, net, netUnitCost: item.quantity ? net / item.quantity : 0 };
}

export function checkedPurchaseTotals(items: PurchaseLine[], subtotal: number | undefined, igv: number | undefined, total: number) {
  const net = round2(items.reduce((sum, item) => sum + checkedPurchaseLine(item).net, 0));
  const tax = round2(net * 0.18);
  const expected = round2(net + tax);
  if (![subtotal, igv, total].filter((value) => value !== undefined).every((value) => Number.isFinite(value)) ||
      (subtotal !== undefined && round2(subtotal) !== net) ||
      (igv !== undefined && round2(igv) !== tax) || round2(total) !== expected) {
    throw new AppError('Los totales de la compra no coinciden con el detalle.', 400, 'PURCHASE_TOTAL_MISMATCH');
  }
  return { subtotal: net, igv: tax, total: expected };
}
