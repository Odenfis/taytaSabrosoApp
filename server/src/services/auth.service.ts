import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { AppError, plain } from '../lib/utils';
import { Prisma } from '@prisma/client';
import { hashToken, signAccessToken } from '../lib/auth';
import { prisma } from '../lib/prisma';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

type UserRecord = Prisma.UserGetPayload<Record<string, never>>;

function publicUser(user: UserRecord) {
  const { pinHash: _pinHash, passwordHash: _passwordHash, ...safe } = user;
  void _pinHash;
  void _passwordHash;
  return safe;
}

export interface LoginInput {
  pin: string;
  deviceCode?: string;
  terminalName?: string;
}

export async function login(input: LoginInput) {
  const pin = (input.pin || '').trim();
  if (!pin) throw new AppError('Ingrese su PIN.', 400, 'INVALID_CREDENTIALS');

  const candidates = await prisma.user.findMany({
    where: { isActive: true, isDeleted: false },
  });

  let matchedUser: (typeof candidates)[number] | null = null;
  for (const u of candidates) {
    if (await bcrypt.compare(pin, u.pinHash)) {
      matchedUser = u;
      break;
    }
  }

  if (!matchedUser) {
    throw new AppError('PIN incorrecto. Intente nuevamente.', 401, 'INVALID_CREDENTIALS');
  }

  const deviceCode = (input.deviceCode || `TERM-${randomUUID().slice(0, 8).toUpperCase()}`).toUpperCase();
  const terminalName = input.terminalName?.trim() || 'Terminal';

  const device = await prisma.device.upsert({
    where: { terminalCode: deviceCode },
    update: { lastSeenAt: new Date(), name: terminalName },
    create: {
      id: randomUUID(),
      companyId: matchedUser.companyId,
      name: terminalName,
      terminalCode: deviceCode,
    },
  });

  const token = signAccessToken({
    sub: matchedUser.id,
    deviceId: device.id,
    role: matchedUser.role,
    name: matchedUser.name,
  });

  const session = await prisma.session.create({
    data: {
      id: randomUUID(),
      userId: matchedUser.id,
      deviceId: device.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });

  const companies = await prisma.company.findMany({
    orderBy: { name: 'asc' },
  });

  // Al iniciar sesión se reporta también el estado del turno vigente por empresa.
  const companyShifts = await prisma.companyShift.findMany();

  return {
    token,
    expiresAt: session.expiresAt.toISOString(),
    user: publicUser(matchedUser),
    device: plain(device),
    companies: plain(companies),
    companyShifts: plain(companyShifts),
  };
}

export async function logout(userId: string, token: string) {
  await prisma.session.deleteMany({
    where: { userId, tokenHash: hashToken(token) },
  });
}

export async function getMe(userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, isActive: true, isDeleted: false },
  });
  if (!user) throw new AppError('Usuario no encontrado.', 404, 'NOT_FOUND');

  const companies = await prisma.company.findMany({ orderBy: { name: 'asc' } });
  const companyShifts = await prisma.companyShift.findMany();

  return { user: publicUser(user), companies: plain(companies), companyShifts: plain(companyShifts) };
}