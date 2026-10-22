import React, { useState } from 'react';
import { usePOS } from '../context/POSContext';
import { BankAccount, CustomPaymentMethod, CompanyId, PaymentCategory } from '../types';

export const BankAccountsScreen: React.FC = () => {
  const {
    bankAccounts,
    filteredBankAccounts,
    addBankAccount,
    updateBankAccount,
    deleteBankAccount,
    paymentMethods,
    filteredPaymentMethods,
    addPaymentMethod,
    updatePaymentMethod,
    deletePaymentMethod,
    activeCompanyId,
    setActiveCompanyId,
    companies,
    totalIngresos,
    totalEgresos,
    saldoActual,
  } = usePOS();

  const [activeTab, setActiveTab] = useState<'cuentas' | 'metodos'>('cuentas');

  // Modal states for Bank Account
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);
  const [editingBank, setEditingBank] = useState<BankAccount | null>(null);
  const [bankFormData, setBankFormData] = useState<Omit<BankAccount, 'id'>>({
    companyId: activeCompanyId === 'todas' ? 'el-tayta' : activeCompanyId,
    bankName: 'BCP',
    accountNumber: '',
    cci: '',
    accountType: 'Corriente',
    currency: 'PEN',
    holderName: 'Corporación Tayta & Sabroso S.A.C.',
    alias: '',
    currentBalance: 0,
    isActive: true,
    notes: '',
  });

  // Modal states for Payment Method
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<CustomPaymentMethod | null>(null);
  const [paymentFormData, setPaymentFormData] = useState<Omit<CustomPaymentMethod, 'id'>>({
    companyId: activeCompanyId === 'todas' ? 'el-tayta' : activeCompanyId,
    name: '',
    category: 'Billetera Digital',
    bankAccountId: '',
    bankAccountAlias: '',
    commissionPct: 0,
    requiresReferenceNumber: true,
    icon: 'payments',
    isActive: true,
  });

  const openNewBankModal = () => {
    setEditingBank(null);
    setBankFormData({
      companyId: activeCompanyId === 'todas' ? 'el-tayta' : activeCompanyId,
      bankName: 'BCP',
      accountNumber: '',
      cci: '',
      accountType: 'Corriente',
      currency: 'PEN',
      holderName:
        activeCompanyId === 'el-sabroso'
          ? 'El Sabroso Brasas & Parrillas E.I.R.L.'
          : 'El Tayta Gastronomía Peruana S.A.C.',
      alias: '',
      currentBalance: 1000,
      isActive: true,
      notes: '',
    });
    setIsBankModalOpen(true);
  };

  const openEditBankModal = (acc: BankAccount) => {
    setEditingBank(acc);
    setBankFormData({
      companyId: acc.companyId,
      bankName: acc.bankName,
      accountNumber: acc.accountNumber,
      cci: acc.cci || '',
      accountType: acc.accountType,
      currency: acc.currency,
      holderName: acc.holderName,
      alias: acc.alias,
      currentBalance: acc.currentBalance,
      isActive: acc.isActive,
      notes: acc.notes || '',
    });
    setIsBankModalOpen(true);
  };

  const handleSaveBank = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingBank) {
      updateBankAccount(editingBank.id, bankFormData);
    } else {
      addBankAccount(bankFormData);
    }
    setIsBankModalOpen(false);
  };

  const openNewPaymentModal = () => {
    setEditingPayment(null);
    const defaultBank = filteredBankAccounts[0];
    setPaymentFormData({
      companyId: activeCompanyId === 'todas' ? 'el-tayta' : activeCompanyId,
      name: '',
      category: 'Billetera Digital',
      bankAccountId: defaultBank ? defaultBank.id : undefined,
      bankAccountAlias: defaultBank ? defaultBank.alias : undefined,
      commissionPct: 0,
      requiresReferenceNumber: true,
      icon: 'smartphone',
      isActive: true,
    });
    setIsPaymentModalOpen(true);
  };

  const openEditPaymentModal = (pm: CustomPaymentMethod) => {
    setEditingPayment(pm);
    setPaymentFormData({
      companyId: pm.companyId,
      name: pm.name,
      category: pm.category,
      bankAccountId: pm.bankAccountId || '',
      bankAccountAlias: pm.bankAccountAlias || '',
      commissionPct: pm.commissionPct || 0,
      requiresReferenceNumber: pm.requiresReferenceNumber,
      icon: pm.icon,
      isActive: pm.isActive,
    });
    setIsPaymentModalOpen(true);
  };

  const handleSavePayment = (e: React.FormEvent) => {
    e.preventDefault();
    const linkedBank = bankAccounts.find((b) => b.id === paymentFormData.bankAccountId);
    const finalData = {
      ...paymentFormData,
      bankAccountAlias: linkedBank ? linkedBank.alias : undefined,
    };
    if (editingPayment) {
      updatePaymentMethod(editingPayment.id, finalData);
    } else {
      addPaymentMethod(finalData);
    }
    setIsPaymentModalOpen(false);
  };

  // Calculate total balance across filtered bank accounts
  const totalBankBalance = filteredBankAccounts.reduce((sum, b) => sum + b.currentBalance, 0);

  return (
    <div id="bank-accounts-screen" className="flex-1 flex flex-col h-full bg-panel-4 overflow-hidden">
      {/* Top Bar with Metrics & Action Buttons */}
      <div className="p-4 sm:p-6 border-b border-edge-outline-3 bg-panel-2 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[26px] text-ink-brand">account_balance</span>
            <h1 className="text-[20px] sm:text-[22px] font-black text-ink-heading-brand">
              Cuentas Bancarias &amp; Métodos de Cobro
            </h1>
          </div>
          <p className="text-[13px] text-ink-muted-7 mt-0.5">
            Configuración multiempresa de cuentas bancarias y enlace directo con métodos de pago para ventas y compras
          </p>
        </div>

        <div className="flex items-center gap-3">
          {activeTab === 'cuentas' ? (
            <button
              onClick={openNewBankModal}
              className="px-4 py-2 rounded-xl bg-surface-brand-solid hover:bg-surface-brand-hover-alt text-ink-on-brand font-bold text-[13px] flex items-center gap-2 shadow-md transition-all"
            >
              <span className="material-symbols-outlined text-[18px]">add_circle</span>
              Agregar Cuenta Bancaria
            </button>
          ) : (
            <button
              onClick={openNewPaymentModal}
              className="px-4 py-2 rounded-xl bg-surface-gold-2 hover:bg-surface-gold-hover text-ink-foreground font-black text-[13px] flex items-center gap-2 shadow-md transition-all"
            >
              <span className="material-symbols-outlined text-[18px]">add_circle</span>
              Agregar Método de Pago
            </button>
          )}
        </div>
      </div>

      {/* KPI Overview Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 sm:p-6 pb-2">
        <div className="bg-panel border border-edge-outline-3 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <span className="text-[12px] font-semibold text-ink-muted-3 uppercase">Cuentas Registradas</span>
            <p className="text-[22px] font-black text-ink-strong mt-1">{(filteredBankAccounts || []).length} Cuentas</p>
            <span className="text-[11px] text-ink-muted">
              {activeCompanyId === 'todas' ? 'Ambas empresas' : activeCompanyId === 'el-tayta' ? 'El Tayta' : 'El Sabroso'}
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-surface-brand-solid-3 border border-edge-brand-4 flex items-center justify-center text-ink-brand">
            <span className="material-symbols-outlined text-[24px]">account_balance</span>
          </div>
        </div>

        <div className="bg-panel border border-edge-outline-3 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <span className="text-[12px] font-semibold text-ink-muted-3 uppercase">Saldo Total en Bancos</span>
            <p className="text-[22px] font-black text-ink-success mt-1">S/ {totalBankBalance.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</p>
            <span className="text-[11px] text-ink-muted">Soles (PEN) disponibles en cuentas</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-surface-success-strong-6 border border-edge-success-2 flex items-center justify-center text-ink-success">
            <span className="material-symbols-outlined text-[24px]">account_balance_wallet</span>
          </div>
        </div>

        <div className="bg-panel border border-edge-outline-3 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <span className="text-[12px] font-semibold text-ink-muted-3 uppercase">Métodos de Cobro Habilitados</span>
            <p className="text-[22px] font-black text-ink-gold mt-1">{(filteredPaymentMethods || []).length} Métodos</p>
            <span className="text-[11px] text-ink-muted">Vinculados al flujo del POS</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-surface-warning-strong-3 border border-edge-gold-4 flex items-center justify-center text-ink-gold">
            <span className="material-symbols-outlined text-[24px]">credit_card</span>
          </div>
        </div>
      </div>

      {/* Tabs Header */}
      <div className="px-4 sm:px-6 pt-2 pb-3 border-b border-edge-outline-5 flex gap-2">
        <button
          onClick={() => setActiveTab('cuentas')}
          className={`px-4 py-2 rounded-xl text-[13px] font-bold transition-all flex items-center gap-2 ${
            activeTab === 'cuentas'
              ? 'bg-surface-brand-solid text-ink-on-brand shadow-sm'
              : 'text-ink-muted-3 hover:text-ink-strong hover:bg-panel-38'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">account_balance</span>
          Cuentas Bancarias ({(filteredBankAccounts || []).length})
        </button>
        <button
          onClick={() => setActiveTab('metodos')}
          className={`px-4 py-2 rounded-xl text-[13px] font-bold transition-all flex items-center gap-2 ${
            activeTab === 'metodos'
              ? 'bg-surface-brand-solid text-ink-on-brand shadow-sm'
              : 'text-ink-muted-3 hover:text-ink-strong hover:bg-panel-38'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">contactless</span>
          Métodos de Pago &amp; POS ({(filteredPaymentMethods || []).length})
        </button>
      </div>

      {/* Tab Content */}
      <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
        {activeTab === 'cuentas' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(filteredBankAccounts || []).map((acc) => (
              <div
                key={acc.id}
                className="bg-panel border border-edge-outline-2 hover:border-edge-brand-5 rounded-2xl p-4 sm:p-5 flex flex-col justify-between shadow-lg relative overflow-hidden transition-all group"
              >
                <div className="absolute top-0 right-0 w-28 h-28 bg-surface-brand-solid-6 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none" />

                <div>
                  {/* Top line: Bank name & company pill */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-panel-33 border border-edge-outline flex items-center justify-center font-black text-[13px] text-ink-strong">
                        {acc.bankName.slice(0, 3)}
                      </div>
                      <div>
                        <h3 className="text-[16px] font-bold text-ink-strong leading-tight">{acc.bankName}</h3>
                        <p className="text-[11px] text-ink-muted">{acc.accountType} • {acc.currency}</p>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                        acc.companyId === 'el-tayta'
                          ? 'bg-surface-brand-solid-2 text-ink-brand border border-edge-brand-solid'
                          : 'bg-surface-warning-strong-7 text-ink-gold border border-edge-warning-3'
                      }`}
                    >
                      {acc.companyId === 'el-tayta' ? 'El Tayta' : 'El Sabroso'}
                    </span>
                  </div>

                  {/* Alias & Account details */}
                  <div className="bg-panel-29 p-3 rounded-xl border border-edge-outline-5 space-y-2 mb-3">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-ink-muted tracking-wider">Alias / Referencia</span>
                      <p className="text-[13px] font-bold text-ink-brand truncate">{acc.alias}</p>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-ink-muted tracking-wider">N° de Cuenta</span>
                      <p className="text-[12px] font-mono text-ink-strong tracking-wider">{acc.accountNumber}</p>
                    </div>
                    {acc.cci && (
                      <div>
                        <span className="text-[10px] uppercase font-bold text-ink-muted tracking-wider">CCI Interbancario</span>
                        <p className="text-[11px] font-mono text-ink-muted-5">{acc.cci}</p>
                      </div>
                    )}
                    <div>
                      <span className="text-[10px] uppercase font-bold text-ink-muted tracking-wider">Titular</span>
                      <p className="text-[11px] text-ink-muted-6 truncate">{acc.holderName}</p>
                    </div>
                  </div>
                </div>

                {/* Balance & Actions */}
                <div className="pt-2 border-t border-edge-outline-5 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-ink-muted">Saldo Disponible</span>
                    <p className="text-[18px] font-black text-ink-success">
                      S/ {acc.currentBalance.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditBankModal(acc)}
                      className="text-ink-muted-3 hover:text-ink-strong p-1.5 rounded-lg hover:bg-panel-3 transition-colors"
                      title="Editar cuenta"
                    >
                      <span className="material-symbols-outlined text-[18px]">edit</span>
                    </button>
                    <button
                      onClick={() => deleteBankAccount(acc.id)}
                      className="text-ink-danger-4 hover:text-ink-danger-2 p-1.5 rounded-lg hover:bg-surface-danger-strong-5 transition-colors"
                      title="Eliminar cuenta"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Métodos de Pago Tab */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPaymentMethods.map((pm) => (
              <div
                key={pm.id}
                className="bg-panel border border-edge-outline-2 hover:border-edge-brand-5 rounded-2xl p-4 sm:p-5 flex flex-col justify-between shadow-lg transition-all"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-surface-brand-solid-3 border border-edge-brand-3 flex items-center justify-center text-ink-brand">
                        <span className="material-symbols-outlined text-[22px]">{pm.icon || 'payments'}</span>
                      </div>
                      <div>
                        <h3 className="text-[15px] font-bold text-ink-strong leading-tight">{pm.name}</h3>
                        <p className="text-[11px] text-ink-muted">{pm.category}</p>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                        pm.companyId === 'ambas'
                          ? 'bg-surface-neutral-2 text-ink-neutral-3'
                          : pm.companyId === 'el-tayta'
                          ? 'bg-surface-brand-solid-2 text-ink-brand'
                          : 'bg-surface-warning-strong-7 text-ink-gold'
                      }`}
                    >
                      {pm.companyId === 'ambas' ? 'Ambas' : pm.companyId === 'el-tayta' ? 'El Tayta' : 'El Sabroso'}
                    </span>
                  </div>

                  {/* Linked Bank Card */}
                  <div className="bg-panel-29 p-3 rounded-xl border border-edge-outline-5 space-y-2 mb-3">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-ink-muted tracking-wider">Cuenta Bancaria Destino</span>
                      {pm.bankAccountId ? (
                        <p className="text-[12px] font-bold text-ink-success flex items-center gap-1.5 mt-0.5">
                          <span className="material-symbols-outlined text-[14px]">link</span>
                          {pm.bankAccountAlias || 'Cuenta Bancaria Vinculada'}
                        </p>
                      ) : (
                        <p className="text-[12px] text-ink-muted flex items-center gap-1 mt-0.5">
                          <span className="material-symbols-outlined text-[14px]">point_of_sale</span>
                          Caja Chica Efectivo (Sin banco)
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-edge-outline-8 text-[11px]">
                      <div>
                        <span className="text-ink-muted font-semibold">Comisión:</span>
                        <p className="font-bold text-ink-strong">{pm.commissionPct ? `${pm.commissionPct}%` : '0% (Sin costo)'}</p>
                      </div>
                      <div>
                        <span className="text-ink-muted font-semibold">N° Operación:</span>
                        <p className="font-bold text-ink-strong">{pm.requiresReferenceNumber ? 'Obligatorio' : 'Opcional'}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-edge-outline-5 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-ink-success flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-surface-success" />
                    Activo en Pantalla de Cobro
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditPaymentModal(pm)}
                      className="text-ink-muted-3 hover:text-ink-strong p-1.5 rounded-lg hover:bg-panel-3 transition-colors"
                      title="Editar método de pago"
                    >
                      <span className="material-symbols-outlined text-[18px]">edit</span>
                    </button>
                    <button
                      onClick={() => deletePaymentMethod(pm.id)}
                      className="text-ink-danger-4 hover:text-ink-danger-2 p-1.5 rounded-lg hover:bg-surface-danger-strong-5 transition-colors"
                      title="Eliminar método"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal: Add/Edit Bank Account */}
      {isBankModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-surface-scrim backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-panel border border-edge-outline rounded-2xl w-full max-w-lg p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-edge-outline-2 pb-3">
              <h3 className="text-[17px] font-bold text-ink-heading-brand flex items-center gap-2">
                <span className="material-symbols-outlined text-ink-brand">account_balance</span>
                {editingBank ? 'Modificar Cuenta Bancaria' : 'Nueva Cuenta Bancaria'}
              </h3>
              <button
                onClick={() => setIsBankModalOpen(false)}
                className="text-ink-muted hover:text-ink-strong p-1 rounded-lg hover:bg-panel-3"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <form onSubmit={handleSaveBank} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-ink-muted-3 mb-1">Empresa</label>
                  <select
                    value={bankFormData.companyId}
                    onChange={(e) =>
                      setBankFormData({ ...bankFormData, companyId: e.target.value as CompanyId })
                    }
                    className="w-full bg-panel-29 border border-edge-outline rounded-xl px-3 py-2 text-[13px] text-ink-strong focus:outline-none focus:border-edge-brand"
                  >
                    <option value="el-tayta">El Tayta</option>
                    <option value="el-sabroso">El Sabroso</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-ink-muted-3 mb-1">Banco</label>
                  <select
                    value={bankFormData.bankName}
                    onChange={(e) =>
                      setBankFormData({ ...bankFormData, bankName: e.target.value })
                    }
                    className="w-full bg-panel-29 border border-edge-outline rounded-xl px-3 py-2 text-[13px] text-ink-strong focus:outline-none focus:border-edge-brand"
                  >
                    <option value="BCP">Banco de Crédito (BCP)</option>
                    <option value="BBVA">BBVA Perú</option>
                    <option value="Interbank">Interbank</option>
                    <option value="Scotiabank">Scotiabank</option>
                    <option value="Banco de la Nación">Banco de la Nación</option>
                    <option value="Yape / Billetera Digital">Yape / Plin Directo</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-ink-muted-3 mb-1">
                  Alias de Cuenta (Para identificar en pagos) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. BCP Soles El Tayta Operaciones"
                  value={bankFormData.alias}
                  onChange={(e) => setBankFormData({ ...bankFormData, alias: e.target.value })}
                  className="w-full bg-panel-29 border border-edge-outline rounded-xl px-3 py-2 text-[13px] text-ink-strong focus:outline-none focus:border-edge-brand"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-ink-muted-3 mb-1">N° de Cuenta</label>
                  <input
                    type="text"
                    required
                    placeholder="191-xxxxxxxx-0-xx"
                    value={bankFormData.accountNumber}
                    onChange={(e) =>
                      setBankFormData({ ...bankFormData, accountNumber: e.target.value })
                    }
                    className="w-full bg-panel-29 border border-edge-outline rounded-xl px-3 py-2 text-[13px] text-ink-strong focus:outline-none focus:border-edge-brand"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-ink-muted-3 mb-1">CCI Interbancario</label>
                  <input
                    type="text"
                    placeholder="002-191-xxxxxxxxxxxx-xx"
                    value={bankFormData.cci || ''}
                    onChange={(e) => setBankFormData({ ...bankFormData, cci: e.target.value })}
                    className="w-full bg-panel-29 border border-edge-outline rounded-xl px-3 py-2 text-[13px] text-ink-strong focus:outline-none focus:border-edge-brand"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-ink-muted-3 mb-1">Titular</label>
                  <input
                    type="text"
                    required
                    value={bankFormData.holderName}
                    onChange={(e) =>
                      setBankFormData({ ...bankFormData, holderName: e.target.value })
                    }
                    className="w-full bg-panel-29 border border-edge-outline rounded-xl px-3 py-2 text-[13px] text-ink-strong focus:outline-none focus:border-edge-brand"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-ink-muted-3 mb-1">Saldo Inicial / Actual (S/)</label>
                  <input
                    type="number"
                    step="0.10"
                    required
                    value={bankFormData.currentBalance}
                    onChange={(e) =>
                      setBankFormData({
                        ...bankFormData,
                        currentBalance: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full bg-panel-29 border border-edge-outline rounded-xl px-3 py-2 text-[13px] text-ink-strong focus:outline-none focus:border-edge-brand"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-edge-outline-5">
                <button
                  type="button"
                  onClick={() => setIsBankModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-[13px] font-bold text-ink-muted-2 hover:bg-panel-3"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-surface-brand-solid hover:bg-surface-brand-hover-alt text-ink-on-brand font-bold text-[13px] shadow-md"
                >
                  {editingBank ? 'Guardar Cambios' : 'Registrar Cuenta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add/Edit Custom Payment Method */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-surface-scrim backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-panel border border-edge-outline rounded-2xl w-full max-w-lg p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-edge-outline-2 pb-3">
              <h3 className="text-[17px] font-bold text-ink-heading-brand flex items-center gap-2">
                <span className="material-symbols-outlined text-ink-gold">payments</span>
                {editingPayment ? 'Modificar Método de Pago' : 'Nuevo Método de Pago'}
              </h3>
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                className="text-ink-muted hover:text-ink-strong p-1 rounded-lg hover:bg-panel-3"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <form onSubmit={handleSavePayment} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-bold uppercase text-ink-muted-3 mb-1">
                  Nombre del Método (Visible en Cobro) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Yape QR BCP, POS Niubiz Visa, Plin..."
                  value={paymentFormData.name}
                  onChange={(e) => setPaymentFormData({ ...paymentFormData, name: e.target.value })}
                  className="w-full bg-panel-29 border border-edge-outline rounded-xl px-3 py-2 text-[13px] text-ink-strong focus:outline-none focus:border-edge-brand"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-ink-muted-3 mb-1">Categoría</label>
                  <select
                    value={paymentFormData.category}
                    onChange={(e) =>
                      setPaymentFormData({
                        ...paymentFormData,
                        category: e.target.value as PaymentCategory,
                      })
                    }
                    className="w-full bg-panel-29 border border-edge-outline rounded-xl px-3 py-2 text-[13px] text-ink-strong focus:outline-none focus:border-edge-brand"
                  >
                    <option value="Billetera Digital">Billetera Digital (Yape / Plin)</option>
                    <option value="Tarjeta / POS">Tarjeta / POS</option>
                    <option value="Transferencia Bancaria">Transferencia Bancaria</option>
                    <option value="Efectivo">Efectivo</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-ink-muted-3 mb-1">Empresa</label>
                  <select
                    value={paymentFormData.companyId}
                    onChange={(e) =>
                      setPaymentFormData({
                        ...paymentFormData,
                        companyId: e.target.value as CompanyId | 'ambas',
                      })
                    }
                    className="w-full bg-panel-29 border border-edge-outline rounded-xl px-3 py-2 text-[13px] text-ink-strong focus:outline-none focus:border-edge-brand"
                  >
                    <option value="el-tayta">El Tayta</option>
                    <option value="el-sabroso">El Sabroso</option>
                    <option value="ambas">Ambas Empresas</option>
                  </select>
                </div>
              </div>

              {/* Linked Bank Account Selection */}
              <div>
                <label className="block text-[11px] font-bold uppercase text-ink-muted-3 mb-1">
                  Cuenta Bancaria Asociada (Donde ingresa el dinero) *
                </label>
                <select
                  value={paymentFormData.bankAccountId || ''}
                  onChange={(e) =>
                    setPaymentFormData({ ...paymentFormData, bankAccountId: e.target.value })
                  }
                  className="w-full bg-panel-29 border border-edge-outline rounded-xl px-3 py-2 text-[13px] text-ink-strong focus:outline-none focus:border-edge-brand"
                >
                  <option value="">-- Ninguna (Ingreso Directo a Caja Efectivo) --</option>
                  {bankAccounts.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.bankName} - {b.alias} (Saldo: S/ {b.currentBalance.toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-ink-muted-3 mb-1">
                    Comisión de Pasarela (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="0 para Yape/Plin, 3.5 para POS"
                    value={paymentFormData.commissionPct || 0}
                    onChange={(e) =>
                      setPaymentFormData({
                        ...paymentFormData,
                        commissionPct: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full bg-panel-29 border border-edge-outline rounded-xl px-3 py-2 text-[13px] text-ink-strong focus:outline-none focus:border-edge-brand"
                  />
                </div>
                <div className="flex flex-col justify-end pb-1">
                  <label className="flex items-center gap-2 cursor-pointer text-[12px] text-ink-muted-2">
                    <input
                      type="checkbox"
                      checked={paymentFormData.requiresReferenceNumber}
                      onChange={(e) =>
                        setPaymentFormData({
                          ...paymentFormData,
                          requiresReferenceNumber: e.target.checked,
                        })
                      }
                      className="w-4 h-4 rounded text-ink-brand-solid accent-accent-brand-solid"
                    />
                    <span>Exigir N° Operación / Voucher</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-edge-outline-5">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-[13px] font-bold text-ink-muted-2 hover:bg-panel-3"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-surface-gold-2 hover:bg-surface-gold-hover text-ink-foreground font-black text-[13px] shadow-md"
                >
                  {editingPayment ? 'Guardar Cambios' : 'Registrar Método'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
