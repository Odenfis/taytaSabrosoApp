import { Router } from 'express';
import { login, logout, getMe } from '../services/auth.service.js';
import { hashToken, requireAuth, requireRoles } from '../lib/auth.js';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/utils.js';
import { z } from 'zod';

const router = Router();

router.post('/login', async (req, res, next) => {
  try {
    const { pin, deviceCode, terminalName } = z.object({
      pin: z.string().trim().min(1).max(100),
      deviceCode: z.string().trim().min(1).max(30).optional(),
      terminalName: z.string().trim().min(1).max(100).optional(),
    }).parse(req.body);
    const result = await login({ pin, deviceCode, terminalName });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const result = await getMe(req.auth!.user.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.patch('/pin', requireAuth, requireRoles('Administrador'), async (req, res, next) => {
  try {
    const { currentPin, newPin } = z.object({
      currentPin: z.string().min(1).max(100),
      newPin: z.string().regex(/^\d{6,12}$/, 'El nuevo PIN debe tener entre 6 y 12 dígitos.'),
    }).parse(req.body);
    if (newPin === '1004' || newPin === currentPin) throw new AppError('Elija un PIN nuevo y distinto al inicial.', 400, 'WEAK_PIN');
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.user.id } });
    if (!await bcrypt.compare(currentPin, user.pinHash)) throw new AppError('PIN actual incorrecto.', 403, 'INVALID_CURRENT_PIN');
    const others = await prisma.user.findMany({ where: { isActive: true, isDeleted: false, id: { not: user.id } }, select: { pinHash: true } });
    for (const other of others) {
      if (await bcrypt.compare(newPin, other.pinHash)) throw new AppError('Ese PIN ya pertenece a otro usuario.', 409, 'PIN_IN_USE');
    }
    const tokenHash = hashToken((req.headers.authorization as string).slice('Bearer '.length));
    await prisma.$transaction(async (db) => {
      await db.user.update({ where: { id: user.id }, data: { pinHash: await bcrypt.hash(newPin, 10) } });
      await db.session.deleteMany({ where: { userId: user.id, tokenHash: { not: tokenHash } } });
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    const token = (req.headers.authorization as string).slice('Bearer '.length);
    await logout(req.auth!.user.id, token);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
