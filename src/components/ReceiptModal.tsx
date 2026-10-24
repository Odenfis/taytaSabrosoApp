import React, { useMemo, useState } from 'react';
import { usePOS } from '../context/POSContext';
import { shareVoucherImage, VoucherHeader } from '../lib/voucherImage';

const WhatsAppIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 016.988 2.898 9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

export const ReceiptModal: React.FC = () => {
  const {
    isReceiptModalOpen,
    setIsReceiptModalOpen,
    receiptMode,
    lastCompletedOrder,
    setCurrentScreen,
    companies,
    addNotification,
  } = usePOS();
  const isPaid = receiptMode === 'paid';
  const [isSharing, setIsSharing] = useState(false);

  const companyHeader = useMemo<VoucherHeader>(() => {
    const cid = lastCompletedOrder?.companyId;
    if (!cid) return { name: 'Empresa sin identificar', ruc: '—', slogan: '', address: '' };
    const c = companies.find((x) => x.id === cid);
    return {
      name: c?.tradeName ?? cid,
      ruc: c?.ruc ?? '—',
      slogan: c?.specialty ?? '',
      address: c?.address ?? '',
    };
  }, [companies, lastCompletedOrder]);

  if (!isReceiptModalOpen || !lastCompletedOrder) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleShareWhatsApp = async () => {
    if (isSharing) return;
    setIsSharing(true);
    try {
      await shareVoucherImage(lastCompletedOrder, companyHeader, isPaid, (msg) =>
        addNotification('Compartir voucher', msg, 'info'),
      );
    } finally {
      setIsSharing(false);
    }
  };

  // En preview el usuario sigue en la pantalla de cobro detrás del modal; solo
  // el voucher pagado devuelve al mapa de mesas.
  const handleClose = () => {
    setIsReceiptModalOpen(false);
    if (isPaid) setCurrentScreen('mesas');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-scrim backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-panel-15 border border-edge-outline rounded-2xl w-full max-w-md p-6 shadow-ui-3 space-y-6 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-edge-outline-2">
          <div className="flex items-center gap-2">
            {isPaid ? (
              <>
                <span className="material-symbols-outlined text-ink-success">check_circle</span>
                <h2 className="text-[18px] font-bold text-ink-body">Pago Completado con Éxito</h2>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-ink-gold">receipt_long</span>
                <h2 className="text-[18px] font-bold text-ink-body">Boleta de la Cuenta</h2>
                <span className="text-[10px] font-bold uppercase tracking-wider text-ink-on-accent-2 bg-surface-gold-2 px-2 py-0.5 rounded-full">
                  Pendiente de pago
                </span>
              </>
            )}
          </div>
          <button
            onClick={handleClose}
            className="text-ink-muted-2 hover:text-ink-body p-1.5 rounded-lg hover:bg-panel-3"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Printable Ticket Receipt Paper Design */}
        <div
          id="receipt-paper"
          className="receipt-print-target bg-white text-zinc-900 font-mono p-6 rounded-xl shadow-inner border border-zinc-300 text-[13px] leading-tight flex flex-col gap-3 select-text"
        >
          <div className="text-center space-y-1 pb-3 border-b border-dashed border-zinc-400">
            <h3 className="text-[18px] font-bold tracking-wider font-sans uppercase">{companyHeader.name}</h3>
            <p className="text-[11px] text-zinc-600">{companyHeader.slogan}</p>
            <p className="text-[11px] text-zinc-600">RUC: {companyHeader.ruc} · {companyHeader.address}</p>
            {isPaid ? (
              <p className="text-[12px] font-bold mt-1 text-zinc-800">
                TICKET INTERNO #{lastCompletedOrder.ticketNumber}
              </p>
            ) : (
              <p className="text-[12px] font-bold mt-1 text-zinc-800">COMANDA / CUENTA PRE-VENTA</p>
            )}
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
            {isPaid && (
              <div className="text-right">
                <span className="font-semibold">Pago:</span> {lastCompletedOrder.paymentMethod || 'Efectivo'}
              </div>
            )}
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

            {isPaid && lastCompletedOrder.amountReceived && lastCompletedOrder.amountReceived > 0 && (
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
          <div className="text-center pt-3 border-t border-dashed border-edge-neutral text-[10px] text-ink-neutral-2 space-y-0.5">
            {isPaid ? (
              <>
                <p className="font-bold text-ink-success-3 text-[11px]">PAGO REGISTRADO</p>
                <p>¡Gracias por su preferencia!</p>
                <p>Representación impresa de la Boleta de Venta Electrónica</p>
              </>
            ) : (
              <>
                <p className="font-bold text-[11px]">*** PENDIENTE DE PAGO ***</p>
                <p>Documento no válido como comprobante de pago</p>
              </>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2.5">
          <button
            type="button"
            onClick={handleShareWhatsApp}
            disabled={isSharing}
            className={`w-full bg-surface-success-solid text-ink-on-accent-2 py-3 rounded-xl text-[14px] font-bold flex items-center justify-center gap-2 transition-colors shadow-md active:scale-95 cursor-pointer ${isSharing ? 'opacity-60 cursor-wait' : 'hover:bg-surface-success-hover'}`}
          >
            <WhatsAppIcon />
            <span>Compartir por WhatsApp</span>
          </button>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handlePrint}
              className="flex-1 bg-panel-3 hover:bg-panel-17 text-ink-body py-3 rounded-xl text-[14px] font-semibold flex items-center justify-center gap-2 transition-colors border border-edge-outline cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">print</span>
              <span>Imprimir</span>
            </button>
            {isPaid ? (
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 bg-surface-brand-solid hover:bg-surface-brand-hover text-ink-on-solid py-3 rounded-xl text-[14px] font-bold flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">table_restaurant</span>
                <span>Volver a Mesas</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 bg-surface-brand-solid hover:bg-surface-brand-hover text-ink-on-solid py-3 rounded-xl text-[14px] font-bold flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
                <span>Continuar al pago</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
