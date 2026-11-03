import { z } from 'zod';
import type { RequestHandler } from 'express';
import type { User } from '@prisma/client';
import { prisma } from './prisma.js';
import { verifyOfflineProofForAuthor } from './offline-proof.js';
import { AppError } from './utils.js';
import {
  canonicalJson,
  offlineActionForRequest,
  ORDER_REF,
  TABLE_REF,
  type OfflineActionVariant,
  type OfflineRefKind,
  type OfflineRouteGroup,
} from './offline-actions.js';

/** Prueba verificada de una operación que se sincroniza desde la cola local. */
export type VerifiedOfflineProof = {
  clientOpId: string;
  authorId: string;
  companyId: string;
  deviceId: string;
  /** Acción lógica autorizada por la firma. */
  action: string;
  method: string;
  path: string;
  document: string;
  signature: string;
  /** true cuando la sesión que ejecuta no es el autor y asume la operación. */
  assumed: boolean;
};

export function isGlobalAdministrator(user: Pick<User, 'role' | 'companyId' | 'assignedCompanyId'>): boolean {
  return user.role === 'Administrador' && !user.companyId && !user.assignedCompanyId;
}

const proofSchema = z.object({
  document: z.string().min(1).max(200_000),
  signature: z.string().min(1).max(200),
}).strict();

type Section = 'body' | 'params' | 'query';

function omitKeys(body: Record<string, unknown>, exclude?: string[]): Record<string, unknown> {
  if (!exclude?.length) return body;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) if (!exclude.includes(key)) result[key] = value;
  return result;
}

/** Resuelve una referencia firmada contra los registros del servidor: la
 * apertura identificada por su clientOpId es la única fuente de verdad.
 * El marcador firmado es `{ orderRef: { openingClientOpId } }` o
 * `{ tableRef: { openingClientOpId } }`; un valor plano se acepta como id. */
async function resolveReference(kind: OfflineRefKind, marker: unknown, companyId: string): Promise<string> {
  if (typeof marker === 'string') return marker;
  const wrapper = (marker ?? {}) as Record<string, unknown>;
  const inner = (kind === 'order' ? wrapper[ORDER_REF] : wrapper[TABLE_REF]) as { openingClientOpId?: unknown } | undefined;
  const openingClientOpId = inner?.openingClientOpId;
  if (typeof openingClientOpId !== 'string' || !openingClientOpId) {
    throw new AppError('La referencia firmada no es válida.', 403, 'OFFLINE_PROOF_INVALID');
  }
  const order = await prisma.order.findUnique({ where: { clientOpId: openingClientOpId } });
  if (!order || order.companyId !== companyId) {
    throw new AppError('No se pudo resolver la referencia firmada.', 403, 'OFFLINE_PROOF_REF_UNRESOLVED');
  }
  if (kind === 'order') return order.id;
  if (!order.tableId) throw new AppError('No se pudo resolver la mesa firmada.', 403, 'OFFLINE_PROOF_REF_UNRESOLVED');
  return order.tableId;
}

/** Comprueba que la ruta solicitada sea una escritura conocida por el contrato
 * y que la acción firmada sea la que corresponde a esa ruta. Devuelve el error
 * que debe rechazarse, o `null` cuando la prueba sirve para esta petición. */
export function offlineRouteError(
  group: OfflineRouteGroup,
  method: string,
  path: string,
  envelope: { action: string; method: string; path: string },
): AppError | null {
  const match = offlineActionForRequest(group, method, path);
  if (!match) {
    return new AppError('Esta ruta no admite operaciones firmadas.', 403, 'OFFLINE_PROOF_UNEXPECTED');
  }
  if (envelope.action !== match.action.id
    || envelope.method !== match.variant.method
    || envelope.path !== match.variant.path) {
    return new AppError('La prueba no corresponde a esta operación.', 403, 'OFFLINE_PROOF_ACTION_MISMATCH');
  }
  return null;
}

/** Verifica la firma de una operación offline antes de que la ruta la ejecute.
 * La prueba viaja en el cuerpo (`__proof`) y se retira antes de la validación
 * del endpoint para no alterar los esquemas estrictos. Sin firma, una petición
 * marcada como replay se rechaza: la cola nunca se ejecuta sin autoría.
 *
 * La firma además queda atada a la escritura: la acción, la ruta, el cuerpo,
 * los parámetros y la query firmados deben coincidir con lo recibido. */
