import React from 'react';
import { usePOS } from '../context/POSContext';

export const OfflineModal: React.FC = () => {
  const {
    isOfflineModalOpen,
    setIsOfflineModalOpen,
    offlineState,
    toggleSimulatedOffline,
    syncOfflineQueue,
  } = usePOS();

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
                  ? 'Todas las comandas, cierres y compras se sincronizan en tiempo real.'
                  : 'Sin internet detectado. El POS continúa operando al 100% en la memoria local.'}
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

          {/* Technical Strategy Card for Client */}
          <div className="bg-panel-29 border border-edge-outline-3 rounded-xl p-3.5 space-y-2">
            <h4 className="text-[13px] font-bold text-ink-heading-brand flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-ink-gold">verified</span>
              Estrategia Arquitectónica Offline-First
            </h4>
            <ul className="text-[12px] text-ink-muted-5 space-y-1.5 pl-4 list-disc">
              <li>
                <strong>Almacenamiento Local (IndexedDB &amp; LocalStorage):</strong> Las comandas, cobros, mesas y compras se persisten localmente con claves únicas (UUID), garantizando que ningún mozo o cajero se detenga ante cortes de fibra o wifi.
              </li>
              <li>
                <strong>Cola Transaccional FIFO:</strong> Cada comanda y ticket emitido offline se almacena en una cola inmutable con marca de tiempo.
              </li>
              <li>
                <strong>Sincronización Automática con Idempotencia:</strong> Al reconectar el router, el worker sube los lotes de datos asegurando que no existan duplicados de folios ni desajustes de Kardex.
              </li>
            </ul>
          </div>
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
