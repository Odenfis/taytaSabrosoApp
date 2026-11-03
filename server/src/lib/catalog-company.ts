import type { RequestHandler } from 'express';
import { prisma } from './prisma.js';
import { canAccessCompany } from './permissions.js';
import { AppError } from './utils.js';

/** Restringe cambios por identificador usando la empresa guardada en SQL. */
export const scopeCatalogMutations: RequestHandler = async (req, _res, next) => {
  try {
    if (req.method === 'GET') return next();
    const user = req.auth!.user;
    const ids = [user.companyId, user.assignedCompanyId].filter((id): id is string => Boolean(id));
    if (!ids.length) return next();
    if (new Set(ids).size > 1) throw new AppError('La asignación de empresas es inconsistente.', 403, 'FORBIDDEN');
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    if (body.companyId !== undefined && (typeof body.companyId !== 'string' || !canAccessCompany(user, body.companyId))) throw new AppError('No tiene acceso a esta empresa.', 403, 'FORBIDDEN');
    if (req.path === '/tables/physical') {
      if (!canAccessCompany(user, 'el-tayta')) throw new AppError('No tiene acceso a esta empresa.', 403, 'FORBIDDEN');
      return next();
    }
    const match = req.path.match(/^\/(tables|products|insumos|recipes|bank-accounts|payment-methods|printers)(?:\/([^/]+))?$/);
    if (!match) return next();
    const [, type, encodedId] = match;
    if (!encodedId) {
      if (body.companyId !== ids[0]) throw new AppError('Debe indicar su empresa para crear este recurso.', 403, 'FORBIDDEN');
      return next();
    }
    const id = decodeURIComponent(encodedId);
    const model = { tables: prisma.table, products: prisma.product, insumos: prisma.insumo, recipes: prisma.recipe, 'bank-accounts': prisma.bankAccount, 'payment-methods': prisma.customPaymentMethod, printers: prisma.printer }[type];
    const row = await (model as { findUnique(args: unknown): Promise<{ companyId: string | null } | null> }).findUnique({ where: { id }, select: { companyId: true } });
    if (!row) throw new AppError('Recurso no encontrado.', 404, 'NOT_FOUND');
    if (!row.companyId || !canAccessCompany(user, row.companyId)) throw new AppError('No tiene acceso a este recurso.', 403, 'FORBIDDEN');
    next();
  } catch (error) { next(error); }
};
