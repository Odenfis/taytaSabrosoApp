import { isInsumoOp, runInsumoRequest } from './insumoCatalog';
import type { PendingOp, PendingOpProof } from '../types';
import { apiClient, ApiError, type OfflineRequestOptions } from './api';
import { ensureOfflineProofs } from './offlineSigning';
import { isProductOp, productIdOf, signalProductQueue } from './productCatalog';
import { offlineApiPath, offlinePlansForOp, offlinePrimaryActionId, type OfflineRequestPlan } from './offlineRequest';

// Dispatcher de replay de la cola offline (Fase E4).
// Convierte una PendingOp guardada en localStorage en la llamada HTTP real del server,
// y clasifica el resultado para que el replay decida: quitar / omitir / reintentar.
//
// La petición se construye desde el contrato compartido (server/src/lib/offline-actions):
// la misma definición que el servidor usa para verificar la firma. Así el cliente
// no puede enviar un cuerpo distinto del firmado.
//
// Disposiciones:
//   - 'ok'       → la operación se aplicó (o el server deduplicó por clientOpId).
//   - 'already'  → 409 ALREADY_* (ya aplicada en otro replay) → omitir en silencio.
//   - 'gone'     → 404 (entidad ya no existe, p.ej. orden liberada offline) → omitir.
//   - 'business' → otro 4xx de negocio → omitir con aviso al usuario.
//   - 'retry'    → red/5xx/401 → conservar en la cola y detener el replay (reintento posterior).

export type ReplayDisposition = 'ok' | 'already' | 'gone' | 'business' | 'retry' | 'conflict';

export interface ReplayCallResult {
  disposition: ReplayDisposition;
  data?: unknown;
  message?: string;
  /** true solo cuando el reintento se debe a red caída (status 0), no a error 5xx del server. */
  network?: boolean;
  unauthorized?: boolean;
}

type AnyPayload = Record<string, unknown>;

const productRequests = new Map<string, Promise<ReplayCallResult>>();
const sendingProducts = new Set<string>();
export const productIsSending = (id: string) => sendingProducts.has(id);

export interface ReplayOptions {
  /** Solo un administrador global puede asumir una firma ajena. */
  assume?: boolean;
}

function replayClient(options: OfflineRequestOptions) {
  return {
    post: <T>(path: string, body?: unknown) => apiClient.post<T>(path, body, options),
    patch: <T>(path: string, body?: unknown) => apiClient.patch<T>(path, body, options),
    del: <T>(path: string) => apiClient.del<T>(path, options),
  };
}

export function replayCall(op: PendingOp, payload: AnyPayload, options?: ReplayOptions): Promise<ReplayCallResult> {
  if (isInsumoOp(op)) return runInsumoRequest(op, () => replayOne(op, payload, options));
  if (!isProductOp(op)) return replayOne(op, payload, options);
  const existing = productRequests.get(op.clientOpId);
  if (existing) return existing;
  const id = productIdOf(op);
  sendingProducts.add(id);
  const request = replayOne(op, payload, options).finally(() => {
    productRequests.delete(op.clientOpId); sendingProducts.delete(id); signalProductQueue();
  });
  productRequests.set(op.clientOpId, request);
  signalProductQueue();
  return request;
}

function proofForPlan(proofs: PendingOpProof[], plan: OfflineRequestPlan): PendingOpProof | undefined {
  return proofs.find((proof) => proof.action === plan.action.id && proof.variant === plan.variantIndex);
}

async function sendPlan(
  plan: OfflineRequestPlan,
  proof: PendingOpProof,
  options?: ReplayOptions,
): Promise<unknown> {
  const path = offlineApiPath(plan);
  const client = replayClient({
    proof: { document: proof.document, signature: proof.signature },
    replay: true,
    assume: options?.assume,
  });
  if (plan.method === 'POST') return client.post(path, plan.body);
  if (plan.method === 'PATCH') return client.patch(path, plan.body);
  return client.del(path);
}

async function replayOne(op: PendingOp, payload: AnyPayload, options?: ReplayOptions): Promise<ReplayCallResult> {
  const isCreateOrder = op.op === 'openOrder' || op.op === 'quickOrder';

  try {
    // La prueba se obtiene en el equipo del autor. Sin firma no se envía: el
    // servidor rechazaría el replay y una asunción administrativa quedaría sin
    // base criptográfica.
    const proofs = await ensureOfflineProofs(op);
    if (!proofs) {
      throw new ApiError('La operación no tiene una prueba de autoría firmada en este equipo. Si fue creada en otra terminal, solo un administrador global puede asumirla desde la terminal donde se firmó.', 'OFFLINE_PROOF_REQUIRED', 403);
    }
    const primary = offlinePrimaryActionId(op);
    const candidates = offlinePlansForOp(op, payload)
      .filter((plan) => plan.action.id === primary && !!proofForPlan(proofs, plan));
    if (!candidates.length) {
      throw new ApiError('La operación no tiene una prueba de autoría válida para la acción que va a ejecutar.', 'OFFLINE_PROOF_REQUIRED', 403);
    }
    if (candidates.some((plan) => plan.unresolved)) {
      throw new ApiError('La operación depende de una apertura sin resolver: no se puede enviar hasta que la apertura se sincronice.', 'OFFLINE_PROOF_REF_UNRESOLVED', 409);
    }

    let failure: unknown = null;
    for (let index = 0; index < candidates.length; index += 1) {
      const plan = candidates[index];
      const proof = proofForPlan(proofs, plan)!;
      try {
        const data = await sendPlan(plan, proof, options);
        return { disposition: 'ok', data };
      } catch (err) {
        failure = err;
        // Variante alternativa de la misma acción (p.ej. PATCH y luego POST).
        const hasFallback = index < candidates.length - 1;
        if (hasFallback && err instanceof ApiError && err.status === 404) continue;
        throw err;
      }
    }
    throw failure;
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 0) return { disposition: 'retry', network: true };
      if (err.status === 401 || err.isUnauthorized) return { disposition: 'retry', network: false, unauthorized: true, message: err.message };
      if (err.status >= 500) return { disposition: 'retry', network: false, message: err.message };
      // Nunca descartar una operación por pérdida de permisos: requiere revisión.
      if (err.status === 403) return { disposition: 'conflict', message: err.message };
      if (err.code.startsWith('INSUMO_') || ['BILLS_EXIST', 'BILL_CLOSED', 'TABLE_CHANGED', 'TOTAL_MISMATCH', 'UNASSIGNED_ITEMS', 'PAYMENT_ID_CONFLICT'].includes(err.code)) return { disposition: 'conflict', message: err.message };
      if (op.op === 'createDinerBills' || op.op === 'payDinerBill') return { disposition: 'conflict', message: err.message };
      if (isProductOp(op) && err.code === 'PRODUCT_VERSION_CONFLICT') return { disposition: 'conflict', message: err.message };
      // 4xx
      if (err.code === 'ALREADY_REGULARIZED' || err.code === 'ALREADY_PAID') {
        return { disposition: 'already', message: err.message };
      }
      if (err.status === 404 && !isCreateOrder) {
        return { disposition: 'gone', message: err.message };
      }
      return { disposition: 'business', message: err.message };
    }
    return { disposition: 'retry' };
  }
}
