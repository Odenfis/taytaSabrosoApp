import type { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import type { NextFunction, Request, Response } from 'express';

export class AppError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode = 400, code = 'BAD_REQUEST') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const notFound = (req: Request, _res: Response, next: NextFunction) => {
  next(new AppError(`Ruta no encontrada: ${req.method} ${req.originalUrl}`, 404, 'NOT_FOUND'));
};

export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  if (err instanceof ZodError) {
    const issues = err.issues.map((i) => ({
      field: i.path.join('.'),
      message: i.message,
    }));
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Datos inválidos.', issues },
    });
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: { code: err.code, message: err.message },
    });
  }

  // Prisma known error: P2002 = unique constraint violation
  if (err && typeof err === 'object' && (err as Prisma.PrismaClientKnownRequestError).code) {
    const prismaErr = err as Prisma.PrismaClientKnownRequestError;
    if (prismaErr.code === 'P2002') {
      return res.status(409).json({
        error: { code: 'CONFLICT', message: 'Ya existe un registro con ese valor único.', target: prismaErr.meta?.target ?? undefined },
      });
    }
    if (prismaErr.code === 'P2025') {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'El registro solicitado no existe.' },
      });
    }
    return res.status(500).json({
      error: { code: 'DATABASE_ERROR', message: 'Error de base de datos.' },
    });
  }

  console.error(err);
  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor.' },
  });
};

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// Convierte Prisma.Decimal (u otros) a number para operaciones aritméticas/JSON.</think>
export function toNum(v: unknown): number {
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object' && typeof (v as { toNumber?: unknown }).toNumber === 'function') {
    return (v as { toNumber: () => number }).toNumber();
  }
  return Number(v);
}

function isDecimal(v: unknown): v is Prisma.Decimal {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as Prisma.Decimal).toNumber === 'function' &&
    'd' in v
  );
}

// Convierte recursivamente Decimal(s) -> Number y Date -> ISO string.
// El front consume números (igual que la demo), Prisma devuelve Decimal.
export function plain<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;

  if (value instanceof Date) return value.toISOString() as unknown as T;

  if (isDecimal(value)) return (value as Prisma.Decimal).toNumber() as unknown as T;

  if (Array.isArray(value)) return value.map((v) => plain(v)) as unknown as T;

  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>)) {
    out[key] = plain((value as Record<string, unknown>)[key]);
  }
  return out as T;
}