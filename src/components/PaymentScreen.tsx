import React, { useState, useMemo } from 'react';
import { usePOS } from '../context/POSContext';
import { PaymentMethod, CustomPaymentMethod } from '../types';
import { ReceiptModal } from './ReceiptModal';

export const PaymentScreen: React.FC = () => {
  const {
    selectedTableId,
    tables,
    orders,
    completePayment,
    setCurrentScreen,
    paymentMethods,
    filteredPaymentMethods,
    bankAccounts,
  } = usePOS();

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | string>('Efectivo');
  const [selectedCustomMethodId, setSelectedCustomMethodId] = useState<string>('');
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [splitPayment, setSplitPayment] = useState(false);
  const [splitCount, setSplitCount] = useState(2);
  const [cashReceivedInput, setCashReceivedInput] = useState<string>('');

  // Active table & order
  const currentTable = useMemo(() => {
    return tables.find((t) => t.id === selectedTableId) || tables[0];
  }, [tables, selectedTableId]);

  const currentOrder = useMemo(() => {
    if (!currentTable || !currentTable.currentOrderId) return null;
    return orders[currentTable.currentOrderId] || null;
  }, [currentTable, orders]);

  const total = currentOrder?.total || 0;

  // Selected custom payment method details
  const activeCustomMethod = useMemo(() => {
    if (selectedCustomMethodId) {
      return paymentMethods.find((p) => p.id === selectedCustomMethodId);
    }
    return paymentMethods.find(
      (p) => p.name.toLowerCase() === (paymentMethod as string).toLowerCase()
    );
  }, [paymentMethods, selectedCustomMethodId, paymentMethod]);

  // Initialize cash received to exact total if empty
  const cashReceivedNumber = parseFloat(cashReceivedInput) || total;
  const changeAmount = Math.max(0, +(cashReceivedNumber - total).toFixed(2));

  // Quick cash chips based on total
  const quickCashOptions = useMemo(() => {
    const roundNext50 = Math.ceil(total / 50) * 50;
    const roundNext100 = Math.ceil(total / 100) * 100;
    const options = [total];
    if (roundNext50 > total && !options.includes(roundNext50)) options.push(roundNext50);
    if (roundNext100 > total && !options.includes(roundNext100)) options.push(roundNext100);
    if (!options.includes(200) && 200 > total) options.push(200);
    return options.slice(0, 4);
  }, [total]);

  const handleSelectPaymentMethod = (pm: CustomPaymentMethod) => {
    setSelectedCustomMethodId(pm.id);
    setPaymentMethod(pm.name);
  };

  const handleConfirmPayment = () => {
    if (!currentTable) return;
    completePayment(
      currentTable.id,
      paymentMethod as PaymentMethod,
      paymentMethod === 'Efectivo' ? cashReceivedNumber : total,
      selectedCustomMethodId || undefined,
      referenceNumber.trim() || undefined
    );
  };

  if (!currentOrder) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#121212] select-none">
        <span className="material-symbols-outlined text-[48px] text-[#dac1b8]/40 mb-3">
          receipt_long
        </span>
        <h2 className="text-[20px] font-bold text-[#e5e2e1]">No hay comanda activa para cobrar</h2>
        <p className="text-[14px] text-[#dac1b8]/70 mt-1 mb-6">
          Selecciona una mesa con orden abierta desde el mapa.
        </p>
        <button
          onClick={() => setCurrentScreen('mesas')}
          className="bg-[#823b19] text-[#ffdbcd] px-6 py-3 rounded-xl font-bold hover:bg-[#944926] transition-colors"
        >
          Ir al Mapa de Mesas
        </button>
      </div>
    );
  }

  // Display methods available
  const availableMethods = (filteredPaymentMethods && filteredPaymentMethods.length > 0) ? filteredPaymentMethods : [
    { id: 'pm-def-1', companyId: currentTable.companyId, name: 'Efectivo', category: 'Efectivo', requiresReferenceNumber: false, icon: 'payments', isActive: true },
    { id: 'pm-def-2', companyId: currentTable.companyId, name: 'Tarjeta (POS)', category: 'Tarjeta / POS', requiresReferenceNumber: true, icon: 'credit_card', isActive: true },
    { id: 'pm-def-3', companyId: currentTable.companyId, name: 'Yape / Plin', category: 'Billetera Digital', requiresReferenceNumber: true, icon: 'qr_code_scanner', isActive: true },
  ];

  return (
    <div id="payment-screen" className="flex-1 flex flex-col h-full w-full overflow-hidden select-none bg-[#121212]">
      {/* Top Header Bar for Payment */}
      <header className="bg-[#131313] border-b border-[#54433c]/60 w-full h-16 flex justify-between items-center px-4 md:px-6 shrink-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            id="btn-back-to-order"
            onClick={() => setCurrentScreen('pedido')}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[#2a2a2a] text-[#dac1b8] hover:text-[#e5e2e1] transition-colors cursor-pointer"
            title="Volver a la Comanda"
          >
            <span className="material-symbols-outlined text-[24px]">arrow_back</span>
          </button>
          <div>
            <h1 className="text-[18px] md:text-[20px] font-bold text-[#ffb597] tracking-tight flex items-center gap-2">
              <span>Cobro Mesa {currentTable.number}</span>
              <span className="text-[12px] font-normal text-[#dac1b8]/70 bg-[#20201f] px-2 py-0.5 rounded-full border border-[#54433c]/40">
                Ticket #{currentOrder.ticketNumber}
              </span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[13px] text-[#dac1b8]/80 hidden sm:inline">Total a Pagar:</span>
          <span className="text-[20px] md:text-[22px] font-extrabold text-[#ebc246]">
            S/ {total.toFixed(2)}
          </span>
        </div>
      </header>

      {/* Main Dual-Column Content */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Column: Order Summary */}
        <section className="w-full lg:w-1/2 p-4 md:p-6 bg-[#131313] border-b lg:border-b-0 lg:border-r border-[#54433c] overflow-y-auto flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#54433c]/60">
              <h2 className="text-[16px] font-bold text-[#e5e2e1] flex items-center gap-2">
                <span className="material-symbols-outlined text-[#ffb597] text-[20px]">
                  receipt_long
                </span>
                Resumen de Cuenta
              </h2>
              <span className="text-[12px] text-[#dac1b8]/70">
                Atendido por: {currentOrder.waiter} • {currentTable.companyId === 'el-tayta' ? 'El Tayta' : 'El Sabroso'}
              </span>
            </div>

            {/* Order Items List */}
            <div className="space-y-3">
              {currentOrder.items.map((item) => (
                <div
                  key={item.id}
                  className="bg-[#1c1b1b] p-3.5 rounded-xl border border-[#54433c]/50 flex items-start justify-between gap-3 shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <span className="bg-[#823b19] text-[#ffdbcd] text-[12px] font-bold px-2 py-0.5 rounded-md mt-0.5">
                      {item.quantity}x
                    </span>
                    <div>
                      <h4 className="text-[15px] font-bold text-[#e5e2e1]">{item.name}</h4>
                      {item.notes && (
                        <p className="text-[12px] text-[#60d4fb] mt-0.5 flex items-center gap-1 font-medium">
                          <span className="material-symbols-outlined text-[13px]">notes</span>
                          {item.notes}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[15px] font-bold text-[#e5e2e1]">
                      S/ {(item.price * item.quantity).toFixed(2)}
                    </span>
                    <span className="text-[11px] text-[#dac1b8]/60 block">
                      S/ {item.price.toFixed(2)} c/u
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Subtotal, IGV and Total */}
          <div className="bg-[#1c1b1b] p-4 rounded-2xl border border-[#54433c]/60 space-y-2 mt-6">
            <div className="flex justify-between text-[13px] text-[#dac1b8]">
              <span>Subtotal:</span>
              <span>S/ {currentOrder.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-[13px] text-[#dac1b8]">
              <span>I.G.V. (18%):</span>
              <span>S/ {currentOrder.igv.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-[18px] font-black text-[#ebc246] pt-2 border-t border-[#54433c]/40">
              <span>Total a Cobrar:</span>
              <span>S/ {total.toFixed(2)}</span>
            </div>
          </div>
        </section>

        {/* Right Column: Payment Methods & Cash Register Breakdown */}
        <section className="w-full lg:w-1/2 p-4 md:p-6 bg-[#1a1a1a] overflow-y-auto flex flex-col justify-between gap-6">
          <div className="space-y-5">
            {/* Payment Method Selector */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <label className="text-[14px] font-bold text-[#dac1b8]">
                  Método de Cobro:
                </label>
                <button
                  type="button"
                  onClick={() => setCurrentScreen('bancos')}
                  className="text-[11px] text-[#ffb597] hover:underline flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[13px]">settings</span>
                  Administrar Bancos y Métodos
                </button>
              </div>

              {/* Grid of Dynamic Payment Methods */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {availableMethods.map((pm) => {
                  const isSelected =
                    (selectedCustomMethodId && selectedCustomMethodId === pm.id) ||
                    (!selectedCustomMethodId && paymentMethod === pm.name);

                  return (
                    <button
                      key={pm.id}
                      type="button"
                      onClick={() => handleSelectPaymentMethod(pm as CustomPaymentMethod)}
                      className={`p-3 rounded-2xl border flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer text-center relative ${
                        isSelected
                          ? 'bg-[#823b19] text-[#ffdbcd] border-[#ffb597] shadow-lg font-bold'
                          : 'bg-[#20201f] text-[#e5e2e1] border-[#54433c] hover:bg-[#2a2a2a]'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[26px]">
                        {pm.icon || 'payments'}
                      </span>
                      <span className="text-[13px] font-semibold leading-tight">{pm.name}</span>
                      {pm.bankAccountAlias && (
                        <span className="text-[10px] text-emerald-300/80 truncate max-w-[120px]">
                          {pm.bankAccountAlias.split(' ')[0]}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Linked Bank Destination Banner */}
            {activeCustomMethod?.bankAccountId && (
              <div className="bg-[#141313] border border-emerald-500/40 rounded-xl p-3 flex items-center gap-2.5">
                <span className="material-symbols-outlined text-emerald-400 text-[20px]">account_balance</span>
                <div className="text-[12px]">
                  <span className="text-[#dac1b8]/70">El dinero ingresará a: </span>
                  <strong className="text-emerald-300">{activeCustomMethod.bankAccountAlias || 'Cuenta Bancaria'}</strong>
                </div>
              </div>
            )}

            {/* Reference Number Input */}
            {(activeCustomMethod?.requiresReferenceNumber || paymentMethod !== 'Efectivo') && (
              <div className="bg-[#20201f] border border-[#54433c] rounded-2xl p-4 space-y-2">
                <label className="text-[12px] font-bold text-[#dac1b8] flex items-center justify-between">
                  <span>N° de Operación / Código de Aprobación (Voucher) *</span>
                  <span className="text-[11px] text-[#dac1b8]/60 font-normal">Para cuadre bancario</span>
                </label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-2.5 text-[#dac1b8]/50 text-[18px]">
                    tag
                  </span>
                  <input
                    type="text"
                    placeholder="Ej. OP-948102 o 6 dígitos de Yape/Plin"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    className="w-full bg-[#2d2d2d] border border-[#54433c] rounded-xl pl-9 pr-3 py-2 text-[14px] font-mono text-white focus:outline-none focus:border-[#ffb597]"
                  />
                </div>
              </div>
            )}

            {/* Cash Calculation (Only if Cash is chosen) */}
            {paymentMethod === 'Efectivo' && (
              <div className="bg-[#20201f] border border-[#54433c] rounded-2xl p-4 space-y-4 animate-in fade-in duration-150">
                <h3 className="text-[14px] font-bold text-[#e5e2e1] flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#ebc246] text-[18px]">
                    calculate
                  </span>
                  Cálculo de Efectivo y Vuelto
                </h3>

                {/* Amount Received Input */}
                <div>
                  <label className="text-[12px] font-semibold text-[#dac1b8] block mb-1.5">
                    Monto Recibido del Cliente (S/):
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#dac1b8] font-bold text-[16px]">
                      S/
                    </span>
                    <input
                      type="number"
                      step="any"
                      placeholder={total.toFixed(2)}
                      value={cashReceivedInput}
                      onChange={(e) => setCashReceivedInput(e.target.value)}
                      className="w-full bg-[#2d2d2d] border border-[#54433c] focus:border-[#60d4fb] rounded-xl pl-10 pr-4 py-3 text-[18px] font-bold text-[#e5e2e1] focus:outline-none"
                    />
                  </div>
                </div>

                {/* Quick amount chips */}
                <div className="flex flex-wrap gap-2">
                  {quickCashOptions.map((opt, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setCashReceivedInput(opt.toString())}
                      className="bg-[#2a2a2a] hover:bg-[#353535] border border-[#54433c] text-[#dac1b8] hover:text-[#e5e2e1] px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors"
                    >
                      {opt === total ? 'Monto Exacto' : `S/ ${opt.toFixed(2)}`}
                    </button>
                  ))}
                </div>

                {/* Change return calculation display */}
                <div className="bg-[#181818] p-3.5 rounded-xl border border-[#54433c]/60 flex items-center justify-between">
                  <div>
                    <span className="text-[12px] text-[#dac1b8]/70 block">Vuelto a Entregar:</span>
                    <span
                      className={`text-[24px] font-black tracking-tight ${
                        changeAmount > 0 ? 'text-[#60d4fb]' : 'text-[#e5e2e1]'
                      }`}
                    >
                      S/ {changeAmount.toFixed(2)}
                    </span>
                  </div>
                  {cashReceivedNumber < total && (
                    <span className="text-[12px] text-[#ffb4ab] font-semibold bg-[#93000a]/20 px-2 py-1 rounded">
                      Falta S/ {(total - cashReceivedNumber).toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Split Payment Toggle */}
            <div className="bg-[#20201f] border border-[#54433c] rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#60d4fb]">call_split</span>
                  <span className="text-[14px] font-bold text-[#e5e2e1]">Pago Dividido</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={splitPayment}
                  onClick={() => setSplitPayment(!splitPayment)}
                  className={`w-12 h-6 rounded-full transition-colors relative p-0.5 cursor-pointer ${
                    splitPayment ? 'bg-[#60d4fb]' : 'bg-[#353535]'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white shadow-md transition-transform ${
                      splitPayment ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {splitPayment && (
                <div className="pt-2 border-t border-[#54433c]/60 flex items-center justify-between gap-4 animate-in fade-in duration-150">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] text-[#dac1b8]">Personas:</span>
                    <div className="flex items-center gap-1 bg-[#2a2a2a] rounded-lg p-1 border border-[#54433c]">
                      <button
                        type="button"
                        onClick={() => setSplitCount(Math.max(2, splitCount - 1))}
                        className="w-7 h-7 rounded flex items-center justify-center text-[#dac1b8] hover:text-white"
                      >
                        -
                      </button>
                      <span className="w-6 text-center font-bold text-[#e5e2e1]">
                        {splitCount}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSplitCount(splitCount + 1)}
                        className="w-7 h-7 rounded flex items-center justify-center text-[#dac1b8] hover:text-white"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[12px] text-[#dac1b8]/70 block">Monto por persona:</span>
                    <span className="text-[16px] font-extrabold text-[#60d4fb]">
                      S/ {(total / splitCount).toFixed(2)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Confirm Payment Button */}
          <div className="pt-4 border-t border-[#54433c]/60">
            <button
              id="btn-confirm-payment"
              type="button"
              onClick={handleConfirmPayment}
              className="w-full bg-gradient-to-r from-[#823b19] to-[#ebc246] text-[#201511] hover:brightness-110 active:scale-[0.98] font-black text-[16px] py-4 rounded-xl flex items-center justify-center gap-2 shadow-[0_6px_24px_rgba(235,194,70,0.3)] transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined fill text-[24px]">check_circle</span>
              <span>Confirmar Pago y Liberar Mesa</span>
            </button>
          </div>
        </section>
      </main>

      {/* Electronic Ticket Modal */}
      <ReceiptModal />
    </div>
  );
};
