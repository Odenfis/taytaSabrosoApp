import type { AuthToken } from '../types';

const API_BASE: string =
  (import.meta.env?.VITE_API_URL as string | undefined) || '/api';

const TOKEN_KEY = 'ts_auth_token';
const EXPIRES_KEY = 'ts_auth_expires';
export const AUTH_REQUIRED_EVENT = 'pos:authentication-required';

export function requireAuthentication(token: string, message: string): void {
  // Una respuesta tardía de la sesión anterior no puede cerrar una sesión nueva.
  if (getAuthToken()?.token !== token) return;
  clearAuthToken();
  window.dispatchEvent(new CustomEvent(AUTH_REQUIRED_EVENT, { detail: { message } }));
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly issues?: Array<{ field: string; message: string }>;

  constructor(message: string, code: string, status: number, issues?: Array<{ field: string; message: string }>) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.issues = issues;
  }

  get isUnauthorized(): boolean {
    return this.code === 'UNAUTHORIZED' || this.status === 401;
  }
}

export function getAuthToken(): AuthToken | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const expiresAt = localStorage.getItem(EXPIRES_KEY);
    if (!token || !expiresAt) return null;
    return { token, expiresAt };
  } catch {
    return null;
  }
}

export function storeAuthToken(auth: AuthToken): void {
  localStorage.setItem(TOKEN_KEY, auth.token);
  localStorage.setItem(EXPIRES_KEY, auth.expiresAt);
}

export function clearAuthToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EXPIRES_KEY);
}

export function isTokenExpired(auth: AuthToken | null): boolean {
  if (!auth || !auth.expiresAt) return false;
  const exp = Date.parse(auth.expiresAt);
  return !Number.isNaN(exp) && exp <= Date.now();
}

/** Prueba de autoría y marcas del replay offline. */
export interface OfflineRequestOptions {
  proof?: { document: string; signature: string };
  /** Marca el envío como replay de la cola; el servidor exige la prueba. */
  replay?: boolean;
  /** Asunción explícita de una operación firmada por otro usuario o terminal. */
  assume?: boolean;
}

function withProof(body: unknown, proof: OfflineRequestOptions['proof']): unknown {
  if (!proof) return body;
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    return { ...(body as Record<string, unknown>), __proof: proof };
  }
  return { __proof: proof };
}

interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    issues?: Array<{ field: string; message: string }>;
  };
}

async function request<T>(path: string, options: RequestInit = {}, offline?: OfflineRequestOptions): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };
  headers['Content-Type'] = 'application/json';
  if (offline?.replay) headers['x-offline-replay'] = '1';
  if (offline?.assume) headers['x-offline-assume'] = '1';

  const auth = path === '/auth/login' ? null : getAuthToken();
  if (auth) {
    if (isTokenExpired(auth)) {
      requireAuthentication(auth.token, 'Su sesión venció. Vuelva a iniciar sesión; las operaciones pendientes se conservan.');
      throw new ApiError(
        'La sesión expiró. Por favor, vuelva a iniciar sesión.',
        'UNAUTHORIZED',
        401
      );
    }
    headers['Authorization'] = `Bearer ${auth.token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch {
    throw new ApiError(
      'Sin conexión con el servidor. Verifique su red o que la API esté activa.',
      'NETWORK_ERROR',
      0
    );
  }

  let body: ApiErrorBody | T | null = null;
  try {
    body = (await res.json()) as ApiErrorBody | T;
  } catch {
    body = null;
  }

  if (!res.ok) {
    const errBody = body as ApiErrorBody | null;
    const code = errBody?.error?.code || 'UNKNOWN_ERROR';
    const message = errBody?.error?.message || `Error inesperado (${res.status})`;
    const issues = errBody?.error?.issues;
    if (res.status === 401 && auth && path !== '/auth/logout') {
      requireAuthentication(auth.token, 'Su sesión ya no es válida. Vuelva a iniciar sesión; las operaciones pendientes se conservan.');
    }
    throw new ApiError(message, code, res.status, issues);
  }

  if (auth && path !== '/auth/logout' && getAuthToken()?.token !== auth.token) {
    throw new ApiError('La respuesta pertenece a una sesión anterior.', 'SESSION_CHANGED', 409);
  }
  return body as T;
}

export const apiClient = {
  get: <T>(path: string, offline?: OfflineRequestOptions): Promise<T> => request<T>(path, {}, offline),
  post: <T>(path: string, body?: unknown, offline?: OfflineRequestOptions): Promise<T> =>
    request<T>(path, {
      method: 'POST',
      body: body === undefined && !offline?.proof ? undefined : JSON.stringify(withProof(body, offline?.proof)),
    }, offline),
  patch: <T>(path: string, body?: unknown, offline?: OfflineRequestOptions): Promise<T> =>
    request<T>(path, {
      method: 'PATCH',
      body: body === undefined && !offline?.proof ? undefined : JSON.stringify(withProof(body, offline?.proof)),
    }, offline),
  del: <T>(path: string, offline?: OfflineRequestOptions): Promise<T> =>
    request<T>(path, {
      method: 'DELETE',
      body: offline?.proof ? JSON.stringify(withProof(undefined, offline.proof)) : undefined,
    }, offline),
};
