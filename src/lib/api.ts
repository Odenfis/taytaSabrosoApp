import type { AuthToken } from '../types';

const API_BASE: string =
  (import.meta.env.VITE_API_URL as string | undefined) || '/api';

const TOKEN_KEY = 'ts_auth_token';
const EXPIRES_KEY = 'ts_auth_expires';

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
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

interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
  };
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };
  headers['Content-Type'] = 'application/json';

  const auth = getAuthToken();
  if (auth) {
    if (isTokenExpired(auth)) {
      clearAuthToken();
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
    throw new ApiError(message, code, res.status);
  }

  return body as T;
}

export const apiClient = {
  get: <T>(path: string): Promise<T> => request<T>(path),
  post: <T>(path: string, body?: unknown): Promise<T> =>
    request<T>(path, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  patch: <T>(path: string, body?: unknown): Promise<T> =>
    request<T>(path, {
      method: 'PATCH',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  del: <T>(path: string): Promise<T> =>
    request<T>(path, {
      method: 'DELETE',
    }),
};