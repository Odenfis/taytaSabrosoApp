import type { Transaction } from '../types';

// Regla de cuenta de fondos: una transacción toca la GAVETA (caja efectivo)
// si y solo si NO está vinculada a una cuenta bancaria. Los movimientos
// con `bankAccountId` son exclusivamente de banco (no doble-imputar).
export const isCashMovement = (tx: Transaction): boolean => !tx.bankAccountId;

export const isBankMovement = (tx: Transaction): boolean => !!tx.bankAccountId;
