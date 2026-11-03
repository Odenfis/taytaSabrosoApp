/** Contenido exacto que se firma antes de intentar sincronizar una operación.
 * El sobre v2 ata la firma a la acción lógica, a la ruta y al contenido que
 * se envía: una prueba de una acción no habilita otra escritura. */
export interface OfflineProofEnvelope {
  version: 2;
  keyId: string;
  authorId: string;
  deviceId: string;
  companyId: string;
  /** Acción lógica del contrato compartido. */
  action: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  /** Plantilla de ruta firmada ('/orders/:id/items'). */
  path: string;
  clientOpId: string;
  /** Cuerpo lógico firmado (las referencias temporales van como marcador). */
  body: Record<string, unknown>;
  params: Record<string, unknown>;
  query: Record<string, string>;
}

export interface OfflineProof {
  document: string;
  signature: string;
}

/** La clave privada no puede exportarse; su registro y almacenamiento son
 * responsabilidades separadas y deben completarse antes de usarla en la cola. */
export async function generateOfflineSigningKey(cryptoProvider: Crypto = globalThis.crypto): Promise<CryptoKeyPair> {
  if (!cryptoProvider?.subtle) throw new Error('Este navegador no permite firmar operaciones sin conexión.');
  return cryptoProvider.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
}

/** Los bytes serializados se conservan junto a la firma para que el servidor
 * verifique exactamente el documento que se firmó. */
export async function signOfflineEnvelope(envelope: OfflineProofEnvelope, key: CryptoKey, cryptoProvider: Crypto = globalThis.crypto): Promise<OfflineProof> {
  if (!cryptoProvider?.subtle) throw new Error('Este navegador no permite firmar operaciones sin conexión.');
  const document = JSON.stringify(envelope);
  const data = new TextEncoder().encode(document);
  if (data.length > 200_000) throw new Error('La operación es demasiado grande para firmarse.');
  const bytes = new Uint8Array(await cryptoProvider.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, data));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return { document, signature: btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') };
}

/** Lee el sobre firmado (sin verificar la firma criptográfica). */
export function parseOfflineDocument(document: string): OfflineProofEnvelope | null {
  try {
    const parsed = JSON.parse(document) as Partial<OfflineProofEnvelope>;
    if (parsed.version !== 2) return null;
    if (typeof parsed.keyId !== 'string' || typeof parsed.action !== 'string') return null;
    if (typeof parsed.method !== 'string' || typeof parsed.path !== 'string') return null;
    if (typeof parsed.clientOpId !== 'string') return null;
    return {
      version: 2,
      keyId: parsed.keyId,
      authorId: String(parsed.authorId ?? ''),
      deviceId: String(parsed.deviceId ?? ''),
      companyId: String(parsed.companyId ?? ''),
      action: parsed.action,
      method: parsed.method,
      path: parsed.path,
      clientOpId: parsed.clientOpId,
      body: (parsed.body ?? {}) as Record<string, unknown>,
      params: (parsed.params ?? {}) as Record<string, unknown>,
      query: (parsed.query ?? {}) as Record<string, string>,
    };
  } catch {
    return null;
  }
}
