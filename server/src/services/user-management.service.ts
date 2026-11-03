import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError, plain } from '../lib/utils.js';
import { disconnectSession } from '../lib/realtime.js';
import { POS_ROLES, type PosRole } from '../lib/permissions.js';

export type UserChange = { name: string; role: PosRole; companyId: string | null; isActive: boolean; pin?: string };
const publicSelect = { id: true, name: true, role: true, companyId: true, assignedCompanyId: true, isActive: true, isDeleted: true, version: true, createdAt: true, updatedAt: true } as const;
export async function listManagedUsers(actorId: string, archived = false) {
  const actor = await prisma.user.findUnique({ where: { id: actorId } });
  assertGlobalAdmin(actor);
  return plain(await prisma.user.findMany({ where: { isDeleted: archived }, select: publicSelect, orderBy: { name: 'asc' } }));
}

function assertGlobalAdmin(actor: { role: string; isActive: boolean; isDeleted: boolean; companyId: string | null; assignedCompanyId: string | null } | null) {
  if (!actor || !actor.isActive || actor.isDeleted || actor.role !== 'Administrador' || actor.companyId || actor.assignedCompanyId) {
    throw new AppError('La gestión de usuarios requiere un administrador con acceso a todas las empresas.', 403, 'FORBIDDEN');
  }
}

