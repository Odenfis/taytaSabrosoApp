import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../lib/auth';
import { prisma } from '../lib/prisma';

const router = Router();
router.use(requireAuth);

// Bitácora de operaciones del cliente (operaciones_cliente) para diagnóstico y futura Fase C.
router.get('/client-ops', async (req, res, next) => {
  try {
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
