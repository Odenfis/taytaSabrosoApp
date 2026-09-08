import React, { useState } from 'react';
import { usePOS } from '../context/POSContext';
import { CompanyId, ShiftType } from '../types';

export const ShiftModal: React.FC = () => {
  const {
    isShiftModalOpen,
    setIsShiftModalOpen,
    companyShifts,
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
    .filter((t) => t.isIncome && (t.paymentMethod === 'Efectivo' || !t.bankAccountId))
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
        (t.bankAccountId !== undefined ||
          (t.description && t.description.toLowerCase().includes('transferencia')))
    )
    .reduce((sum, t) => sum + t.amount, 0);

  const totalSales = cashSales + cardSales + walletSales;
  const cashExpenses = compTxs
    .filter((t) => !t.isIncome && (!t.bankAccountId || t.type === 'Caja Chica'))
    .reduce((sum, t) => sum + t.amount, 0);

  const initialCash = 350.0;
  const expectedCashInDrawer = +(initialCash + cashSales - cashExpenses).toFixed(2);

  const [reportedCash, setReportedCash] = useState<number>(expectedCashInDrawer);
  const [initialForNext, setInitialForNext] = useState<number>(350.0);
  const [notes, setNotes] = useState<string>('');

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
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="bg-[#1c1b1b] border border-[#54433c] rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#54433c]/60 flex items-center justify-between bg-[#161515]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#823b19]/30 border border-[#ffb597]/40 flex items-center justify-center text-[#ffb597]">
              <span className="material-symbols-outlined text-[24px]">
                {currentCompanyShift === 'Día' ? 'wb_sunny' : 'bedtime'}
              </span>
            </div>
            <div>
              <h2 className="text-[17px] sm:text-[19px] font-black text-[#ffdbcd]">
                Control de Turnos y Cierre de Caja
              </h2>
              <p className="text-[12px] text-[#dac1b8]/70">
                Gestión manual de 2 turnos (Día / Noche) por cada empresa
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsShiftModalOpen(false)}
            className="text-[#dac1b8]/60 hover:text-white p-1.5 rounded-lg hover:bg-[#2a2a2a] transition-colors"
          >
            <span className="material-symbols-outlined text-[22px]">close</span>
          </button>
        </div>

        {/* Tab Controls & Company Switcher */}
        <div className="px-4 sm:px-5 pt-3 pb-2 border-b border-[#54433c]/40 flex flex-wrap items-center justify-between gap-2 bg-[#191818]">
          <div className="flex gap-1 bg-[#121212] p-1 rounded-xl border border-[#54433c]/40">
            <button
              type="button"
              onClick={() => setActiveTab('cambiar')}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'cambiar'
                  ? 'bg-[#823b19] text-[#ffdbcd] shadow-sm'
                  : 'text-[#dac1b8]/70 hover:text-white'
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
                  ? 'bg-[#823b19] text-[#ffdbcd] shadow-sm'
                  : 'text-[#dac1b8]/70 hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">history</span>
              Historial de Turnos ({shiftRecords.length})
            </button>
          </div>

          {/* Target Company Pill */}
          <div className="flex items-center gap-1 bg-[#121212] p-1 rounded-xl border border-[#54433c]/40">
            <button
              type="button"
              onClick={() => {
                setTargetCompany('el-tayta');
                setReportedCash(expectedCashInDrawer);
              }}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all ${
                targetCompany === 'el-tayta'
                  ? 'bg-[#823b19] text-[#ffdbcd]'
                  : 'text-[#dac1b8]/60 hover:text-white'
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
                  ? 'bg-[#ebc246] text-[#352800]'
                  : 'text-[#dac1b8]/60 hover:text-white'
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
              <div className="bg-[#242323] border border-[#54433c]/60 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    className={`material-symbols-outlined text-[28px] ${
                      currentCompanyShift === 'Día' ? 'text-amber-400' : 'text-indigo-400'
                    }`}
                  >
                    {currentCompanyShift === 'Día' ? 'wb_sunny' : 'nightlight'}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] uppercase tracking-wider text-[#dac1b8]/70 font-bold">
                        Turno En Curso:
                      </span>
                      <span
                        className={`text-[13px] font-black px-2 py-0.5 rounded-md ${
                          currentCompanyShift === 'Día'
                            ? 'bg-amber-950/60 text-amber-300 border border-amber-500/40'
                            : 'bg-indigo-950/60 text-indigo-300 border border-indigo-500/40'
                        }`}
                      >
                        Turno {currentCompanyShift}
                      </span>
                    </div>
                    <p className="text-[12px] text-[#dac1b8]/80 mt-0.5">
                      Empresa: <strong className="text-[#ffb597]">{targetCompany === 'el-tayta' ? 'El Tayta (Criollo & Marino)' : 'El Sabroso (Brasas & Parrillas)'}</strong> • Operador: {currentUser?.name}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-[12px] bg-[#1a1919] px-3 py-1.5 rounded-lg border border-[#54433c]/40 text-[#dac1b8]">
                  <span>Próximo Turno al Cerrar:</span>
                  <span className="font-bold text-[#ebc246]">Turno {nextShift}</span>
                </div>
              </div>

              {/* Shift Sales & Cash Breakdown */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="bg-[#191818] border border-[#54433c]/40 p-2.5 rounded-xl">
                  <p className="text-[11px] text-[#dac1b8]/60 font-semibold">Fondo Apertura</p>
                  <p className="text-[15px] font-bold text-[#e5e2e1]">S/ {initialCash.toFixed(2)}</p>
                </div>
                <div className="bg-[#191818] border border-[#54433c]/40 p-2.5 rounded-xl">
                  <p className="text-[11px] text-[#dac1b8]/60 font-semibold">Ventas Efectivo</p>
                  <p className="text-[15px] font-bold text-emerald-400">+ S/ {cashSales.toFixed(2)}</p>
                </div>
                <div className="bg-[#191818] border border-[#54433c]/40 p-2.5 rounded-xl">
                  <p className="text-[11px] text-[#dac1b8]/60 font-semibold">Egresos de Caja</p>
                  <p className="text-[15px] font-bold text-rose-400">- S/ {cashExpenses.toFixed(2)}</p>
                </div>
                <div className="bg-[#191818] border border-[#54433c]/40 p-2.5 rounded-xl">
                  <p className="text-[11px] text-[#dac1b8]/60 font-semibold">Tarjetas &amp; Yape</p>
                  <p className="text-[15px] font-bold text-[#ebc246]">S/ {(cardSales + walletSales).toFixed(2)}</p>
                </div>
              </div>

              {/* Arqueo de Caja Form */}
              <div className="bg-[#141313] border border-[#54433c]/70 rounded-xl p-4 space-y-3.5">
                <div className="flex items-center justify-between pb-2 border-b border-[#54433c]/40">
                  <div>
                    <h3 className="text-[14px] font-bold text-[#ffdbcd] flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[18px] text-[#ebc246]">point_of_sale</span>
                      Arqueo de Efectivo Físico en Cajón
                    </h3>
                    <p className="text-[11px] text-[#dac1b8]/70">
                      Cuadre entre el cálculo del sistema y el dinero en físico antes del traspaso
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] text-[#dac1b8]/60 uppercase font-semibold">Esperado en Sistema:</span>
                    <p className="text-[16px] font-black text-white">S/ {expectedCashInDrawer.toFixed(2)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[12px] font-bold text-[#dac1b8] mb-1">
                      Dinero Físico Contado en Caja (S/) *
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-[#dac1b8]/60 text-[14px] font-bold">S/</span>
                      <input
                        type="number"
                        step="0.10"
                        min="0"
                        required
                        value={reportedCash}
                        onChange={(e) => setReportedCash(parseFloat(e.target.value) || 0)}
                        className="w-full bg-[#1e1d1d] border border-[#54433c] rounded-xl pl-8 pr-3 py-2 text-[15px] font-bold text-white focus:outline-none focus:border-[#ffb597]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[12px] font-bold text-[#dac1b8] mb-1">
                      Fondo para Próximo Turno {nextShift} (S/)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-[#dac1b8]/60 text-[14px] font-bold">S/</span>
                      <input
                        type="number"
                        step="10"
                        min="0"
                        required
                        value={initialForNext}
                        onChange={(e) => setInitialForNext(parseFloat(e.target.value) || 0)}
                        className="w-full bg-[#1e1d1d] border border-[#54433c] rounded-xl pl-8 pr-3 py-2 text-[15px] font-bold text-white focus:outline-none focus:border-[#ffb597]"
                      />
                    </div>
                  </div>
                </div>

                {/* Live Difference Semaphore */}
                <div
                  className={`p-3 rounded-xl border flex items-center justify-between ${
                    difference === 0
                      ? 'bg-emerald-950/30 border-emerald-500/50 text-emerald-300'
                      : difference > 0
                      ? 'bg-blue-950/30 border-blue-500/50 text-blue-300'
                      : 'bg-rose-950/30 border-rose-500/50 text-rose-300'
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
                  <label className="block text-[12px] font-medium text-[#dac1b8] mb-1">
                    Observaciones del Cierre / Novedades del Turno
                  </label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Ej. Cierre sin incidentes, se deja sencillo para cambio en monedas..."
                    className="w-full bg-[#1e1d1d] border border-[#54433c] rounded-xl p-2.5 text-[13px] text-[#e5e2e1] focus:outline-none focus:border-[#ffb597] resize-none"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsShiftModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-[#54433c]/60 text-[#dac1b8] hover:text-white hover:bg-[#2a2a2a] text-[13px] font-bold transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#823b19] to-[#ebc246] text-[#201511] font-black text-[13px] hover:brightness-110 shadow-lg flex items-center gap-2 transition-all"
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
                <div className="text-center py-12 text-[#dac1b8]/60">
                  <span className="material-symbols-outlined text-[36px] text-[#54433c] mb-2">history_toggle_off</span>
                  <p className="text-[14px]">No hay cierres de turno registrados aún en esta sesión.</p>
                </div>
              ) : (
                filteredHistory.map((record) => (
                  <div
                    key={record.id}
                    className="bg-[#191818] border border-[#54433c]/50 rounded-xl p-3.5 space-y-2"
                  >
                    <div className="flex items-center justify-between border-b border-[#54433c]/40 pb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                            record.shift === 'Día'
                              ? 'bg-amber-950/60 text-amber-300 border border-amber-500/40'
                              : 'bg-indigo-950/60 text-indigo-300 border border-indigo-500/40'
                          }`}
                        >
                          Turno {record.shift}
                        </span>
                        <span className="text-[12px] font-bold text-[#e5e2e1]">
                          {record.companyId === 'el-tayta' ? 'El Tayta' : 'El Sabroso'}
                        </span>
                      </div>
                      <span className="text-[11px] text-[#dac1b8]/60">
                        Cerrado: {record.closedAt} por {record.closedBy}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[12px]">
                      <div>
                        <span className="text-[#dac1b8]/60">Total Ventas:</span>
                        <p className="font-bold text-[#ebc246]">S/ {record.totalSales.toFixed(2)}</p>
                      </div>
                      <div>
                        <span className="text-[#dac1b8]/60">Efectivo Sistema:</span>
                        <p className="font-bold text-white">S/ {(record.systemCashExpected ?? 0).toFixed(2)}</p>
                      </div>
                      <div>
                        <span className="text-[#dac1b8]/60">Efectivo Físico:</span>
                        <p className="font-bold text-white">S/ {(record.finalCashReported ?? 0).toFixed(2)}</p>
                      </div>
                      <div>
                        <span className="text-[#dac1b8]/60">Diferencia:</span>
                        <p
                          className={`font-black ${
                            (record.cashDifference ?? 0) === 0
                              ? 'text-emerald-400'
                              : (record.cashDifference ?? 0) > 0
                              ? 'text-blue-400'
                              : 'text-rose-400'
                          }`}
                        >
                          {(record.cashDifference ?? 0) > 0 ? '+' : ''}
                          S/ {(record.cashDifference ?? 0).toFixed(2)}
                        </p>
                      </div>
                    </div>

                    {record.notes && (
                      <p className="text-[11px] text-[#dac1b8]/75 bg-[#121212] p-2 rounded-lg border border-[#54433c]/30">
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
