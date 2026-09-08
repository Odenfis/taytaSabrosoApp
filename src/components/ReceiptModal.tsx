import React from 'react';
import { usePOS } from '../context/POSContext';

export const ReceiptModal: React.FC = () => {
  const { isReceiptModalOpen, setIsReceiptModalOpen, lastCompletedOrder, setCurrentScreen } = usePOS();

  if (!isReceiptModalOpen || !lastCompletedOrder) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleClose = () => {
    setIsReceiptModalOpen(false);
    setCurrentScreen('mesas');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#1e1e1e] border border-[#54433c] rounded-2xl w-full max-w-md p-6 shadow-[0_16px_50px_rgba(0,0,0,0.8)] space-y-6 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#54433c]/60">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-emerald-400">check_circle</span>
            <h2 className="text-[18px] font-bold text-[#e5e2e1]">Pago Completado con Éxito</h2>
          </div>
          <button
            onClick={handleClose}
            className="text-[#dac1b8] hover:text-[#e5e2e1] p-1.5 rounded-lg hover:bg-[#2a2a2a]"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Printable Ticket Receipt Paper Design */}
        <div
          id="receipt-paper"
          className="bg-white text-zinc-900 font-mono p-6 rounded-xl shadow-inner border border-zinc-300 text-[13px] leading-tight flex flex-col gap-3 select-text"
        >
          <div className="text-center space-y-1 pb-3 border-b border-dashed border-zinc-400">
            <h3 className="text-[18px] font-bold tracking-wider font-sans uppercase">El Tayta POS</h3>
            <p className="text-[11px] text-zinc-600">Restaurante & Tradición Criolla</p>
            <p className="text-[11px] text-zinc-600">RUC: 20601234567 • Av. Principal 450, Lima</p>
            <p className="text-[12px] font-bold mt-1 text-zinc-800">
              BOLETA ELECTRÓNICA #{lastCompletedOrder.ticketNumber}
            </p>
          </div>

          <div className="grid grid-cols-2 text-[11px] gap-y-1 text-zinc-700 py-1 border-b border-dashed border-zinc-300">
            <div>
              <span className="font-semibold">Mesa:</span> {lastCompletedOrder.tableNumber} ({lastCompletedOrder.zone})
            </div>
            <div className="text-right">
              <span className="font-semibold">Hora:</span> {lastCompletedOrder.closedAt || lastCompletedOrder.createdAt}
            </div>
            <div>
              <span className="font-semibold">Atendido por:</span> {lastCompletedOrder.waiter}
            </div>
            <div className="text-right">
              <span className="font-semibold">Pago:</span> {lastCompletedOrder.paymentMethod || 'Efectivo'}
            </div>
          </div>

          {/* Items table */}
          <div className="py-2 border-b border-dashed border-zinc-300 space-y-1.5">
            <div className="flex justify-between font-bold text-[11px] text-zinc-800 uppercase">
              <span>Cant / Descripción</span>
              <span>Total</span>
            </div>
            {lastCompletedOrder.items.map((item) => (
              <div key={item.id} className="flex justify-between items-start text-[12px]">
                <div className="flex-1 pr-2">
                  <span>{item.quantity}x {item.name}</span>
                  {item.notes && (
                    <div className="text-[10px] text-zinc-500 italic pl-3">
                      * {item.notes}
                    </div>
                  )}
                </div>
                <span className="font-medium shrink-0">
                  S/ {(item.price * item.quantity).toFixed(2)}
                </span>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="space-y-1 text-[12px] text-zinc-700 pt-1">
            <div className="flex justify-between">
              <span>Op. Gravada / Subtotal:</span>
              <span>S/ {lastCompletedOrder.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>I.G.V. (18%):</span>
              <span>S/ {lastCompletedOrder.igv.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-[16px] font-bold text-zinc-950 pt-1.5 border-t border-zinc-400">
              <span>TOTAL:</span>
              <span>S/ {lastCompletedOrder.total.toFixed(2)}</span>
            </div>

            {lastCompletedOrder.amountReceived && lastCompletedOrder.amountReceived > 0 && (
              <>
                <div className="flex justify-between text-[11px] text-zinc-600 pt-1">
                  <span>Monto Recibido:</span>
                  <span>S/ {lastCompletedOrder.amountReceived.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-[12px] font-bold text-emerald-700">
                  <span>VUELTO:</span>
                  <span>S/ {(lastCompletedOrder.change || 0).toFixed(2)}</span>
                </div>
              </>
            )}
          </div>

          {/* Footer note */}
          <div className="text-center pt-3 border-t border-dashed border-zinc-400 text-[10px] text-zinc-500 space-y-0.5">
            <p>¡Gracias por su preferencia!</p>
            <p>Representación impresa de la Boleta de Venta Electrónica</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handlePrint}
            className="flex-1 bg-[#2a2a2a] hover:bg-[#353535] text-[#e5e2e1] py-3 rounded-xl text-[14px] font-semibold flex items-center justify-center gap-2 transition-colors border border-[#54433c]"
          >
            <span className="material-symbols-outlined text-[20px]">print</span>
            <span>Imprimir Ticket</span>
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 bg-[#823b19] hover:bg-[#944926] text-white py-3 rounded-xl text-[14px] font-bold flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">table_restaurant</span>
            <span>Volver a Mesas</span>
          </button>
        </div>
      </div>
    </div>
  );
};
