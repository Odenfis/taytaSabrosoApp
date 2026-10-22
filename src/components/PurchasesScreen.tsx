import { insumoSelectable } from '../lib/insumoCatalog';
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
    addNotification,
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

      if (field === 'quantity') {
        item.quantity = +value || 0;
      } else if (field === 'unitCost') {
        item.unitCost = +value || 0;
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
    if (!supplierName || items.length === 0) {
      addNotification(
        'Faltan datos del proveedor',
        'Ingresa el nombre del proveedor para registrar la compra.',
        'warning'
      );
      return;
    }

    const validItems = items.filter((it) => it.insumoId && it.quantity > 0);
    if (validItems.length === 0) {
      addNotification(
        'Falta seleccionar insumos',
        'Selecciona al menos un insumo con cantidad mayor a 0 para ingresar al Kardex.',
        'warning'
      );
      return;
    }

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
    <div id="purchases-screen" className="flex-1 flex flex-col h-full bg-panel-20 text-ink-body overflow-hidden">
      {/* Top Header */}
      <div className="bg-panel-21 border-b border-edge-outline-2 p-4 md:px-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[26px] text-ink-brand">shopping_cart_checkout</span>
              <h1 className="text-[20px] md:text-[22px] font-black text-ink-heading-brand">
                Compras, Facturas &amp; Vales Provisionales
              </h1>
            </div>
            <p className="text-[13px] text-ink-muted-7 mt-0.5">
              Registro formal e intermedio de compras de insumos, actualización de Kardex y regularización de comprobantes
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => {
                setIsProvisionalDoc(true);
                setIsNewPurchaseModalOpen(true);
              }}
              className="bg-surface-tinted-2 hover:bg-surface-tinted-3 text-ink-brand border border-edge-brand-3 px-3.5 py-2 rounded-xl text-[13px] font-bold flex items-center gap-1.5 shadow-sm transition-all"
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
              className="bg-surface-brand-solid hover:bg-surface-brand-hover-alt text-ink-on-brand px-4 py-2 rounded-xl text-[13px] font-bold flex items-center gap-2 shadow-md transition-all"
            >
              <span className="material-symbols-outlined text-[18px]">add_shopping_cart</span>
              <span>Registrar Compra con Factura</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 md:px-6 pb-2">
        <div className="bg-panel-21 border border-edge-outline-2 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <span className="text-[12px] font-semibold text-ink-muted-3 uppercase">Total en Compras</span>
            <p className="text-[22px] font-black text-ink-strong mt-1">S/ {totalPurchasesAmount.toFixed(2)}</p>
            <span className="text-[11px] text-ink-muted">{filteredPurchases.length} operaciones registradas</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-surface-brand-solid-3 text-ink-brand flex items-center justify-center border border-edge-brand-4">
            <span className="material-symbols-outlined text-[24px]">receipt_long</span>
          </div>
        </div>

        {/* Provisional Alert Card */}
        <div
          onClick={() => setDocFilter('provisionales')}
          className={`bg-panel-21 rounded-2xl p-4 flex items-center justify-between cursor-pointer transition-all border ${
            provisionalPurchases.length > 0
              ? 'border-edge-warning-2 hover:bg-surface-warning-strong-2'
              : 'border-edge-outline-2'
          }`}
        >
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-semibold text-ink-warning-3 uppercase">Vales por Regularizar</span>
              {provisionalPurchases.length > 0 && (
                <span className="w-2 h-2 rounded-full bg-surface-warning animate-pulse" />
              )}
            </div>
            <p className="text-[22px] font-black text-ink-warning-3 mt-1">{provisionalPurchases.length} Vales</p>
            <span className="text-[11px] text-ink-muted-3">
              S/ {provisionalTotalAmount.toFixed(2)} pendientes de factura formal
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-surface-warning-strong-3 text-ink-warning-3 flex items-center justify-center border border-edge-warning-3">
            <span className="material-symbols-outlined text-[24px]">pending_actions</span>
          </div>
        </div>

        <div className="bg-panel-21 border border-edge-outline-2 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <span className="text-[12px] font-semibold text-ink-muted-3 uppercase">Regularizadas / Formales</span>
            <p className="text-[22px] font-black text-ink-success mt-1">
              {filteredPurchases.filter((p) => p.documentStatus === 'regularizado').length} Compras
            </p>
            <span className="text-[11px] text-ink-muted">Con Factura / Boleta SUNAT validada</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-surface-success-strong-3 text-ink-success flex items-center justify-center border border-edge-success-2">
            <span className="material-symbols-outlined text-[24px]">verified</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="px-4 md:px-6 py-2 border-b border-edge-outline-5 flex flex-wrap items-center justify-between gap-3 bg-panel-29">
        <div className="flex items-center gap-1.5 bg-panel-30 p-1 rounded-xl border border-edge-outline-3">
          <button
            onClick={() => setDocFilter('todos')}
            className={`px-3 py-1 rounded-lg text-[12px] font-bold transition-all ${
              docFilter === 'todos' ? 'bg-surface-brand-solid text-ink-on-brand' : 'text-ink-muted-3 hover:text-ink-strong'
            }`}
          >
            Todas ({purchases.length})
          </button>
          <button
            onClick={() => setDocFilter('provisionales')}
            className={`px-3 py-1 rounded-lg text-[12px] font-bold transition-all flex items-center gap-1.5 ${
              docFilter === 'provisionales'
                ? 'bg-surface-warning-strong-4 text-ink-warning-2 border border-edge-warning-2'
                : 'text-ink-muted-3 hover:text-ink-warning-2'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-surface-warning" />
            Vales Provisionales ({purchases.filter((p) => p.documentStatus === 'provisional').length})
          </button>
          <button
            onClick={() => setDocFilter('regularizados')}
            className={`px-3 py-1 rounded-lg text-[12px] font-bold transition-all flex items-center gap-1.5 ${
              docFilter === 'regularizados'
                ? 'bg-surface-success-strong-4 text-ink-success-2 border border-edge-success-3'
                : 'text-ink-muted-3 hover:text-ink-success-2'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-surface-success" />
            Regularizados ({purchases.filter((p) => p.documentStatus === 'regularizado').length})
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <span className="material-symbols-outlined absolute left-3 top-2.5 text-ink-muted-4 text-[18px]">
            search
          </span>
          <input
            type="text"
            placeholder="Buscar por N° doc, RUC o proveedor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-panel-30 border border-edge-outline-2 rounded-xl pl-9 pr-3 py-1.5 text-[12px] text-ink-strong focus:outline-none focus:border-edge-brand"
          />
        </div>
      </div>

      {/* Purchases Table */}
      <div className="flex-1 overflow-y-auto p-4 md:px-6">
        <div className="bg-panel-21 border border-edge-outline-2 rounded-2xl overflow-hidden shadow-lg">
          <table className="w-full text-left border-collapse text-[13px]">
            <thead>
              <tr className="bg-panel-30 border-b border-edge-outline-3 text-[11px] uppercase font-bold text-ink-muted-3 tracking-wider">
                <th className="py-3 px-4">Estado / Folio</th>
                <th className="py-3 px-4">Proveedor / RUC</th>
                <th className="py-3 px-4">Insumos Comprados</th>
                <th className="py-3 px-4">Medio de Pago</th>
                <th className="py-3 px-4 text-right">Total</th>
                <th className="py-3 px-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge-outline-6">
              {filteredPurchases.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-ink-muted">
                    <span className="material-symbols-outlined text-[36px] text-ink-outline mb-2">shopping_bag</span>
                    <p>No se encontraron compras en este filtro.</p>
                  </td>
                </tr>
              ) : (
                filteredPurchases.map((p) => (
                  <tr key={p.id} className="hover:bg-panel-31 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          {p.documentStatus === 'provisional' ? (
                            <span className="bg-surface-warning-strong-5 text-ink-warning-2 border border-edge-warning-2 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 w-max">
                              <span className="material-symbols-outlined text-[12px]">schedule</span>
                              Provisional (Vale)
                            </span>
                          ) : (
                            <span className="bg-surface-success-strong-5 text-ink-success-2 border border-edge-success text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 w-max">
                              <span className="material-symbols-outlined text-[12px]">verified</span>
                              Regularizado
                            </span>
                          )}
                          <span className="text-[11px] text-ink-muted">{p.date} • {p.time}</span>
                        </div>

                        <div className="font-bold text-ink-strong font-mono text-[13px]">
                          {p.documentStatus === 'provisional' ? (
                            <span className="text-ink-warning-3">{p.provisionalNoteNumber || 'VALE PROVISIONAL'}</span>
                          ) : (
                            <span className="text-ink-brand">{p.invoiceNumber}</span>
                          )}
                        </div>

                        <span className="text-[10px] text-ink-muted-4">
                          {p.companyId === 'el-tayta' ? 'El Tayta' : 'El Sabroso'} • Turno {p.shift}
                        </span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-bold text-ink-strong">{p.supplierName}</div>
                      <div className="text-[11px] text-ink-muted-3 font-mono">RUC: {p.supplierRuc}</div>
                      {p.notes && (
                        <div className="text-[11px] text-ink-muted-4 italic mt-0.5 truncate max-w-xs">
                          {p.notes}
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="text-[12px] text-ink-muted-2 space-y-0.5 max-w-xs">
                        {(p.items || []).map((it, idx) => (
                          <div key={idx} className="flex justify-between gap-2">
                            <span className="truncate">{it.insumoName}</span>
                            <span className="font-mono text-ink-muted-3 shrink-0">
                              {it.quantity} {it.unit}
                            </span>
                          </div>
                        ))}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex flex-col gap-1">
                        <span className="text-[12px] font-medium text-ink-strong">{p.paymentStatus}</span>
                        {p.bankAccountAlias ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-ink-success bg-surface-success-strong-6 px-1.5 py-0.5 rounded border border-edge-success-2 w-max">
                            <span className="material-symbols-outlined text-[11px]">account_balance</span>
                            {p.bankAccountAlias}
                          </span>
                        ) : p.paidFromCash ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-ink-muted-3 bg-surface-neutral-2 px-1.5 py-0.5 rounded w-max">
                            <span className="material-symbols-outlined text-[11px]">point_of_sale</span>
                            Caja Chica Efectivo
                          </span>
                        ) : null}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="font-black text-[15px] text-ink-strong">S/ {p.total.toFixed(2)}</div>
                      <div className="text-[10px] text-ink-muted">Sub: S/ {p.subtotal.toFixed(2)}</div>
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      {p.documentStatus === 'provisional' ? (
                        <button
                          onClick={() => openRegularizeModal(p)}
                          className="px-3 py-1.5 rounded-xl bg-surface-warning-strong hover:bg-surface-warning-strong-6 border border-edge-warning-2 text-ink-warning-2 font-bold text-[11px] flex items-center gap-1.5 mx-auto transition-all shadow-sm"
                          title="Ingresar N° de Factura oficial emitida por el proveedor"
                        >
                          <span className="material-symbols-outlined text-[14px]">edit_document</span>
                          Pasar a Limpio
                        </button>
                      ) : (
                        <div className="text-[11px] text-ink-success-4 font-medium">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-surface-scrim backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-panel border border-edge-outline rounded-2xl w-full max-w-lg p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-edge-outline-2 pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[24px] text-ink-warning-3">edit_document</span>
                <div>
                  <h3 className="text-[17px] font-bold text-ink-strong">Pasar Compra a Limpio</h3>
                  <p className="text-[11px] text-ink-muted-3">
                    Vincular comprobante formal definitivo de SUNAT al vale provisional
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsRegularizeModalOpen(false)}
                className="text-ink-muted hover:text-ink-strong p-1 rounded-lg hover:bg-panel-3"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Summary of provisional purchase */}
            <div className="bg-panel-29 p-3.5 rounded-xl border border-edge-outline-3 space-y-1.5 text-[12px]">
              <div className="flex justify-between">
                <span className="text-ink-muted">Vale de Origen:</span>
                <span className="font-bold text-ink-warning-3 font-mono">
                  {selectedPurchaseToRegularize.provisionalNoteNumber || 'VALE PROVISIONAL'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Proveedor Temporal:</span>
                <span className="font-bold text-ink-strong">{selectedPurchaseToRegularize.supplierName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Total de la Compra:</span>
                <span className="font-bold text-ink-success text-[14px]">
                  S/ {selectedPurchaseToRegularize.total.toFixed(2)}
                </span>
              </div>
            </div>

            <form onSubmit={handleConfirmRegularization} className="space-y-3.5">
              <div>
                <label className="block text-[12px] font-bold text-ink-muted-2 mb-1">
                  N° de Factura / Boleta Oficial *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. F001-0004921 o B002-1920"
                  value={regInvoiceNumber}
                  onChange={(e) => setRegInvoiceNumber(e.target.value)}
                  className="w-full bg-panel-29 border border-edge-outline rounded-xl px-3 py-2 text-[14px] font-bold font-mono text-ink-strong focus:outline-none focus:border-edge-brand"
                />
              </div>

              <div>
                <label className="block text-[12px] font-bold text-ink-muted-2 mb-1">
                  RUC Formal del Proveedor (11 dígitos)
                </label>
                <input
                  type="text"
                  placeholder="Ej. 20601829401"
                  value={regSupplierRuc}
                  onChange={(e) => setRegSupplierRuc(e.target.value)}
                  className="w-full bg-panel-29 border border-edge-outline rounded-xl px-3 py-2 text-[13px] font-mono text-ink-strong focus:outline-none focus:border-edge-brand"
                />
              </div>

              <div>
                <label className="block text-[12px] font-medium text-ink-muted-2 mb-1">
                  Notas de Regularización
                </label>
                <input
                  type="text"
                  placeholder="Ej. Factura enviada por correo el día de hoy..."
                  value={regNotes}
                  onChange={(e) => setRegNotes(e.target.value)}
                  className="w-full bg-panel-29 border border-edge-outline rounded-xl px-3 py-2 text-[12px] text-ink-strong focus:outline-none focus:border-edge-brand"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-edge-outline-5">
                <button
                  type="button"
                  onClick={() => setIsRegularizeModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-[13px] font-bold text-ink-muted-2 hover:bg-panel-3"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-surface-warning-2 to-surface-brand-solid-4 hover:brightness-110 text-ink-on-solid font-bold text-[13px] shadow-md flex items-center gap-1.5"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-surface-scrim backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-panel border border-edge-outline rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-edge-outline-2 flex items-center justify-between bg-panel-2">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[24px] text-ink-brand">
                  {isProvisionalDoc ? 'receipt' : 'add_shopping_cart'}
                </span>
                <h3 className="text-[17px] font-bold text-ink-strong">
                  {isProvisionalDoc ? 'Nuevo Vale de Compra Provisional (Al Paso)' : 'Registrar Compra Formal con Factura'}
                </h3>
              </div>
              <button
                onClick={() => setIsNewPurchaseModalOpen(false)}
                className="text-ink-muted hover:text-ink-strong p-1 rounded-lg hover:bg-panel-3"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <form onSubmit={handleSavePurchase} className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
              {/* Document Type Switch */}
              <div className="bg-panel-29 p-2 rounded-xl border border-edge-outline-3 flex items-center justify-between gap-2">
                <span className="text-[12px] font-bold text-ink-muted-2">Modalidad del Registro:</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setIsProvisionalDoc(false)}
                    className={`px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all ${
                      !isProvisionalDoc
                        ? 'bg-surface-brand-solid text-ink-on-brand shadow-sm'
                        : 'text-ink-muted-3 hover:text-ink-strong'
                    }`}
                  >
                    Factura / Boleta SUNAT
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsProvisionalDoc(true)}
                    className={`px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all flex items-center gap-1 ${
                      isProvisionalDoc
                        ? 'bg-surface-warning-strong-4 text-ink-warning-2 border border-edge-warning-2'
                        : 'text-ink-muted-3 hover:text-ink-warning-2'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-surface-warning" />
                    Vale Provisional (Pasar a limpio luego)
                  </button>
                </div>
              </div>

              {/* Company & Category */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-ink-muted-3 mb-1">Empresa</label>
                  <select
                    value={targetCompany}
                    onChange={(e) => setTargetCompany(e.target.value as CompanyId)}
                    className="w-full bg-panel-29 border border-edge-outline rounded-xl px-3 py-2 text-[13px] text-ink-strong focus:outline-none focus:border-edge-brand"
                  >
                    <option value="el-tayta">El Tayta (Criollo &amp; Marino)</option>
                    <option value="el-sabroso">El Sabroso (Brasas &amp; Parrillas)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-ink-muted-3 mb-1">Rubro</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as PurchaseCategory)}
                    className="w-full bg-panel-29 border border-edge-outline rounded-xl px-3 py-2 text-[13px] text-ink-strong focus:outline-none focus:border-edge-brand"
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
                    <label className="block text-[11px] font-bold uppercase text-ink-muted-3 mb-1">
                      N° Factura / Boleta *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ej. F001-00921"
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value)}
                      className="w-full bg-panel-29 border border-edge-outline rounded-xl px-3 py-2 text-[13px] font-mono text-ink-strong focus:outline-none focus:border-edge-brand"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-ink-warning-3 mb-1">
                      Folio Provisional de Vale
                    </label>
                    <div className="bg-panel-29 border border-edge-warning-4 rounded-xl px-3 py-2 text-[13px] font-mono text-ink-warning-2">
                      Auto-generado (Ej. VALE-Mercado)
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-bold uppercase text-ink-muted-3 mb-1">
                    Proveedor *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Distribuidora Santa Rosa"
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    className="w-full bg-panel-29 border border-edge-outline rounded-xl px-3 py-2 text-[13px] text-ink-strong focus:outline-none focus:border-edge-brand"
                  />
                </div>
              </div>

              {/* Supplier RUC & Presets */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-ink-muted-3 mb-1">
                    RUC Proveedor
                  </label>
                  <input
                    type="text"
                    placeholder="20601928301 o PENDIENTE"
                    value={supplierRuc}
                    onChange={(e) => setSupplierRuc(e.target.value)}
                    className="w-full bg-panel-29 border border-edge-outline rounded-xl px-3 py-2 text-[13px] font-mono text-ink-strong focus:outline-none focus:border-edge-brand"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-ink-muted-3 mb-1">
                    Proveedores Habituales
                  </label>
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() => applySupplierPreset('Avícola San Fernando S.A.', '20100154308')}
                      className="px-2 py-1 rounded bg-panel-3 text-[11px] text-ink-muted-2 hover:text-ink-strong"
                    >
                      San Fernando
                    </button>
                    <button
                      type="button"
                      onClick={() => applySupplierPreset('Mercado Mayorista Frutas y Verduras', 'PENDIENTE')}
                      className="px-2 py-1 rounded bg-panel-3 text-[11px] text-ink-muted-2 hover:text-ink-strong"
                    >
                      Mercado Local
                    </button>
                    <button
                      type="button"
                      onClick={() => applySupplierPreset('Comercializadora de Mariscos Del Pacífico', '20489102931')}
                      className="px-2 py-1 rounded bg-panel-3 text-[11px] text-ink-muted-2 hover:text-ink-strong"
                    >
                      Mariscos Pacífico
                    </button>
                  </div>
                </div>
              </div>

              {/* Payment Mode Selection (Cash vs Bank Account) */}
              <div className="bg-panel-29 p-3 rounded-xl border border-edge-outline-3 space-y-2">
                <span className="block text-[11px] font-bold uppercase text-ink-muted-3">
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
                        ? 'bg-surface-brand-solid-2 border-edge-brand text-ink-heading-brand'
                        : 'bg-panel border-edge-outline-5 text-ink-muted-3'
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
                        ? 'bg-surface-success-strong-6 border-edge-success-4 text-ink-success-2'
                        : 'bg-panel border-edge-outline-5 text-ink-muted-3'
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
                        ? 'bg-surface-warning-strong-3 border-edge-warning-5 text-ink-warning-2'
                        : 'bg-panel border-edge-outline-5 text-ink-muted-3'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px]">credit_card</span>
                    Crédito 15 días
                  </button>
                </div>

                {paymentMode === 'banco' && (
                  <div className="pt-2">
                    <label className="block text-[11px] font-semibold text-ink-muted-5 mb-1">
                      Seleccionar Cuenta Bancaria de Débito:
                    </label>
                    <select
                      value={selectedBankId}
                      onChange={(e) => setSelectedBankId(e.target.value)}
                      className="w-full bg-panel-30 border border-edge-success-3 rounded-xl px-3 py-2 text-[13px] text-ink-strong focus:outline-none"
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
                  <span className="text-[12px] font-bold text-ink-strong">Insumos a Ingresar al Kardex:</span>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="text-[11px] text-ink-brand hover:underline font-bold flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[14px]">add</span>
                    Agregar Insumo
                  </button>
                </div>

                <div className="space-y-2">
                  {items.map((it, idx) => (
                    <div
                      key={idx}
                      className="bg-panel-29 p-2.5 rounded-xl border border-edge-outline-5 flex flex-wrap sm:flex-nowrap items-center gap-2"
                    >
                      <div className="flex-1 min-w-[140px]">
                        <select
                          required
                          value={it.insumoId}
                          onChange={(e) => handleItemChange(idx, 'insumoId', e.target.value)}
                          className="w-full bg-panel-30 border border-edge-outline rounded-lg px-2.5 py-1.5 text-[12px] text-ink-strong focus:outline-none"
                        >
                          <option value="">-- Seleccionar Insumo --</option>
                          {insumos.filter(insumoSelectable).map((ins) => (
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
                          className="w-full bg-panel-30 border border-edge-outline rounded-lg px-2 py-1.5 text-[12px] text-ink-strong text-center"
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
                          className="w-full bg-panel-30 border border-edge-outline rounded-lg px-2 py-1.5 text-[12px] text-ink-strong text-center"
                        />
                      </div>

                      <div className="w-24 text-right font-bold text-[13px] text-ink-gold">
                        S/ {(it.totalCost || 0).toFixed(2)}
                      </div>

                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="text-ink-danger-3 hover:text-ink-danger-2 p-1"
                        >
                          <span className="material-symbols-outlined text-[16px]">close</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Total Calculation Strip */}
              <div className="bg-panel-29 p-3.5 rounded-xl border border-edge-outline-2 flex items-center justify-between text-[13px]">
                <span className="text-ink-muted-5 font-bold">Total a Registrar en Kardex y Contabilidad:</span>
                <span className="text-[20px] font-black text-ink-success">S/ {draftTotal.toFixed(2)}</span>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-edge-outline-5">
                <button
                  type="button"
                  onClick={() => setIsNewPurchaseModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-[13px] font-bold text-ink-muted-2 hover:bg-panel-3"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-surface-brand-solid hover:bg-surface-brand-hover-alt text-ink-on-brand font-bold text-[13px] shadow-md flex items-center gap-1.5"
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
