import React, { useState } from 'react';
import { usePOS } from '../context/POSContext';
import { Zone, TableStatus } from '../types';

interface NewTableModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewTableModal: React.FC<NewTableModalProps> = ({ isOpen, onClose }) => {
  const { addNewTable, openQuickOrder, activeCompanyId } = usePOS();
  const [tableNumber, setTableNumber] = useState('');
  const [capacity, setCapacity] = useState('4');
  const [zone, setZone] = useState<Zone>('Salón Principal');

  if (!isOpen) return null;

  const handleCreateTable = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tableNumber.trim()) return;
    addNewTable(tableNumber, parseInt(capacity) || 4, zone);
    onClose();
    setTableNumber('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-scrim-2 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-panel-15 border border-edge-outline rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-6 animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-edge-outline-2">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-ink-brand">add_box</span>
            <h2 className="text-[18px] font-bold text-ink-body">Nueva Mesa o Pedido Rápido</h2>
          </div>
          <button
            onClick={onClose}
            className="text-ink-muted-2 hover:text-ink-body p-1.5 rounded-lg hover:bg-panel-3"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {activeCompanyId !== 'el-sabroso' && <div className="grid grid-cols-2 gap-3">
          {(['Delivery', 'Llevar'] as const).map((serviceZone) => <button key={serviceZone} type="button"
            onClick={() => { openQuickOrder(serviceZone); onClose(); }}
            className="bg-surface-brand-solid text-ink-on-brand rounded-xl px-3 py-3 font-bold">
            Nuevo {serviceZone}
          </button>)}
          <p className="col-span-2 text-xs text-ink-muted-2">El número se asigna al sincronizar, desde la mesa 36.</p>
        </div>}

        {/* Quick Order Shortcut */}
        <div className="bg-panel-3 border border-edge-outline-2 rounded-xl p-4 flex items-center justify-between">
          <div>
            <h3 className="text-[14px] font-bold text-ink-gold">Pedido Rápido de Barra</h3>
            <p className="text-[12px] text-ink-muted-5 mt-0.5">Usa una silla de Barra disponible.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              openQuickOrder('Barra');
              onClose();
            }}
            className="bg-surface-gold-2 text-ink-on-accent px-3.5 py-2 rounded-lg text-[13px] font-bold hover:bg-surface-gold-soft active:scale-95 transition-all shadow shrink-0"
          >
            Abrir Comanda
          </button>
        </div>

        <div className="relative flex items-center py-1">
          <div className="flex-grow border-t border-edge-outline-3"></div>
          <span className="flex-shrink mx-3 text-[12px] text-ink-muted uppercase tracking-wider font-semibold">o crear mesa física</span>
          <div className="flex-grow border-t border-edge-outline-3"></div>
        </div>

        {/* Create Physical Table Form */}
        {activeCompanyId === 'el-sabroso' && <form onSubmit={handleCreateTable} className="space-y-4">
          <div>
            <label className="text-[13px] font-semibold text-ink-body block mb-1.5">
              Número / Identificador de Mesa
            </label>
            <input
              type="text"
              required
              placeholder="Ej: 07, T5, Terraza VIP"
              value={tableNumber}
              onChange={(e) => setTableNumber(e.target.value)}
              className="w-full bg-panel-16 border border-edge-outline focus:border-edge-brand rounded-xl px-4 py-2.5 text-ink-body text-[15px] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[13px] font-semibold text-ink-body block mb-1.5">
                Capacidad (Comensales)
              </label>
              <select
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                className="w-full bg-panel-16 border border-edge-outline focus:border-edge-brand rounded-xl px-3 py-2.5 text-ink-body text-[14px] focus:outline-none"
              >
                <option value="1">1 Persona</option>
                <option value="2">2 Personas</option>
                <option value="4">4 Personas</option>
                <option value="6">6 Personas</option>
                <option value="8">8 Personas</option>
                <option value="10">10+ Personas</option>
              </select>
            </div>

            <div>
              <label className="text-[13px] font-semibold text-ink-body block mb-1.5">
                Zona
              </label>
              <select
                value={zone}
                onChange={(e) => setZone(e.target.value as Zone)}
                className="w-full bg-panel-16 border border-edge-outline focus:border-edge-brand rounded-xl px-3 py-2.5 text-ink-body text-[14px] focus:outline-none"
              >
                <option value="Salón Principal">Salón Principal</option>
                <option value="Terraza">Terraza</option>
                <option value="Barra">Barra</option>
              </select>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-panel-3 hover:bg-panel-17 text-ink-muted-2 py-3 rounded-xl text-[14px] font-semibold transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 bg-surface-brand-solid hover:bg-surface-brand-hover text-ink-on-solid py-3 rounded-xl text-[14px] font-bold transition-all shadow-md active:scale-95"
            >
              Crear Mesa
            </button>
          </div>
        </form>}
      </div>
    </div>
  );
};