async function lockAndCheckAdmin(db: Prisma.TransactionClient, actorId: string) {
  // Serializa la comprobación de PIN y la protección del último administrador.
  await db.$queryRaw`SELECT [id] FROM [dbo].[usuarios] WITH (UPDLOCK, HOLDLOCK) ORDER BY [id]`;
  const actor = await db.user.findUnique({ where: { id: actorId } });
  assertGlobalAdmin(actor);
}
async function validateChange(db: Prisma.TransactionClient, input: UserChange, existingId?: string) {
  if (!(POS_ROLES as readonly string[]).includes(input.role)) throw new AppError('Perfil no válido.', 400, 'INVALID_ROLE');
  if (input.companyId && !await db.company.findUnique({ where: { id: input.companyId }, select: { id: true } })) throw new AppError('Empresa no encontrada.', 400, 'INVALID_COMPANY');
  if (input.pin) {
    if (!/^\d{6,12}$/.test(input.pin) || input.pin === '1004') throw new AppError('El PIN debe tener entre 6 y 12 dígitos y ser distinto al inicial.', 400, 'INVALID_PIN');
    const others = await db.user.findMany({ where: { isDeleted: false, ...(existingId ? { id: { not: existingId } } : {}) }, select: { pinHash: true } });
    for (const other of others) if (await bcrypt.compare(input.pin, other.pinHash)) throw new AppError('Ese PIN ya pertenece a otro usuario.', 409, 'PIN_IN_USE');
  }
}
export async function createManagedUser(actorId: string, deviceId: string, input: UserChange & { pin: string }) {
  return plain(await prisma.$transaction(async (db) => {
    await lockAndCheckAdmin(db, actorId);
    await validateChange(db, input);
    const created = await db.user.create({ data: { id: randomUUID(), name: input.name.trim(), role: input.role, companyId: input.companyId, assignedCompanyId: input.companyId, isActive: input.isActive, pinHash: await bcrypt.hash(input.pin, 10), terminal: 'Sin asignar' }, select: publicSelect });
    await db.userAccessAudit.create({ data: { id: randomUUID(), actorUserId: actorId, subjectUserId: created.id, deviceId, action: 'crear', newRole: created.role, newCompanyId: created.assignedCompanyId, newActive: created.isActive } });
    return created;
  }, { timeout: 30000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
}
export async function updateManagedUser(actorId: string, deviceId: string, subjectId: string, expectedVersion: number, input: UserChange) {
  const result = await prisma.$transaction(async (db) => {
    await lockAndCheckAdmin(db, actorId);
    const old = await db.user.findUnique({ where: { id: subjectId } });
    if (!old || old.isDeleted) throw new AppError('Usuario no encontrado.', 404, 'USER_NOT_FOUND');
    if (old.version !== expectedVersion) throw new AppError('El usuario cambió en otra terminal. Actualice.', 409, 'USER_VERSION_CONFLICT');
    await validateChange(db, input, subjectId);
    if (old.role === 'Administrador' && old.isActive && (input.role !== 'Administrador' || !input.isActive)) {
      const count = await db.user.count({ where: { id: { not: subjectId }, role: 'Administrador', isActive: true, isDeleted: false } });
      if (!count) throw new AppError('Debe permanecer al menos un administrador activo.', 409, 'LAST_ADMINISTRATOR');
    }
    if (old.role === 'Administrador' && old.isActive && !old.companyId && !old.assignedCompanyId && (input.role !== 'Administrador' || !input.isActive || input.companyId)) {
      const count = await db.user.count({ where: { id: { not: subjectId }, role: 'Administrador', isActive: true, isDeleted: false, companyId: null, assignedCompanyId: null } });
      if (!count) throw new AppError('Debe permanecer al menos un administrador activo con acceso global.', 409, 'LAST_GLOBAL_ADMINISTRATOR');
    }
    const sensitive = old.role !== input.role || old.companyId !== input.companyId || old.assignedCompanyId !== input.companyId || old.isActive !== input.isActive || !!input.pin;
    const sessions = sensitive ? await db.session.findMany({ where: { userId: subjectId }, select: { tokenHash: true } }) : [];
    const updated = await db.user.update({ where: { id: subjectId }, data: { name: input.name.trim(), role: input.role, companyId: input.companyId, assignedCompanyId: input.companyId, isActive: input.isActive, version: { increment: 1 }, ...(input.pin ? { pinHash: await bcrypt.hash(input.pin, 10) } : {}) }, select: publicSelect });
    if (sensitive) await db.session.deleteMany({ where: { userId: subjectId } });
    await db.userAccessAudit.create({ data: { id: randomUUID(), actorUserId: actorId, subjectUserId: subjectId, deviceId, action: input.pin ? 'editar_y_restablecer_pin' : 'editar', oldRole: old.role, newRole: updated.role, oldCompanyId: old.assignedCompanyId ?? old.companyId, newCompanyId: updated.assignedCompanyId, oldActive: old.isActive, newActive: updated.isActive, pinReset: !!input.pin } });
    return { user: updated, tokens: sessions.map((session) => session.tokenHash) };
  }, { timeout: 30000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  for (const token of result.tokens) disconnectSession(token);
  return plain(result.user);
}

/** Archiva sin borrar historia ni claves; restaura siempre sin habilitar acceso. */
export async function setUserArchived(actorId: string, deviceId: string, subjectId: string, expectedVersion: number, archived: boolean, pin?: string) {
  const result = await prisma.$transaction(async db => {
    await lockAndCheckAdmin(db, actorId);
    const old = await db.user.findUnique({ where: { id: subjectId } });
    if (!old || old.isDeleted === archived) throw new AppError('Usuario no encontrado o estado ya cambiado.', 404, 'USER_NOT_FOUND');
    if (old.version !== expectedVersion) throw new AppError('El usuario cambió en otra terminal. Actualice.', 409, 'USER_VERSION_CONFLICT');
    if (archived && old.id === actorId) throw new AppError('No puede archivar su propia cuenta.', 409, 'CANNOT_ARCHIVE_SELF');
    if (archived && old.role === 'Administrador' && old.isActive && !old.companyId && !old.assignedCompanyId) {
      const others = await db.user.count({ where: { id: { not: subjectId }, role: 'Administrador', isActive: true, isDeleted: false, companyId: null, assignedCompanyId: null } });
      if (!others) throw new AppError('Debe permanecer al menos un administrador activo con acceso global.', 409, 'LAST_GLOBAL_ADMINISTRATOR');
    }
    if (!archived) {
      if (!pin) throw new AppError('Se requiere un PIN nuevo.', 400, 'INVALID_PIN');
      if (!/^\d{6,12}$/.test(pin) || pin === '1004') throw new AppError('El PIN debe tener entre 6 y 12 dígitos y ser distinto al inicial.', 400, 'INVALID_PIN');
      if (await bcrypt.compare(pin, old.pinHash)) throw new AppError('Elija un PIN distinto al anterior.', 400, 'INVALID_PIN');
      const others = await db.user.findMany({ where: { isDeleted: false, id: { not: subjectId } }, select: { pinHash: true } });
      for (const other of others) if (await bcrypt.compare(pin, other.pinHash)) throw new AppError('Ese PIN ya pertenece a otro usuario.', 409, 'PIN_IN_USE');
    }
    const sessions = await db.session.findMany({ where: { userId: subjectId }, select: { tokenHash: true } });
    const updated = await db.user.update({ where: { id: subjectId }, data: { isDeleted: archived, isActive: false, version: { increment: 1 }, ...(!archived && pin ? { pinHash: await bcrypt.hash(pin, 10) } : {}) }, select: publicSelect });
    await db.session.deleteMany({ where: { userId: subjectId } });
    await db.userAccessAudit.create({ data: { id: randomUUID(), actorUserId: actorId, subjectUserId: subjectId, deviceId, action: archived ? 'archivar' : 'restaurar', oldRole: old.role, newRole: updated.role, oldCompanyId: old.assignedCompanyId ?? old.companyId, newCompanyId: updated.assignedCompanyId ?? updated.companyId, oldActive: old.isActive, newActive: false, pinReset: !archived } });
    return { user: updated, tokens: sessions.map(session => session.tokenHash) };
  }, { timeout: 30000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  for (const token of result.tokens) disconnectSession(token);
  return plain(result.user);
}

/** Se usa el mismo bloqueo que el alta para impedir dos PIN iguales concurrentes. */
export async function changeOwnPin(actorId: string, deviceId: string, currentPin: string, newPin: string) {
  if (!/^\d{6,12}$/.test(newPin) || newPin === '1004' || newPin === currentPin) throw new AppError('Elija un PIN nuevo de 6 a 12 dígitos.', 400, 'INVALID_PIN');
  const tokens = await prisma.$transaction(async (db) => {
    await db.$queryRaw`SELECT [id] FROM [dbo].[usuarios] WITH (UPDLOCK, HOLDLOCK) ORDER BY [id]`;
    const actor = await db.user.findUnique({ where: { id: actorId } });
    if (!actor || !actor.isActive || actor.isDeleted) throw new AppError('Sesión inválida.', 401, 'UNAUTHORIZED');
    if (!await bcrypt.compare(currentPin, actor.pinHash)) throw new AppError('PIN actual incorrecto.', 403, 'INVALID_CURRENT_PIN');
    const others = await db.user.findMany({ where: { isDeleted: false, id: { not: actorId } }, select: { pinHash: true } });
    for (const other of others) if (await bcrypt.compare(newPin, other.pinHash)) throw new AppError('Ese PIN ya pertenece a otro usuario.', 409, 'PIN_IN_USE');
    const sessions = await db.session.findMany({ where: { userId: actorId }, select: { tokenHash: true } });
    await db.user.update({ where: { id: actorId }, data: { pinHash: await bcrypt.hash(newPin, 10), version: { increment: 1 } } });
    await db.session.deleteMany({ where: { userId: actorId } });
    await db.userAccessAudit.create({ data: { id: randomUUID(), actorUserId: actorId, subjectUserId: actorId, deviceId, action: 'cambiar_pin', oldRole: actor.role, newRole: actor.role, oldCompanyId: actor.assignedCompanyId ?? actor.companyId, newCompanyId: actor.assignedCompanyId ?? actor.companyId, oldActive: true, newActive: true, pinReset: true } });
    return sessions.map((session) => session.tokenHash);
  }, { timeout: 30000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  for (const token of tokens) disconnectSession(token);
  return { ok: true };
}
