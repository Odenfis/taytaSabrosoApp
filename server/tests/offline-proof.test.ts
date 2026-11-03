import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID, sign, webcrypto } from 'node:crypto';
import { test } from 'node:test';
import { verifyOfflineProof, verifyOfflineProofForAuthor, verifyRegisteredOfflineProof } from '../src/lib/offline-proof.js';
import type { Prisma } from '@prisma/client';

const envelope = () => ({
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
});

test('la firma vincula usuario, terminal, empresa, acción, ruta y contenido', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' });
  const value = envelope();
  const document = JSON.stringify(value);
  const signature = sign('sha256', Buffer.from(document), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  assert.deepEqual(verifyOfflineProof(document, signature, jwk), value);
  for (const changed of [
    { ...value, authorId: 'otro' }, { ...value, deviceId: 'otra' },
    { ...value, companyId: 'otra' }, { ...value, clientOpId: randomUUID() },
    { ...value, action: 'orders.open' }, { ...value, method: 'PATCH' },
    { ...value, path: '/orders/open' }, { ...value, body: { amount: 1 } },
    { ...value, params: { id: 'mesa-2' } }, { ...value, query: { clientOpId: 'x' } },
  ]) assert.equal(verifyOfflineProof(JSON.stringify(changed), signature, jwk), null);
  assert.equal(verifyOfflineProof(document, signature, generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).publicKey.export({ format: 'jwk' })), null);
  assert.equal(verifyOfflineProof(document, `${signature}=`, jwk), null);
});

test('rechaza documentos malformados y pruebas de la versión anterior', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' });
  const legacy = { version: 1, keyId: randomUUID(), authorId: 'usuario', deviceId: 'terminal', companyId: 'empresa', clientOpId: randomUUID(), operation: 'payOrder', payload: { amount: 100 } };
  for (const document of ['{}', '{', JSON.stringify(legacy), JSON.stringify({ version: 2, payload: {} })]) {
    const signature = sign('sha256', Buffer.from(document), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
    assert.equal(verifyOfflineProof(document, signature, jwk), null);
  }
});

test('acepta una firma P-256 creada con WebCrypto', async () => {
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const jwk = await webcrypto.subtle.exportKey('jwk', pair.publicKey);
  const document = JSON.stringify(envelope());
  const signature = await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, new TextEncoder().encode(document));
  assert.ok(verifyOfflineProof(document, Buffer.from(signature).toString('base64url'), jwk));
});

test('procedencia registrada rechaza sustitución de usuario, terminal, clave revocada y empresa ajena', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const exported = publicKey.export({ format: 'jwk' });
  const value = envelope();
  const document = JSON.stringify(value);
  const signature = sign('sha256', Buffer.from(document), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  const key = { userId: 'usuario', deviceId: 'terminal', revokedAt: null as Date | null, publicKey: JSON.stringify({ kty: exported.kty, crv: exported.crv, x: exported.x, y: exported.y }) };
  const user = { isDeleted: false, isActive: true, companyId: 'empresa', assignedCompanyId: null };
  const device = { isActive: true, companyId: null as string | null };
  const db = { offlineSigningKey: { findUnique: async () => key }, user: { findUnique: async () => user }, device: { findUnique: async () => device } } as unknown as Pick<Prisma.TransactionClient, 'offlineSigningKey' | 'user' | 'device'>;
  const session = { userId: 'usuario', deviceId: 'terminal' };
  assert.deepEqual(await verifyRegisteredOfflineProof(db, session, document, signature), value);
  await assert.rejects(verifyRegisteredOfflineProof(db, { ...session, userId: 'otro' }, document, signature), { code: 'OFFLINE_PROOF_SESSION_MISMATCH' });
  await assert.rejects(verifyRegisteredOfflineProof(db, { ...session, deviceId: 'otra' }, document, signature), { code: 'OFFLINE_PROOF_SESSION_MISMATCH' });
  key.revokedAt = new Date();
  await assert.rejects(verifyRegisteredOfflineProof(db, session, document, signature), { code: 'OFFLINE_KEY_UNAVAILABLE' });
  key.revokedAt = null;
  user.companyId = 'otra';
  await assert.rejects(verifyRegisteredOfflineProof(db, session, document, signature), { code: 'OFFLINE_ACCESS_REVOKED' });
  assert.deepEqual(await verifyOfflineProofForAuthor(db, document, signature, { allowInactiveIdentity: true }), value);
  user.companyId = 'empresa'; device.companyId = 'otra';
  await assert.rejects(verifyRegisteredOfflineProof(db, session, document, signature), { code: 'OFFLINE_ACCESS_REVOKED' });
  device.companyId = null; user.isActive = false;
  await assert.rejects(verifyRegisteredOfflineProof(db, session, document, signature), { code: 'OFFLINE_ACCESS_REVOKED' });
});
