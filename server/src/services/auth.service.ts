import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { AppError, plain } from '../lib/utils.js';
import { Prisma } from '@prisma/client';
import { hashToken, signAccessToken } from '../lib/auth.js';
import { prisma } from '../lib/prisma.js';
import { disconnectSession } from '../lib/realtime.js';
import { canAccessCompany, hasPermission } from '../lib/permissions.js';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

type UserRecord = Prisma.UserGetPayload<Record<string, never>>;

function publicUser(user: UserRecord) {
  const { pinHash: _pinHash, passwordHash: _passwordHash, ...safe } = user;
  void _pinHash;
  void _passwordHash;
  return safe;
}

async function sessionContext(user: UserRecord) {
  const restrictions = [user.companyId, user.assignedCompanyId].filter((id): id is string => Boolean(id));
  if (new Set(restrictions).size > 1) throw new AppError('La asignación de empresas de su usuario es inconsistente.', 403, 'FORBIDDEN');
  const companyId = restrictions[0];
  const companies = await prisma.company.findMany({ where: companyId ? { id: companyId } : undefined, orderBy: { name: 'asc' } });
  const allowed = companies.filter((company) => canAccessCompany(user, company.id));
  const companyShifts = hasPermission(user.role, 'cash.read')
    ? await prisma.companyShift.findMany({ where: companyId ? { companyId } : undefined })
    : [];
  return { companies: plain(allowed), companyShifts: plain(companyShifts) };
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
  const { companies, companyShifts } = await sessionContext(matchedUser);

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
  if (!device.isActive) {
    throw new AppError('Esta terminal está inactiva.', 401, 'UNAUTHORIZED');
  }

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

  return {
    token,
    expiresAt: session.expiresAt.toISOString(),
    user: publicUser(matchedUser),
    device: plain(device),
    companies,
    companyShifts,
  };
}

export async function logout(userId: string, token: string) {
  const tokenHash = hashToken(token);
  await prisma.session.deleteMany({
    where: { userId, tokenHash },
  });
  disconnectSession(tokenHash);
}

export async function getMe(userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, isActive: true, isDeleted: false },
  });
  if (!user) throw new AppError('Usuario no encontrado.', 404, 'NOT_FOUND');

  const { companies, companyShifts } = await sessionContext(user);
  return { user: publicUser(user), companies, companyShifts };
}
