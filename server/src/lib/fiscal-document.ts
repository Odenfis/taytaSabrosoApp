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

/** Tasas en centésimas de punto porcentual: 1050 equivale a 10,50 %. */
export type FiscalTaxLine = { description: string; quantity: number; unitPriceCents: number };
export type FiscalCalculatedLine = FiscalTaxLine & { totalCents: number; baseCents: number; taxCents: number };
export type FiscalCalculation = { rateBasisPoints: number; lines: FiscalCalculatedLine[]; totalCents: number; baseCents: number; taxCents: number };

/**
 * Cálculo provisional por línea, con precios que incluyen impuesto.
 * No habilita emisión: el contador debe confirmar tasa y redondeo aplicables.
 * Los importes y multiplicaciones usan enteros, sin decimales binarios.
 */
export function calculateFiscalLines(lines: readonly FiscalTaxLine[], rateBasisPoints: number): FiscalCalculation {
  if (!Number.isSafeInteger(rateBasisPoints) || rateBasisPoints < 0 || rateBasisPoints > 10000) throw new Error('Tasa fiscal inválida.');
  if (!lines.length || lines.length > 1000) throw new Error('Cantidad de líneas fiscales inválida.');
  const divisor = 10000n + BigInt(rateBasisPoints);
  const calculated = lines.map(line => {
    if (!line.description.trim() || line.description.length > 500) throw new Error('Descripción fiscal inválida.');
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0 || line.quantity > 1_000_000) throw new Error('Cantidad fiscal inválida.');
    if (!Number.isSafeInteger(line.unitPriceCents) || line.unitPriceCents < 0) throw new Error('Precio fiscal inválido.');
    const total = BigInt(line.unitPriceCents) * BigInt(line.quantity);
    if (total > 999_999_999_999n) throw new Error('Importe fiscal excede el límite.');
    const base = (total * 10000n + divisor / 2n) / divisor;
    return { ...line, totalCents: Number(total), baseCents: Number(base), taxCents: Number(total - base) };
  });
  const totalCents = calculated.reduce((sum, line) => sum + line.totalCents, 0);
  const baseCents = calculated.reduce((sum, line) => sum + line.baseCents, 0);
  if (!Number.isSafeInteger(totalCents) || totalCents > 999_999_999_999) throw new Error('Total fiscal excede el límite.');
  return { rateBasisPoints, lines: calculated, totalCents, baseCents, taxCents: totalCents - baseCents };
}
