import jwt from 'jsonwebtoken';
import { createHash, randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { AppError } from './utils.js';
import { prisma } from './prisma.js';
import { getJwtSecret } from './config.js';

const TOKEN_TTL_HOURS = 12;

export interface AccessTokenPayload {
  sub: string; // userId
  deviceId: string;
  role: string;
  name: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, getJwtSecret(), {
    algorithm: 'HS256',
    jwtid: randomUUID(),
    expiresIn: `${TOKEN_TTL_HOURS}h`,
  });
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function verifyAccessToken(token: string): AccessTokenPayload & { exp: number } {
  // La configuración se evalúa fuera del catch: un fallo del servidor no es un 401.
  const secret = getJwtSecret();
  let decoded: string | jwt.JwtPayload;
  try {
    decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
  } catch (err) {
    if (err instanceof jwt.JsonWebTokenError) {
      throw new AppError('Sesión inválida o vencida. Vuelva a iniciar sesión.', 401, 'UNAUTHORIZED');
    }
    throw err;
  }
  if (typeof decoded === 'string' || typeof decoded.sub !== 'string' || !decoded.sub ||
      typeof decoded.deviceId !== 'string' || !decoded.deviceId ||
      typeof decoded.exp !== 'number' || !Number.isFinite(decoded.exp)) {
    throw new AppError('Token de sesión inválido.', 401, 'UNAUTHORIZED');
  }
  return decoded as AccessTokenPayload & { exp: number };
}

// Única fuente de validación para HTTP y Socket.IO. No captura errores de SQL.
export async function authenticateAccessToken(token: string) {
  const payload = verifyAccessToken(token);
  const tokenHash = hashToken(token);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: true, device: true },
  });
  const expiresAt = Math.min(payload.exp * 1000, session?.expiresAt.getTime() ?? 0);
  if (!session || session.userId !== payload.sub || session.deviceId !== payload.deviceId ||
      expiresAt <= Date.now() || !session.user.isActive || session.user.isDeleted ||
      !session.device.isActive) {
    throw new AppError('Sesión inválida o vencida. Vuelva a iniciar sesión.', 401, 'UNAUTHORIZED');
  }
  return { user: session.user, deviceId: session.deviceId, tokenHash, expiresAt };
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new AppError('No autorizado. Falta el token.', 401, 'UNAUTHORIZED');
    }

    const session = await authenticateAccessToken(header.slice('Bearer '.length));
    req.auth = { user: session.user, deviceId: session.deviceId };

    // Marca de última conexión del dispositivo (sin bloqueo).
    prisma.device
      .update({ where: { id: session.deviceId }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);

    next();
  } catch (err) {
    next(err);
  }
}

export function requireRoles(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = req.auth?.user;
    if (!user) return next(new AppError('No autorizado.', 401, 'UNAUTHORIZED'));
    if (roles.length > 0 && !roles.includes(user.role)) {
      return next(new AppError('No tiene permisos para esta operación.', 403, 'FORBIDDEN'));
    }
    next();
  };
}
