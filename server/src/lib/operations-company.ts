import type { RequestHandler } from 'express';
import { prisma } from './prisma.js';
import { canAccessCompany } from './permissions.js';
import { AppError } from './utils.js';

/** Verifica el ámbito a partir del recurso persistido, no del companyId del cliente. */
export const scopeOperationResources: RequestHandler = async (req, _res, next) => {
  try {
    const user = req.auth!.user;
    const restrictions = [user.companyId, user.assignedCompanyId].filter((id): id is string => Boolean(id));
    if (new Set(restrictions).size > 1) throw new AppError('La asignación de empresas es inconsistente.', 403, 'FORBIDDEN');
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    const relatedKeys = ['productId', 'insumoId', 'bankAccountId', 'customPaymentMethodId'];
    const hasRelated = relatedKeys.some((key) => typeof body[key] === 'string' && body[key]) ||
      (Array.isArray(body.items) && body.items.some((item) => item && typeof item === 'object' && relatedKeys.some((key) => typeof item[key] === 'string' && item[key])));
    if (!restrictions.length && !hasRelated) return next();
    if (typeof body.companyId === 'string' && !canAccessCompany(user, body.companyId)) throw new AppError('No tiene acceso a esta empresa.', 403, 'FORBIDDEN');
    const matches = req.path.match(/^\/(orders|tables|bills|purchases|transactions)\/([^/]+)/);
    let companyId: string | null | undefined;
    if (matches) {
      const [, kind, rawId] = matches;
      const id = decodeURIComponent(rawId);
      if (kind === 'orders' && id === 'open' && typeof body.tableId === 'string') companyId = (await prisma.table.findUnique({ where: { id: body.tableId }, select: { companyId: true } }))?.companyId;
      else if (kind === 'orders' && (id === 'opening-items' || id === 'cancel-opening') && typeof body.openingClientOpId === 'string') {
        const opening = await prisma.order.findUnique({ where: { clientOpId: body.openingClientOpId }, select: { companyId: true } });
        const alias = opening ? null : await prisma.orderOperationResult.findUnique({ where: { id: `alias:${body.openingClientOpId}` }, select: { orderId: true } });
        companyId = opening?.companyId ?? (alias?.orderId ? (await prisma.order.findUnique({ where: { id: alias.orderId }, select: { companyId: true } }))?.companyId : undefined);
      }
      else if (kind === 'orders' && !['active', 'open', 'opening-items', 'cancel-opening', 'quick-bar'].includes(id)) companyId = (await prisma.order.findUnique({ where: { id }, select: { companyId: true } }))?.companyId;
      else if (kind === 'tables') companyId = (await prisma.table.findUnique({ where: { id }, select: { companyId: true } }))?.companyId;
      else if (kind === 'bills') companyId = (await prisma.dinerBill.findUnique({ where: { id }, select: { order: { select: { companyId: true } } } }))?.order.companyId;
      else if (kind === 'purchases') companyId = (await prisma.purchase.findUnique({ where: { id }, select: { companyId: true } }))?.companyId;
      else if (kind === 'transactions') companyId = (await prisma.transaction.findUnique({ where: { id }, select: { companyId: true } }))?.companyId;
      else if (kind !== 'orders' || !['active', 'quick-bar'].includes(id)) return next();
      if (companyId === null) throw new AppError('Recurso no disponible para su empresa.', 404, 'NOT_FOUND');
      if (companyId && !canAccessCompany(user, companyId)) throw new AppError('No tiene acceso a esta empresa.', 403, 'FORBIDDEN');
      if (companyId === undefined && !['active', 'quick-bar'].includes(id)) throw new AppError('Recurso no disponible para su empresa.', 404, 'NOT_FOUND');
    }
    const target = companyId ?? (typeof body.companyId === 'string' ? body.companyId : restrictions[0]);
    if (hasRelated && !target) throw new AppError('No se pudo determinar la empresa de la operación.', 400, 'INVALID_COMPANY');
    const checkRelated = async (kind: 'product' | 'insumo' | 'bankAccount' | 'customPaymentMethod', id: unknown) => {
      if (typeof id !== 'string' || !id) return;
      const delegate = prisma[kind] as { findUnique(args: unknown): Promise<{ companyId: string | null } | null> };
      const row = await delegate.findUnique({ where: { id }, select: { companyId: true } });
      if (!row || (row.companyId && row.companyId !== target)) throw new AppError('El recurso relacionado no pertenece a esta empresa.', 403, 'FORBIDDEN');
    };
    await checkRelated('product', body.productId);
    await checkRelated('insumo', body.insumoId);
    await checkRelated('bankAccount', body.bankAccountId);
    await checkRelated('customPaymentMethod', body.customPaymentMethodId);
    if (Array.isArray(body.items)) for (const item of body.items) {
      if (!item || typeof item !== 'object') continue;
      await checkRelated('product', item.productId);
      await checkRelated('insumo', item.insumoId);
    }
    next();
  } catch (error) { next(error); }
};
