import { Router } from 'express';
import { login, logout, getMe } from '../services/auth.service.js';
import { requireAuth, requireRoles } from '../lib/auth.js';
import { changeOwnPin } from '../services/user-management.service.js';
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
    res.json({ ...result, deviceId: req.auth!.deviceId });
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
    res.json(await changeOwnPin(req.auth!.user.id, req.auth!.deviceId, currentPin, newPin));
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
