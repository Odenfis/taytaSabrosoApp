import { canAcquireFirstProof } from './offlineProvenance';
import { apiClient, ApiError } from './api';
import { parseOfflineDocument, signOfflineEnvelope, type OfflineProof, type OfflineProofEnvelope } from './offlineProof';
import { offlinePlansForOp, offlinePrimaryActionId } from './offlineRequest';
import { canonicalJson } from '../../server/src/lib/offline-actions';
import type { PendingOp, PendingOpProof } from '../types';

// Clave ECDSA P-256 no exportable, una por usuario y terminal. La clave privada
// nunca sale del navegador; el servidor solo recibe la clave pública.
type PublicJwk = { kty: 'EC'; crv: 'P-256'; x: string; y: string };

interface StoredSigningKey {
  id: string;
  owner: string;
  userId: string;
  deviceId: string;
  publicJwk: PublicJwk;
  privateKey: CryptoKey;
  createdAt: string;
  registered: boolean;
}

const DB_NAME = 'ts_offline_signing_v1';
const STORE = 'keys';
const memory = new Map<string, StoredSigningKey>();
let databasePromise: Promise<IDBDatabase | null> | null = null;
let identity: { userId: string; deviceId: string } | null = null;
let keyPromise: Promise<StoredSigningKey | null> | null = null;
let registrationRetryAt = 0;
const keyFlights = new Map<string, Promise<StoredSigningKey | null>>();
const cryptoProvider = (): Crypto => globalThis.crypto;

/** La firma necesita WebCrypto, disponible en HTTPS o localhost. */
export function canSignOffline(): boolean {
  return !!globalThis.crypto?.subtle;
}

