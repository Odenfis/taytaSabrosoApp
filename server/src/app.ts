import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import routes from './routes';
import { errorHandler, notFound } from './lib/utils';

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const indexHtmlPath = path.join(publicDir, 'index.html');

export function createApp() {
  const app = express();

  app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') ?? true }));
  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'tayta-sabroso-api', time: new Date().toISOString() });
  });

  const apiIndex = {
    ok: true,
    service: 'tayta-sabroso-api',
    version: '0.1.0',
    endpoints: {
      health: '/health',
      auth: ['POST /api/auth/login', 'GET /api/auth/me', 'POST /api/auth/logout'],
      catalogs: ['/api/catalogs/companies', '/api/catalogs/tables', '/api/catalogs/products', '/api/catalogs/insumos', '/api/catalogs/recipes', '/api/catalogs/bank-accounts', '/api/catalogs/payment-methods', '/api/catalogs/printers'],
      operations: ['/api/operations/orders/active', '/api/operations/orders/open', '/api/operations/purchases', '/api/operations/kardex', '/api/operations/shifts/records', '/api/operations/transactions'],
      reports: ['/api/reports/ratios', '/api/reports/summary'],
    },
    time: new Date().toISOString(),
  };

  app.get('/', (req, res) => {
    const wantsHtml = (req.headers.accept ?? '').includes('text/html');
    if (wantsHtml) {
      res.sendFile(indexHtmlPath);
    } else {
      res.json(apiIndex);
    }
  });

  app.get('/api', (_req, res) => {
    res.json(apiIndex);
  });

  app.use('/api', routes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}