import { requiresProvenanceReview } from '../lib/offlineProvenance';
import React, { useEffect, useState } from 'react';
import { usePOS } from '../context/POSContext';
import { loadQueue, QUEUE_PROOF_EVENT } from '../lib/offlineQueue';
import { canSignOffline, offlineProofMatches } from '../lib/offlineSigning';
import type { PendingOp } from '../types';

export const OfflineModal: React.FC = () => {
  const {
    isOfflineModalOpen,
    setIsOfflineModalOpen,
    offlineState,
    toggleSimulatedOffline,
    syncOfflineQueue,
    assumeOfflineOperation,
    currentUser,
  } = usePOS();

  const [pending, setPending] = useState<PendingOp[]>([]);
  useEffect(() => {
    if (!isOfflineModalOpen || currentUser?.role !== 'Administrador') return;
    const refresh = () => setPending(loadQueue());
    refresh();
    window.addEventListener(QUEUE_PROOF_EVENT, refresh);
    return () => window.removeEventListener(QUEUE_PROOF_EVENT, refresh);
  }, [isOfflineModalOpen, currentUser?.role, offlineState.pendingSyncCount]);

  const isGlobalAdmin = !!currentUser && currentUser.role === 'Administrador'
    && !currentUser.companyId && !currentUser.assignedCompanyId;

  if (!isOfflineModalOpen) return null;

  return (
    <div
      id="offline-resilience-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-surface-scrim backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="bg-panel border border-edge-outline rounded-2xl w-full max-w-xl flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-edge-outline-2 flex items-center justify-between bg-panel-2">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                offlineState.isOnline
                  ? 'bg-surface-success-strong-6 border-edge-success text-ink-success'
                  : 'bg-surface-warning-strong-8 border-edge-warning-3 text-ink-warning-3'
              }`}
            >
              <span className="material-symbols-outlined text-[24px]">
                {offlineState.isOnline ? 'wifi' : 'wifi_off'}
              </span>
            </div>
            <div>
              <h2 className="text-[17px] font-bold text-ink-strong">
                Resiliencia &amp; Modo Offline (Sin Conexión)
              </h2>
              <p className="text-[12px] text-ink-muted-3">
                Arquitectura de operación local continua para restaurantes
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsOfflineModalOpen(false)}
            className="text-ink-muted hover:text-ink-strong p-1 rounded-lg hover:bg-panel-3"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto">
          {/* Status Banner */}
          <div
            className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
              offlineState.isOnline
                ? 'bg-surface-success-strong-7 border-edge-success-2 text-ink-success-2'
                : 'bg-surface-warning-strong-9 border-edge-warning-3 text-ink-warning-2'
            }`}
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-current animate-ping" />
                <span className="text-[14px] font-bold">
                  {offlineState.isOnline ? 'Conectado a la Nube (Online)' : 'Operando en Modo Offline Local'}
                </span>
              </div>
              <p className="text-[12px] opacity-80">
                {offlineState.isOnline
                  ? 'Las operaciones pendientes se conservan en este equipo y se revisan al sincronizar.'
                  : 'Los cambios pendientes se guardan en este equipo y pueden requerir revisión al reconectar.'}
              </p>
            </div>

            <button
              onClick={toggleSimulatedOffline}
              className={`px-3 py-1.5 rounded-xl text-[12px] font-bold border shrink-0 transition-all ${
                offlineState.isOnline
                  ? 'bg-surface-warning-strong-7 border-edge-warning-2 text-ink-warning-2 hover:bg-surface-warning-strong-10'
                  : 'bg-surface-success-strong-5 border-edge-success-3 text-ink-success-2 hover:bg-surface-success-strong-8'
              }`}
            >
              {offlineState.isOnline ? 'Simular Corte de Red' : 'Restablecer Conexión'}
            </button>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="bg-panel-29 border border-edge-outline-5 p-3 rounded-xl">
              <span className="text-[11px] text-ink-muted font-semibold">Comandas Pendientes de Subida</span>
              <p className="text-[20px] font-black text-ink-strong mt-0.5">{offlineState.pendingSyncCount}</p>
            </div>
            <div className="bg-panel-29 border border-edge-outline-5 p-3 rounded-xl">
              <span className="text-[11px] text-ink-muted font-semibold">Última Sincronización</span>
              <p className="text-[16px] font-bold text-ink-gold mt-1">{offlineState.lastSyncTime}</p>
            </div>
          </div>

          {/* Estado de operaciones pendientes */}
          <div className="bg-panel-29 border border-edge-outline-3 rounded-xl p-3.5 space-y-2">
            <h4 className="text-[13px] font-bold text-ink-heading-brand flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-ink-gold">verified</span>
              Operaciones pendientes
            </h4>
            <ul className="text-[12px] text-ink-muted-5 space-y-1.5 pl-4 list-disc">
              <li>
                Los cambios pendientes permanecen en este equipo hasta que se confirmen o se revisen.
              </li>
              <li>
                Los pendientes antiguos o pertenecientes a otra sesión pueden detener la sincronización y requieren revisión.
              </li>
              <li>
                Un resultado incierto o un conflicto se conserva para evitar repetir un cobro sin comprobarlo.
              </li>
            </ul>
          </div>
          {currentUser?.role === 'Administrador' && pending.length > 0 && <section className="bg-panel-29 border border-edge-outline-3 rounded-xl p-3.5 space-y-2">
            <h4 className="text-[13px] font-bold text-ink-heading-brand">Pendientes en este equipo</h4>
            <p className="text-[12px] text-ink-muted-5">
              Las operaciones con prueba firmada pueden verificarse en el servidor antes de aplicarse.
              Las que no tengan una prueba válida se conservan para revisión. La asunción de una firma ajena queda auditada.
            </p>
            {!canSignOffline() && <p className="text-[12px] text-ink-warning-2" role="alert">
              Esta terminal no puede firmar (requiere HTTPS o localhost). Las operaciones sin firma no se sincronizarán.
            </p>}
            <ul className="space-y-2 max-h-44 overflow-y-auto">{pending.map((op) => {
              const signed = (op.proofs ?? []).some((proof) => offlineProofMatches(op, proof));
              const action = (op.proofs ?? []).map((proof) => proof.action).filter((value, index, all) => all.indexOf(value) === index).join(', ');
              return <li key={op.clientOpId} className="text-[12px] border border-edge-outline-3 rounded-lg p-2">
                <strong>{op.op}</strong> · {op.createdAt}<br />
                Autor: {op.authorId || 'sin identificar'} · Empresa: {op.companyId || 'sin identificar'}<br />
                Terminal: {op.deviceId || 'sin identificar'} · Firma: {signed ? 'coincide con el contenido; pendiente de verificación del servidor' : 'sin prueba coincidente'}<br />
                {requiresProvenanceReview(op.clientOpId) && <p role="alert">Pendiente anterior a la actualización: la terminal pudo haber sido inferida. Requiere revisión expresa; su identidad no se reconstruirá automáticamente.</p>}
                {action && <span>Accion firmada: {action}<br /></span>}
                {op.error && <span role="alert">Requiere revisión: {op.error}</span>}
                <details className="mt-2"><summary>Revisar contenido declarado</summary><pre className="whitespace-pre-wrap break-all">{JSON.stringify(op.payload, null, 2)}</pre></details>
                {isGlobalAdmin && <button onClick={() => assumeOfflineOperation(op.clientOpId)} className="mt-2 px-3 py-1.5 rounded-xl border border-edge-warning-2 text-ink-warning-2">Asumir esta operación</button>}
              </li>;
            })}</ul>
          </section>}
        </div>

        {/* Footer */}
        <div className="p-4 bg-panel-2 border-t border-edge-outline-3 flex items-center justify-between">
          <span className="text-[11px] text-ink-muted">PWA Offline Storage Engine</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsOfflineModalOpen(false)}
              className="px-3.5 py-1.5 rounded-xl text-[12px] font-bold text-ink-muted-2 hover:bg-panel-3"
            >
              Cerrar
            </button>
            <button
              onClick={syncOfflineQueue}
              className="px-4 py-1.5 rounded-xl bg-surface-brand-solid hover:bg-surface-brand-hover-alt text-ink-on-brand text-[12px] font-bold flex items-center gap-1.5 shadow-md"
            >
              <span className="material-symbols-outlined text-[16px]">cloud_sync</span>
              Sincronizar Lote Ahora
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
