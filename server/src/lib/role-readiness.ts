import { POS_ROLES } from './permissions.js';

type ReviewUser = {
  role: string; companyId: string | null; assignedCompanyId: string | null;
  isActive: boolean; isDeleted: boolean;
};
/** Solo evalúa acceso. No transforma perfiles antiguos ni modifica usuarios. */
export function reviewRoleReadiness<T extends ReviewUser>(users: T[], companyIds: string[]) {
  const roles = new Set<string>(POS_ROLES);
  const companies = new Set(companyIds);
  const items = users.map(u => ({ ...u,
    needsRoleReview: !roles.has(u.role),
    companyConflict: !!u.companyId && !!u.assignedCompanyId && u.companyId !== u.assignedCompanyId,
    companyMissing: [u.companyId, u.assignedCompanyId].some(id => !!id && !companies.has(id)),
  }));
  const active = items.filter(u => u.isActive && !u.isDeleted);
  const activeAdministrators = active.filter(u => u.role === 'Administrador').length;
  const activeGlobalAdministrators = active.filter(u => u.role === 'Administrador' && !u.companyId && !u.assignedCompanyId).length;
  return {
    totalUsers: items.length, activeAdministrators, activeGlobalAdministrators,
    activeUsersRequiringRoleReview: active.filter(u => u.needsRoleReview).length,
    activeUsersWithCompanyConflict: active.filter(u => u.companyConflict).length,
    activeUsersWithMissingCompany: active.filter(u => u.companyMissing).length,
    readyForReview: activeGlobalAdministrators > 0,
    readyForActivation: activeGlobalAdministrators > 0 && active.every(u => !u.needsRoleReview && !u.companyConflict && !u.companyMissing),
    users: items,
  };
}
