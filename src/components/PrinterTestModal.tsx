import React from 'react';
import { usePOS } from '../context/POSContext';

export const PrinterTestModal: React.FC = () => {
  const { isPrinterTestModalOpen, setIsPrinterTestModalOpen, lastPrintedTicket } = usePOS();

  if (!isPrinterTestModalOpen || !lastPrintedTicket) return null;

  const handleBrowserPrint = () => {
    window.print();
  };

  return (
    <div
      id="printer-test-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-surface-scrim backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="bg-panel border border-edge-outline rounded-2xl w-full max-w-md flex flex-col shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-edge-outline-2 flex items-center justify-between bg-panel-2">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-[22px] text-ink-gold">print</span>
            <h3 className="text-[16px] font-bold text-ink-strong">
              Emisión de Ticket: {lastPrintedTicket.printerName}
            </h3>
          </div>
          <button
            onClick={() => setIsPrinterTestModalOpen(false)}
            className="text-ink-muted hover:text-ink-strong p-1 rounded-lg hover:bg-panel-3"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Realistic Thermal Receipt Visualizer */}
        <div className="p-5 bg-panel-4 flex flex-col items-center">
          <div className="w-full max-w-[320px] bg-white text-black font-mono text-[11px] leading-relaxed p-5 shadow-2xl rounded-sm border-t-8 border-dashed border-[#dcdcdc] relative">
            <pre className="whitespace-pre-wrap font-mono text-[11px] text-zinc-900 select-all">
              {lastPrintedTicket.content}
            </pre>
            <div className="w-full h-3 border-b-8 border-dashed border-[#dcdcdc] mt-4" />
          </div>
        </div>

        {/* Footer controls */}
        <div className="p-4 bg-panel-2 border-t border-edge-outline-3 flex items-center justify-between gap-3">
          <span className="text-[11px] text-ink-muted">
            Simulación ESC/POS 80mm
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsPrinterTestModalOpen(false)}
              className="px-3 py-1.5 rounded-xl text-[12px] font-bold text-ink-muted-2 hover:bg-panel-3"
            >
              Cerrar
            </button>
            <button
              onClick={handleBrowserPrint}
              className="px-4 py-1.5 rounded-xl bg-surface-brand-solid hover:bg-surface-brand-hover-alt text-ink-on-brand text-[12px] font-bold flex items-center gap-1.5 shadow-md"
            >
              <span className="material-symbols-outlined text-[16px]">print</span>
              Imprimir Físico (Diálogo)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
