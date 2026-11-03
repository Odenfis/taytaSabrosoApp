import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import { AppError } from './utils.js';
import { offlineProofFingerprint } from './offline-proof.js';

export type OfflineOperationProof = {
  clientOpId: string;
  authorId: string;
  companyId: string;
  /** Acción lógica del contrato que la firma autorizó. */
  action: string;
  document: string;
  signature: string;
  assumed: boolean;
};

export type OperationActor = {
  userId: string;
  deviceId: string;
  /** Presente solo cuando la escritura proviene de una operación offline firmada. */
  offline?: OfflineOperationProof;
};

/** Construye el actor de una ruta usando la sesión y, si existe, la prueba
 * verificada por `verifyOfflineAuthorship`. */
export function operationActor(req: Request): OperationActor {
  const actor: OperationActor = { userId: req.auth!.user.id, deviceId: req.auth!.deviceId };
  if (req.offline) actor.offline = { ...req.offline };
  return actor;
}

/** Debe invocarse dentro de la misma transacción que modifica el recurso.
 * Conserva la prueba de autoría y registra la asunción administrativa, si la
 * hubo, en esa misma transacción. */
export async function auditOperation(tx: Prisma.TransactionClient, actor: OperationActor | undefined, companyId: string, action: string, entityId: string) {
  if (!actor) return;
  const offline = actor.offline;
  if (offline && offline.companyId !== companyId) {
    throw new AppError('La empresa firmada no coincide con la operación.', 403, 'OFFLINE_PROOF_COMPANY_MISMATCH');
  }
  await tx.operationAudit.create({
    data: {
      id: randomUUID(),
      actorUserId: actor.userId,
      deviceId: actor.deviceId,
      companyId,
      action,
      entityId,
      clientOpId: offline?.clientOpId,
      proofDocument: offline?.document,
      proofSignature: offline?.signature,
      offlineAction: offline?.action,
    },
  });
  if (offline?.assumed) {
    // La asunción se registra una sola vez por clientOpId, incluso si la
    // operación se reintenta.
    await tx.offlineAssumptionAudit.upsert({
      where: { clientOpId: offline.clientOpId },
      create: {
        id: randomUUID(),
        clientOpId: offline.clientOpId,
        authorUserId: offline.authorId,
        assumedByUserId: actor.userId,
        deviceId: actor.deviceId,
        companyId,
        documentFingerprint: offlineProofFingerprint(offline.document),
      },
      update: {},
    });
  }
}
