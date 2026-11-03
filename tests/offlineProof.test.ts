import assert from 'node:assert/strict';
import { randomUUID, webcrypto } from 'node:crypto';
import { test } from 'node:test';
import { generateOfflineSigningKey, signOfflineEnvelope } from '../src/lib/offlineProof';
import { verifyOfflineProof } from '../server/src/lib/offline-proof';

test('la firma del navegador es verificable en el servidor y la clave privada no es exportable', async () => {
  const provider = webcrypto as unknown as Crypto;
  const pair = await generateOfflineSigningKey(provider);
  assert.equal(pair.privateKey.extractable, false);
  await assert.rejects(provider.subtle.exportKey('jwk', pair.privateKey));
  const jwk = await provider.subtle.exportKey('jwk', pair.publicKey);
  const envelope = {
    version: 2 as const,
    keyId: randomUUID(),
    authorId: 'usuario',
    deviceId: 'terminal',
    companyId: 'empresa',
    action: 'orders.payTable',
    method: 'POST' as const,
    path: '/tables/:id/pay',
    clientOpId: randomUUID(),
    body: { amount: 100, clientOpId: randomUUID() },
    params: { id: 'mesa-1' },
    query: {},
  };
  const proof = await signOfflineEnvelope(envelope, pair.privateKey, provider);
  assert.deepEqual(verifyOfflineProof(proof.document, proof.signature, jwk), envelope);
  assert.equal(verifyOfflineProof(proof.document.replace('100', '101'), proof.signature, jwk), null);
  // La acción firmada tampoco se puede cambiar sin invalidar la firma.
  assert.equal(verifyOfflineProof(proof.document.replace('orders.payTable', 'orders.open'), proof.signature, jwk), null);
});
