import { Router } from 'express';
import { login, logout, getMe } from '../services/auth.service.js';
import { requireAuth } from '../lib/auth.js';
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
