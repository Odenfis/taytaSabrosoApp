import { createHash, createPublicKey, verify, type JsonWebKey } from 'node:crypto';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { AppError } from './utils.js';
import { canAccessCompany } from './permissions.js';

// La firma cubre los bytes exactos de este documento, no una reconstrucción del
// objeto: cambiar un campo, incluido el payload, invalida la firma.
const envelopeSchema = z.object({
  version: z.literal(2),
  keyId: z.string().uuid(),
  authorId: z.string().min(1).max(100),
  deviceId: z.string().min(1).max(100),
  companyId: z.string().min(1).max(100),
  /** Acción lógica (contrato compartido) que autoriza la escritura. */
  action: z.string().min(1).max(100),
  method: z.enum(['POST', 'PATCH', 'DELETE']),
  /** Plantilla de ruta que se firmaba ('/orders/:id/items'). */
  path: z.string().min(1).max(200),
  clientOpId: z.string().uuid(),
  /** Cuerpo lógico firmado; las referencias temporales van como marcador. */
  body: z.record(z.string(), z.unknown()),
  params: z.record(z.string(), z.unknown()),
  query: z.record(z.string(), z.unknown()),
}).strict();

export type OfflineEnvelope = z.infer<typeof envelopeSchema>;

type VerificationDatabase = Pick<Prisma.TransactionClient, 'offlineSigningKey' | 'user' | 'device'>;

/** Verifica la firma contra la clave registrada y la identidad firmada. No
 * autoriza por sí sola la mutación: el ejecutor debe comprobar que la sesión
 * corresponde al autor o que un administrador global asume la operación, y
 * vincularla a la escritura y su recibo. */
export async function verifyOfflineProofForAuthor(
  db: VerificationDatabase,
  document: string,
  signature: string,
  options: { allowInactiveIdentity?: boolean } = {},
): Promise<OfflineEnvelope> {
  if (Buffer.byteLength(document, 'utf8') > 200_000) throw new AppError('Prueba de autoría inválida.', 403, 'OFFLINE_PROOF_INVALID');
  let keyId: string;
  try { keyId = z.string().uuid().parse(JSON.parse(document)?.keyId); }
  catch { throw new AppError('Prueba de autoría inválida.', 403, 'OFFLINE_PROOF_INVALID'); }
  const key = await db.offlineSigningKey.findUnique({ where: { id: keyId } });
  if (!key || key.revokedAt) throw new AppError('La clave no corresponde a esta sesión o fue revocada.', 403, 'OFFLINE_KEY_UNAVAILABLE');
  let jwk: unknown;
  try { jwk = JSON.parse(key.publicKey); }
  catch { throw new AppError('El registro de la clave está dañado.', 500, 'OFFLINE_KEY_CORRUPT'); }
  const publicKey = z.object({ kty: z.literal('EC'), crv: z.literal('P-256'), x: z.string(), y: z.string() }).strict().safeParse(jwk);
  if (!publicKey.success) throw new AppError('El registro de la clave está dañado.', 500, 'OFFLINE_KEY_CORRUPT');
  const envelope = verifyOfflineProof(document, signature, publicKey.data);
  if (!envelope || envelope.authorId !== key.userId || envelope.deviceId !== key.deviceId) {
    throw new AppError('La firma o su identidad no son válidas.', 403, 'OFFLINE_PROOF_INVALID');
  }
  const [user, device] = await Promise.all([
    db.user.findUnique({ where: { id: key.userId } }),
    db.device.findUnique({ where: { id: key.deviceId } }),
  ]);
  const active = !!user && (options.allowInactiveIdentity || (!user.isDeleted && user.isActive));
  const deviceActive = !!device && (options.allowInactiveIdentity || device.isActive);
  if (!user || !active || !device || !deviceActive || (!options.allowInactiveIdentity && (!canAccessCompany(user, envelope.companyId) || (device.companyId && device.companyId !== envelope.companyId)))) {
    throw new AppError('El usuario o la terminal ya no tienen acceso a la empresa.', 403, 'OFFLINE_ACCESS_REVOKED');
  }
  return envelope;
}

/** Variante para el replay normal: la firma debe pertenecer al usuario y a la
 * terminal de la sesión autenticada. */
export async function verifyRegisteredOfflineProof(
  db: VerificationDatabase,
  session: { userId: string; deviceId: string },
  document: string,
  signature: string,
): Promise<OfflineEnvelope> {
  const envelope = await verifyOfflineProofForAuthor(db, document, signature);
  if (envelope.authorId !== session.userId || envelope.deviceId !== session.deviceId) {
    throw new AppError('La firma no corresponde a la sesión.', 403, 'OFFLINE_PROOF_SESSION_MISMATCH');
  }
  return envelope;
}

/** Huella estable para localizar la prueba conservada sin duplicar el documento. */
export function offlineProofFingerprint(document: string): string {
  return createHash('sha256').update(document, 'utf8').digest('hex');
}

/** Comprueba integridad criptográfica; la asociación de clave, usuario y
 * terminal debe comprobarse por separado contra el registro del servidor. */
export function verifyOfflineProof(document: string, signature: string, publicJwk: { kty?: string; crv?: string; x?: string; y?: string; d?: string }): OfflineEnvelope | null {
  if (Buffer.byteLength(document, 'utf8') > 200_000 || !/^[A-Za-z0-9_-]+$/.test(signature)) return null;
  try {
    if (publicJwk.kty !== 'EC' || publicJwk.crv !== 'P-256' || publicJwk.d !== undefined) return null;
    const sig = Buffer.from(signature, 'base64url');
    if (sig.length !== 64 || sig.toString('base64url') !== signature) return null;
    const key = createPublicKey({ key: publicJwk as JsonWebKey, format: 'jwk' });
    if (!verify('sha256', Buffer.from(document, 'utf8'), { key, dsaEncoding: 'ieee-p1363' }, sig)) return null;
    const parsed: unknown = JSON.parse(document);
    const result = envelopeSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
