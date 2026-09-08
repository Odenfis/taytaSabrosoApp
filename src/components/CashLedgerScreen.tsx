import React, { useState, useMemo } from 'react';
import { usePOS } from '../context/POSContext';
import { TransactionType } from '../types';

export const CashLedgerScreen: React.FC = () => {
  const {
    transactions,
    filteredTransactions: contextFilteredTx,
    totalIngresos,
    totalEgresos,
    saldoActual,
    activeShift,
    activeCompanyId,
    activeCompany,
    bankAccounts,
    filteredBankAccounts,
    setIsShiftModalOpen,
    addManualTransaction,
  } = usePOS();

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'ingresos' | 'egresos'>('all');
  const [accountFilter, setAccountFilter] = useState<string>('all'); // 'all', 'caja', or bankAccountId
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Form State for new movement
  const [formIsIncome, setFormIsIncome] = useState(false);
  const [formType, setFormType] = useState<TransactionType>('Pago Proveedor');
  const [formAmount, setFormAmount] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formBankAccountId, setFormBankAccountId] = useState<string>('');
  const [formReferenceNumber, setFormReferenceNumber] = useState<string>('');

  const filteredTransactions = useMemo(() => {
    return contextFilteredTx.filter((tx) => {
      const matchSearch =
        searchQuery === '' ||
        tx.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tx.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (tx.ticketNumber && tx.ticketNumber.includes(searchQuery)) ||
        (tx.bankAccountAlias && tx.bankAccountAlias.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (tx.referenceNumber && tx.referenceNumber.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchType =
        typeFilter === 'all' ||
        (typeFilter === 'ingresos' && tx.isIncome) ||
        (typeFilter === 'egresos' && !tx.isIncome);

      let matchAccount = true;
      if (accountFilter === 'caja') {
        matchAccount = !tx.bankAccountId;
      } else if (accountFilter !== 'all') {
        matchAccount = tx.bankAccountId === accountFilter;
      }

      return matchSearch && matchType && matchAccount;
    });
  }, [contextFilteredTx, searchQuery, typeFilter, accountFilter]);

  // Total balance in bank accounts for active company
  const totalBankBalance = useMemo(() => {
    return filteredBankAccounts.reduce((acc, b) => acc + b.currentBalance, 0);
  }, [filteredBankAccounts]);

  const totalLiquidBalance = +(saldoActual + totalBankBalance).toFixed(2);

  const handleSaveMovement = (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(formAmount);
    if (!amountNum || amountNum <= 0 || !formDescription.trim()) return;

    addManualTransaction(
      formType,
      formDescription.trim(),
      amountNum,
      formIsIncome,
      formBankAccountId || undefined,
      undefined,
      formReferenceNumber || undefined
    );

    setIsAddModalOpen(false);
    setFormAmount('');
    setFormDescription('');
    setFormBankAccountId('');
    setFormReferenceNumber('');
  };

  return (
    <main
      id="cash-ledger-screen"
      className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col gap-6 bg-[#121212] select-none"
    >
      {/* Header & Main Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-[20px] md:text-[24px] font-bold text-[#ffb597] tracking-tight">
              Libro de Caja &amp; Cuentas Bancarias
            </h2>
            <button
              onClick={() => setIsShiftModalOpen(true)}
              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[#823b19]/30 text-[#ffb597] border border-[#ffb597]/40 flex items-center gap-1.5 hover:bg-[#823b19]/50 transition-all cursor-pointer"
              title="Click para cuadre de caja y cambio de turno"
            >
              <span className="material-symbols-outlined text-[14px]">
                {activeShift === 'Día' ? 'wb_sunny' : 'nightlight'}
              </span>
              <span>Turno {activeShift}</span>
              <span className="text-[9px] uppercase tracking-wider bg-[#ffb597]/20 px-1 py-0.5 rounded">
                Arqueo
              </span>
            </button>
          </div>
          <p className="text-[13px] text-[#dac1b8]/80 mt-0.5">
            Flujo de efectivo diario en caja y saldos disponibles en cuentas bancarias ({activeCompany.tradeName}).
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            id="btn-open-shift-modal"
            onClick={() => setIsShiftModalOpen(true)}
            className="bg-[#242323] hover:bg-[#2d2c2c] text-[#ffdbcd] border border-[#54433c] px-3.5 py-2 rounded-xl font-bold text-[13px] flex items-center gap-2 transition-all shadow-sm cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px] text-[#ebc246]">sync_alt</span>
            <span>Cerrar / Cambiar Turno</span>
          </button>

          <button
            id="btn-add-movement"
            onClick={() => setIsAddModalOpen(true)}
            className="bg-[#823b19] hover:bg-[#944926] text-white px-4 py-2 rounded-xl font-bold text-[13px] flex items-center gap-2 transition-all shadow-md active:scale-95 cursor-pointer shrink-0"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            <span>Registrar Movimiento</span>
          </button>
        </div>
      </div>

      {/* Metric Cards Grid (including Bank Balances) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Ingresos Totales */}
        <div className="bg-[#1c1b1b] border border-[#54433c]/60 rounded-2xl p-4 sm:p-5 flex flex-col justify-between shadow-sm">
          <div className="flex justify-between items-start">
            <span className="text-[12px] font-semibold text-[#dac1b8]">Ingresos del Turno</span>
            <div className="w-9 h-9 rounded-xl bg-[#60d4fb]/10 text-[#60d4fb] flex items-center justify-center border border-[#60d4fb]/30">
              <span className="material-symbols-outlined text-[20px]">trending_up</span>
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-[24px] font-black text-[#60d4fb] tracking-tight">
              S/ {totalIngresos.toFixed(2)}
            </h3>
            <p className="text-[11px] text-[#dac1b8]/70 mt-0.5">
              Ventas en mesas y barra
            </p>
          </div>
        </div>

        {/* Egresos Totales */}
        <div className="bg-[#1c1b1b] border border-[#54433c]/60 rounded-2xl p-4 sm:p-5 flex flex-col justify-between shadow-sm">
          <div className="flex justify-between items-start">
            <span className="text-[12px] font-semibold text-[#dac1b8]">Egresos / Pagos</span>
            <div className="w-9 h-9 rounded-xl bg-[#ffb4ab]/10 text-[#ffb4ab] flex items-center justify-center border border-[#ffb4ab]/30">
              <span className="material-symbols-outlined text-[20px]">trending_down</span>
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-[24px] font-black text-[#ffb4ab] tracking-tight">
              S/ {totalEgresos.toFixed(2)}
            </h3>
            <p className="text-[11px] text-[#dac1b8]/70 mt-0.5">
              Compras y caja chica
            </p>
          </div>
        </div>

        {/* Saldo en Caja Física */}
        <div className="bg-[#1c1b1b] border border-[#ebc246]/40 rounded-2xl p-4 sm:p-5 flex flex-col justify-between shadow-[0_4px_20px_rgba(235,194,70,0.12)]">
          <div className="flex justify-between items-start">
            <span className="text-[12px] font-semibold text-[#dac1b8]">Efectivo en Caja</span>
            <div className="w-9 h-9 rounded-xl bg-[#ebc246]/15 text-[#ebc246] flex items-center justify-center border border-[#ebc246]/40">
              <span className="material-symbols-outlined text-[20px]">point_of_sale</span>
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-[24px] font-black text-[#ebc246] tracking-tight">
              S/ {saldoActual.toFixed(2)}
            </h3>
            <p className="text-[11px] text-[#dac1b8]/70 mt-0.5">
              Billetes y monedas en gaveta
            </p>
          </div>
        </div>

        {/* Saldo en Bancos */}
        <div className="bg-[#1c1b1b] border border-emerald-500/40 rounded-2xl p-4 sm:p-5 flex flex-col justify-between shadow-[0_4px_20px_rgba(16,185,129,0.12)]">
          <div className="flex justify-between items-start">
            <span className="text-[12px] font-semibold text-[#dac1b8]">Saldo en Bancos</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-950/40 text-emerald-400 flex items-center justify-center border border-emerald-500/40">
              <span className="material-symbols-outlined text-[20px]">account_balance</span>
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-[24px] font-black text-emerald-400 tracking-tight">
              S/ {totalBankBalance.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
            </h3>
            <p className="text-[11px] text-[#dac1b8]/70 mt-0.5">
              {(filteredBankAccounts || []).length} cuenta(s) vinculada(s)
            </p>
          </div>
        </div>
      </div>

      {/* Mini Bank Accounts Ribbon */}
      {(filteredBankAccounts || []).length > 0 && (
        <div className="bg-[#181717] border border-[#54433c]/40 rounded-xl p-3 flex flex-wrap items-center gap-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#dac1b8]/60 flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px] text-[#ebc246]">account_balance</span>
            Cuentas Activas:
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {(filteredBankAccounts || []).map((b) => (
              <button
                key={b.id}
                onClick={() => setAccountFilter(accountFilter === b.id ? 'all' : b.id)}
                className={`text-[12px] px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1.5 ${
                  accountFilter === b.id
                    ? 'bg-[#823b19] border-[#ffb597] text-[#ffdbcd] font-bold'
                    : 'bg-[#201f1f] border-[#54433c]/50 text-[#dac1b8] hover:text-white'
                }`}
              >
                <span className="font-semibold">{b.bankName}:</span>
                <span className="font-mono text-emerald-400">S/ {b.currentBalance.toFixed(2)}</span>
                <span className="text-[10px] text-[#dac1b8]/60">({b.alias.split(' ')[0]})</span>
              </button>
            ))}
            <button
              onClick={() => setAccountFilter(accountFilter === 'caja' ? 'all' : 'caja')}
              className={`text-[12px] px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1.5 ${
                accountFilter === 'caja'
                  ? 'bg-[#ebc246] border-[#ebc246] text-[#352800] font-bold'
                  : 'bg-[#201f1f] border-[#54433c]/50 text-[#dac1b8] hover:text-white'
              }`}
            >
              <span>Solo Caja Efectivo</span>
            </button>
            {accountFilter !== 'all' && (
              <button
                onClick={() => setAccountFilter('all')}
                className="text-[11px] text-[#ffb597] hover:underline"
              >
                Ver Todas
              </button>
            )}
          </div>
        </div>
      )}

      {/* Transactions Section */}
      <div className="bg-[#1c1b1b] border border-[#54433c]/60 rounded-2xl p-4 md:p-6 space-y-4 shadow-sm">
        {/* Table Toolbar */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#ffb597]">receipt</span>
            <h3 className="text-[16px] font-bold text-[#e5e2e1]">Movimientos Registrados</h3>
            <span className="text-[11px] bg-[#2a2a2a] text-[#dac1b8] px-2 py-0.5 rounded-full font-semibold">
              {(filteredTransactions || []).length}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {/* Filter Tabs */}
            <div className="flex bg-[#2a2a2a] p-1 rounded-xl border border-[#54433c]/40 text-[12px] font-semibold">
              <button
                onClick={() => setTypeFilter('all')}
                className={`px-3 py-1.5 rounded-lg transition-colors ${
                  typeFilter === 'all' ? 'bg-[#ebc246] text-[#3d2f00]' : 'text-[#dac1b8] hover:text-white'
                }`}
              >
                Todos
              </button>
              <button
                onClick={() => setTypeFilter('ingresos')}
                className={`px-3 py-1.5 rounded-lg transition-colors ${
                  typeFilter === 'ingresos' ? 'bg-[#60d4fb] text-[#003543]' : 'text-[#dac1b8] hover:text-white'
                }`}
              >
                Ingresos
              </button>
              <button
                onClick={() => setTypeFilter('egresos')}
                className={`px-3 py-1.5 rounded-lg transition-colors ${
                  typeFilter === 'egresos' ? 'bg-[#ffb4ab] text-[#690005]' : 'text-[#dac1b8] hover:text-white'
                }`}
              >
                Egresos
              </button>
            </div>

            {/* Search */}
            <div className="relative flex-1 sm:w-56">
              <input
                type="text"
                placeholder="Buscar (banco, ref, detalle)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#2a2a2a] border border-[#54433c]/60 rounded-xl px-3 py-1.5 text-[12px] text-[#e5e2e1] focus:border-[#60d4fb] focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Transactions Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#54433c]/40 text-[11px] font-semibold text-[#dac1b8]/70 uppercase tracking-wider">
                <th className="py-3 px-3">Hora / Turno</th>
                <th className="py-3 px-3">Tipo &amp; Cuenta</th>
                <th className="py-3 px-3">Descripción &amp; N° Operación</th>
                <th className="py-3 px-3 text-right">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#54433c]/20 text-[13px]">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-[#dac1b8]/60">
                    No se encontraron transacciones con los criterios seleccionados.
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-[#252524] transition-colors">
                    <td className="py-3.5 px-3 text-[#dac1b8] whitespace-nowrap">
                      <div className="font-medium text-white">{tx.time}</div>
                      <div className="text-[10px] text-[#dac1b8]/60">
                        {tx.shift ? `Turno ${tx.shift}` : 'Turno General'}
                      </div>
                    </td>
                    <td className="py-3.5 px-3 whitespace-nowrap">
                      <div className="flex flex-col gap-1">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold w-max ${
                            tx.isIncome
                              ? 'bg-[#60d4fb]/10 text-[#60d4fb] border border-[#60d4fb]/30'
                              : 'bg-[#ffb4ab]/10 text-[#ffb4ab] border border-[#ffb4ab]/30'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[13px]">
                            {tx.isIncome ? 'arrow_upward' : 'arrow_downward'}
                          </span>
                          <span>{tx.type}</span>
                        </span>
                        {tx.bankAccountAlias ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-500/30 w-max">
                            <span className="material-symbols-outlined text-[11px]">account_balance</span>
                            {tx.bankAccountAlias}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#dac1b8]/70 bg-zinc-800/60 px-1.5 py-0.5 rounded w-max">
                            <span className="material-symbols-outlined text-[11px]">point_of_sale</span>
                            Caja Chica Efectivo
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-3 text-[#e5e2e1]">
                      <div className="font-medium">{tx.description}</div>
                      <div className="flex items-center gap-3 text-[11px] text-[#dac1b8]/70 mt-0.5">
                        {tx.paymentMethod && <span>Método: {tx.paymentMethod}</span>}
                        {tx.referenceNumber && (
                          <span className="font-mono bg-[#141313] px-1.5 py-0.5 rounded border border-[#54433c]/40 text-[#ebc246]">
                            Ref: {tx.referenceNumber}
                          </span>
                        )}
                        {tx.tableNumber && <span>Mesa: {tx.tableNumber}</span>}
                      </div>
                    </td>
                    <td
                      className={`py-3.5 px-3 text-right font-bold text-[14px] whitespace-nowrap ${
                        tx.isIncome ? 'text-[#60d4fb]' : 'text-[#ffb4ab]'
                      }`}
                    >
                      {tx.isIncome ? '+' : '-'} S/ {tx.amount.toFixed(2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual Movement Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[#1e1e1e] border border-[#54433c] rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#54433c]/60">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#ffb597]">edit_calendar</span>
                <h2 className="text-[18px] font-bold text-[#e5e2e1]">Registrar Movimiento de Caja / Banco</h2>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-[#dac1b8] hover:text-[#e5e2e1] p-1.5 rounded-lg hover:bg-[#2a2a2a]"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Income / Expense Switch */}
            <div className="grid grid-cols-2 gap-2 bg-[#2a2a2a] p-1 rounded-xl border border-[#54433c]/60">
              <button
                type="button"
                onClick={() => {
                  setFormIsIncome(false);
                  setFormType('Pago Proveedor');
                }}
                className={`py-2 rounded-lg text-[13px] font-bold flex items-center justify-center gap-1.5 transition-all ${
                  !formIsIncome ? 'bg-[#ffb4ab] text-[#690005] shadow' : 'text-[#dac1b8]'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">trending_down</span>
                <span>Egreso (Gasto)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setFormIsIncome(true);
                  setFormType('Ingreso Extra');
                }}
                className={`py-2 rounded-lg text-[13px] font-bold flex items-center justify-center gap-1.5 transition-all ${
                  formIsIncome ? 'bg-[#60d4fb] text-[#003543] shadow' : 'text-[#dac1b8]'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">trending_up</span>
                <span>Ingreso Extra</span>
              </button>
            </div>

            <form onSubmit={handleSaveMovement} className="space-y-3.5">
              {/* Movement Type */}
              <div>
                <label className="block text-[12px] font-bold text-[#dac1b8] mb-1">
                  Categoría del Movimiento
                </label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as TransactionType)}
                  className="w-full bg-[#2a2a2a] border border-[#54433c]/60 rounded-xl px-3 py-2 text-[13px] text-[#e5e2e1] focus:border-[#60d4fb] focus:outline-none"
                >
                  {formIsIncome ? (
                    <>
                      <option value="Ingreso Extra">Ingreso Extra (Propinas, Delivery particular)</option>
                      <option value="Venta (Mesa)">Venta Mesa / Salón</option>
                      <option value="Venta (Barra)">Venta Barra</option>
                    </>
                  ) : (
                    <>
                      <option value="Pago Proveedor">Pago a Proveedor de Insumos</option>
                      <option value="Caja Chica">Gasto Operativo Menor (Caja Chica)</option>
                      <option value="Retiro de Caja">Retiro Parcial / Bóveda</option>
                    </>
                  )}
                </select>
              </div>

              {/* Source Account: Cash Register vs Bank Account */}
              <div>
                <label className="block text-[12px] font-bold text-[#dac1b8] mb-1">
                  Cuenta Origen / Destino de los Fondos
                </label>
                <select
                  value={formBankAccountId}
                  onChange={(e) => setFormBankAccountId(e.target.value)}
                  className="w-full bg-[#2a2a2a] border border-[#54433c]/60 rounded-xl px-3 py-2 text-[13px] text-[#e5e2e1] focus:border-[#60d4fb] focus:outline-none"
                >
                  <option value="">Caja Chica Efectivo (Gaveta de Caja)</option>
                  {filteredBankAccounts.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.bankName} - {b.alias} (Saldo: S/ {b.currentBalance.toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-[12px] font-bold text-[#dac1b8] mb-1">
                  Monto (S/) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-[#dac1b8] font-bold text-[14px]">
                    S/
                  </span>
                  <input
                    type="number"
                    step="0.10"
                    min="0.10"
                    placeholder="0.00"
                    required
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    className="w-full bg-[#2a2a2a] border border-[#54433c]/60 rounded-xl pl-9 pr-3 py-2 text-[14px] text-white font-bold focus:border-[#60d4fb] focus:outline-none"
                  />
                </div>
              </div>

              {/* Reference Number */}
              <div>
                <label className="block text-[12px] font-bold text-[#dac1b8] mb-1">
                  N° de Operación / Voucher (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ej. OP-44910293 o Factura F001-22"
                  value={formReferenceNumber}
                  onChange={(e) => setFormReferenceNumber(e.target.value)}
                  className="w-full bg-[#2a2a2a] border border-[#54433c]/60 rounded-xl px-3 py-2 text-[13px] text-white focus:border-[#60d4fb] focus:outline-none"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-[12px] font-bold text-[#dac1b8] mb-1">
                  Detalle / Motivo *
                </label>
                <input
                  type="text"
                  placeholder="Ej. Compra de limón de emergencia en mercado..."
                  required
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full bg-[#2a2a2a] border border-[#54433c]/60 rounded-xl px-3 py-2 text-[13px] text-white focus:border-[#60d4fb] focus:outline-none"
                />
              </div>

              {/* Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#54433c]/40">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-[13px] font-bold text-[#dac1b8] hover:bg-[#2a2a2a]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={`px-5 py-2 rounded-xl text-[13px] font-black shadow-md ${
                    formIsIncome
                      ? 'bg-[#60d4fb] text-[#003543] hover:bg-[#4bc7f2]'
                      : 'bg-[#ffb4ab] text-[#690005] hover:bg-[#ffa094]'
                  }`}
                >
                  Guardar Movimiento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
};
