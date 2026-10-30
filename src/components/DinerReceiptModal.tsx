import React from 'react';
import type { Company } from '../types';

export type DinerReceiptBill = {
  ticketNumber: string; label: string; total: number; recipientName?: string | null; recipientId?: string | null;
  items: { orderItemId?: string; quantity: number; orderItem?: { name: string; price: number } }[];
  transactions: { id: string; amount: number; paymentMethod: string | null; contributorName?: string | null; referenceNumber?: string | null; amountReceived?: number | null; change?: number | null }[];
};

export function DinerReceiptModal({ bill, company, tableNumber, orderNumber, onClose, onShare, syncPending }: {
  bill: DinerReceiptBill; company?: Company; tableNumber?: string; orderNumber?: string;
  onClose: () => void; onShare?: () => void; syncPending?: boolean;
}) {
  const total = Math.round(bill.total * 100);
  const paid = bill.transactions.reduce((sum, item) => sum + Math.round(item.amount * 100), 0);
  const remaining = Math.max(0, total - paid);
  const subtotal = Math.round(total / 1.18);
  const [shareMessage, setShareMessage] = React.useState('');
  const share = async () => {
    if (onShare) { onShare(); return; }
    const text = [company?.tradeName ?? 'Empresa', `TICKET INTERNO #${bill.ticketNumber}`, `Mesa ${tableNumber ?? '—'} · Comanda #${orderNumber ?? '—'}`, `Comensal: ${bill.label}`, `Receptor: ${bill.recipientName || 'Sin identificar'} ${bill.recipientId || ''}`, ...bill.items.map((item) => `${item.quantity} × ${item.orderItem?.name ?? 'Plato'} · S/ ${((item.orderItem?.price ?? 0) * item.quantity).toFixed(2)}`), `Subtotal sin IGV: S/ ${(subtotal / 100).toFixed(2)}`, `IGV incluido: S/ ${((total - subtotal) / 100).toFixed(2)}`, `Total: S/ ${bill.total.toFixed(2)}`, ...bill.transactions.map((payment) => `Abono S/ ${payment.amount.toFixed(2)} · ${payment.paymentMethod} · ${payment.contributorName || bill.label}${payment.referenceNumber ? ` · Ref. ${payment.referenceNumber}` : ''}`), `Saldo: S/ ${(remaining / 100).toFixed(2)}`, ...(syncPending ? ['PENDIENTE DE SINCRONIZACIÓN'] : []), 'Ticket interno. No es comprobante electrónico.'].join('\n');
    try {
      if (navigator.share) await navigator.share({ title: `Ticket interno #${bill.ticketNumber}`, text });
      else { await navigator.clipboard.writeText(text); setShareMessage('Ticket copiado para compartir.'); }
    } catch { setShareMessage('No se pudo compartir el ticket.'); }
  };
  return <div role="dialog" aria-modal="true" aria-label="Ticket interno" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-scrim backdrop-blur-sm">
    <div className="bg-panel-15 border border-edge-outline rounded-2xl w-full max-w-md p-6 shadow-ui-3 space-y-5 max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between border-b border-edge-outline-2 pb-3"><h2 className="text-lg font-bold text-ink-body flex items-center gap-2"><span className="material-symbols-outlined text-ink-brand">receipt_long</span>{remaining ? 'Cuenta pendiente' : 'Pago completado'}</h2><button type="button" aria-label="Cerrar ticket" onClick={onClose} className="text-ink-muted-2 p-2"><span className="material-symbols-outlined">close</span></button></div>
      <div className="receipt-print-target diner-ticket-paper font-mono p-6 rounded-xl shadow-inner border text-[13px] leading-tight flex flex-col gap-3 select-text">
        <div className="text-center space-y-1 pb-3 border-b border-dashed"><h3 className="text-lg font-bold tracking-wider font-sans uppercase">{company?.tradeName ?? 'Empresa'}</h3><p className="text-[11px]">{company?.specialty}</p><p className="text-[11px]">RUC: {company?.ruc ?? '—'} · {company?.address}</p><p className="font-bold">TICKET INTERNO #{bill.ticketNumber}</p></div>
        <div className="text-[11px] space-y-1 border-b border-dashed pb-3"><p>Mesa: {tableNumber ?? '—'} · Comanda: #{orderNumber ?? '—'}</p><p>Comensal: {bill.label}</p><p>Receptor: {bill.recipientName || 'Sin identificar'} {bill.recipientId || ''}</p></div>
        <div className="space-y-1 border-b border-dashed pb-3"><div className="flex justify-between font-bold"><span>Cant / Descripción</span><span>Total</span></div>{bill.items.map((item, index) => <div key={item.orderItemId ?? index} className="flex justify-between gap-2"><span>{item.quantity} × {item.orderItem?.name ?? 'Plato'}</span><span>S/ {((item.orderItem?.price ?? 0) * item.quantity).toFixed(2)}</span></div>)}</div>
        <div className="space-y-1"><div className="flex justify-between"><span>Subtotal sin IGV:</span><span>S/ {(subtotal / 100).toFixed(2)}</span></div><div className="flex justify-between"><span>IGV incluido (18%):</span><span>S/ {((total - subtotal) / 100).toFixed(2)}</span></div><div className="flex justify-between text-base font-bold border-t pt-2"><span>TOTAL:</span><span>S/ {bill.total.toFixed(2)}</span></div></div>
        {bill.transactions.length > 0 && <div className="border-t border-dashed pt-2 space-y-1"><strong>Abonos</strong>{bill.transactions.map((payment) => <div key={payment.id}><div className="flex justify-between gap-2"><span>{payment.paymentMethod} · {payment.contributorName || bill.label}</span><span>S/ {payment.amount.toFixed(2)}</span></div>{payment.referenceNumber && <p>Ref. {payment.referenceNumber}</p>}{(payment.change ?? 0) > 0 && <p>Vuelto: S/ {payment.change!.toFixed(2)}</p>}</div>)}</div>}
        <div className="border-t border-dashed pt-3 text-center text-[11px]"><p className="font-bold">{syncPending ? 'PENDIENTE DE SINCRONIZACIÓN' : remaining ? `PENDIENTE: S/ ${(remaining / 100).toFixed(2)}` : 'PAGO REGISTRADO'}</p><p>Ticket interno. No es comprobante electrónico.</p></div>
      </div>
      {shareMessage && <p role="status" className="text-sm text-ink-muted-2">{shareMessage}</p>}
      <div className="flex gap-2"><button type="button" onClick={() => window.print()} className="flex-1 bg-panel-3 border border-edge-outline rounded-xl p-3 font-bold text-ink-body">Imprimir</button><button type="button" onClick={() => void share()} className="flex-1 bg-surface-success-solid text-ink-on-accent-2 rounded-xl p-3 font-bold">Compartir</button><button type="button" onClick={onClose} className="flex-1 bg-surface-brand-solid text-ink-on-brand rounded-xl p-3 font-bold">Cerrar</button></div>
    </div>
  </div>;
}
