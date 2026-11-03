import React, { useEffect, useState } from 'react';
import { apiClient } from '../lib/api';
import { usePOS } from '../context/POSContext';

type ManagedUser = { id: string; name: string; role: string; companyId: string | null; assignedCompanyId: string | null; isActive: boolean; version: number };
type Form = { name: string; role: string; companyId: string; isActive: boolean; pin: string };
const blank = (): Form => ({ name: '', role: 'Mesero', companyId: '', isActive: true, pin: '' });
const roles = ['Administrador', 'Jefe de restaurante', 'Cajero', 'Mesero'];
const formFor = (user: ManagedUser): Form => ({ name: user.name, role: user.role, companyId: user.assignedCompanyId ?? user.companyId ?? '', isActive: user.isActive, pin: '' });
const fieldClass = 'mt-2 min-h-11 w-full rounded-xl border border-edge-outline bg-panel px-3 py-2 text-ink-strong outline-none transition focus-visible:ring-2 focus-visible:ring-primary';

export const UserManagement: React.FC = () => {
  const { companies, offlineState } = usePOS();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [selected, setSelected] = useState<ManagedUser | null>(null);
  const [form, setForm] = useState<Form>(blank);
  const [archived, setArchived] = useState(false);
  const [search, setSearch] = useState('');
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [restorePin, setRestorePin] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const offline = !offlineState.isOnline || offlineState.isSimulatedOffline;
  const dirty = JSON.stringify(form) !== JSON.stringify(selected ? formFor(selected) : blank());
  const load = async (showArchived = archived) => {
    setLoading(true); setLoadError('');
    try { setUsers(await apiClient.get<ManagedUser[]>(showArchived ? '/users?archived=true' : '/users')); }
    catch (e) { setLoadError(e instanceof Error ? e.message : 'No se pudieron cargar usuarios.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const changeSelection = (user: ManagedUser | null) => {
    if (busy || (dirty && !window.confirm('Hay cambios sin guardar. ¿Deseas descartarlos?'))) return;
    setSelected(user); setForm(user ? formFor(user) : blank()); setRestorePin(''); setConfirmArchive(false); setMessage(null);
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy || offline) return; setBusy(true); setMessage(null);
    try {
      const body = { name: form.name.trim(), role: form.role, companyId: form.companyId || null, isActive: form.isActive, ...(form.pin ? { pin: form.pin } : {}) };
      if (selected) await apiClient.patch(`/users/${encodeURIComponent(selected.id)}`, { ...body, expectedVersion: selected.version });
      else await apiClient.post('/users', body);
      setSelected(null); setForm(blank()); setMessage({ kind: 'success', text: 'Usuario guardado. Los cambios de acceso cierran sus sesiones.' }); await load();
    } catch (e) { setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'No se pudo guardar el usuario.' }); }
    finally { setBusy(false); }
  };
  const switchView = (value: boolean) => {
    if (busy || (dirty && !window.confirm('Hay cambios sin guardar. ¿Deseas descartarlos?'))) return;
    setArchived(value); setSelected(null); setForm(blank()); setRestorePin(''); setMessage(null); setSearch(''); void load(value);
  };
  const changeArchived = async (archive: boolean) => {
    if (!selected || busy || offline) return;
    setBusy(true); setMessage(null);
    try {
      await apiClient.post(`/users/${encodeURIComponent(selected.id)}/${archive ? 'archive' : 'restore'}`, { expectedVersion: selected.version, ...(!archive ? { pin: restorePin } : {}) });
      setSelected(null); setForm(blank()); setRestorePin(''); setConfirmArchive(false);
      setMessage({kind:'success',text: archive ? 'Usuario archivado. Sus sesiones se cerraron y su historial se conserva.' : 'Usuario restaurado como inactivo. Revisa su perfil y empresa antes de activarlo.'});
      await load();
    } catch (e) { setMessage({kind:'error',text:e instanceof Error ? e.message : 'No se pudo actualizar el usuario.'}); }
    finally { setBusy(false); }
  };
  const visibleUsers = users.filter(user => user.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const companyName = (user: ManagedUser) => {
    const id = user.assignedCompanyId ?? user.companyId;
    return id ? companies.find(company => company.id === id)?.name ?? 'Empresa no disponible' : 'Ambas empresas';
  };
  return <section className="space-y-5" aria-labelledby="users-title">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h2 id="users-title" className="text-xl font-bold text-ink-strong">Usuarios y perfiles</h2><p className="mt-1 text-sm text-ink-muted-3">Administra quién puede acceder y a qué empresas pertenece.</p></div>
      <button type="button" onClick={() => changeSelection(null)} disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-surface-brand-solid px-4 py-2 text-sm font-bold text-ink-on-brand disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"><span aria-hidden="true" className="material-symbols-outlined text-[20px]">person_add</span>Nuevo usuario</button>
    </div>
    {offline && <p role="status" className="rounded-xl border border-edge-warning-2 bg-panel p-3 text-sm text-ink-strong">La gestión de usuarios necesita conexión. Recupera la conexión para guardar cambios.</p>}
    {message && <p role={message.kind === 'error' ? 'alert' : 'status'} className={`rounded-xl border bg-panel p-3 text-sm ${message.kind === 'error' ? 'border-edge-danger text-ink-danger' : 'border-edge-outline text-ink-success'}`}>{message.text}</p>}
    <div className="flex flex-wrap gap-2">{([false, true] as const).map(value => <button key={String(value)} type="button" aria-pressed={archived === value} onClick={() => switchView(value)} className={`min-h-11 rounded-xl border px-4 font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${archived === value ? 'border-transparent bg-surface-brand-solid text-ink-on-brand shadow-sm' : 'border-edge-outline text-ink-strong hover:bg-panel-3'}`}>{value ? 'Archivados' : 'Equipo actual'}</button>)}</div>
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className="rounded-2xl border border-edge-outline bg-panel p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3"><div><h3 className="font-bold text-ink-strong">Equipo</h3><p className="mt-1 text-sm text-ink-muted-3">Selecciona una persona para editarla.</p></div>{!loading && !loadError && <span className="rounded-full bg-panel-3 px-3 py-1 text-xs font-bold text-ink-muted-3">{users.length}</span>}</div>
        {archived && <label className="block text-sm text-ink-strong">Buscar archivados<input type="search" value={search} onChange={e => setSearch(e.target.value)} className={fieldClass} /></label>}
        {loading && <p role="status" className="py-5 text-sm text-ink-muted-3">Cargando usuarios…</p>}
        {!loading && loadError && <div role="alert" className="space-y-3 rounded-xl border border-edge-danger p-4 text-sm text-ink-danger"><p>{loadError}</p><button type="button" onClick={() => void load()} className="min-h-11 rounded-lg border border-edge-outline px-3 text-ink-strong">Reintentar</button></div>}
        {!loading && !loadError && visibleUsers.length === 0 && <p className="rounded-xl border border-edge-outline p-4 text-sm text-ink-muted-3">No hay usuarios para mostrar.</p>}
        {!loading && !loadError && <ul className="space-y-2">{visibleUsers.map(user => <li key={user.id}><button type="button" disabled={busy} onClick={() => changeSelection(user)} aria-pressed={selected?.id === user.id} className={`flex min-h-11 w-full items-start gap-3 rounded-xl border p-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 ${selected?.id === user.id ? 'border-primary bg-panel-3' : 'border-edge-outline hover:bg-panel-3'}`}>
          <span aria-hidden="true" className="material-symbols-outlined rounded-lg bg-panel-3 p-2 text-ink-muted-3">person</span><span className="min-w-0 flex-1"><span className="block break-words font-bold text-ink-strong">{user.name}</span><span className="mt-1 block text-sm text-ink-muted-3">{user.role} · {companyName(user)}</span></span><span className={`rounded-full px-2 py-1 text-xs font-bold ${user.isActive ? 'text-ink-success' : 'text-ink-muted-3'}`}>{user.isActive ? 'Activo' : 'Inactivo'}</span>
        </button></li>)}</ul>}
      </div>
      {archived ? <section className="space-y-5 rounded-2xl border border-edge-outline bg-panel p-4 sm:p-6"><h3 className="text-lg font-bold text-ink-strong">{selected ? `Restaurar ${selected.name}` : 'Usuarios archivados'}</h3>{selected ? <form onSubmit={e => { e.preventDefault(); void changeArchived(false); }} className="space-y-4"><p className="text-sm text-ink-muted-3">El usuario volverá inactivo. Revisa su perfil y empresa antes de activarlo.</p><label className="block text-sm font-semibold text-ink-strong">Nuevo PIN para restaurar<input type="password" inputMode="numeric" pattern="[0-9]{6,12}" required value={restorePin} onChange={e => setRestorePin(e.target.value)} className={fieldClass} /></label><button type="submit" disabled={busy || offline} className="min-h-11 rounded-xl bg-primary-container px-5 py-2 font-bold text-on-primary-fixed disabled:opacity-50">Restaurar usuario</button></form> : <p className="text-sm text-ink-muted-3">Selecciona un usuario para restaurarlo.</p>}</section> : <form onSubmit={save} className="space-y-5 rounded-2xl border border-edge-outline bg-panel p-4 sm:p-6">
        <div><h3 className="text-lg font-bold text-ink-strong">{selected ? `Editar ${selected.name}` : 'Nuevo usuario'}</h3><p className="mt-1 text-sm text-ink-muted-3">{selected ? 'Actualiza sus datos y permisos de acceso.' : 'Completa los datos para añadir una persona al equipo.'}</p></div>
        <label className="block text-sm font-semibold text-ink-strong">Nombre<input required maxLength={120} className={fieldClass} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
        <div className="grid gap-5 sm:grid-cols-2"><label className="block text-sm font-semibold text-ink-strong">Perfil<select aria-label="Perfil" className={fieldClass} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>{!roles.includes(form.role) && <option value={form.role}>{form.role} (requiere equivalencia)</option>}{roles.map(role => <option key={role}>{role}</option>)}</select></label>
        <label className="block text-sm font-semibold text-ink-strong">Empresa<select aria-label="Empresa" aria-describedby="company-help" className={fieldClass} value={form.companyId} onChange={e => setForm({ ...form, companyId: e.target.value })}><option value="">Ambas empresas</option>{companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label></div>
        <p id="company-help" className="text-sm text-ink-muted-3">El acceso se limita a la empresa elegida; selecciona ambas si corresponde.</p>
        <label className="block text-sm font-semibold text-ink-strong">{selected ? 'Nuevo PIN (dejar vacío para conservar)' : 'PIN'}<input type="password" inputMode="numeric" pattern="[0-9]{6,12}" required={!selected} autoComplete="new-password" aria-describedby="pin-help" className={fieldClass} value={form.pin} onChange={e => setForm({ ...form, pin: e.target.value })} /></label>
        <p id="pin-help" className="text-sm text-ink-muted-3">PIN personal y único de 6 a 12 dígitos.{selected ? ' Déjalo vacío para conservar el actual.' : ''}</p>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-edge-outline p-3 text-sm font-semibold text-ink-strong"><input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} /> Usuario activo</label>
        {selected && <p className="text-sm text-ink-muted-3">Cambiar el perfil, la empresa, el PIN o el estado cerrará las sesiones de este usuario.</p>}
        <div className="flex flex-wrap gap-3"><button type="submit" disabled={busy || offline} className="min-h-11 rounded-xl bg-primary-container px-5 py-2 font-bold text-on-primary-fixed disabled:opacity-50">{busy ? 'Guardando…' : 'Guardar'}</button><button type="button" disabled={busy} onClick={() => changeSelection(null)} className="min-h-11 rounded-xl border border-edge-outline px-4 py-2 text-ink-strong disabled:opacity-50">Nuevo</button></div>
        {selected && <button type="button" disabled={busy || offline} onClick={() => setConfirmArchive(true)} className="min-h-11 rounded-xl border border-edge-danger px-4 text-ink-danger disabled:opacity-50">Archivar usuario</button>}
        {selected && confirmArchive && <div role="alertdialog" aria-label="Confirmar archivo de usuario" className="space-y-3 rounded-xl border border-edge-warning-2 p-4"><p className="text-sm text-ink-strong">Se cerrarán las sesiones de {selected.name}. Sus ventas, auditoría y operaciones pendientes se conservarán.</p><div className="flex gap-3"><button type="button" disabled={busy || offline} onClick={() => void changeArchived(true)} className="min-h-11 rounded-xl bg-primary-container px-4 font-bold text-on-primary-fixed">Confirmar archivo</button><button type="button" onClick={() => setConfirmArchive(false)} className="min-h-11 rounded-xl border border-edge-outline px-4">Cancelar</button></div></div>}
      </form>}
    </div>
  </section>;
};
