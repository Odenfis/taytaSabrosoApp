import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requirePermission } from '../lib/auth.js';
import { POS_ROLES } from '../lib/permissions.js';
import { createManagedUser, listManagedUsers, setUserArchived, updateManagedUser } from '../services/user-management.service.js';

const router = Router();
router.use(requireAuth, requirePermission('users.manage'));
const fields = { name: z.string().trim().min(1).max(120), role: z.enum(POS_ROLES), companyId: z.string().min(1).max(36).nullable(), isActive: z.boolean() };
router.get('/', async (req, res, next) => { try { res.json(await listManagedUsers(req.auth!.user.id, z.enum(['true', 'false']).optional().parse(req.query.archived) === 'true')); } catch (e) { next(e); } });
router.post('/', async (req, res, next) => {
  try { const body = z.object({ ...fields, pin: z.string().regex(/^\d{6,12}$/) }).strict().parse(req.body); res.status(201).json(await createManagedUser(req.auth!.user.id, req.auth!.deviceId, { ...body, companyId: body.companyId ?? null })); } catch (e) { next(e); }
});
router.patch('/:id', async (req, res, next) => {
  try { const { id } = z.object({ id: z.string().min(1).max(36) }).parse(req.params); const body = z.object({ ...fields, pin: z.string().regex(/^\d{6,12}$/).optional(), expectedVersion: z.number().int().positive() }).strict().parse(req.body); const { expectedVersion, ...input } = body; res.json(await updateManagedUser(req.auth!.user.id, req.auth!.deviceId, id, expectedVersion, { ...input, companyId: input.companyId ?? null })); } catch (e) { next(e); }
});
router.post('/:id/archive', async (req, res, next) => {
  try { const { id } = z.object({ id: z.string().min(1).max(36) }).parse(req.params); const { expectedVersion } = z.object({ expectedVersion: z.number().int().positive() }).strict().parse(req.body); res.json(await setUserArchived(req.auth!.user.id, req.auth!.deviceId, id, expectedVersion, true)); } catch (e) { next(e); }
});
router.post('/:id/restore', async (req, res, next) => {
  try { const { id } = z.object({ id: z.string().min(1).max(36) }).parse(req.params); const { expectedVersion, pin } = z.object({ expectedVersion: z.number().int().positive(), pin: z.string().regex(/^\d{6,12}$/) }).strict().parse(req.body); res.json(await setUserArchived(req.auth!.user.id, req.auth!.deviceId, id, expectedVersion, false, pin)); } catch (e) { next(e); }
});
export default router;
