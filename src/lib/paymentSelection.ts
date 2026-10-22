import type { CustomPaymentMethod } from '../types';

export function availablePaymentMethods(methods: CustomPaymentMethod[], companyId?: string) {
  return companyId ? methods.filter((method) => method.isActive && !method.isDeleted &&
    (method.companyId === companyId || method.companyId === 'ambas')) : [];
}

// undefined waits for the first available catalog; null requires an explicit choice.
export function reconcilePaymentSelection(methods: CustomPaymentMethod[], id: string | null | undefined) {
  if (id === undefined) return (methods.find((method) => method.category === 'Efectivo') ?? methods[0])?.id;
  return id && methods.some((method) => method.id === id) ? id : null;
}

export function resolvePaymentMethod(methods: CustomPaymentMethod[], companyId: string, name: string, id?: string) {
  const available = availablePaymentMethods(methods, companyId);
  return id ? available.find((method) => method.id === id)
    : available.find((method) => method.name.toLowerCase() === name.toLowerCase());
}

export function paymentDetails(method: CustomPaymentMethod | undefined, total: number, cashInput: string, reference: string) {
  const isCash = method?.category === 'Efectivo';
  const cashReceived = cashInput.trim() === '' ? total : Number(cashInput);
  const error = !method ? 'Selecciona un método de cobro activo.'
    : isCash && (!Number.isFinite(cashReceived) || cashReceived < 0) ? 'Ingresa un monto de efectivo válido.'
    : isCash && cashReceived < total ? 'El efectivo recibido no cubre el total.'
    : method.requiresReferenceNumber && !reference.trim() ? 'Ingresa el número de operación o voucher.' : '';
  return {
    isCash, cashReceived, error,
    change: Number.isFinite(cashReceived) ? Math.max(0, +(cashReceived - total).toFixed(2)) : 0,
    paymentMethod: method?.name,
    customPaymentMethodId: method?.id,
    amountReceived: isCash ? cashReceived : total,
    referenceNumber: method?.requiresReferenceNumber ? reference.trim() || undefined : undefined,
  };
}