function ownerOf(userId: string, deviceId: string): string {
  return `${userId}:${deviceId}`;
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('owner', 'owner', { unique: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return databasePromise;
}

async function readKey(owner: string): Promise<StoredSigningKey | null> {
  const db = await openDatabase();
  if (!db) return memory.get(owner) ?? null;
  return new Promise((resolve) => {
    try {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).index('owner').get(owner);
      request.onsuccess = () => resolve((request.result as StoredSigningKey | undefined) ?? null);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function saveKey(key: StoredSigningKey): Promise<void> {
  const db = await openDatabase();
  if (!db) {
    memory.set(key.owner, key);
    return;
  }
  await new Promise<void>((resolve, reject) => {
    try {
      const transaction = db.transaction(STORE, 'readwrite');
      transaction.objectStore(STORE).put(key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('No se pudo guardar la clave de firma.'));
    } catch (err) {
      reject(err);
    }
  });
}

async function deleteKey(key: StoredSigningKey): Promise<void> {
  const db = await openDatabase();
  if (!db) {
    memory.delete(key.owner);
    return;
  }
  await new Promise<void>((resolve) => {
    try {
      const transaction = db.transaction(STORE, 'readwrite');
      transaction.objectStore(STORE).delete(key.id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

function newKeyId(): string {
  const provider = cryptoProvider();
  if (typeof provider?.randomUUID === 'function') return provider.randomUUID();
  // RFC 4122 v4 con getRandomValues (disponible también sin HTTPS).
  const bytes = provider.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function createKey(userId: string, deviceId: string): Promise<StoredSigningKey> {
  const provider = cryptoProvider();
  if (!provider?.subtle) throw new Error('La firma de operaciones requiere HTTPS en esta terminal.');
  const pair = await provider.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const exported = await provider.subtle.exportKey('jwk', pair.publicKey);
  if (!exported.x || !exported.y) throw new Error('No se pudo exportar la clave pública de firma.');
  const key: StoredSigningKey = {
    id: newKeyId(),
    owner: ownerOf(userId, deviceId),
    userId,
    deviceId,
    publicJwk: { kty: 'EC', crv: 'P-256', x: exported.x, y: exported.y },
    privateKey: pair.privateKey,
    createdAt: new Date().toISOString(),
    registered: false,
  };
  await saveKey(key);
  return key;
}

/** Registra la clave pública. Sin red se conserva la clave y se reintenta al
 * sincronizar; si el servidor la rechazó (revocada o ajena) se rota una vez. */
async function registerKey(key: StoredSigningKey, allowRotation = true): Promise<StoredSigningKey> {
  if (key.registered) return key;
  // Evita una petición por cada operación de la cola cuando el servidor no
  // responde; se reintenta en una firma posterior.
  if (Date.now() < registrationRetryAt) return key;
  try {
    const result = await apiClient.post<{ id: string }>('/sync/signing-keys', { id: key.id, ...key.publicJwk });
    registrationRetryAt = 0;
    if (result.id !== key.id) {
      await deleteKey(key);
      const moved = { ...key, id: result.id, registered: true };
      await saveKey(moved);
      return moved;
    }
    const updated = { ...key, registered: true };
    await saveKey(updated);
    return updated;
  } catch (error) {
    if (allowRotation && error instanceof ApiError && error.code === 'SIGNING_KEY_UNAVAILABLE') {
      await deleteKey(key);
      return registerKey(await createKey(key.userId, key.deviceId), false);
    }
    registrationRetryAt = Date.now() + 15_000;
    // Sin conexión o error transitorio: se puede firmar y registrar al reconectar.
    return key;
  }
}

async function ensureKey(): Promise<StoredSigningKey | null> {
  const actor = identity && { ...identity };
  if (!actor) return null;
  const owner = ownerOf(actor.userId, actor.deviceId);
  const running = keyFlights.get(owner);
  if (running) return running;
  const flight = (async () => {
    const existing = await readKey(owner);
    const key = existing ?? await createKey(actor.userId, actor.deviceId);
    // An asynchronous key creation must never register under another login.
    if (identity?.userId !== actor.userId || identity.deviceId !== actor.deviceId) return null;
    return registerKey(key);
  })();
  keyFlights.set(owner, flight);
  try { return await flight; } finally { if (keyFlights.get(owner) === flight) keyFlights.delete(owner); }
}

/** Configura la identidad de firma de la sesión. La promesa termina cuando la
 * clave local existe (el registro remoto puede quedar pendiente sin red). */
export function configureOfflineSigning(next: { userId: string; deviceId: string } | null): Promise<void> {
  if (!next) {
    identity = null;
    keyPromise = null;
    return Promise.resolve();
  }
  if (identity?.userId === next.userId && identity?.deviceId === next.deviceId && keyPromise) {
    return keyPromise.then(() => undefined, () => undefined);
  }
  registrationRetryAt = 0;
  identity = { ...next };
  keyPromise = ensureKey().catch(() => null);
  return keyPromise.then(() => undefined, () => undefined);
}

export function clearOfflineSigning(): void {
  identity = null;
  keyPromise = null;
}

async function signingKey(): Promise<StoredSigningKey | null> {
  if (!identity) return null;
  // Reintenta el registro pendiente en cada firma; sin esto una clave creada
  // sin conexión nunca llegaría al servidor.
  const key = await ensureKey();
  if (key) keyPromise = Promise.resolve(key);
  return key;
}

/** Solo diagnostica una clave faltante para una operación nueva del autor local. */
export async function localSigningKeyUnavailable(op: PendingOp): Promise<boolean> {
  if (!canAcquireFirstProof(op.clientOpId) || !identity ||
      identity.userId !== op.authorId || identity.deviceId !== op.deviceId) return false;
  try { return !(await signingKey()); } catch { return true; }
}

/** Firma el contenido exacto de la operación encolada. La terminal firmada es
 * la que originó la operación; no se reasigna al sincronizar. Se firma una
 * prueba por cada variante de ruta que la operación puede ejecutar. */
export async function signPendingOperation(op: PendingOp, providedKey?: StoredSigningKey | null): Promise<PendingOpProof[]> {
  if (!op.proofs?.length && !canAcquireFirstProof(op.clientOpId)) return [];
  const key = providedKey === undefined ? await signingKey() : providedKey;
  if (!key || !op.authorId || !op.companyId || !op.deviceId) return [];
  if (op.authorId !== key.userId || op.deviceId !== key.deviceId) return [];
  const payload = (op.payload ?? {}) as Record<string, unknown>;
  const proofs: PendingOpProof[] = [];
  for (const plan of offlinePlansForOp(op, payload)) {
    if (plan.unresolved) continue;
    const envelope: OfflineProofEnvelope = {
      version: 2,
      keyId: key.id,
      authorId: op.authorId,
      deviceId: op.deviceId,
      companyId: op.companyId,
      action: plan.action.id,
      method: plan.variant.method,
      path: plan.variant.path,
      clientOpId: op.clientOpId,
      body: plan.signed.body,
      params: plan.signed.params,
      query: plan.signed.query,
    };
    const proof = await signOfflineEnvelope(envelope, key.privateKey, cryptoProvider());
    proofs.push({ action: plan.action.id, variant: plan.variantIndex, document: proof.document, signature: proof.signature });
  }
  return proofs;
}

/** Reutiliza la prueba solo si sigue correspondiendo al contenido lógico
 * encolado (acción, ruta, cuerpo, parámetros y query). */
export function offlineProofMatches(op: PendingOp, proof: PendingOpProof | undefined): boolean {
  if (!proof) return false;
  const parsed = parseOfflineDocument(proof.document);
  if (!parsed) return false;
  if (parsed.version !== 2) return false;
  if (parsed.clientOpId !== op.clientOpId) return false;
  if (parsed.authorId !== op.authorId) return false;
  if (parsed.deviceId !== op.deviceId) return false;
  if (parsed.companyId !== op.companyId) return false;
  if (parsed.action !== proof.action) return false;
  const payload = (op.payload ?? {}) as Record<string, unknown>;
  const plan = offlinePlansForOp(op, payload)
    .find((entry) => entry.action.id === proof.action && entry.variantIndex === proof.variant);
  if (!plan) return false;
  if (parsed.method !== plan.variant.method || parsed.path !== plan.variant.path) return false;
  return canonicalJson(parsed.body) === canonicalJson(plan.signed.body)
    && canonicalJson(parsed.params) === canonicalJson(plan.signed.params)
    && canonicalJson(parsed.query) === canonicalJson(plan.signed.query);
}

/** Obtiene las pruebas para un envío. La prueba original del autor se conserva
 * intacta, incluso cuando otra sesión la asume. Solo se vuelve a firmar si el
 * contenido cambió y esta terminal es la del autor. */
export async function ensureOfflineProofs(op: PendingOp): Promise<PendingOpProof[] | null> {
  if (!op.authorId || !op.companyId || !op.deviceId) return null;
  const proofs = [...(op.proofs ?? [])];
  const payload = (op.payload ?? {}) as Record<string, unknown>;
  const plans = offlinePlansForOp(op, payload);
  // Si esta terminal es la del autor, la clave vigente es la única aceptable:
  // una clave rotada invalidaría la prueba ante el servidor.
  const local = identity?.userId === op.authorId && identity.deviceId === op.deviceId
    ? await readKey(ownerOf(op.authorId, op.deviceId))
    : null;
  const acceptable = (proof: PendingOpProof) => {
    if (!offlineProofMatches(op, proof)) return false;
    if (!local) return true;
    const parsed = parseOfflineDocument(proof.document);
    return !!parsed && parsed.keyId === local.id;
  };
  const pending = plans.some((plan) => !proofs.some((proof) =>
    proof.action === plan.action.id && proof.variant === plan.variantIndex && acceptable(proof)));
  if (pending) {
    const signed = await signPendingOperation(op, local ?? undefined);
    for (const proof of signed) {
      const index = proofs.findIndex((entry) => entry.action === proof.action && entry.variant === proof.variant);
      if (index >= 0) proofs[index] = proof;
      else proofs.push(proof);
    }
  }
  const usable = proofs.filter((proof) => offlineProofMatches(op, proof));
  return usable.length ? usable : null;
}

/** Prueba de la acción principal de la operación (compatibilidad). */
export async function ensureOfflineProof(op: PendingOp): Promise<PendingOpProof | null> {
  const proofs = await ensureOfflineProofs(op);
  if (!proofs) return null;
  const primary = offlinePrimaryActionId(op);
  return proofs.find((proof) => proof.action === primary) ?? proofs[0] ?? null;
}

/** Solo para pruebas: aísla la identidad y el almacén en memoria. */
export function resetOfflineSigningForTests(): void {
  clearOfflineSigning();
  memory.clear();
  databasePromise = null;
  registrationRetryAt = 0;
}

/** Solo para pruebas: clave pública de la terminal sembrada, para verificar la
 * firma con el mismo algoritmo que usa el servidor. */
export async function offlineSigningPublicKeyForTests(userId: string, deviceId: string): Promise<PublicJwk | null> {
  const key = await readKey(ownerOf(userId, deviceId));
  return key?.publicJwk ?? null;
}

/** Solo para pruebas: instala una clave ya registrada, sin red, para que el
 * replay pueda firmar determinísticamente. */
export async function seedOfflineSigningForTests(userId: string, deviceId: string): Promise<void> {
  identity = { userId, deviceId };
  const owner = ownerOf(userId, deviceId);
  const existing = await readKey(owner);
  const key = existing ?? await createKey(userId, deviceId);
  const registered = { ...key, registered: true };
  await saveKey(registered);
  keyPromise = Promise.resolve(registered);
}
