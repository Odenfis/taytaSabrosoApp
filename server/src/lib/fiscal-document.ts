/** Estado interno de preparación y seguimiento. No implica emisión fiscal. */
export type FiscalDocumentState = 'draft' | 'prepared' | 'sending' | 'outcome_unknown' | 'accepted' | 'rejected' | 'review_required';
export type FiscalDocumentEvent = 'prepare' | 'send' | 'transport_uncertain' | 'accept' | 'reject' | 'require_review';
const transitions: Record<FiscalDocumentState, Partial<Record<FiscalDocumentEvent, FiscalDocumentState>>> = {
  draft: { prepare: 'prepared', require_review: 'review_required' },
  prepared: { send: 'sending', require_review: 'review_required' },
  sending: { transport_uncertain: 'outcome_unknown', accept: 'accepted', reject: 'rejected', require_review: 'review_required' },
  outcome_unknown: { accept: 'accepted', reject: 'rejected', require_review: 'review_required' },
  accepted: {}, rejected: { require_review: 'review_required' }, review_required: {},
};
/** Ante una respuesta incierta se consulta o revisa antes de reenviar. */
export function nextFiscalDocumentState(state: FiscalDocumentState, event: FiscalDocumentEvent): FiscalDocumentState {
  const next = transitions[state][event];
  if (!next) throw new Error(`Transición fiscal inválida: ${state} → ${event}`);
  return next;
}
/** Comprueba precisión y rango antes de serializar un importe fiscal. */
export function fiscalCents(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 9_999_999_999.99) throw new Error('Importe fiscal inválido.');
  const cents = Math.round(value * 100);
  if (Math.abs(value * 100 - cents) > 1e-7 || !Number.isSafeInteger(cents)) throw new Error('El importe fiscal debe tener máximo dos decimales.');
  return cents;
}
/** Desglose provisional para ventas gravadas a la tasa actual del POS. */
export function fiscalTaxIncluded(total: number): { total: number; subtotal: number; igv: number } {
  const cents = fiscalCents(total);
  const base = Math.round(cents / 1.18);
  return { total: cents, subtotal: base, igv: cents - base };
}
