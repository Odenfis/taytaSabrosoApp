import React, { useState, useMemo } from 'react';
import { usePOS } from '../context/POSContext';
import { Purchase, PurchaseItem, CompanyId, PurchaseCategory, PurchaseDocumentStatus } from '../types';

export const PurchasesScreen: React.FC = () => {
  const {
    purchases,
    insumos,
    activeCompanyId,
    activeCompany,
    bankAccounts,
    filteredBankAccounts,
    addPurchase,
    regularizePurchase,
    currentUser,
  } = usePOS();

  const [searchTerm, setSearchTerm] = useState('');
  const [docFilter, setDocFilter] = useState<'todos' | 'provisionales' | 'regularizados'>('todos');
  const [isNewPurchaseModalOpen, setIsNewPurchaseModalOpen] = useState(false);

  // Regularization Modal State
  const [isRegularizeModalOpen, setIsRegularizeModalOpen] = useState(false);
  const [selectedPurchaseToRegularize, setSelectedPurchaseToRegularize] = useState<Purchase | null>(null);
  const [regInvoiceNumber, setRegInvoiceNumber] = useState('');
  const [regSupplierRuc, setRegSupplierRuc] = useState('');
  const [regNotes, setRegNotes] = useState('');

  // New Purchase Form State
  const [targetCompany, setTargetCompany] = useState<CompanyId>(
    activeCompanyId === 'todas' ? 'el-tayta' : activeCompanyId
  );
  const [isProvisionalDoc, setIsProvisionalDoc] = useState(false);
  const [category, setCategory] = useState<PurchaseCategory>('insumos');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [supplierRuc, setSupplierRuc] = useState('');
  const [paymentMode, setPaymentMode] = useState<'caja' | 'banco' | 'credito'>('caja');
  const [selectedBankId, setSelectedBankId] = useState<string>('');
  const [notes, setNotes] = useState('');

  // Items in current draft purchase
  const [items, setItems] = useState<PurchaseItem[]>([
    { insumoId: '', insumoName: '', quantity: 1, unit: 'kg', unitCost: 0, totalCost: 0 },
  ]);

  // Filtered Purchases
  const filteredPurchases = useMemo(() => {
    return purchases.filter((p) => {
      const matchCompany = activeCompanyId === 'todas' || p.companyId === activeCompanyId;
      const invoiceNumber = p.invoiceNumber || '';
      const supplierName = p.supplierName || '';
      const supplierRuc = p.supplierRuc || '';
      const provNote = p.provisionalNoteNumber || '';
      const matchSearch =
        invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        supplierName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        supplierRuc.includes(searchTerm) ||
        provNote.toLowerCase().includes(searchTerm.toLowerCase());

      let matchDoc = true;
      if (docFilter === 'provisionales') {
        matchDoc = p.documentStatus === 'provisional';
      } else if (docFilter === 'regularizados') {
        matchDoc = p.documentStatus === 'regularizado';
      }

      return matchCompany && matchSearch && matchDoc;
    });
  }, [purchases, activeCompanyId, searchTerm, docFilter]);

  // Financial Stats
  const totalPurchasesAmount = useMemo(() => {
    return filteredPurchases.reduce((sum, p) => sum + (p.total || 0), 0);
  }, [filteredPurchases]);

  const provisionalPurchases = useMemo(() => {
    return filteredPurchases.filter((p) => p.documentStatus === 'provisional');
  }, [filteredPurchases]);

  const provisionalTotalAmount = useMemo(() => {
    return provisionalPurchases.reduce((sum, p) => sum + (p.total || 0), 0);
  }, [provisionalPurchases]);

  // Calculate draft purchase totals
  const draftSubtotal = useMemo(() => {
    return items.reduce((acc, it) => acc + (it.totalCost || 0), 0);
  }, [items]);
  const draftIgv = +(draftSubtotal * 0.18).toFixed(2);
  const draftTotal = +(draftSubtotal + draftIgv).toFixed(2);

  // Quick Supplier presets
  const applySupplierPreset = (name: string, ruc: string) => {
    setSupplierName(name);
    setSupplierRuc(ruc);
  };

  const handleItemChange = (index: number, field: keyof PurchaseItem, value: any) => {
    setItems((prev) => {
      const updated = [...prev];
      const item = { ...updated[index], [field]: value };

      if (field === 'insumoId') {
        const found = insumos.find((i) => i.id === value);
        if (found) {
          item.insumoName = found.name;
          item.unit = found.unit;
          item.unitCost = found.costPerUnit;
        }
      }

      if (field === 'quantity' || field === 'unitCost' || field === 'insumoId') {
        const qty = parseFloat(item.quantity as any) || 0;
        const cost = parseFloat(item.unitCost as any) || 0;
        item.totalCost = +(qty * cost).toFixed(2);
      }

      updated[index] = item;
      return updated;
    });
  };

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      { insumoId: '', insumoName: '', quantity: 1, unit: 'kg', unitCost: 0, totalCost: 0 },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSavePurchase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierName || items.length === 0) return;

    const validItems = items.filter((it) => it.insumoId && it.quantity > 0);
    if (validItems.length === 0) return;

    const generatedDocNum = isProvisionalDoc
      ? `VALE-${Math.floor(100 + Math.random() * 900)}`
      : invoiceNumber.trim().toUpperCase();

    const linkedBank = paymentMode === 'banco' ? bankAccounts.find((b) => b.id === selectedBankId) : undefined;

    addPurchase({
      companyId: targetCompany,
      category,
      documentStatus: isProvisionalDoc ? 'provisional' : 'regularizado',
      provisionalNoteNumber: isProvisionalDoc ? generatedDocNum : undefined,
      invoiceNumber: isProvisionalDoc ? 'PENDIENTE FACTURA' : generatedDocNum,
      supplierName: supplierName.trim(),
      supplierRuc: supplierRuc.trim() || (isProvisionalDoc ? 'PENDIENTE' : '20500000000'),
      items: validItems,
      subtotal: draftSubtotal,
      igv: draftIgv,
      total: draftTotal,
      paymentStatus:
        paymentMode === 'banco'
          ? 'Transferencia Bancaria'
          : paymentMode === 'credito'
          ? 'Crédito 15 días'
          : 'Pagado (Caja)',
      paidFromCash: paymentMode === 'caja',
      bankAccountId: linkedBank ? linkedBank.id : undefined,
      bankAccountAlias: linkedBank ? linkedBank.alias : undefined,
      notes: notes || undefined,
    });

    setIsNewPurchaseModalOpen(false);
    // Reset form
    setInvoiceNumber('');
    setSupplierName('');
    setSupplierRuc('');
    setNotes('');
    setIsProvisionalDoc(false);
    setPaymentMode('caja');
    setSelectedBankId('');
    setItems([{ insumoId: '', insumoName: '', quantity: 1, unit: 'kg', unitCost: 0, totalCost: 0 }]);
  };

  const openRegularizeModal = (p: Purchase) => {
    setSelectedPurchaseToRegularize(p);
    setRegInvoiceNumber('');
    setRegSupplierRuc(p.supplierRuc !== 'PENDIENTE' ? p.supplierRuc : '');
    setRegNotes('');
    setIsRegularizeModalOpen(true);
  };

  const handleConfirmRegularization = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPurchaseToRegularize || !regInvoiceNumber.trim()) return;

    regularizePurchase(
      selectedPurchaseToRegularize.id,
      regInvoiceNumber.trim().toUpperCase(),
      regSupplierRuc.trim() || undefined,
      regNotes.trim() || undefined
    );

    setIsRegularizeModalOpen(false);
    setSelectedPurchaseToRegularize(null);
  };

  return (
    <div id="purchases-screen" className="flex-1 flex flex-col h-full bg-[#101010] text-[#e5e2e1] overflow-hidden">
      {/* Top Header */}
      <div className="bg-[#181717] border-b border-[#54433c]/60 p-4 md:px-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[26px] text-[#ffb597]">shopping_cart_checkout</span>
              <h1 className="text-[20px] md:text-[22px] font-black text-[#ffdbcd]">
                Compras, Facturas &amp; Vales Provisionales
              </h1>
            </div>
            <p className="text-[13px] text-[#dac1b8]/75 mt-0.5">
              Registro formal e intermedio de compras de insumos, actualización de Kardex y regularización de comprobantes
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => {
                setIsProvisionalDoc(true);
                setIsNewPurchaseModalOpen(true);
              }}
              className="bg-[#2a231d] hover:bg-[#382d24] text-[#ffb597] border border-[#ffb597]/40 px-3.5 py-2 rounded-xl text-[13px] font-bold flex items-center gap-1.5 shadow-sm transition-all"
            >
              <span className="material-symbols-outlined text-[18px]">receipt</span>
              <span>+ Vale Provisional (Al paso)</span>
            </button>

            <button
              id="btn-new-purchase"
              onClick={() => {
                setIsProvisionalDoc(false);
                setIsNewPurchaseModalOpen(true);
              }}
              className="bg-[#823b19] hover:bg-[#9a451e] text-[#ffdbcd] px-4 py-2 rounded-xl text-[13px] font-bold flex items-center gap-2 shadow-md transition-all"
            >
              <span className="material-symbols-outlined text-[18px]">add_shopping_cart</span>
              <span>Registrar Compra con Factura</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 md:px-6 pb-2">
        <div className="bg-[#181717] border border-[#54433c]/60 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <span className="text-[12px] font-semibold text-[#dac1b8]/70 uppercase">Total en Compras</span>
            <p className="text-[22px] font-black text-white mt-1">S/ {totalPurchasesAmount.toFixed(2)}</p>
            <span className="text-[11px] text-[#dac1b8]/60">{filteredPurchases.length} operaciones registradas</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-[#823b19]/30 text-[#ffb597] flex items-center justify-center border border-[#ffb597]/30">
            <span className="material-symbols-outlined text-[24px]">receipt_long</span>
          </div>
        </div>

        {/* Provisional Alert Card */}
        <div
          onClick={() => setDocFilter('provisionales')}
          className={`bg-[#181717] rounded-2xl p-4 flex items-center justify-between cursor-pointer transition-all border ${
            provisionalPurchases.length > 0
              ? 'border-amber-500/50 hover:bg-amber-950/20'
              : 'border-[#54433c]/60'
          }`}
        >
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-semibold text-amber-400 uppercase">Vales por Regularizar</span>
              {provisionalPurchases.length > 0 && (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              )}
            </div>
            <p className="text-[22px] font-black text-amber-400 mt-1">{provisionalPurchases.length} Vales</p>
            <span className="text-[11px] text-[#dac1b8]/70">
              S/ {provisionalTotalAmount.toFixed(2)} pendientes de factura formal
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-amber-950/40 text-amber-400 flex items-center justify-center border border-amber-500/40">
            <span className="material-symbols-outlined text-[24px]">pending_actions</span>
          </div>
        </div>

        <div className="bg-[#181717] border border-[#54433c]/60 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <span className="text-[12px] font-semibold text-[#dac1b8]/70 uppercase">Regularizadas / Formales</span>
            <p className="text-[22px] font-black text-emerald-400 mt-1">
              {filteredPurchases.filter((p) => p.documentStatus === 'regularizado').length} Compras
            </p>
            <span className="text-[11px] text-[#dac1b8]/60">Con Factura / Boleta SUNAT validada</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-950/30 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
            <span className="material-symbols-outlined text-[24px]">verified</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="px-4 md:px-6 py-2 border-b border-[#54433c]/40 flex flex-wrap items-center justify-between gap-3 bg-[#141313]">
        <div className="flex items-center gap-1.5 bg-[#1e1d1d] p-1 rounded-xl border border-[#54433c]/50">
          <button
            onClick={() => setDocFilter('todos')}
            className={`px-3 py-1 rounded-lg text-[12px] font-bold transition-all ${
              docFilter === 'todos' ? 'bg-[#823b19] text-[#ffdbcd]' : 'text-[#dac1b8]/70 hover:text-white'
            }`}
          >
            Todas ({purchases.length})
          </button>
          <button
            onClick={() => setDocFilter('provisionales')}
            className={`px-3 py-1 rounded-lg text-[12px] font-bold transition-all flex items-center gap-1.5 ${
              docFilter === 'provisionales'
                ? 'bg-amber-950 text-amber-300 border border-amber-500/50'
                : 'text-[#dac1b8]/70 hover:text-amber-300'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            Vales Provisionales ({purchases.filter((p) => p.documentStatus === 'provisional').length})
          </button>
          <button
            onClick={() => setDocFilter('regularizados')}
            className={`px-3 py-1 rounded-lg text-[12px] font-bold transition-all flex items-center gap-1.5 ${
              docFilter === 'regularizados'
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/50'
                : 'text-[#dac1b8]/70 hover:text-emerald-300'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            Regularizados ({purchases.filter((p) => p.documentStatus === 'regularizado').length})
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <span className="material-symbols-outlined absolute left-3 top-2.5 text-[#dac1b8]/50 text-[18px]">
            search
          </span>
          <input
            type="text"
            placeholder="Buscar por N° doc, RUC o proveedor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#1e1d1d] border border-[#54433c]/60 rounded-xl pl-9 pr-3 py-1.5 text-[12px] text-white focus:outline-none focus:border-[#ffb597]"
          />
        </div>
      </div>

      {/* Purchases Table */}
      <div className="flex-1 overflow-y-auto p-4 md:px-6">
        <div className="bg-[#181717] border border-[#54433c]/60 rounded-2xl overflow-hidden shadow-lg">
          <table className="w-full text-left border-collapse text-[13px]">
            <thead>
              <tr className="bg-[#1e1d1d] border-b border-[#54433c]/50 text-[11px] uppercase font-bold text-[#dac1b8]/70 tracking-wider">
                <th className="py-3 px-4">Estado / Folio</th>
                <th className="py-3 px-4">Proveedor / RUC</th>
                <th className="py-3 px-4">Insumos Comprados</th>
                <th className="py-3 px-4">Medio de Pago</th>
                <th className="py-3 px-4 text-right">Total</th>
                <th className="py-3 px-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#54433c]/30">
              {filteredPurchases.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-[#dac1b8]/60">
                    <span className="material-symbols-outlined text-[36px] text-[#54433c] mb-2">shopping_bag</span>
                    <p>No se encontraron compras en este filtro.</p>
                  </td>
                </tr>
              ) : (
                filteredPurchases.map((p) => (
                  <tr key={p.id} className="hover:bg-[#201f1f] transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          {p.documentStatus === 'provisional' ? (
                            <span className="bg-amber-950/70 text-amber-300 border border-amber-500/50 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 w-max">
                              <span className="material-symbols-outlined text-[12px]">schedule</span>
                              Provisional (Vale)
                            </span>
                          ) : (
                            <span className="bg-emerald-950/60 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 w-max">
                              <span className="material-symbols-outlined text-[12px]">verified</span>
                              Regularizado
                            </span>
                          )}
                          <span className="text-[11px] text-[#dac1b8]/60">{p.date} • {p.time}</span>
                        </div>

                        <div className="font-bold text-white font-mono text-[13px]">
                          {p.documentStatus === 'provisional' ? (
                            <span className="text-amber-400">{p.provisionalNoteNumber || 'VALE PROVISIONAL'}</span>
                          ) : (
                            <span className="text-[#ffb597]">{p.invoiceNumber}</span>
                          )}
                        </div>

                        <span className="text-[10px] text-[#dac1b8]/50">
                          {p.companyId === 'el-tayta' ? 'El Tayta' : 'El Sabroso'} • Turno {p.shift}
                        </span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-bold text-white">{p.supplierName}</div>
                      <div className="text-[11px] text-[#dac1b8]/70 font-mono">RUC: {p.supplierRuc}</div>
                      {p.notes && (
                        <div className="text-[11px] text-[#dac1b8]/50 italic mt-0.5 truncate max-w-xs">
                          {p.notes}
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="text-[12px] text-[#dac1b8] space-y-0.5 max-w-xs">
                        {(p.items || []).map((it, idx) => (
                          <div key={idx} className="flex justify-between gap-2">
                            <span className="truncate">{it.insumoName}</span>
                            <span className="font-mono text-[#dac1b8]/70 shrink-0">
                              {it.quantity} {it.unit}
                            </span>
                          </div>
                        ))}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex flex-col gap-1">
                        <span className="text-[12px] font-medium text-white">{p.paymentStatus}</span>
                        {p.bankAccountAlias ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-500/30 w-max">
                            <span className="material-symbols-outlined text-[11px]">account_balance</span>
                            {p.bankAccountAlias}
                          </span>
                        ) : p.paidFromCash ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-[#dac1b8]/70 bg-zinc-800 px-1.5 py-0.5 rounded w-max">
                            <span className="material-symbols-outlined text-[11px]">point_of_sale</span>
                            Caja Chica Efectivo
                          </span>
                        ) : null}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="font-black text-[15px] text-white">S/ {p.total.toFixed(2)}</div>
                      <div className="text-[10px] text-[#dac1b8]/60">Sub: S/ {p.subtotal.toFixed(2)}</div>
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      {p.documentStatus === 'provisional' ? (
                        <button
                          onClick={() => openRegularizeModal(p)}
                          className="px-3 py-1.5 rounded-xl bg-amber-950/80 hover:bg-amber-900 border border-amber-500/50 text-amber-300 font-bold text-[11px] flex items-center gap-1.5 mx-auto transition-all shadow-sm"
                          title="Ingresar N° de Factura oficial emitida por el proveedor"
                        >
                          <span className="material-symbols-outlined text-[14px]">edit_document</span>
                          Pasar a Limpio
                        </button>
                      ) : (
                        <div className="text-[11px] text-emerald-400/80 font-medium">
                          {p.regularizedAt ? `Reg. ${p.regularizedAt}` : 'Facturado'}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Regularize Provisional Purchase */}
      {isRegularizeModalOpen && selectedPurchaseToRegularize && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[#1c1b1b] border border-[#54433c] rounded-2xl w-full max-w-lg p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#54433c]/60 pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[24px] text-amber-400">edit_document</span>
                <div>
                  <h3 className="text-[17px] font-bold text-white">Pasar Compra a Limpio</h3>
                  <p className="text-[11px] text-[#dac1b8]/70">
                    Vincular comprobante formal definitivo de SUNAT al vale provisional
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsRegularizeModalOpen(false)}
                className="text-[#dac1b8]/60 hover:text-white p-1 rounded-lg hover:bg-[#2a2a2a]"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Summary of provisional purchase */}
            <div className="bg-[#141313] p-3.5 rounded-xl border border-[#54433c]/50 space-y-1.5 text-[12px]">
              <div className="flex justify-between">
                <span className="text-[#dac1b8]/60">Vale de Origen:</span>
                <span className="font-bold text-amber-400 font-mono">
                  {selectedPurchaseToRegularize.provisionalNoteNumber || 'VALE PROVISIONAL'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#dac1b8]/60">Proveedor Temporal:</span>
                <span className="font-bold text-white">{selectedPurchaseToRegularize.supplierName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#dac1b8]/60">Total de la Compra:</span>
                <span className="font-bold text-emerald-400 text-[14px]">
                  S/ {selectedPurchaseToRegularize.total.toFixed(2)}
                </span>
              </div>
            </div>

            <form onSubmit={handleConfirmRegularization} className="space-y-3.5">
              <div>
                <label className="block text-[12px] font-bold text-[#dac1b8] mb-1">
                  N° de Factura / Boleta Oficial *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. F001-0004921 o B002-1920"
                  value={regInvoiceNumber}
                  onChange={(e) => setRegInvoiceNumber(e.target.value)}
                  className="w-full bg-[#141313] border border-[#54433c] rounded-xl px-3 py-2 text-[14px] font-bold font-mono text-white focus:outline-none focus:border-[#ffb597]"
                />
              </div>

              <div>
                <label className="block text-[12px] font-bold text-[#dac1b8] mb-1">
                  RUC Formal del Proveedor (11 dígitos)
                </label>
                <input
                  type="text"
                  placeholder="Ej. 20601829401"
                  value={regSupplierRuc}
                  onChange={(e) => setRegSupplierRuc(e.target.value)}
                  className="w-full bg-[#141313] border border-[#54433c] rounded-xl px-3 py-2 text-[13px] font-mono text-white focus:outline-none focus:border-[#ffb597]"
                />
              </div>

              <div>
                <label className="block text-[12px] font-medium text-[#dac1b8] mb-1">
                  Notas de Regularización
                </label>
                <input
                  type="text"
                  placeholder="Ej. Factura enviada por correo el día de hoy..."
                  value={regNotes}
                  onChange={(e) => setRegNotes(e.target.value)}
                  className="w-full bg-[#141313] border border-[#54433c] rounded-xl px-3 py-2 text-[12px] text-white focus:outline-none focus:border-[#ffb597]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#54433c]/40">
                <button
                  type="button"
                  onClick={() => setIsRegularizeModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-[13px] font-bold text-[#dac1b8] hover:bg-[#2a2a2a]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-[#823b19] hover:brightness-110 text-white font-bold text-[13px] shadow-md flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[16px]">verified</span>
                  Confirmar y Regularizar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: New Purchase (Supports both direct Factura & Provisional Vale) */}
      {isNewPurchaseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[#1c1b1b] border border-[#54433c] rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-[#54433c]/60 flex items-center justify-between bg-[#161515]">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[24px] text-[#ffb597]">
                  {isProvisionalDoc ? 'receipt' : 'add_shopping_cart'}
                </span>
                <h3 className="text-[17px] font-bold text-white">
                  {isProvisionalDoc ? 'Nuevo Vale de Compra Provisional (Al Paso)' : 'Registrar Compra Formal con Factura'}
                </h3>
              </div>
              <button
                onClick={() => setIsNewPurchaseModalOpen(false)}
                className="text-[#dac1b8]/60 hover:text-white p-1 rounded-lg hover:bg-[#2a2a2a]"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <form onSubmit={handleSavePurchase} className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
              {/* Document Type Switch */}
              <div className="bg-[#141313] p-2 rounded-xl border border-[#54433c]/50 flex items-center justify-between gap-2">
                <span className="text-[12px] font-bold text-[#dac1b8]">Modalidad del Registro:</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setIsProvisionalDoc(false)}
                    className={`px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all ${
                      !isProvisionalDoc
                        ? 'bg-[#823b19] text-[#ffdbcd] shadow-sm'
                        : 'text-[#dac1b8]/70 hover:text-white'
                    }`}
                  >
                    Factura / Boleta SUNAT
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsProvisionalDoc(true)}
                    className={`px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all flex items-center gap-1 ${
                      isProvisionalDoc
                        ? 'bg-amber-950 text-amber-300 border border-amber-500/50'
                        : 'text-[#dac1b8]/70 hover:text-amber-300'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    Vale Provisional (Pasar a limpio luego)
                  </button>
                </div>
              </div>

              {/* Company & Category */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-[#dac1b8]/70 mb-1">Empresa</label>
                  <select
                    value={targetCompany}
                    onChange={(e) => setTargetCompany(e.target.value as CompanyId)}
                    className="w-full bg-[#141313] border border-[#54433c] rounded-xl px-3 py-2 text-[13px] text-white focus:outline-none focus:border-[#ffb597]"
                  >
                    <option value="el-tayta">El Tayta (Criollo &amp; Marino)</option>
                    <option value="el-sabroso">El Sabroso (Brasas &amp; Parrillas)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-[#dac1b8]/70 mb-1">Rubro</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as PurchaseCategory)}
                    className="w-full bg-[#141313] border border-[#54433c] rounded-xl px-3 py-2 text-[13px] text-white focus:outline-none focus:border-[#ffb597]"
                  >
                    <option value="insumos">Insumos de Cocina / Recetas</option>
                    <option value="productos_reventa">Bebidas y Reventa</option>
                    <option value="gastos_operativos">Gastos Operativos Generales</option>
                  </select>
                </div>
              </div>

              {/* Document Number & Supplier */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {!isProvisionalDoc ? (
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-[#dac1b8]/70 mb-1">
                      N° Factura / Boleta *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ej. F001-00921"
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value)}
                      className="w-full bg-[#141313] border border-[#54433c] rounded-xl px-3 py-2 text-[13px] font-mono text-white focus:outline-none focus:border-[#ffb597]"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-amber-400 mb-1">
                      Folio Provisional de Vale
                    </label>
                    <div className="bg-[#141313] border border-amber-500/30 rounded-xl px-3 py-2 text-[13px] font-mono text-amber-300">
                      Auto-generado (Ej. VALE-Mercado)
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-bold uppercase text-[#dac1b8]/70 mb-1">
                    Proveedor *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Distribuidora Santa Rosa"
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    className="w-full bg-[#141313] border border-[#54433c] rounded-xl px-3 py-2 text-[13px] text-white focus:outline-none focus:border-[#ffb597]"
                  />
                </div>
              </div>

              {/* Supplier RUC & Presets */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-[#dac1b8]/70 mb-1">
                    RUC Proveedor
                  </label>
                  <input
                    type="text"
                    placeholder="20601928301 o PENDIENTE"
                    value={supplierRuc}
                    onChange={(e) => setSupplierRuc(e.target.value)}
                    className="w-full bg-[#141313] border border-[#54433c] rounded-xl px-3 py-2 text-[13px] font-mono text-white focus:outline-none focus:border-[#ffb597]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-[#dac1b8]/70 mb-1">
                    Proveedores Habituales
                  </label>
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() => applySupplierPreset('Avícola San Fernando S.A.', '20100154308')}
                      className="px-2 py-1 rounded bg-[#2a2a2a] text-[11px] text-[#dac1b8] hover:text-white"
                    >
                      San Fernando
                    </button>
                    <button
                      type="button"
                      onClick={() => applySupplierPreset('Mercado Mayorista Frutas y Verduras', 'PENDIENTE')}
                      className="px-2 py-1 rounded bg-[#2a2a2a] text-[11px] text-[#dac1b8] hover:text-white"
                    >
                      Mercado Local
                    </button>
                    <button
                      type="button"
                      onClick={() => applySupplierPreset('Comercializadora de Mariscos Del Pacífico', '20489102931')}
                      className="px-2 py-1 rounded bg-[#2a2a2a] text-[11px] text-[#dac1b8] hover:text-white"
                    >
                      Mariscos Pacífico
                    </button>
                  </div>
                </div>
              </div>

              {/* Payment Mode Selection (Cash vs Bank Account) */}
              <div className="bg-[#141313] p-3 rounded-xl border border-[#54433c]/50 space-y-2">
                <span className="block text-[11px] font-bold uppercase text-[#dac1b8]/70">
                  Fuente de Fondos / Forma de Pago
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentMode('caja');
                      setSelectedBankId('');
                    }}
                    className={`p-2 rounded-xl border text-[12px] font-bold flex flex-col items-center gap-1 ${
                      paymentMode === 'caja'
                        ? 'bg-[#823b19]/40 border-[#ffb597] text-[#ffdbcd]'
                        : 'bg-[#1c1b1b] border-[#54433c]/40 text-[#dac1b8]/70'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px]">point_of_sale</span>
                    Caja Chica (Efectivo)
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPaymentMode('banco');
                      if (filteredBankAccounts.length > 0) {
                        setSelectedBankId(filteredBankAccounts[0].id);
                      }
                    }}
                    className={`p-2 rounded-xl border text-[12px] font-bold flex flex-col items-center gap-1 ${
                      paymentMode === 'banco'
                        ? 'bg-emerald-950/40 border-emerald-500 text-emerald-300'
                        : 'bg-[#1c1b1b] border-[#54433c]/40 text-[#dac1b8]/70'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px]">account_balance</span>
                    Cuenta Bancaria
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPaymentMode('credito');
                      setSelectedBankId('');
                    }}
                    className={`p-2 rounded-xl border text-[12px] font-bold flex flex-col items-center gap-1 ${
                      paymentMode === 'credito'
                        ? 'bg-amber-950/40 border-amber-500 text-amber-300'
                        : 'bg-[#1c1b1b] border-[#54433c]/40 text-[#dac1b8]/70'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px]">credit_card</span>
                    Crédito 15 días
                  </button>
                </div>

                {paymentMode === 'banco' && (
                  <div className="pt-2">
                    <label className="block text-[11px] font-semibold text-[#dac1b8]/80 mb-1">
                      Seleccionar Cuenta Bancaria de Débito:
                    </label>
                    <select
                      value={selectedBankId}
                      onChange={(e) => setSelectedBankId(e.target.value)}
                      className="w-full bg-[#1e1d1d] border border-emerald-500/50 rounded-xl px-3 py-2 text-[13px] text-white focus:outline-none"
                    >
                      {filteredBankAccounts.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.bankName} - {b.alias} (Saldo: S/ {b.currentBalance.toFixed(2)})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Items List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-bold text-white">Insumos a Ingresar al Kardex:</span>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="text-[11px] text-[#ffb597] hover:underline font-bold flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[14px]">add</span>
                    Agregar Insumo
                  </button>
                </div>

                <div className="space-y-2">
                  {items.map((it, idx) => (
                    <div
                      key={idx}
                      className="bg-[#141313] p-2.5 rounded-xl border border-[#54433c]/40 flex flex-wrap sm:flex-nowrap items-center gap-2"
                    >
                      <div className="flex-1 min-w-[140px]">
                        <select
                          required
                          value={it.insumoId}
                          onChange={(e) => handleItemChange(idx, 'insumoId', e.target.value)}
                          className="w-full bg-[#1e1d1d] border border-[#54433c] rounded-lg px-2.5 py-1.5 text-[12px] text-white focus:outline-none"
                        >
                          <option value="">-- Seleccionar Insumo --</option>
                          {insumos.map((ins) => (
                            <option key={ins.id} value={ins.id}>
                              {ins.name} ({ins.unit})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="w-20">
                        <input
                          type="number"
                          step="0.1"
                          min="0.1"
                          placeholder="Cant."
                          value={it.quantity}
                          onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                          className="w-full bg-[#1e1d1d] border border-[#54433c] rounded-lg px-2 py-1.5 text-[12px] text-white text-center"
                        />
                      </div>

                      <div className="w-24">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          placeholder="Costo U."
                          value={it.unitCost}
                          onChange={(e) => handleItemChange(idx, 'unitCost', e.target.value)}
                          className="w-full bg-[#1e1d1d] border border-[#54433c] rounded-lg px-2 py-1.5 text-[12px] text-white text-center"
                        />
                      </div>

                      <div className="w-24 text-right font-bold text-[13px] text-[#ebc246]">
                        S/ {(it.totalCost || 0).toFixed(2)}
                      </div>

                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="text-rose-400 hover:text-rose-300 p-1"
                        >
                          <span className="material-symbols-outlined text-[16px]">close</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Total Calculation Strip */}
              <div className="bg-[#141313] p-3.5 rounded-xl border border-[#54433c]/60 flex items-center justify-between text-[13px]">
                <span className="text-[#dac1b8]/80 font-bold">Total a Registrar en Kardex y Contabilidad:</span>
                <span className="text-[20px] font-black text-emerald-400">S/ {draftTotal.toFixed(2)}</span>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#54433c]/40">
                <button
                  type="button"
                  onClick={() => setIsNewPurchaseModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-[13px] font-bold text-[#dac1b8] hover:bg-[#2a2a2a]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#823b19] hover:bg-[#9a451e] text-[#ffdbcd] font-bold text-[13px] shadow-md flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[18px]">save</span>
                  {isProvisionalDoc ? 'Guardar Vale Provisional' : 'Guardar Compra y Afectar Kardex'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
