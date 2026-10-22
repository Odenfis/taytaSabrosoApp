import React, { useState, useMemo } from 'react';
import { availablePaymentMethods, reconcilePaymentSelection, paymentDetails } from '../lib/paymentSelection';
import { usePOS } from '../context/POSContext';
import { CustomPaymentMethod } from '../types';

export const PaymentScreen: React.FC = () => {
  const {
    selectedTableId,
    tables,
    orders,
    completePayment,
    setCurrentScreen,
    paymentMethods,
  } = usePOS();

  const [selection, setSelection] = useState<{ scope: string; id: string | null | undefined }>({ scope: '', id: undefined });
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [splitPayment, setSplitPayment] = useState(false);
  const [splitCount, setSplitCount] = useState(2);
  const [cashReceivedInput, setCashReceivedInput] = useState<string>('');

  // Active table & order
  const currentTable = useMemo(() => {
    return tables.find((t) => t.id === selectedTableId);
  }, [tables, selectedTableId]);

  const currentOrder = useMemo(() => {
    if (!currentTable || !currentTable.currentOrderId) return null;
    return orders[currentTable.currentOrderId] || null;
  }, [currentTable, orders]);

  const total = currentOrder?.total || 0;

  const availableMethods = useMemo(() => availablePaymentMethods(paymentMethods, currentTable?.companyId), [paymentMethods, currentTable?.companyId]);
  const scope = `${currentTable?.id ?? ''}:${currentOrder?.id ?? ''}`;
  const scopeChanged = selection.scope !== scope;
  const selectedCustomMethodId = reconcilePaymentSelection(availableMethods, scopeChanged ? undefined : selection.id);
  // Reconcile during render so no frame can submit stale fields from another order.
  if (scopeChanged || selectedCustomMethodId !== selection.id) {
    setSelection({ scope, id: selectedCustomMethodId });
    setReferenceNumber('');
    if (scopeChanged) setCashReceivedInput('');
  }
  const activeCustomMethod = availableMethods.find((method) => method.id === selectedCustomMethodId);
  const details = paymentDetails(activeCustomMethod, total, scopeChanged ? '' : cashReceivedInput, scopeChanged ? '' : referenceNumber);
  const cashReceivedNumber = details.cashReceived;
  const changeAmount = details.change;

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
    if (pm.id !== selectedCustomMethodId) setReferenceNumber('');
    setSelection({ scope, id: pm.id });
  };

  const handleConfirmPayment = () => {
    if (!currentTable || !currentOrder || details.error || !activeCustomMethod) return;
    completePayment(
      currentTable.id,
      activeCustomMethod.name,
      details.amountReceived,
      activeCustomMethod.id,
      details.referenceNumber
    );
  };

  if (!currentOrder) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-panel-4 select-none">
        <span className="material-symbols-outlined text-[48px] text-ink-muted-8 mb-3">
          receipt_long
        </span>
        <h2 className="text-[20px] font-bold text-ink-body">No hay comanda activa para cobrar</h2>
        <p className="text-[14px] text-ink-muted-3 mt-1 mb-6">
          Selecciona una mesa con orden abierta desde el mapa.
        </p>
        <button
          onClick={() => setCurrentScreen('mesas')}
          className="bg-surface-brand-solid text-ink-on-brand px-6 py-3 rounded-xl font-bold hover:bg-surface-brand-hover transition-colors"
        >
          Ir al Mapa de Mesas
        </button>
      </div>
    );
  }

  return (
    <div id="payment-screen" className="flex-1 flex flex-col h-full w-full overflow-hidden select-none bg-panel-4">
      {/* Top Header Bar for Payment */}
      <header className="bg-panel-35 border-b border-edge-outline-2 w-full h-16 flex justify-between items-center px-4 md:px-6 shrink-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            id="btn-back-to-order"
            onClick={() => setCurrentScreen('pedido')}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-panel-3 text-ink-muted-2 hover:text-ink-body transition-colors cursor-pointer"
            title="Volver a la Comanda"
          >
            <span className="material-symbols-outlined text-[24px]">arrow_back</span>
          </button>
          <div>
            <h1 className="text-[18px] md:text-[20px] font-bold text-ink-brand tracking-tight flex items-center gap-2">
              <span>Cobro Mesa {currentTable.number}</span>
              <span className="text-[12px] font-normal text-ink-muted-3 bg-panel-13 px-2 py-0.5 rounded-full border border-edge-outline-5">
                Ticket #{currentOrder.ticketNumber}
              </span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[13px] text-ink-muted-5 hidden sm:inline">Total a Pagar:</span>
          <span className="text-[20px] md:text-[22px] font-extrabold text-ink-gold">
            S/ {total.toFixed(2)}
          </span>
        </div>
      </header>

      {/* Main Dual-Column Content */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Column: Order Summary */}
        <section className="w-full lg:w-1/2 p-4 md:p-6 bg-panel-35 border-b lg:border-b-0 lg:border-r border-edge-outline overflow-y-auto flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-edge-outline-2">
              <h2 className="text-[16px] font-bold text-ink-body flex items-center gap-2">
                <span className="material-symbols-outlined text-ink-brand text-[20px]">
                  receipt_long
                </span>
                Resumen de Cuenta
              </h2>
              <span className="text-[12px] text-ink-muted-3">
                Atendido por: {currentOrder.waiter} • {currentTable.companyId === 'el-tayta' ? 'El Tayta' : 'El Sabroso'}
              </span>
            </div>

            {/* Order Items List */}
            <div className="space-y-3">
              {currentOrder.items.map((item) => (
                <div
                  key={item.id}
                  className="bg-panel p-3.5 rounded-xl border border-edge-outline-3 flex items-start justify-between gap-3 shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <span className="bg-surface-brand-solid text-ink-on-brand text-[12px] font-bold px-2 py-0.5 rounded-md mt-0.5">
                      {item.quantity}x
                    </span>
                    <div>
                      <h4 className="text-[15px] font-bold text-ink-body">{item.name}</h4>
                      {item.notes && (
                        <p className="text-[12px] text-ink-info mt-0.5 flex items-center gap-1 font-medium">
                          <span className="material-symbols-outlined text-[13px]">notes</span>
                          {item.notes}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[15px] font-bold text-ink-body">
                      S/ {(item.price * item.quantity).toFixed(2)}
                    </span>
                    <span className="text-[11px] text-ink-muted block">
                      S/ {item.price.toFixed(2)} c/u
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Subtotal, IGV and Total */}
          <div className="bg-panel p-4 rounded-2xl border border-edge-outline-2 space-y-2 mt-6">
            <div className="flex justify-between text-[13px] text-ink-muted-2">
              <span>Subtotal:</span>
              <span>S/ {currentOrder.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-[13px] text-ink-muted-2">
              <span>I.G.V. (18%):</span>
              <span>S/ {currentOrder.igv.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-[18px] font-black text-ink-gold pt-2 border-t border-edge-outline-5">
              <span>Total a Cobrar:</span>
              <span>S/ {total.toFixed(2)}</span>
            </div>
          </div>
        </section>

        {/* Right Column: Payment Methods & Cash Register Breakdown */}
        <section className="w-full lg:w-1/2 p-4 md:p-6 bg-panel-57 overflow-y-auto flex flex-col justify-between gap-6">
          <div className="space-y-5">
            {/* Payment Method Selector */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <label className="text-[14px] font-bold text-ink-muted-2">
                  Método de Cobro:
                </label>
                <button
                  type="button"
                  onClick={() => setCurrentScreen('bancos')}
                  className="text-[11px] text-ink-brand hover:underline flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[13px]">settings</span>
                  Administrar Bancos y Métodos
                </button>
              </div>

              {/* Grid of Dynamic Payment Methods */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {availableMethods.map((pm) => {
                  const isSelected = selectedCustomMethodId === pm.id;

                  return (
                    <button
                      key={pm.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => handleSelectPaymentMethod(pm)}
                      className={`p-3 rounded-2xl border flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer text-center relative ${
                        isSelected
                          ? 'bg-surface-brand-solid text-ink-on-brand border-edge-brand shadow-lg font-bold'
                          : 'bg-panel-13 text-ink-body border-edge-outline hover:bg-panel-3'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[26px]">
                        {pm.icon || 'payments'}
                      </span>
                      <span className="text-[13px] font-semibold leading-tight">{pm.name}</span>
                      {pm.bankAccountAlias && (
                        <span className="text-[10px] text-ink-success-5 truncate max-w-[120px]">
                          {pm.bankAccountAlias.split(' ')[0]}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {!availableMethods.length && <p role="status" className="text-[13px] text-ink-muted-2">No hay métodos de cobro activos para esta empresa. Configúralos en Administrar Bancos y Métodos.</p>}

            {/* Linked Bank Destination Banner */}
            {activeCustomMethod?.bankAccountId && (
              <div className="bg-panel-29 border border-edge-success rounded-xl p-3 flex items-center gap-2.5">
                <span className="material-symbols-outlined text-ink-success text-[20px]">account_balance</span>
                <div className="text-[12px]">
                  <span className="text-ink-muted-3">El dinero ingresará a: </span>
                  <strong className="text-ink-success-2">{activeCustomMethod.bankAccountAlias || 'Cuenta Bancaria'}</strong>
                </div>
              </div>
            )}

            {/* Reference Number Input */}
            {activeCustomMethod?.requiresReferenceNumber && (
              <div className="bg-panel-13 border border-edge-outline rounded-2xl p-4 space-y-2">
                <label className="text-[12px] font-bold text-ink-muted-2 flex items-center justify-between">
                  <span>N° de Operación / Código de Aprobación (Voucher) *</span>
                  <span className="text-[11px] text-ink-muted font-normal">Para cuadre bancario</span>
                </label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-2.5 text-ink-muted-4 text-[18px]">
                    tag
                  </span>
                  <input
                    type="text"
                    placeholder="Ej. OP-948102 o 6 dígitos de Yape/Plin"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    className="w-full bg-panel-16 border border-edge-outline rounded-xl pl-9 pr-3 py-2 text-[14px] font-mono text-ink-strong focus:outline-none focus:border-edge-brand"
                  />
                </div>
              </div>
            )}

            {/* Cash Calculation (Only if Cash is chosen) */}
            {details.isCash && (
              <div className="bg-panel-13 border border-edge-outline rounded-2xl p-4 space-y-4 animate-in fade-in duration-150">
                <h3 className="text-[14px] font-bold text-ink-body flex items-center gap-2">
                  <span className="material-symbols-outlined text-ink-gold text-[18px]">
                    calculate
                  </span>
                  Cálculo de Efectivo y Vuelto
                </h3>

                {/* Amount Received Input */}
                <div>
                  <label className="text-[12px] font-semibold text-ink-muted-2 block mb-1.5">
                    Monto Recibido del Cliente (S/):
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-ink-muted-2 font-bold text-[16px]">
                      S/
                    </span>
                    <input
                      type="number"
                      step="any"
                      placeholder={total.toFixed(2)}
                      value={cashReceivedInput}
                      onChange={(e) => setCashReceivedInput(e.currentTarget.validity.badInput ? 'NaN' : e.target.value)}
                      className="w-full bg-panel-16 border border-edge-outline focus:border-edge-info-6 rounded-xl pl-10 pr-4 py-3 text-[18px] font-bold text-ink-body focus:outline-none"
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
                      className="bg-panel-3 hover:bg-panel-17 border border-edge-outline text-ink-muted-2 hover:text-ink-body px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors"
                    >
                      {opt === total ? 'Monto Exacto' : `S/ ${opt.toFixed(2)}`}
                    </button>
                  ))}
                </div>

                {/* Change return calculation display */}
                <div className="bg-panel-58 p-3.5 rounded-xl border border-edge-outline-2 flex items-center justify-between">
                  <div>
                    <span className="text-[12px] text-ink-muted-3 block">Vuelto a Entregar:</span>
                    <span
                      className={`text-[24px] font-black tracking-tight ${
                        changeAmount > 0 ? 'text-ink-info' : 'text-ink-body'
                      }`}
                    >
                      S/ {changeAmount.toFixed(2)}
                    </span>
                  </div>
                  {cashReceivedNumber < total && (
                    <span className="text-[12px] text-ink-danger font-semibold bg-surface-danger-solid-3 px-2 py-1 rounded">
                      Falta S/ {(total - cashReceivedNumber).toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Split Payment Toggle */}
            <div className="bg-panel-13 border border-edge-outline rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-ink-info">call_split</span>
                  <span className="text-[14px] font-bold text-ink-body">Pago Dividido</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={splitPayment}
                  onClick={() => setSplitPayment(!splitPayment)}
                  className={`w-12 h-6 rounded-full transition-colors relative p-0.5 cursor-pointer ${
                    splitPayment ? 'bg-surface-info-2' : 'bg-panel-17'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-surface-thumb shadow-md transition-transform ${
                      splitPayment ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {splitPayment && (
                <div className="pt-2 border-t border-edge-outline-2 flex items-center justify-between gap-4 animate-in fade-in duration-150">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] text-ink-muted-2">Personas:</span>
                    <div className="flex items-center gap-1 bg-panel-3 rounded-lg p-1 border border-edge-outline">
                      <button
                        type="button"
                        onClick={() => setSplitCount(Math.max(2, splitCount - 1))}
                        className="w-7 h-7 rounded flex items-center justify-center text-ink-muted-2 hover:text-ink-strong"
                      >
                        -
                      </button>
                      <span className="w-6 text-center font-bold text-ink-body">
                        {splitCount}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSplitCount(splitCount + 1)}
                        className="w-7 h-7 rounded flex items-center justify-center text-ink-muted-2 hover:text-ink-strong"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[12px] text-ink-muted-3 block">Monto por persona:</span>
                    <span className="text-[16px] font-extrabold text-ink-info">
                      S/ {(total / splitCount).toFixed(2)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Confirm Payment Button */}
          <div className="pt-4 border-t border-edge-outline-2">
            {details.error && <p id="payment-validation" role="status" className="mb-3 text-[12px] text-ink-danger">{details.error}</p>}
            <button
              id="btn-confirm-payment"
              type="button"
              disabled={!!details.error}
              aria-describedby={details.error ? "payment-validation" : undefined}
              onClick={handleConfirmPayment}
              className="w-full bg-gradient-to-r from-payment-start to-surface-gold-4 text-ink-on-accent-3 hover:brightness-110 active:scale-[0.98] font-black text-[16px] py-4 rounded-xl flex items-center justify-center gap-2 shadow-ui-8 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined fill text-[24px]">check_circle</span>
              <span>Confirmar Pago y Liberar Mesa</span>
            </button>
          </div>
        </section>
      </main>
    </div>
  );
};
