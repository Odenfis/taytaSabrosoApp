import type { User } from '../types';

// deviceId is the server-generated UUID, never the browser's terminal code.
// A new database registration, user or access revision gets a distinct namespace.
export function sessionCacheScope(user: User, deviceId: string | null, companyIds: string[]): string | null {
  if (!deviceId) return null;
  return JSON.stringify([deviceId, user.id, user.role, user.version ?? 0,
    user.companyId ?? null, user.assignedCompanyId ?? null, [...companyIds].sort()]);
}
export function readSessionCache<T>(scope: string | null, key: string, fallback: T): T {
  if (!scope) return fallback;
  try {
    const raw = localStorage.getItem(`ts_scoped_v1:${scope}:${key}`);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (Array.isArray(fallback) && !Array.isArray(parsed)) return fallback;
    return parsed ?? fallback;
  } catch { return fallback; }
}
export function writeSessionCache(scope: string | null, key: string, value: unknown): void {
  if (!scope) return;
  try { localStorage.setItem(`ts_scoped_v1:${scope}:${key}`, JSON.stringify(value)); }
  catch { /* Cache is disposable; pending operations have their own strict storage. */ }
}
