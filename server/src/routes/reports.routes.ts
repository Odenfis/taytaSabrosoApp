import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../lib/auth';
import { getCompanyAnalysis, getReportSummary } from '../services/analytics.service';

const router = Router();
router.use(requireAuth);

router.get('/reports/ratios', async (req, res, next) => {
  try {
    const q = z
      .object({ companyId: z.string().optional().default('all') })
      .parse(req.query);
    res.json(await getCompanyAnalysis(q.companyId));
  } catch (err) {
    next(err);
  }
});

router.get('/reports/summary', async (req, res, next) => {
  try {
    const q = z
      .object({ companyId: z.string().optional().default('all') })
      .parse(req.query);
    res.json(await getReportSummary(q.companyId));
  } catch (err) {
    next(err);
  }
});

export default router;