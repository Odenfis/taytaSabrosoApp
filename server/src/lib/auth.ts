import jwt from 'jsonwebtoken';
import { createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { User } from '@prisma/client';
import { AppError } from './utils';
import { prisma } from './prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-cambiar-en-produccion';
const TOKEN_TTL_HOURS = 12;

export interface AccessTokenPayload {
  sub: string; // userId
  deviceId: string;
  role: string;
  name: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: `${TOKEN_TTL_HOURS}h`,
  });
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, JWT_SECRET) as AccessTokenPayload;
}

// Middleware de autenticación: verifica JWT y carga el usuario activo desde la DB.
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new AppError('No autorizado. Falta el token.', 401, 'UNAUTHORIZED');
    }

    const payload = verifyAccessToken(header.slice('Bearer '.length));

    const user = await prisma.user.findFirst({
      where: { id: payload.sub, isActive: true, isDeleted: false },
    });

    if (!user) {
      throw new AppError('Sesión inválida o usuario inactivo.', 401, 'UNAUTHORIZED');
    }

    req.auth = { user, deviceId: payload.deviceId };

    // Marca de última conexión del dispositivo (sin bloqueo).
    prisma.device
      .update({ where: { id: payload.deviceId }, data: { lastSeenAt: new Date() } })
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