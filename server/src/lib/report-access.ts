import { AppError } from './utils.js';
import { canAccessCompany } from './permissions.js';

/** Los informes agregados solo pueden abarcar empresas autorizadas por la sesión. */
export function reportCompany(user: { companyId: string | null; assignedCompanyId: string | null }, requested: string): string {
  const restrictions = [user.companyId, user.assignedCompanyId].filter((id): id is string => Boolean(id));
  if (new Set(restrictions).size > 1) throw new AppError('La asignación de empresas de su usuario es inconsistente.', 403, 'FORBIDDEN');
  if (requested === 'all') return restrictions[0] ?? 'all';
  if (!canAccessCompany(user, requested)) throw new AppError('No tiene acceso a esta empresa.', 403, 'FORBIDDEN');
  return requested;
}
