// Deliberately in memory: a historical local declaration cannot acquire proof
// merely by logging in. Existing signed records remain verifiable after restart.
const createdHere = new Set<string>();
export function markOperationCreatedHere(id: string): void { createdHere.add(id); }
export function canAcquireFirstProof(id: string): boolean { return createdHere.has(id); }

const REVIEW_KEY = 'ts_offline_provenance_review_v1';
/** Upgrade guard: we cannot distinguish an inferred historical terminal from
 * a genuinely recorded one. Conservatively retain every pre-upgrade pending
 * operation for explicit review, without modifying its identity or payload. */
export function initializeProvenanceReview(): void {
  try {
    if (localStorage.getItem(REVIEW_KEY) !== null) return;
    const queue = JSON.parse(localStorage.getItem('ts_pending_queue_v2') || '[]');
    if (!Array.isArray(queue)) return;
    localStorage.setItem(REVIEW_KEY, JSON.stringify(queue.map(op => op.clientOpId)));
  } catch { /* No successful marker means review is required (fail closed). */ }
}
export function requiresProvenanceReview(id: string): boolean {
  try {
    const raw = localStorage.getItem(REVIEW_KEY);
    if (raw === null) return true;
    const ids = JSON.parse(raw);
    return !Array.isArray(ids) || ids.includes(id);
  } catch { return true; }
}
