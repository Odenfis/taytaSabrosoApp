import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../lib/auth.js';
import { prisma } from '../lib/prisma.js';
import { enforceRoutePermission } from '../lib/route-permissions.js';
import { AppError } from '../lib/utils.js';
import { createHash, createPublicKey, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';

const router = Router();
router.use(requireAuth, enforceRoutePermission('sync'));

const publicKeySchema = z.object({
  // El cliente puede proponer el identificador para poder firmar antes de
  // recuperar la conexión; el registro sigue ligado a la sesión.
  id: z.string().uuid().optional(),
  kty: z.literal('EC'), crv: z.literal('P-256'),
  x: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  y: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
}).strict();

// Never return public/private key material or session credentials in this list.
router.get('/signing-keys', async (req, res, next) => {
  try {
    const { user } = req.auth!;
    if (user.companyId || user.assignedCompanyId) throw new AppError('Se requiere administración global.', 403, 'FORBIDDEN');
    const keys = await prisma.offlineSigningKey.findMany({
      select: { id: true, userId: true, deviceId: true, createdAt: true, revokedAt: true, revokedBy: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(keys);
  } catch (err) { next(err); }
});

// El usuario y la terminal siempre provienen de la sesión, nunca del cuerpo.
router.post('/signing-keys', async (req, res, next) => {
  try {
    const input = publicKeySchema.parse(req.body);
    let normalized: { kty?: string; crv?: string; x?: string; y?: string };
    try { normalized = createPublicKey({ key: input, format: 'jwk' }).export({ format: 'jwk' }); }
    catch { throw new AppError('La clave pública no es válida.', 400, 'INVALID_SIGNING_KEY'); }
    const publicKey = JSON.stringify({ kty: normalized.kty, crv: normalized.crv, x: normalized.x, y: normalized.y });
    const fingerprint = createHash('sha256').update(publicKey).digest('hex');
    const { user, deviceId } = req.auth!;
    const owned = (key: { fingerprint: string; userId: string; deviceId: string; revokedAt: Date | null }) =>
      key.fingerprint === fingerprint && key.userId === user.id && key.deviceId === deviceId && !key.revokedAt;
    const byId = input.id ? await prisma.offlineSigningKey.findUnique({ where: { id: input.id } }) : null;
    if (byId) {
      if (!owned(byId)) throw new AppError('Esta clave no está disponible para la sesión.', 409, 'SIGNING_KEY_UNAVAILABLE');
      return res.json({ id: byId.id });
    }
    const existing = await prisma.offlineSigningKey.findUnique({ where: { fingerprint } });
    if (existing) {
      if (!owned(existing)) throw new AppError('Esta clave no está disponible para la sesión.', 409, 'SIGNING_KEY_UNAVAILABLE');
      return res.json({ id: existing.id });
    }
    try {
      const key = await prisma.offlineSigningKey.create({ data: { id: input.id ?? randomUUID(), userId: user.id, deviceId, fingerprint, publicKey } });
      res.status(201).json({ id: key.id });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      // Otro registro concurrente pudo ganar la inserción. Nunca reutilizar
      // una clave registrada por otro usuario o terminal.
      const raced = input.id
        ? await prisma.offlineSigningKey.findUnique({ where: { id: input.id } })
        : null;
      if (raced && owned(raced)) return res.json({ id: raced.id });
      const byFingerprint = await prisma.offlineSigningKey.findUnique({ where: { fingerprint } });
      if (!byFingerprint || !owned(byFingerprint)) throw new AppError('Esta clave no está disponible para la sesión.', 409, 'SIGNING_KEY_UNAVAILABLE');
      res.json({ id: byFingerprint.id });
    }
  } catch (err) { next(err); }
});

router.delete('/signing-keys/:id', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const { user, deviceId } = req.auth!;
    const key = await prisma.offlineSigningKey.findUnique({ where: { id } });
    const globalAdmin = user.role === 'Administrador' && !user.companyId && !user.assignedCompanyId;
    if (!key || (!globalAdmin && (key.userId !== user.id || key.deviceId !== deviceId))) throw new AppError('Clave no encontrada.', 404, 'NOT_FOUND');
    await prisma.$transaction(async tx => {
      const result = await tx.offlineSigningKey.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date(), revokedBy: user.id } });
      if (result.count) {
        const subject = await tx.user.findUniqueOrThrow({ where: { id: key.userId } });
        await tx.userAccessAudit.create({ data: { id: randomUUID(), actorUserId: user.id,
          subjectUserId: key.userId, deviceId, action: 'revocar_clave_offline', newActive: subject.isActive } });
      }
    });
    res.json({ revoked: true });
  } catch (err) { next(err); }
});

// Bitácora de operaciones del cliente (operaciones_cliente) para diagnóstico y futura Fase C.
router.get('/client-ops', async (req, res, next) => {
  try {
    if (req.auth!.user.companyId || req.auth!.user.assignedCompanyId) throw new AppError('La revisión de sincronización requiere acceso global.', 403, 'FORBIDDEN');
    const q = z
      .object({
        companyId: z.string().min(1).optional(),
        deviceId: z.string().min(1).optional(),
        entity: z.string().min(1).optional(),
        operation: z.string().min(1).optional(),
        status: z.enum(['PENDIENTE', 'EN_VUELO', 'APLICADO', 'FALLO_REINTENTABLE', 'FALLO_TERMINAL']).optional(),
        since: z.coerce.date().optional(),
        limit: z.coerce.number().int().positive().max(500).default(100),
        offset: z.coerce.number().int().nonnegative().default(0),
      })
      .parse(req.query);

    const where = {
      companyId: q.companyId,
      deviceId: q.deviceId,
      entity: q.entity,
      operation: q.operation,
      status: q.status,
      ...(q.since ? { createdAt: { gte: q.since } } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.clientOp.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: q.limit,
        skip: q.offset,
      }),
      prisma.clientOp.count({ where }),
    ]);

    res.json({ items, total });
  } catch (err) {
    next(err);
  }
});

export default router;
