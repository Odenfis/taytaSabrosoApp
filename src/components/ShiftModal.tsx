import React, { useEffect, useState } from 'react';
import { usePOS } from '../context/POSContext';
import { CompanyId, ShiftType } from '../types';
import { isBankMovement, isCashMovement } from '../lib/finance';

export const ShiftModal: React.FC = () => {
  const {
    isShiftModalOpen,
    setIsShiftModalOpen,
    companyShifts,
    companyShiftCash,
    activeShift,
    shiftRecords,
    switchCompanyShift,
    activeCompanyId,
    activeCompany,
    transactions,
    currentUser,
  } = usePOS();

  const [activeTab, setActiveTab] = useState<'cambiar' | 'historial'>('cambiar');
  const [targetCompany, setTargetCompany] = useState<CompanyId>(
    activeCompanyId === 'todas' ? 'el-tayta' : activeCompanyId
  );

  const currentCompanyShift = companyShifts[targetCompany] || 'Día';
  const nextShift: ShiftType = currentCompanyShift === 'Día' ? 'Noche' : 'Día';

  // Calculate live shift numbers for the selected company
  const compTxs = transactions.filter(
    (t) => t.companyId === targetCompany && (!t.shift || t.shift === currentCompanyShift)
  );

  const cashSales = compTxs
    .filter((t) => t.isIncome && isCashMovement(t))
    .reduce((sum, t) => sum + t.amount, 0);

  const cardSales = compTxs
    .filter(
      (t) =>
        t.isIncome &&
        (t.paymentMethod === 'Tarjeta' ||
          (t.description && t.description.toLowerCase().includes('tarjeta')))
    )
    .reduce((sum, t) => sum + t.amount, 0);

  const walletSales = compTxs
    .filter(
      (t) =>
        t.isIncome &&
        (t.paymentMethod === 'Billetera Digital' ||
          (t.description &&
            (t.description.toLowerCase().includes('yape') ||
              t.description.toLowerCase().includes('plin'))))
    )
    .reduce((sum, t) => sum + t.amount, 0);

  const bankTransferSales = compTxs
    .filter(
      (t) =>
        t.isIncome &&
        isBankMovement(t) &&
        t.paymentMethod !== 'Tarjeta' &&
        t.paymentMethod !== 'Billetera Digital' &&
        t.paymentMethod !== 'Yape / Plin'
    )
    .reduce((sum, t) => sum + t.amount, 0);

  const totalSales = cashSales + cardSales + walletSales;
  // Regla de gaveta: solo egresos sin cuenta bancaria salen de la caja efectivo
  // (un 'Caja Chica' pagado desde banco decrementa el banco, no la gaveta).
  const cashExpenses = compTxs
    .filter((t) => !t.isIncome && isCashMovement(t))
    .reduce((sum, t) => sum + t.amount, 0);

  const initialCash = companyShiftCash[targetCompany] ?? 350.0;
  const expectedCashInDrawer = +(initialCash + cashSales - cashExpenses).toFixed(2);

  const [reportedCash, setReportedCash] = useState<number>(expectedCashInDrawer);
  const [initialForNext, setInitialForNext] = useState<number>(350.0);
  const [notes, setNotes] = useState<string>('');

  // Al reabrir el modal, el efectivo esperado se prellena con el cálculo vigente
  // (los state no se reinician porque el componente está siempre montado).
  useEffect(() => {
    if (isShiftModalOpen) {
      setReportedCash(expectedCashInDrawer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isShiftModalOpen, targetCompany]);

  if (!isShiftModalOpen) return null;

  const difference = +(reportedCash - expectedCashInDrawer).toFixed(2);

  const handleCloseShift = (e: React.FormEvent) => {
    e.preventDefault();
    switchCompanyShift(targetCompany, nextShift, reportedCash, initialForNext, notes);
    setIsShiftModalOpen(false);
  };

  const filteredHistory = shiftRecords.filter(
    (r) => targetCompany === 'todas' || r.companyId === targetCompany
  );

  return (
    <div
      id="shift-management-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-surface-scrim backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="bg-panel border border-edge-outline rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-edge-outline-2 flex items-center justify-between bg-panel-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-surface-brand-solid-3 border border-edge-brand-3 flex items-center justify-center text-ink-brand">
              <span className="material-symbols-outlined text-[24px]">
                {currentCompanyShift === 'Día' ? 'wb_sunny' : 'bedtime'}
              </span>
            </div>
            <div>
              <h2 className="text-[17px] sm:text-[19px] font-black text-ink-heading-brand">
                Control de Turnos y Cierre de Caja
              </h2>
              <p className="text-[12px] text-ink-muted-3">
                Gestión manual de 2 turnos (Día / Noche) por cada empresa
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsShiftModalOpen(false)}
            className="text-ink-muted hover:text-ink-strong p-1.5 rounded-lg hover:bg-panel-3 transition-colors"
          >
            <span className="material-symbols-outlined text-[22px]">close</span>
          </button>
        </div>

        {/* Tab Controls & Company Switcher */}
        <div className="px-4 sm:px-5 pt-3 pb-2 border-b border-edge-outline-5 flex flex-wrap items-center justify-between gap-2 bg-panel-32">
          <div className="flex gap-1 bg-panel-4 p-1 rounded-xl border border-edge-outline-5">
            <button
              type="button"
              onClick={() => setActiveTab('cambiar')}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'cambiar'
                  ? 'bg-surface-brand-solid text-ink-on-brand shadow-sm'
                  : 'text-ink-muted-3 hover:text-ink-strong'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">sync_alt</span>
              Arqueo &amp; Cambio de Turno
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('historial')}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'historial'
                  ? 'bg-surface-brand-solid text-ink-on-brand shadow-sm'
                  : 'text-ink-muted-3 hover:text-ink-strong'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">history</span>
              Historial de Turnos ({shiftRecords.length})
            </button>
          </div>

          {/* Target Company Pill */}
          <div className="flex items-center gap-1 bg-panel-4 p-1 rounded-xl border border-edge-outline-5">
            <button
              type="button"
              onClick={() => {
                setTargetCompany('el-tayta');
                setReportedCash(expectedCashInDrawer);
              }}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all ${
                targetCompany === 'el-tayta'
                  ? 'bg-surface-brand-solid text-ink-on-brand'
                  : 'text-ink-muted hover:text-ink-strong'
              }`}
            >
              El Tayta ({companyShifts['el-tayta']})
            </button>
            <button
              type="button"
              onClick={() => {
                setTargetCompany('el-sabroso');
                setReportedCash(expectedCashInDrawer);
              }}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all ${
                targetCompany === 'el-sabroso'
                  ? 'bg-surface-gold-2 text-ink-foreground'
                  : 'text-ink-muted hover:text-ink-strong'
              }`}
            >
              El Sabroso ({companyShifts['el-sabroso']})
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
          {activeTab === 'cambiar' ? (
            <form onSubmit={handleCloseShift} className="space-y-4">
              {/* Current Status Card */}
              <div className="bg-panel-33 border border-edge-outline-2 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    className={`material-symbols-outlined text-[28px] ${
                      currentCompanyShift === 'Día' ? 'text-ink-warning-3' : 'text-ink-accent'
                    }`}
                  >
                    {currentCompanyShift === 'Día' ? 'wb_sunny' : 'nightlight'}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] uppercase tracking-wider text-ink-muted-3 font-bold">
                        Turno En Curso:
                      </span>
                      <span
                        className={`text-[13px] font-black px-2 py-0.5 rounded-md ${
                          currentCompanyShift === 'Día'
                            ? 'bg-surface-warning-strong-7 text-ink-warning-2 border border-edge-warning-3'
                            : 'bg-surface-accent-strong text-ink-accent-2 border border-edge-accent'
                        }`}
                      >
                        Turno {currentCompanyShift}
                      </span>
                    </div>
                    <p className="text-[12px] text-ink-muted-5 mt-0.5">
                      Empresa: <strong className="text-ink-brand">{targetCompany === 'el-tayta' ? 'El Tayta (Criollo & Marino)' : 'El Sabroso (Brasas & Parrillas)'}</strong> • Operador: {currentUser?.name}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-[12px] bg-panel-34 px-3 py-1.5 rounded-lg border border-edge-outline-5 text-ink-muted-2">
                  <span>Próximo Turno al Cerrar:</span>
                  <span className="font-bold text-ink-gold">Turno {nextShift}</span>
                </div>
              </div>

              {/* Shift Sales & Cash Breakdown */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="bg-panel-32 border border-edge-outline-5 p-2.5 rounded-xl">
                  <p className="text-[11px] text-ink-muted font-semibold">Fondo Apertura</p>
                  <p className="text-[15px] font-bold text-ink-body">S/ {initialCash.toFixed(2)}</p>
                </div>
                <div className="bg-panel-32 border border-edge-outline-5 p-2.5 rounded-xl">
                  <p className="text-[11px] text-ink-muted font-semibold">Ventas Efectivo</p>
                  <p className="text-[15px] font-bold text-ink-success">+ S/ {cashSales.toFixed(2)}</p>
                </div>
                <div className="bg-panel-32 border border-edge-outline-5 p-2.5 rounded-xl">
                  <p className="text-[11px] text-ink-muted font-semibold">Egresos de Caja</p>
                  <p className="text-[15px] font-bold text-ink-danger-3">- S/ {cashExpenses.toFixed(2)}</p>
                </div>
                <div className="bg-panel-32 border border-edge-outline-5 p-2.5 rounded-xl">
                  <p className="text-[11px] text-ink-muted font-semibold">Tarjetas &amp; Yape</p>
                  <p className="text-[15px] font-bold text-ink-gold">S/ {(cardSales + walletSales).toFixed(2)}</p>
                </div>
              </div>

              {/* Arqueo de Caja Form */}
              <div className="bg-panel-29 border border-edge-outline-7 rounded-xl p-4 space-y-3.5">
                <div className="flex items-center justify-between pb-2 border-b border-edge-outline-5">
                  <div>
                    <h3 className="text-[14px] font-bold text-ink-heading-brand flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[18px] text-ink-gold">point_of_sale</span>
                      Arqueo de Efectivo Físico en Cajón
                    </h3>
                    <p className="text-[11px] text-ink-muted-3">
                      Cuadre entre el cálculo del sistema y el dinero en físico antes del traspaso
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] text-ink-muted uppercase font-semibold">Esperado en Sistema:</span>
                    <p className="text-[16px] font-black text-ink-strong">S/ {expectedCashInDrawer.toFixed(2)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[12px] font-bold text-ink-muted-2 mb-1">
                      Dinero Físico Contado en Caja (S/) *
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-ink-muted text-[14px] font-bold">S/</span>
                      <input
                        type="number"
                        step="0.10"
                        min="0"
                        required
                        value={reportedCash}
                        onChange={(e) => setReportedCash(parseFloat(e.target.value) || 0)}
                        className="w-full bg-panel-30 border border-edge-outline rounded-xl pl-8 pr-3 py-2 text-[15px] font-bold text-ink-strong focus:outline-none focus:border-edge-brand"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[12px] font-bold text-ink-muted-2 mb-1">
                      Fondo para Próximo Turno {nextShift} (S/)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-ink-muted text-[14px] font-bold">S/</span>
                      <input
                        type="number"
                        step="10"
                        min="0"
                        required
                        value={initialForNext}
                        onChange={(e) => setInitialForNext(parseFloat(e.target.value) || 0)}
                        className="w-full bg-panel-30 border border-edge-outline rounded-xl pl-8 pr-3 py-2 text-[15px] font-bold text-ink-strong focus:outline-none focus:border-edge-brand"
                      />
                    </div>
                  </div>
                </div>

                {/* Live Difference Semaphore */}
                <div
                  className={`p-3 rounded-xl border flex items-center justify-between ${
                    difference === 0
                      ? 'bg-surface-success-strong-3 border-edge-success-3 text-ink-success-2'
                      : difference > 0
                      ? 'bg-surface-info-strong-2 border-edge-info-5 text-ink-info-2'
                      : 'bg-surface-danger-strong-3 border-edge-danger-5 text-ink-danger-2'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[20px]">
                      {difference === 0 ? 'check_circle' : difference > 0 ? 'trending_up' : 'warning'}
                    </span>
                    <span className="text-[13px] font-bold">
                      {difference === 0
                        ? 'Caja Cuadrada Perfectamente'
                        : difference > 0
                        ? `Sobrante en Caja: +S/ ${difference.toFixed(2)}`
                        : `Faltante en Caja: S/ ${difference.toFixed(2)}`}
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold opacity-80">
                    {difference !== 0 ? 'Se generará asiento de ajuste de arqueo' : 'Sin desvíos'}
                  </span>
                </div>

                <div>
                  <label className="block text-[12px] font-medium text-ink-muted-2 mb-1">
                    Observaciones del Cierre / Novedades del Turno
                  </label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Ej. Cierre sin incidentes, se deja sencillo para cambio en monedas..."
                    className="w-full bg-panel-30 border border-edge-outline rounded-xl p-2.5 text-[13px] text-ink-body focus:outline-none focus:border-edge-brand resize-none"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsShiftModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-edge-outline-2 text-ink-muted-2 hover:text-ink-strong hover:bg-panel-3 text-[13px] font-bold transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-payment-start to-surface-gold-4 text-ink-on-accent-3 font-black text-[13px] hover:brightness-110 shadow-lg flex items-center gap-2 transition-all"
                >
                  <span className="material-symbols-outlined text-[18px]">lock</span>
                  Confirmar Cierre {currentCompanyShift} y Abrir {nextShift}
                </button>
              </div>
            </form>
          ) : (
            /* Historial de Turnos */
            <div className="space-y-3">
              {filteredHistory.length === 0 ? (
                <div className="text-center py-12 text-ink-muted">
                  <span className="material-symbols-outlined text-[36px] text-ink-outline mb-2">history_toggle_off</span>
                  <p className="text-[14px]">No hay cierres de turno registrados aún en esta sesión.</p>
                </div>
              ) : (
                filteredHistory.map((record) => (
                  <div
                    key={record.id}
                    className="bg-panel-32 border border-edge-outline-3 rounded-xl p-3.5 space-y-2"
                  >
                    <div className="flex items-center justify-between border-b border-edge-outline-5 pb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                            record.shift === 'Día'
                              ? 'bg-surface-warning-strong-7 text-ink-warning-2 border border-edge-warning-3'
                              : 'bg-surface-accent-strong text-ink-accent-2 border border-edge-accent'
                          }`}
                        >
                          Turno {record.shift}
                        </span>
                        <span className="text-[12px] font-bold text-ink-body">
                          {record.companyId === 'el-tayta' ? 'El Tayta' : 'El Sabroso'}
                        </span>
                      </div>
                      <span className="text-[11px] text-ink-muted">
                        Cerrado: {record.closedAt} por {record.closedBy}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[12px]">
                      <div>
                        <span className="text-ink-muted">Total Ventas:</span>
                        <p className="font-bold text-ink-gold">S/ {record.totalSales.toFixed(2)}</p>
                      </div>
                      <div>
                        <span className="text-ink-muted">Efectivo Sistema:</span>
                        <p className="font-bold text-ink-strong">S/ {(record.systemCashExpected ?? 0).toFixed(2)}</p>
                      </div>
                      <div>
                        <span className="text-ink-muted">Efectivo Físico:</span>
                        <p className="font-bold text-ink-strong">S/ {(record.finalCashReported ?? 0).toFixed(2)}</p>
                      </div>
                      <div>
                        <span className="text-ink-muted">Diferencia:</span>
                        <p
                          className={`font-black ${
                            (record.cashDifference ?? 0) === 0
                              ? 'text-ink-success'
                              : (record.cashDifference ?? 0) > 0
                              ? 'text-ink-info-3'
                              : 'text-ink-danger-3'
                          }`}
                        >
                          {(record.cashDifference ?? 0) > 0 ? '+' : ''}
                          S/ {(record.cashDifference ?? 0).toFixed(2)}
                        </p>
                      </div>
                    </div>

                    {record.notes && (
                      <p className="text-[11px] text-ink-muted-7 bg-panel-4 p-2 rounded-lg border border-edge-outline-8">
                        Nota: {record.notes}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
