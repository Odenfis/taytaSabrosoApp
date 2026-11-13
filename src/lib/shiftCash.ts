import type { Transaction } from '../types';

/** Mirrors the server's cash-drawer calculation for the selected shift. */
export function expectedShiftCash(transactions: Transaction[], initialCash: number): number {
  const change = transactions.reduce((sum, tx) => {
    if (tx.bankAccountId) return sum;
    return sum + (tx.isIncome ? tx.amount : -tx.amount);
  }, 0);
  return +(initialCash + change).toFixed(2);
}
