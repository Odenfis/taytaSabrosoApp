import { Router } from 'express';
import { login, logout, getMe } from '../services/auth.service';
import { requireAuth } from '../lib/auth';

const router = Router();

router.post('/login', async (req, res, next) => {
  try {
    const { pin, deviceCode, terminalName } = req.body ?? {};
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