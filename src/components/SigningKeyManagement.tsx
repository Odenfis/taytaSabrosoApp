import React, { useEffect, useState } from 'react';
import { apiClient } from '../lib/api';

type SigningKey = { id: string; userId: string; deviceId: string; createdAt: string; revokedAt: string | null; revokedBy: string | null };
export const SigningKeyManagement: React.FC = () => {
  const [keys, setKeys] = useState<SigningKey[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<SigningKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const load = async () => {
    try {
      const [rows, users] = await Promise.all([apiClient.get<SigningKey[]>('/sync/signing-keys'), apiClient.get<{id:string;name:string}[]>('/users')]);
      setKeys(rows); setNames(Object.fromEntries(users.map(user => [user.id, user.name])));
    } catch (error) { setMessage((error as Error).message); }
  };
  useEffect(() => { void load(); }, []);
  const revoke = async () => {
    if (!selected || busy) return;
    setBusy(true); setMessage('');
    try { await apiClient.del(`/sync/signing-keys/${selected.id}`); setSelected(null); await load(); setMessage('Clave revocada. Sus pendientes se conservan y requerirán revisión.'); }
    catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  };
  return <section className="rounded-2xl border border-edge-outline bg-panel p-5 space-y-4">
    <h2 className="font-bold text-lg">Claves de firma offline</h2>
    <p className="text-sm">Revoque una clave cuando una terminal deje de ser confiable. Las operaciones firmadas con ella no podrán enviarse; la cola se conserva para revisión.</p>
    {message && <p role="status">{message}</p>}
    <button type="button" onClick={() => void load()} disabled={busy} className="rounded-lg border border-edge-outline px-3 py-2">Actualizar claves</button>
    <ul className="space-y-3">{keys.map(key => <li key={key.id} className="rounded-lg border border-edge-outline p-3 text-sm break-all">
      <p className="font-bold">{names[key.userId] || key.userId}</p>
      <p>Terminal: {key.deviceId}</p><p>Clave: {key.id}</p>
      <p>{key.revokedAt ? `Revocada: ${new Date(key.revokedAt).toLocaleString()}` : 'Activa'}</p>
      {!key.revokedAt && <button type="button" disabled={busy} onClick={() => setSelected(key)} className="mt-2 rounded-lg border border-edge-danger px-3 py-2">Revocar clave</button>}
    </li>)}</ul>
    {selected && <div role="alertdialog" aria-label="Confirmar revocación" className="rounded-xl border border-edge-warning-2 p-4 space-y-3">
      <p>Revocar la clave de {names[selected.userId] || selected.userId}, terminal {selected.deviceId}. Esta acción invalida sus firmas pendientes y queda auditada.</p>
      <button type="button" disabled={busy} onClick={() => void revoke()} className="rounded-lg bg-surface-brand-solid text-ink-on-brand px-3 py-2">Confirmar revocación</button>
      <button type="button" disabled={busy} onClick={() => setSelected(null)} className="ml-2 rounded-lg border px-3 py-2">Cancelar</button>
    </div>}
  </section>;
};
