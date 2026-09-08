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
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="bg-[#1c1b1b] border border-[#54433c] rounded-2xl w-full max-w-md flex flex-col shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-[#54433c]/60 flex items-center justify-between bg-[#161515]">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-[22px] text-[#ebc246]">print</span>
            <h3 className="text-[16px] font-bold text-white">
              Emisión de Ticket: {lastPrintedTicket.printerName}
            </h3>
          </div>
          <button
            onClick={() => setIsPrinterTestModalOpen(false)}
            className="text-[#dac1b8]/60 hover:text-white p-1 rounded-lg hover:bg-[#2a2a2a]"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Realistic Thermal Receipt Visualizer */}
        <div className="p-5 bg-[#121212] flex flex-col items-center">
          <div className="w-full max-w-[320px] bg-white text-black font-mono text-[11px] leading-relaxed p-5 shadow-2xl rounded-sm border-t-8 border-dashed border-[#dcdcdc] relative">
            <pre className="whitespace-pre-wrap font-mono text-[11px] text-zinc-900 select-all">
              {lastPrintedTicket.content}
            </pre>
            <div className="w-full h-3 border-b-8 border-dashed border-[#dcdcdc] mt-4" />
          </div>
        </div>

        {/* Footer controls */}
        <div className="p-4 bg-[#161515] border-t border-[#54433c]/50 flex items-center justify-between gap-3">
          <span className="text-[11px] text-[#dac1b8]/60">
            Simulación ESC/POS 80mm
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsPrinterTestModalOpen(false)}
              className="px-3 py-1.5 rounded-xl text-[12px] font-bold text-[#dac1b8] hover:bg-[#2a2a2a]"
            >
              Cerrar
            </button>
            <button
              onClick={handleBrowserPrint}
              className="px-4 py-1.5 rounded-xl bg-[#823b19] hover:bg-[#9a451e] text-[#ffdbcd] text-[12px] font-bold flex items-center gap-1.5 shadow-md"
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
