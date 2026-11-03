import { markOperationCreatedHere } from '../src/lib/offlineProvenance';
import assert from 'node:assert/strict';
import type { PendingOp } from '../src/types';
import { seedOfflineSigningForTests, signPendingOperation } from '../src/lib/offlineSigning';

const USER = 'replay-user';
const DEVICE = 'replay-device';

/** Prepara una operación firmada como la dejaría la cola real en su equipo de
 * origen, sin tocar la red. */
export async function signReplay(op: PendingOp, companyId = 'el-tayta'): Promise<PendingOp> {
  await seedOfflineSigningForTests(USER, DEVICE);
  const base: PendingOp = { ...op, authorId: USER, companyId, deviceId: DEVICE };
  markOperationCreatedHere(base.clientOpId);
  const proofs = await signPendingOperation(base);
  if (!proofs.length) throw new Error('No se pudo firmar la operación de prueba.');
  return { ...base, proofs };
}

/** Retira la prueba del cuerpo para comparar el contrato original del endpoint. */
export function withoutProof(body: Record<string, unknown>): Record<string, unknown> {
  assert.equal(typeof body.__proof, 'object', 'la petición debe incluir __proof');
  const { __proof, ...rest } = body;
  assert.equal(typeof (__proof as { document?: unknown }).document, 'string');
  assert.equal(typeof (__proof as { signature?: unknown }).signature, 'string');
  return rest;
}
