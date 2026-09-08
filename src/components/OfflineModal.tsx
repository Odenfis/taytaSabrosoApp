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
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="bg-[#1c1b1b] border border-[#54433c] rounded-2xl w-full max-w-xl flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#54433c]/60 flex items-center justify-between bg-[#161515]">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                offlineState.isOnline
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-400'
                  : 'bg-amber-950/50 border-amber-500/40 text-amber-400'
              }`}
            >
              <span className="material-symbols-outlined text-[24px]">
                {offlineState.isOnline ? 'wifi' : 'wifi_off'}
              </span>
            </div>
            <div>
              <h2 className="text-[17px] font-bold text-white">
                Resiliencia &amp; Modo Offline (Sin Conexión)
              </h2>
              <p className="text-[12px] text-[#dac1b8]/70">
                Arquitectura de operación local continua para restaurantes
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsOfflineModalOpen(false)}
            className="text-[#dac1b8]/60 hover:text-white p-1 rounded-lg hover:bg-[#2a2a2a]"
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
                ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                : 'bg-amber-950/30 border-amber-500/40 text-amber-300'
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
                  ? 'bg-amber-950/60 border-amber-500/50 text-amber-300 hover:bg-amber-900/60'
                  : 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300 hover:bg-emerald-900/60'
              }`}
            >
              {offlineState.isOnline ? 'Simular Corte de Red' : 'Restablecer Conexión'}
            </button>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="bg-[#141313] border border-[#54433c]/40 p-3 rounded-xl">
              <span className="text-[11px] text-[#dac1b8]/60 font-semibold">Comandas Pendientes de Subida</span>
              <p className="text-[20px] font-black text-white mt-0.5">{offlineState.pendingSyncCount}</p>
            </div>
            <div className="bg-[#141313] border border-[#54433c]/40 p-3 rounded-xl">
              <span className="text-[11px] text-[#dac1b8]/60 font-semibold">Última Sincronización</span>
              <p className="text-[16px] font-bold text-[#ebc246] mt-1">{offlineState.lastSyncTime}</p>
            </div>
          </div>

          {/* Technical Strategy Card for Client */}
          <div className="bg-[#141313] border border-[#54433c]/50 rounded-xl p-3.5 space-y-2">
            <h4 className="text-[13px] font-bold text-[#ffdbcd] flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-[#ebc246]">verified</span>
              Estrategia Arquitectónica Offline-First
            </h4>
            <ul className="text-[12px] text-[#dac1b8]/80 space-y-1.5 pl-4 list-disc">
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
        <div className="p-4 bg-[#161515] border-t border-[#54433c]/50 flex items-center justify-between">
          <span className="text-[11px] text-[#dac1b8]/60">PWA Offline Storage Engine</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsOfflineModalOpen(false)}
              className="px-3.5 py-1.5 rounded-xl text-[12px] font-bold text-[#dac1b8] hover:bg-[#2a2a2a]"
            >
              Cerrar
            </button>
            <button
              onClick={syncOfflineQueue}
              className="px-4 py-1.5 rounded-xl bg-[#823b19] hover:bg-[#9a451e] text-[#ffdbcd] text-[12px] font-bold flex items-center gap-1.5 shadow-md"
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
