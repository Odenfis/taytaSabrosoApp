const DEV_SECRET = 'dev-only-secret-cambiar-en-produccion';

export function getJwtSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.JWT_SECRET?.trim() || DEV_SECRET;
  if (env.NODE_ENV === 'production' && (
    secret.length < 32 || /dev-only|cambiar|change.?me|example|placeholder|tu[_-]?secreto/i.test(secret)
  )) {
    throw new Error('JWT_SECRET debe ser un secreto propio de al menos 32 caracteres en producción.');
  }
  return secret;
}

export function getCorsOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const configured = env.CORS_ORIGIN?.trim();
  if (!configured && env.NODE_ENV === 'production') {
    throw new Error('CORS_ORIGIN es obligatorio en producción.');
  }
  const origins = (configured || 'http://localhost:3000,http://127.0.0.1:3000')
    .split(',').map((origin) => origin.trim());
  for (const origin of origins) {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new Error('CORS_ORIGIN debe contener orígenes HTTP(S) explícitos separados por comas.');
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin ||
        url.username || url.password || url.hostname.includes('*')) {
      throw new Error('CORS_ORIGIN debe contener orígenes HTTP(S) sin rutas, credenciales ni comodines.');
    }
  }
  return origins;
}

export function validateConfig(env: NodeJS.ProcessEnv = process.env) {
  if (!env.DATABASE_URL?.trim().startsWith('sqlserver://')) {
    throw new Error('DATABASE_URL debe especificar una conexión SQL Server.');
  }
  getJwtSecret(env);
  getCorsOrigins(env);
  const port = Number(env.PORT || 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT debe ser un puerto entre 1 y 65535.');
  }
  return { port };
}
