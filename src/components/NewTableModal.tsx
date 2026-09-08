import React, { useState } from 'react';
import { usePOS } from '../context/POSContext';
import { Zone, TableStatus } from '../types';

interface NewTableModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewTableModal: React.FC<NewTableModalProps> = ({ isOpen, onClose }) => {
  const { addNewTable, openQuickOrder } = usePOS();
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-[#1e1e1e] border border-[#54433c] rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-6 animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-[#54433c]/60">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#ffb597]">add_box</span>
            <h2 className="text-[18px] font-bold text-[#e5e2e1]">Nueva Mesa o Pedido Rápido</h2>
          </div>
          <button
            onClick={onClose}
            className="text-[#dac1b8] hover:text-[#e5e2e1] p-1.5 rounded-lg hover:bg-[#2a2a2a]"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Quick Order Shortcut */}
        <div className="bg-[#2a2a2a] border border-[#54433c]/60 rounded-xl p-4 flex items-center justify-between">
          <div>
            <h3 className="text-[14px] font-bold text-[#ebc246]">Pedido Rápido (Barra / Para Llevar)</h3>
            <p className="text-[12px] text-[#dac1b8]/80 mt-0.5">Abre una comanda exprés sin asignar mesa física.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              openQuickOrder('Barra');
              onClose();
            }}
            className="bg-[#ebc246] text-[#3d2f00] px-3.5 py-2 rounded-lg text-[13px] font-bold hover:bg-[#ffe08b] active:scale-95 transition-all shadow shrink-0"
          >
            Abrir Comanda
          </button>
        </div>

        <div className="relative flex items-center py-1">
          <div className="flex-grow border-t border-[#54433c]/50"></div>
          <span className="flex-shrink mx-3 text-[12px] text-[#dac1b8]/60 uppercase tracking-wider font-semibold">o crear mesa física</span>
          <div className="flex-grow border-t border-[#54433c]/50"></div>
        </div>

        {/* Create Physical Table Form */}
        <form onSubmit={handleCreateTable} className="space-y-4">
          <div>
            <label className="text-[13px] font-semibold text-[#e5e2e1] block mb-1.5">
              Número / Identificador de Mesa
            </label>
            <input
              type="text"
              required
              placeholder="Ej: 07, T5, Terraza VIP"
              value={tableNumber}
              onChange={(e) => setTableNumber(e.target.value)}
              className="w-full bg-[#2d2d2d] border border-[#54433c] focus:border-[#ffb597] rounded-xl px-4 py-2.5 text-[#e5e2e1] text-[15px] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[13px] font-semibold text-[#e5e2e1] block mb-1.5">
                Capacidad (Comensales)
              </label>
              <select
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                className="w-full bg-[#2d2d2d] border border-[#54433c] focus:border-[#ffb597] rounded-xl px-3 py-2.5 text-[#e5e2e1] text-[14px] focus:outline-none"
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
              <label className="text-[13px] font-semibold text-[#e5e2e1] block mb-1.5">
                Zona
              </label>
              <select
                value={zone}
                onChange={(e) => setZone(e.target.value as Zone)}
                className="w-full bg-[#2d2d2d] border border-[#54433c] focus:border-[#ffb597] rounded-xl px-3 py-2.5 text-[#e5e2e1] text-[14px] focus:outline-none"
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
              className="flex-1 bg-[#2a2a2a] hover:bg-[#353535] text-[#dac1b8] py-3 rounded-xl text-[14px] font-semibold transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 bg-[#823b19] hover:bg-[#944926] text-white py-3 rounded-xl text-[14px] font-bold transition-all shadow-md active:scale-95"
            >
              Crear Mesa
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
