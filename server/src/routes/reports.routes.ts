import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requirePermission } from '../lib/auth.js';
import { getCompanyAnalysis, getReportSummary } from '../services/analytics.service.js';
import { reportCompany } from '../lib/report-access.js';

const router = Router();
router.use('/reports', requireAuth, requirePermission('reports.financial'));

router.get('/reports/ratios', async (req, res, next) => {
  try {
    const q = z
      .object({ companyId: z.string().optional().default('all') })
      .parse(req.query);
    const user = req.auth!.user;
    res.json(await getCompanyAnalysis(reportCompany(user, q.companyId), !!(user.companyId || user.assignedCompanyId)));
  } catch (err) {
    next(err);
  }
});

router.get('/reports/summary', async (req, res, next) => {
  try {
    const q = z
      .object({ companyId: z.string().optional().default('all') })
      .parse(req.query);
    const user = req.auth!.user;
    res.json(await getReportSummary(reportCompany(user, q.companyId), !user.companyId && !user.assignedCompanyId));
  } catch (err) {
    next(err);
  }
});

export default router;
