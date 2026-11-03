import {
  canonicalJson,
  isTemporaryOrderId,
  isTemporaryTableId,
  offlineActionById,
  offlineBindingsForOp,
  offlineSourceValue,
  ORDER_REF,
  TABLE_REF,
  type OfflineAction,
  type OfflineActionVariant,
  type OfflineRefKind,
} from '../../server/src/lib/offline-actions';
import { resolutionForRealId, resolutionForTemporaryId } from './offlineResolution';
import type { PendingOp } from '../types';

/** Secciones lógicas que se firman y que el servidor recalcula. */
export type OfflineSections = {
  body: Record<string, unknown>;
  params: Record<string, unknown>;
  query: Record<string, string>;
};

export type OfflineRequestPlan = {
  action: OfflineAction;
  variant: OfflineActionVariant;
  variantIndex: number;
  method: 'POST' | 'PATCH' | 'DELETE';
  /** Ruta concreta (parámetros ya resueltos), relativa al grupo. */
  path: string;
  /** Cuerpo que se envía (sin la prueba). */
  body: Record<string, unknown>;
  /** Query que se envía. */
  query: Record<string, string>;
  /** Secciones lógicas firmadas (con marcadores de referencia). */
  signed: OfflineSections;
  /** true si alguna referencia temporal no se pudo resolver. */
  unresolved: boolean;
};

function isTemporary(value: unknown): boolean {
  return isTemporaryOrderId(value) || isTemporaryTableId(value);
}

/** Marcador de referencia para un identificador temporal. Si la apertura no se
 * conoce todavía, el valor se conserva y la operación no se puede enviar.
 * Cuando el payload ya trae el identificador real, se sigue usando el
 * marcador lógico: el contenido firmado no cambia al sustituir el id. */
function referenceMarker(kind: OfflineRefKind, value: unknown): { marker: unknown; unresolved: boolean } {
  const build = (openingClientOpId: string) => (kind === 'order'
    ? { [ORDER_REF]: { openingClientOpId } }
    : { [TABLE_REF]: { openingClientOpId } });
  if (!isTemporary(value)) {
    const known = resolutionForRealId(value, kind);
    return known
      ? { marker: build(known.openingClientOpId), unresolved: false }
      : { marker: value, unresolved: false };
  }
  const resolution = resolutionForTemporaryId(value);
  if (!resolution) return { marker: value, unresolved: true };
  return { marker: build(resolution.openingClientOpId), unresolved: false };
}

/** Identificador concreto que se envía: el real si la apertura ya se aplicó. */
function concreteReference(value: unknown): { value: unknown; unresolved: boolean } {
  if (!isTemporary(value)) return { value, unresolved: false };
  const resolution = resolutionForTemporaryId(value);
  if (!resolution) return { value, unresolved: true };
  const real = isTemporaryOrderId(value) ? resolution.orderId : resolution.tableId;
  if (!real) return { value, unresolved: true };
  return { value: real, unresolved: false };
}

function buildSections(
  op: PendingOp,
  payload: Record<string, unknown>,
  variant: OfflineActionVariant,
  options: { markers: boolean; exclude: boolean },
): { sections: OfflineSections; unresolved: boolean } {
  const body: Record<string, unknown> = {};
  for (const [key, source] of Object.entries(variant.body ?? {})) {
    const value = offlineSourceValue(source, op, payload);
    if (value === undefined) continue;
    body[key] = value;
  }
  const params: Record<string, unknown> = {};
  for (const [key, source] of Object.entries(variant.params ?? {})) {
    const value = offlineSourceValue(source, op, payload);
    if (value === undefined) continue;
    params[key] = value;
  }
  const query: Record<string, string> = {};
  for (const [key, source] of Object.entries(variant.query ?? {})) {
    const value = offlineSourceValue(source, op, payload);
    if (value === undefined) continue;
    query[key] = String(value);
  }

  let unresolved = false;
  for (const [field, kind] of Object.entries(variant.refs ?? {})) {
    const [section, key] = field.split('.') as ['body' | 'params' | 'query', string];
    const target = section === 'body' ? body : section === 'params' ? params : query;
    if (!(key in target)) continue;
    if (options.markers) {
      const result = referenceMarker(kind, target[key]);
      if (result.unresolved) unresolved = true;
      target[key] = result.marker;
    } else {
      const result = concreteReference(target[key]);
      if (result.unresolved) unresolved = true;
      target[key] = result.value;
    }
  }

  if (options.exclude) {
    for (const key of variant.exclude ?? []) delete body[key];
  }
  return { sections: { body, params, query }, unresolved };
}

function concretePath(variant: OfflineActionVariant, params: Record<string, unknown>): string {
  return variant.path
    .split('/')
    .map((segment) => (segment.startsWith(':') ? encodeURIComponent(String(params[segment.slice(1)] ?? '')) : segment))
    .join('/');
}

/** Planes de envío derivados del contrato para una operación de la cola. */
export function offlinePlansForOp(op: PendingOp, payload: Record<string, unknown>): OfflineRequestPlan[] {
  const plans: OfflineRequestPlan[] = [];
  for (const binding of offlineBindingsForOp(op)) {
    const action = offlineActionById(binding.actionId);
    if (!action) continue;
    const indexes = binding.variants ?? action.variants.map((_, index) => index);
    for (const index of indexes) {
      const variant = action.variants[index];
      if (!variant) continue;
      const request = buildSections(op, payload, variant, { markers: false, exclude: false });
      const signed = buildSections(op, payload, variant, { markers: true, exclude: true });
      plans.push({
        action,
        variant,
        variantIndex: index,
        method: variant.method,
        path: concretePath(variant, request.sections.params),
        body: request.sections.body,
        query: request.sections.query,
        signed: signed.sections,
        unresolved: request.unresolved || signed.unresolved,
      });
    }
  }
  return plans;
}

/** Acción principal de la operación: la que ejecuta el replay. */
export function offlinePrimaryActionId(op: PendingOp): string | undefined {
  return offlineBindingsForOp(op)[0]?.actionId;
}

/** Plan de una acción concreta (usado, por ejemplo, por el vaciado de ítems
 * de la apertura, que viaja con su propia prueba). */
export function offlinePlanForAction(
  op: PendingOp, payload: Record<string, unknown>, actionId: string,
): OfflineRequestPlan | undefined {
  return offlinePlansForOp(op, payload).find((plan) => plan.action.id === actionId);
}

/** Ruta completa del API a partir del plan. */
export function offlineApiPath(plan: OfflineRequestPlan): string {
  const prefix = plan.action.group === 'operations' ? '/operations' : '/catalogs';
  const query = Object.entries(plan.query)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  return `${prefix}${plan.path}${query ? `?${query}` : ''}`;
}

/** Huella del contenido lógico firmado: cambia cuando cambia la acción, la
 * ruta o cualquier valor firmado; no cambia cuando solo se sustituye un
 * identificador temporal por su equivalente real. */
export function offlineLogicalFingerprint(op: PendingOp): string {
  const payload = (op.payload ?? {}) as Record<string, unknown>;
  const plans = offlinePlansForOp(op, payload);
  return canonicalJson(plans.map((plan) => ({
    action: plan.action.id,
    variant: plan.variantIndex,
    body: plan.signed.body,
    params: plan.signed.params,
    query: plan.signed.query,
  })));
}
