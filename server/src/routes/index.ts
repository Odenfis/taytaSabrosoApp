import { Router } from 'express';
import authRoutes from './auth.routes.js';
import catalogsRoutes from './catalogs.routes.js';
import operationsRoutes from './operations.routes.js';
import reportsRoutes from './reports.routes.js';
import syncRoutes from './sync.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/catalogs', catalogsRoutes);
router.use('/operations', operationsRoutes);
router.use('/sync', syncRoutes);
router.use(reportsRoutes);

export default router;