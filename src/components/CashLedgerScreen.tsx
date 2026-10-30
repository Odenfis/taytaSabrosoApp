import React, { useState, useMemo } from 'react';
import { usePOS } from '../context/POSContext';
import { Transaction, TransactionType } from '../types';
import { apiClient } from '../lib/api';
import { DinerReceiptModal } from './DinerReceiptModal';

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
    companies,
    bankAccounts,
    filteredBankAccounts,
    setIsShiftModalOpen,
    addManualTransaction,
    paymentMethods,
    correctSalePayment,
    offlineState,
  } = usePOS();

  const [correcting, setCorrecting] = useState<Transaction | null>(null);
  const [historicalBill, setHistoricalBill] = useState<{ companyId?: string; tableNumber?: string; ticketNumber: string; order?: { ticketNumber: string }; label: string; documentType: string; recipientName?: string | null; recipientId?: string | null; total: number; items: { quantity: number; orderItem: { name: string; price: number } }[]; transactions: { id: string; amount: number; paymentMethod: string; contributorName?: string | null }[] } | null>(null);
  const [ticketError, setTicketError] = useState('');
  const openDinerTicket = async (tx: Transaction) => {
    if (!tx.orderId || !tx.dinerBillId) return;
    setTicketError('');
    try {
      const bills = await apiClient.get<Array<NonNullable<typeof historicalBill> & { id: string }>>(`/operations/orders/${tx.orderId}/bills`);
      const bill = bills.find((item) => item.id === tx.dinerBillId);
      if (!bill) throw new Error('No se encontró el ticket de este abono.');
      setHistoricalBill({ ...bill, companyId: tx.companyId, tableNumber: tx.tableNumber });
    } catch (error) { setTicketError(error instanceof Error ? error.message : 'No se pudo abrir el ticket.'); }
  };
  const [methodId, setMethodId] = useState('');
  const [correctionReference, setCorrectionReference] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [supervisorPin, setSupervisorPin] = useState('');
  const [correctionId, setCorrectionId] = useState('');
  const [correctionError, setCorrectionError] = useState('');
  const [correctionBusy, setCorrectionBusy] = useState(false);
  const [correctionHistory, setCorrectionHistory] = useState<Array<{
    id: string; createdAt: string; oldMethodName: string | null; newMethodName: string;
    oldBankAccountAlias: string | null; newBankAccountAlias: string | null;
    reason: string; operator: { name: string }; authorizer: { name: string };
  }>>([]);
  const correctionMethods = correcting ? paymentMethods.filter((m) =>
    !m.isDeleted && m.isActive && m.category !== 'Crédito' &&
    (m.companyId === correcting.companyId || m.companyId === 'ambas') &&
    (m.category === 'Efectivo' ? !m.bankAccountId : !!m.bankAccountId) &&
    (!m.bankAccountId || bankAccounts.some((b) => b.id === m.bankAccountId && b.companyId === correcting.companyId && b.isActive && !b.isDeleted && b.currency === 'PEN'))
  ) : [];
  const selectedCorrectionMethod = correctionMethods.find((m) => m.id === methodId);

  const openCorrection = async (tx: Transaction) => {
    setCorrecting(tx);
    setCorrectionId(crypto.randomUUID());
    setMethodId(''); setCorrectionReference(tx.referenceNumber ?? ''); setCorrectionReason('');
    setSupervisorPin(''); setCorrectionError(''); setCorrectionHistory([]);
    try {
      const history = await apiClient.get<typeof correctionHistory>(`/operations/transactions/${encodeURIComponent(tx.id)}/corrections`);
      setCorrectionHistory(history);
    } catch (error) { setCorrectionError(error instanceof Error ? error.message : 'No se pudo cargar el historial.'); }
  };

  const saveCorrection = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!correcting || !selectedCorrectionMethod || correctionBusy) return;
    setCorrectionBusy(true); setCorrectionError('');
    try {
      await correctSalePayment(correcting, correctionId, selectedCorrectionMethod.id, correctionReference, correctionReason, supervisorPin);
      setCorrecting(null); setSupervisorPin('');
    } catch (error) { setCorrectionError(error instanceof Error ? error.message : 'No se pudo corregir el cobro.'); }
    finally { setCorrectionBusy(false); }
  };

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
      className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col gap-6 bg-panel-4 select-none"
    >
      {/* Header & Main Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-[20px] md:text-[24px] font-bold text-ink-brand tracking-tight">
              Libro de Caja &amp; Cuentas Bancarias
            </h2>
            <button
              onClick={() => setIsShiftModalOpen(true)}
              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-surface-brand-solid-3 text-ink-brand border border-edge-brand-3 flex items-center gap-1.5 hover:bg-surface-brand-solid-9 transition-all cursor-pointer"
              title="Click para cuadre de caja y cambio de turno"
            >
              <span className="material-symbols-outlined text-[14px]">
                {activeShift === 'Día' ? 'wb_sunny' : 'nightlight'}
              </span>
              <span>Turno {activeShift}</span>
              <span className="text-[9px] uppercase tracking-wider bg-surface-brand-2 px-1 py-0.5 rounded">
                Arqueo
              </span>
            </button>
          </div>
          <p className="text-[13px] text-ink-muted-5 mt-0.5">
            Flujo de efectivo diario en caja y saldos disponibles en cuentas bancarias ({activeCompany.tradeName}).
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            id="btn-open-shift-modal"
            onClick={() => setIsShiftModalOpen(true)}
            className="bg-panel-33 hover:bg-panel-39 text-ink-heading-brand border border-edge-outline px-3.5 py-2 rounded-xl font-bold text-[13px] flex items-center gap-2 transition-all shadow-sm cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px] text-ink-gold">sync_alt</span>
            <span>Cerrar / Cambiar Turno</span>
          </button>

          <button
            id="btn-add-movement"
            onClick={() => setIsAddModalOpen(true)}
            className="bg-surface-brand-solid hover:bg-surface-brand-hover text-ink-on-solid px-4 py-2 rounded-xl font-bold text-[13px] flex items-center gap-2 transition-all shadow-md active:scale-95 cursor-pointer shrink-0"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            <span>Registrar Movimiento</span>
          </button>
        </div>
      </div>

      {/* Metric Cards Grid (including Bank Balances) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Ingresos Totales */}
        <div className="bg-panel border border-edge-outline-2 rounded-2xl p-4 sm:p-5 flex flex-col justify-between shadow-sm">
          <div className="flex justify-between items-start">
            <span className="text-[12px] font-semibold text-ink-muted-2">Ingresos del Turno</span>
            <div className="w-9 h-9 rounded-xl bg-surface-info-3 text-ink-info flex items-center justify-center border border-edge-info-3">
              <span className="material-symbols-outlined text-[20px]">trending_up</span>
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-[24px] font-black text-ink-info tracking-tight">
              S/ {totalIngresos.toFixed(2)}
            </h3>
            <p className="text-[11px] text-ink-muted-3 mt-0.5">
              Ventas de todas las cuentas (caja + bancos)
            </p>
          </div>
        </div>

        {/* Egresos Totales */}
        <div className="bg-panel border border-edge-outline-2 rounded-2xl p-4 sm:p-5 flex flex-col justify-between shadow-sm">
          <div className="flex justify-between items-start">
            <span className="text-[12px] font-semibold text-ink-muted-2">Egresos / Pagos</span>
            <div className="w-9 h-9 rounded-xl bg-surface-danger-3 text-ink-danger flex items-center justify-center border border-edge-danger-4">
              <span className="material-symbols-outlined text-[20px]">trending_down</span>
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-[24px] font-black text-ink-danger tracking-tight">
              S/ {totalEgresos.toFixed(2)}
            </h3>
            <p className="text-[11px] text-ink-muted-3 mt-0.5">
              Compras y gastos de todas las cuentas
            </p>
          </div>
        </div>

        {/* Saldo en Caja Física */}
        <div className="bg-panel border border-edge-gold-5 rounded-2xl p-4 sm:p-5 flex flex-col justify-between shadow-ui-11">
          <div className="flex justify-between items-start">
            <span className="text-[12px] font-semibold text-ink-muted-2">Efectivo en Caja</span>
            <div className="w-9 h-9 rounded-xl bg-surface-gold-5 text-ink-gold flex items-center justify-center border border-edge-gold-5">
              <span className="material-symbols-outlined text-[20px]">point_of_sale</span>
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-[24px] font-black text-ink-gold tracking-tight">
              S/ {saldoActual.toFixed(2)}
            </h3>
            <p className="text-[11px] text-ink-muted-3 mt-0.5">
              Billetes y monedas en gaveta
            </p>
          </div>
        </div>

        {/* Saldo en Bancos */}
        <div className="bg-panel border border-edge-success rounded-2xl p-4 sm:p-5 flex flex-col justify-between shadow-ui-12">
          <div className="flex justify-between items-start">
            <span className="text-[12px] font-semibold text-ink-muted-2">Saldo en Bancos</span>
            <div className="w-9 h-9 rounded-xl bg-surface-success-strong-6 text-ink-success flex items-center justify-center border border-edge-success">
              <span className="material-symbols-outlined text-[20px]">account_balance</span>
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-[24px] font-black text-ink-success tracking-tight">
              S/ {totalBankBalance.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
            </h3>
            <p className="text-[11px] text-ink-muted-3 mt-0.5">
              {(filteredBankAccounts || []).length} cuenta(s) vinculada(s)
            </p>
          </div>
        </div>
      </div>

      {/* Mini Bank Accounts Ribbon */}
      {(filteredBankAccounts || []).length > 0 && (
        <div className="bg-panel-21 border border-edge-outline-5 rounded-xl p-3 flex flex-wrap items-center gap-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px] text-ink-gold">account_balance</span>
            Cuentas Activas:
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {(filteredBankAccounts || []).map((b) => (
              <button
                key={b.id}
                onClick={() => setAccountFilter(accountFilter === b.id ? 'all' : b.id)}
                aria-pressed={accountFilter === b.id}
                className={`ledger-bank-filter text-[12px] px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1.5 ${
                  accountFilter === b.id
                    ? 'bg-surface-brand-solid border-edge-brand text-ink-on-brand font-bold'
                    : 'bg-panel-31 border-edge-outline-3 text-ink-muted-2 hover:text-ink-strong'
                }`}
              >
                <span className="font-semibold">{b.bankName}:</span>
                <span className="ledger-bank-filter-balance font-mono text-ink-success">S/ {b.currentBalance.toFixed(2)}</span>
                <span className="ledger-bank-filter-alias text-[10px] text-ink-muted">({b.alias.split(' ')[0]})</span>
              </button>
            ))}
            <button
              onClick={() => setAccountFilter(accountFilter === 'caja' ? 'all' : 'caja')}
              className={`text-[12px] px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1.5 ${
                accountFilter === 'caja'
                  ? 'bg-surface-gold-2 border-edge-gold-2 text-ink-foreground font-bold'
                  : 'bg-panel-31 border-edge-outline-3 text-ink-muted-2 hover:text-ink-strong'
              }`}
            >
              <span>Solo Caja Efectivo</span>
            </button>
            {accountFilter !== 'all' && (
              <button
                onClick={() => setAccountFilter('all')}
                className="text-[11px] text-ink-brand hover:underline"
              >
                Ver Todas
              </button>
            )}
          </div>
        </div>
      )}

      {/* Transactions Section */}
      <div className="bg-panel border border-edge-outline-2 rounded-2xl p-4 md:p-6 space-y-4 shadow-sm">
        {/* Table Toolbar */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-ink-brand">receipt</span>
            <h3 className="text-[16px] font-bold text-ink-body">Movimientos Registrados</h3>
            <span className="text-[11px] bg-panel-3 text-ink-muted-2 px-2 py-0.5 rounded-full font-semibold">
              {(filteredTransactions || []).length}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {/* Filter Tabs */}
            <div className="flex bg-panel-3 p-1 rounded-xl border border-edge-outline-5 text-[12px] font-semibold">
              <button
                onClick={() => setTypeFilter('all')}
                className={`px-3 py-1.5 rounded-lg transition-colors ${
                  typeFilter === 'all' ? 'bg-surface-gold-2 text-ink-on-accent' : 'text-ink-muted-2 hover:text-ink-strong'
                }`}
              >
                Todos
              </button>
              <button
                onClick={() => setTypeFilter('ingresos')}
                className={`px-3 py-1.5 rounded-lg transition-colors ${
                  typeFilter === 'ingresos' ? 'bg-surface-info-2 text-ink-on-accent-5' : 'text-ink-muted-2 hover:text-ink-strong'
                }`}
              >
                Ingresos
              </button>
              <button
                onClick={() => setTypeFilter('egresos')}
                className={`px-3 py-1.5 rounded-lg transition-colors ${
                  typeFilter === 'egresos' ? 'bg-surface-danger-2 text-ink-on-accent-6' : 'text-ink-muted-2 hover:text-ink-strong'
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
                className="w-full bg-panel-3 border border-edge-outline-2 rounded-xl px-3 py-1.5 text-[12px] text-ink-body focus:border-edge-info-6 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Transactions Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-edge-outline-5 text-[11px] font-semibold text-ink-muted-3 uppercase tracking-wider">
                <th className="py-3 px-3">Hora / Turno</th>
                <th className="py-3 px-3">Tipo &amp; Cuenta</th>
                <th className="py-3 px-3">Descripción &amp; N° Operación</th>
                <th className="py-3 px-3 text-right">Monto</th>
                <th className="py-3 px-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge-outline-10 text-[13px]">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-ink-muted">
                    No se encontraron transacciones con los criterios seleccionados.
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-panel-37 transition-colors">
                    <td className="py-3.5 px-3 text-ink-muted-2 whitespace-nowrap">
                      <div className="font-medium text-ink-strong">{tx.time}</div>
                      <div className="text-[10px] text-ink-muted">
                        {tx.shift ? `Turno ${tx.shift}` : 'Turno General'}
                      </div>
                    </td>
                    <td className="py-3.5 px-3 whitespace-nowrap">
                      <div className="flex flex-col gap-1">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold w-max ${
                            tx.isIncome
                              ? 'bg-surface-info-3 text-ink-info border border-edge-info-3'
                              : 'bg-surface-danger-3 text-ink-danger border border-edge-danger-4'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[13px]">
                            {tx.isIncome ? 'arrow_upward' : 'arrow_downward'}
                          </span>
                          <span>{tx.type}</span>
                        </span>
                        {tx.bankAccountAlias ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-ink-success bg-surface-success-strong-6 px-1.5 py-0.5 rounded border border-edge-success-2 w-max">
                            <span className="material-symbols-outlined text-[11px]">account_balance</span>
                            {tx.bankAccountAlias}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-ink-muted-3 bg-surface-neutral-3 px-1.5 py-0.5 rounded w-max">
                            <span className="material-symbols-outlined text-[11px]">point_of_sale</span>
                            Caja Chica Efectivo
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-3 text-ink-body">
                      <div className="font-medium">{tx.description}</div>
                      <div className="flex items-center gap-3 text-[11px] text-ink-muted-3 mt-0.5">
                        {tx.paymentMethod && <span>Método: {tx.paymentMethod}</span>}
                        {tx.referenceNumber && (
                          <span className="font-mono bg-panel-29 px-1.5 py-0.5 rounded border border-edge-outline-5 text-ink-gold">
                            Ref: {tx.referenceNumber}
                          </span>
                        )}
                        {tx.tableNumber && <span>Mesa: {tx.tableNumber}</span>}
                        {!!tx.correctionCount && <span className="text-ink-gold">Corregido · {tx.correctionCount}</span>}
                      </div>
                    </td>
                    <td
                      className={`py-3.5 px-3 text-right font-bold text-[14px] whitespace-nowrap ${
                        tx.isIncome ? 'text-ink-info' : 'text-ink-danger'
                      }`}
                    >
                      {tx.isIncome ? '+' : '-'} S/ {tx.amount.toFixed(2)}
                    </td>
                    <td className="py-3.5 px-3 text-right">
                      {tx.orderId && tx.type.startsWith('Venta (') && !tx.id.startsWith('tx-') && (
                        <button type="button" onClick={() => void openCorrection(tx)} disabled={!offlineState.isOnline || offlineState.isSimulatedOffline}
                          className="rounded-lg border border-edge-outline-2 px-2 py-1 text-xs text-ink-brand hover:bg-panel-3 disabled:opacity-50"
                          title="Requiere conexión y PIN de administrador">Corregir medio de pago</button>
                      )}
                      {tx.dinerBillId && <button type="button" onClick={() => void openDinerTicket(tx)} className="ml-2 rounded-lg border border-edge-outline-2 px-2 py-1 text-xs text-ink-brand hover:bg-panel-3">Ver ticket</button>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {ticketError && <p role="alert" className="p-3 text-ink-danger">{ticketError}</p>}
      {historicalBill && <DinerReceiptModal bill={historicalBill} company={companies.find((company) => company.id === historicalBill.companyId)} tableNumber={historicalBill.tableNumber} orderNumber={historicalBill.order?.ticketNumber} onClose={() => setHistoricalBill(null)} />}


      {correcting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-scrim-4 p-4">
          <form onSubmit={(event) => void saveCorrection(event)} role="dialog" aria-modal="true" aria-label="Corregir medio de pago"
            className="w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-2xl border border-edge-outline bg-panel-15 p-6 shadow-2xl space-y-4 text-ink-body">
            <h2 className="text-lg font-bold">Corregir medio de pago</h2>
            <p className="text-sm">Ticket #{correcting.ticketNumber} · S/ {correcting.amount.toFixed(2)}</p>
            <p className="text-sm">Actual: {correcting.paymentMethod || 'Sin nombre'} · {correcting.bankAccountAlias || 'Caja efectivo'}{correcting.referenceNumber ? ` · Ref. ${correcting.referenceNumber}` : ''}</p>
            <label className="block text-sm">Nuevo método
              <select value={methodId} onChange={(event) => { setMethodId(event.target.value); setCorrectionReference(''); }} required
                className="mt-1 w-full rounded-lg border border-edge-outline-2 bg-panel-3 p-2 text-ink-body">
                <option value="">Seleccione un método</option>
                {correctionMethods.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.bankAccountAlias || 'Caja efectivo'}</option>)}
              </select>
            </label>
            {selectedCorrectionMethod?.requiresReferenceNumber && <label className="block text-sm">N° de operación
              <input value={correctionReference} onChange={(event) => setCorrectionReference(event.target.value)} maxLength={100} required
                className="mt-1 w-full rounded-lg border border-edge-outline-2 bg-panel-3 p-2 text-ink-body" />
            </label>}
            <label className="block text-sm">Motivo de la corrección
              <textarea value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} minLength={5} maxLength={500} required
                className="mt-1 w-full rounded-lg border border-edge-outline-2 bg-panel-3 p-2 text-ink-body" />
            </label>
            <label className="block text-sm">PIN de administrador
              <input type="password" autoComplete="off" value={supervisorPin} onChange={(event) => setSupervisorPin(event.target.value)} required
                className="mt-1 w-full rounded-lg border border-edge-outline-2 bg-panel-3 p-2 text-ink-body" />
            </label>
            {correctionError && <p role="alert" className="text-sm text-ink-danger">{correctionError}</p>}
            {correctionHistory.length > 0 && <section className="border-t border-edge-outline-2 pt-3 text-xs space-y-2">
              <h3 className="font-semibold">Historial de correcciones</h3>
              {correctionHistory.map((item) => <p key={item.id}>{new Date(item.createdAt).toLocaleString()} · {item.oldMethodName || 'Sin método'} ({item.oldBankAccountAlias || 'Caja'}) → {item.newMethodName} ({item.newBankAccountAlias || 'Caja'}) · {item.reason} · Operador: {item.operator.name} · Autorizó: {item.authorizer.name}</p>)}
            </section>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setCorrecting(null); setSupervisorPin(''); }} disabled={correctionBusy} className="rounded-lg border border-edge-outline-2 px-4 py-2">Cancelar</button>
              <button type="submit" disabled={correctionBusy || !selectedCorrectionMethod || !offlineState.isOnline || offlineState.isSimulatedOffline}
                className="rounded-lg bg-surface-gold-2 px-4 py-2 font-semibold text-ink-on-accent disabled:opacity-50">{correctionBusy ? 'Guardando…' : 'Confirmar corrección'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Manual Movement Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-scrim-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-panel-15 border border-edge-outline rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-edge-outline-2">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-ink-brand">edit_calendar</span>
                <h2 className="text-[18px] font-bold text-ink-body">Registrar Movimiento de Caja / Banco</h2>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-ink-muted-2 hover:text-ink-body p-1.5 rounded-lg hover:bg-panel-3"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Income / Expense Switch */}
            <div className="grid grid-cols-2 gap-2 bg-panel-3 p-1 rounded-xl border border-edge-outline-2">
              <button
                type="button"
                onClick={() => {
                  setFormIsIncome(false);
                  setFormType('Pago Proveedor');
                }}
                className={`py-2 rounded-lg text-[13px] font-bold flex items-center justify-center gap-1.5 transition-all ${
                  !formIsIncome ? 'bg-surface-danger-2 text-ink-on-accent-6 shadow' : 'text-ink-muted-2'
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
                  formIsIncome ? 'bg-surface-info-2 text-ink-on-accent-5 shadow' : 'text-ink-muted-2'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">trending_up</span>
                <span>Ingreso Extra</span>
              </button>
            </div>

            <form onSubmit={handleSaveMovement} className="space-y-3.5">
              {/* Movement Type */}
              <div>
                <label className="block text-[12px] font-bold text-ink-muted-2 mb-1">
                  Categoría del Movimiento
                </label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as TransactionType)}
                  className="w-full bg-panel-3 border border-edge-outline-2 rounded-xl px-3 py-2 text-[13px] text-ink-body focus:border-edge-info-6 focus:outline-none"
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
                <label className="block text-[12px] font-bold text-ink-muted-2 mb-1">
                  Cuenta Origen / Destino de los Fondos
                </label>
                <select
                  value={formBankAccountId}
                  onChange={(e) => setFormBankAccountId(e.target.value)}
                  className="w-full bg-panel-3 border border-edge-outline-2 rounded-xl px-3 py-2 text-[13px] text-ink-body focus:border-edge-info-6 focus:outline-none"
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
                <label className="block text-[12px] font-bold text-ink-muted-2 mb-1">
                  Monto (S/) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-ink-muted-2 font-bold text-[14px]">
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
                    className="w-full bg-panel-3 border border-edge-outline-2 rounded-xl pl-9 pr-3 py-2 text-[14px] text-ink-strong font-bold focus:border-edge-info-6 focus:outline-none"
                  />
                </div>
              </div>

              {/* Reference Number */}
              <div>
                <label className="block text-[12px] font-bold text-ink-muted-2 mb-1">
                  N° de Operación / Voucher (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ej. OP-44910293 o Factura F001-22"
                  value={formReferenceNumber}
                  onChange={(e) => setFormReferenceNumber(e.target.value)}
                  className="w-full bg-panel-3 border border-edge-outline-2 rounded-xl px-3 py-2 text-[13px] text-ink-strong focus:border-edge-info-6 focus:outline-none"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-[12px] font-bold text-ink-muted-2 mb-1">
                  Detalle / Motivo *
                </label>
                <input
                  type="text"
                  placeholder="Ej. Compra de limón de emergencia en mercado..."
                  required
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full bg-panel-3 border border-edge-outline-2 rounded-xl px-3 py-2 text-[13px] text-ink-strong focus:border-edge-info-6 focus:outline-none"
                />
              </div>

              {/* Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-edge-outline-5">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-[13px] font-bold text-ink-muted-2 hover:bg-panel-3"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={`px-5 py-2 rounded-xl text-[13px] font-black shadow-md ${
                    formIsIncome
                      ? 'bg-surface-info-2 text-ink-on-accent-5 hover:bg-surface-info-hover'
                      : 'bg-surface-danger-2 text-ink-on-accent-6 hover:bg-surface-danger-hover'
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