export const verifyOfflineAuthorship = (group: OfflineRouteGroup): RequestHandler => async (req, _res, next) => {
  try {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
      ? req.body as Record<string, unknown>
      : undefined;
    const raw = body && Object.hasOwn(body, '__proof') ? body.__proof : undefined;
    if (body) delete body.__proof;

    const replay = req.get('x-offline-replay') === '1';
    if (raw === undefined) {
      if (replay) throw new AppError('La operación pendiente no tiene una prueba de autoría válida.', 403, 'OFFLINE_PROOF_REQUIRED');
      return next();
    }

    const proof = proofSchema.safeParse(raw);
    if (!proof.success) throw new AppError('Prueba de autoría inválida.', 403, 'OFFLINE_PROOF_INVALID');
    const { user, deviceId } = req.auth!;
    const assume = req.get('x-offline-assume') === '1';
    if (assume && !isGlobalAdministrator(user)) throw new AppError('Solo un administrador global puede asumir operaciones.', 403, 'OFFLINE_PROOF_SESSION_MISMATCH');
    const envelope = await verifyOfflineProofForAuthor(prisma, proof.data.document, proof.data.signature, {
      // La asunción administrativa permite resolver pendientes de usuarios o
      // terminales ya desactivados; la clave, empresa y firma siguen vigentes.
      allowInactiveIdentity: assume,
    });

    const routeError = offlineRouteError(group, req.method, req.path, envelope);
    if (routeError) throw routeError;
    const match = offlineActionForRequest(group, req.method, req.path)!;

    const variant: OfflineActionVariant = match.variant;
    const expected: Record<Section, Record<string, unknown>> = {
      body: omitKeys({ ...envelope.body }, variant.exclude),
      params: { ...envelope.params },
      query: { ...envelope.query },
    };
    for (const [field, kind] of Object.entries(variant.refs ?? {})) {
      const [section, key] = field.split('.') as [Section, string];
      const marker = expected[section]?.[key];
      if (kind === 'order' && marker && typeof marker === 'object' && !(ORDER_REF in (marker as object))) {
        throw new AppError('La referencia firmada no es válida.', 403, 'OFFLINE_PROOF_INVALID');
      }
      if (kind === 'table' && marker && typeof marker === 'object' && !(TABLE_REF in (marker as object))) {
        throw new AppError('La referencia firmada no es válida.', 403, 'OFFLINE_PROOF_INVALID');
      }
      expected[section][key] = await resolveReference(kind, marker, envelope.companyId);
    }

    const received: Record<Section, Record<string, unknown>> = {
      body: omitKeys(body ?? {}, variant.exclude),
      params: variant.params
        ? Object.fromEntries(Object.keys(variant.params).map((key) => [key, match.params[key]]))
        : {},
      query: variant.query
        ? Object.fromEntries(Object.keys(variant.query).map((key) => {
          const value = (req.query as Record<string, unknown>)[key];
          return [key, Array.isArray(value) ? value[0] : value];
        }))
        : {},
    };

    for (const section of ['body', 'params', 'query'] as Section[]) {
      if (canonicalJson(expected[section]) !== canonicalJson(received[section])) {
        throw new AppError('La prueba no corresponde al contenido enviado.', 403, 'OFFLINE_PROOF_MISMATCH');
      }
    }

    const requestClientOpId = typeof body?.clientOpId === 'string'
      ? body.clientOpId
      : typeof (req.query as Record<string, unknown>).clientOpId === 'string' ? (req.query as Record<string, unknown>).clientOpId as string : undefined;
    if (requestClientOpId && requestClientOpId !== envelope.clientOpId) {
      throw new AppError('La prueba no corresponde a la operación enviada.', 403, 'OFFLINE_PROOF_MISMATCH');
    }

    let assumed = false;
    if (envelope.authorId !== user.id) {
      if (!assume || !isGlobalAdministrator(user)) {
        throw new AppError('La firma no corresponde a la sesión autenticada.', 403, 'OFFLINE_PROOF_SESSION_MISMATCH');
      }
      assumed = true;
    } else if (envelope.deviceId !== deviceId) {
      // Mismo usuario en otra terminal: solo un administrador global puede
      // asumirla, y la asunción queda auditada.
      if (!assume || !isGlobalAdministrator(user)) {
        throw new AppError('La firma no corresponde a esta terminal.', 403, 'OFFLINE_PROOF_SESSION_MISMATCH');
      }
      assumed = true;
    }

    req.offline = {
      clientOpId: envelope.clientOpId,
      authorId: envelope.authorId,
      companyId: envelope.companyId,
      deviceId: envelope.deviceId,
      action: envelope.action,
      method: envelope.method,
      path: envelope.path,
      document: proof.data.document,
      signature: proof.data.signature,
      assumed,
    };
    next();
  } catch (err) {
    next(err);
  }
};
