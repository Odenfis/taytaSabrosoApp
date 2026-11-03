import { isTemporaryOrderId, isTemporaryTableId } from '../../server/src/lib/offline-actions';

/** Resolución de una entidad temporal del cliente contra su equivalente en el
 * servidor. Se conserva en este equipo para que una interrupción del replay
 * no deje operaciones con identificadores sin asociación recuperable. */
export type OfflineResolution = {
  /** clientOpId de la apertura que originó la entidad temporal. */
  openingClientOpId: string;
  /** Id real del pedido (se conoce cuando la apertura se aplica). */
  orderId?: string;
  /** Id real de la mesa (se conoce cuando la apertura se aplica). */
  tableId?: string;
  /** Id temporal de la mesa (barra express). */
  tmpTableId?: string;
  /** Empresa del pedido. */
  companyId?: string;
};

const RESOLUTION_KEY = 'ts_offline_resolutions_v1';

function readStore(): Record<string, OfflineResolution> {
  try {
    const raw = localStorage.getItem(RESOLUTION_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, OfflineResolution> : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, OfflineResolution>, strict = false): void {
  try {
    const serialized = JSON.stringify(store);
    localStorage.setItem(RESOLUTION_KEY, serialized);
    if (strict && localStorage.getItem(RESOLUTION_KEY) !== serialized) throw new Error('Almacenamiento no confirmado');
  } catch {
    if (strict) throw new Error('No se pudo guardar la referencia de la apertura. Libere espacio y reintente la sincronización.');
  }
}

export function loadResolutions(): Record<string, OfflineResolution> {
  return readStore();
}

/** Registra (o completa) la resolución de un pedido temporal. */
export function recordResolution(tmpOrderId: string, resolution: OfflineResolution): void {
  if (!tmpOrderId) return;
  const store = readStore();
  store[tmpOrderId] = { ...(store[tmpOrderId] ?? {}), ...resolution };
  writeStore(store, true);
}

export function clearResolution(tmpOrderId: string): void {
  const store = readStore();
  if (!(tmpOrderId in store)) return;
  delete store[tmpOrderId];
  writeStore(store);
}

/** Busca la resolución que corresponde a un identificador temporal (pedido o
 * mesa). Devuelve undefined si la apertura todavía no se conoce. */
export function resolutionForTemporaryId(value: unknown): OfflineResolution | undefined {
  if (typeof value !== 'string') return undefined;
  const store = readStore();
  if (isTemporaryOrderId(value)) return store[value];
  if (isTemporaryTableId(value)) {
    return Object.values(store).find((entry) => entry.tmpTableId === value);
  }
  return undefined;
}

/** Busca la resolución de una apertura cuyo identificador real es el dado.
 * Permite que el documento firmado use siempre el marcador lógico, aunque el
 * payload ya tenga el identificador real del servidor. */
export function resolutionForRealId(value: unknown, kind: 'order' | 'table'): OfflineResolution | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  const store = readStore();
  return Object.values(store).find((entry) => (kind === 'order' ? entry.orderId === value : entry.tableId === value));
}

/** Sustituye en el payload los identificadores temporales ya resueltos. */
export function resolveTemporaryReferences(payload: Record<string, unknown>): Record<string, unknown> {
  const resolved = { ...payload };
  for (const field of ['orderId', 'tableId'] as const) {
    const value = resolved[field];
    if (typeof value !== 'string') continue;
    const resolution = resolutionForTemporaryId(value);
    if (!resolution) continue;
    const real = field === 'orderId' ? resolution.orderId : resolution.tableId;
    if (real) resolved[field] = real;
  }
  return resolved;
}
