import React, { useState } from 'react';

interface ItemNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemName: string;
  currentNotes: string;
  onSave: (notes: string) => void;
}

const QUICK_NOTES = [
  'Sin cebolla',
  'Término medio',
  'Bien cocido',
  'Poco picante',
  'Sin picante',
  'Hielo aparte',
  'Sin azúcar',
  'Para llevar',
  'Servir primero',
  'Con salsa aparte',
];

export const ItemNotesModal: React.FC<ItemNotesModalProps> = ({
  isOpen,
  onClose,
  itemName,
  currentNotes,
  onSave,
}) => {
  const [notes, setNotes] = useState(currentNotes);

  if (!isOpen) return null;

  const handleQuickAdd = (chip: string) => {
    if (notes.includes(chip)) return;
    setNotes((prev) => (prev ? `${prev}, ${chip}` : chip));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(notes.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-[#1e1e1e] border border-[#54433c] rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-[#54433c]/60">
          <div>
            <h2 className="text-[17px] font-bold text-[#e5e2e1]">Instrucciones de Cocina</h2>
            <p className="text-[13px] text-[#ffb597] font-semibold">{itemName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-[#dac1b8] hover:text-[#e5e2e1] p-1.5 rounded-lg hover:bg-[#2a2a2a]"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Quick Chips */}
        <div>
          <label className="text-[12px] font-semibold text-[#dac1b8] block mb-2">
            Notas rápidas comunes:
          </label>
          <div className="flex flex-wrap gap-2">
            {QUICK_NOTES.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => handleQuickAdd(chip)}
                className="bg-[#2a2a2a] hover:bg-[#353535] border border-[#54433c] text-[#e5e2e1] px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors active:scale-95"
              >
                + {chip}
              </button>
            ))}
          </div>
        </div>

        {/* Textarea */}
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="text-[12px] font-semibold text-[#dac1b8] block mb-1.5">
              Nota personalizada:
            </label>
            <textarea
              rows={3}
              placeholder="Ej: Sin sal, alérgico al marisco, término 3/4..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-[#2d2d2d] border border-[#54433c] focus:border-[#60d4fb] rounded-xl p-3 text-[#e5e2e1] text-[14px] focus:outline-none resize-none"
            />
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                setNotes('');
                onSave('');
                onClose();
              }}
              className="px-4 py-2.5 bg-[#2a2a2a] hover:bg-[#353535] text-[#dac1b8] rounded-xl text-[13px] font-semibold transition-colors"
            >
              Borrar Nota
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-[#2a2a2a] hover:bg-[#353535] text-[#dac1b8] py-2.5 rounded-xl text-[13px] font-semibold transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 bg-[#60d4fb] hover:bg-[#b7eaff] text-[#003543] py-2.5 rounded-xl text-[13px] font-bold transition-all shadow-md active:scale-95"
            >
              Guardar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
