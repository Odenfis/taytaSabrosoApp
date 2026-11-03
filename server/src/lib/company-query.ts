import type { RequestHandler } from 'express';
import { canAccessCompany } from './permissions.js';
import { AppError } from './utils.js';

/** Acota consultas de colecciones que aceptan companyId, aun si se omite. */
export function scopeCompanyQueries(paths: readonly string[]): RequestHandler {
  return (req, _res, next) => {
    if (req.method !== 'GET' || !paths.includes(req.path)) return next();
    const user = req.auth!.user;
    const ids = [user.companyId, user.assignedCompanyId].filter((id): id is string => Boolean(id));
    if (new Set(ids).size > 1) return next(new AppError('La asignación de empresas es inconsistente.', 403, 'FORBIDDEN'));
    const requested = req.query.companyId;
    if (typeof requested === 'string' && ids[0] && !canAccessCompany(user, requested)) return next(new AppError('No tiene acceso a esta empresa.', 403, 'FORBIDDEN'));
    if (ids[0] && requested === undefined) Object.defineProperty(req, 'query', { configurable: true, value: { ...req.query, companyId: ids[0] } });
    next();
  };
}
