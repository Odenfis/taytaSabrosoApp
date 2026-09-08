import { Router } from 'express';
import authRoutes from './auth.routes';
import catalogsRoutes from './catalogs.routes';
import operationsRoutes from './operations.routes';
import reportsRoutes from './reports.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/catalogs', catalogsRoutes);
router.use('/operations', operationsRoutes);
router.use(reportsRoutes);

export default router;