import React, { useState, useMemo } from 'react';
import { usePOS } from '../context/POSContext';
import { Insumo, KardexMovementType, CompanyId } from '../types';

export const KardexScreen: React.FC = () => {
  const {
    insumos,
    kardexMovements,
    activeCompanyId,
    activeCompany,
    addKardexAdjustment,
    addInsumo,
  } = usePOS();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('todas');
  const [activeTab, setActiveTab] = useState<'stock' | 'movimientos'>('stock');
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [isAddInsumoModalOpen, setIsAddInsumoModalOpen] = useState(false);

  // Adjustment form state
  const [adjustInsumoId, setAdjustInsumoId] = useState('');
  const [adjustType, setAdjustType] = useState<'AJUSTE_MERMA' | 'ENTRADA_COMPRA'>('AJUSTE_MERMA');
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustReason, setAdjustReason] = useState('');

  // Add insumo form state
  const [newInsName, setNewInsName] = useState('');
  const [newInsCategory, setNewInsCategory] = useState<Insumo['category']>('Carnes & Aves');
  const [newInsUnit, setNewInsUnit] = useState<Insumo['unit']>('kg');
  const [newInsStock, setNewInsStock] = useState('');
  const [newInsMinStock, setNewInsMinStock] = useState('');
  const [newInsCost, setNewInsCost] = useState('');

  // Filtered insumos by company and search
  const filteredInsumos = useMemo(() => {
    return insumos.filter((ins) => {
      const matchCompany =
        activeCompanyId === 'todas' ||
        ins.companyId === 'ambas' ||
        ins.companyId === activeCompanyId;

      const matchCategory =
        selectedCategory === 'todas' || ins.category === selectedCategory;

      const matchSearch =
        ins.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ins.code.toLowerCase().includes(searchTerm.toLowerCase());

      return matchCompany && matchCategory && matchSearch;
    });
  }, [insumos, activeCompanyId, selectedCategory, searchTerm]);

  // Filtered Kardex movements
  const filteredMovements = useMemo(() => {
    return kardexMovements.filter((m) => {
      const matchCompany =
        activeCompanyId === 'todas' || m.companyId === activeCompanyId;
      const matchSearch =
        m.insumoName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.referenceDoc.toLowerCase().includes(searchTerm.toLowerCase());
      return matchCompany && matchSearch;
    });
  }, [kardexMovements, activeCompanyId, searchTerm]);

  // Valued stock totals
  const totalValuedStock = useMemo(() => {
    return filteredInsumos.reduce((acc, ins) => acc + ins.currentStock * ins.costPerUnit, 0);
  }, [filteredInsumos]);

  const lowStockCount = useMemo(() => {
    return filteredInsumos.filter((ins) => ins.currentStock <= ins.minStock).length;
  }, [filteredInsumos]);

  const handleSaveAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustInsumoId || !adjustQty || parseFloat(adjustQty) <= 0) return;
    addKardexAdjustment(
      adjustInsumoId,
      parseFloat(adjustQty),
      adjustType,
      adjustReason || 'Ajuste de inventario físico'
    );
    setIsAdjustModalOpen(false);
    setAdjustQty('');
    setAdjustReason('');
  };

  const handleSaveNewInsumo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInsName || !newInsCost) return;
    addInsumo({
      companyId: activeCompanyId === 'todas' ? 'ambas' : activeCompanyId,
      name: newInsName.trim(),
      category: newInsCategory,
      unit: newInsUnit,
      currentStock: parseFloat(newInsStock) || 0,
      minStock: parseFloat(newInsMinStock) || 5,
      costPerUnit: parseFloat(newInsCost) || 0,
      lastPurchaseDate: 'Hoy (Registro Inicial)',
    });
    setIsAddInsumoModalOpen(false);
    setNewInsName('');
    setNewInsCost('');
    setNewInsStock('');
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#101010] text-[#e5e2e1] overflow-hidden">
      {/* Header bar with metrics */}
      <div className="bg-[#181717] border-b border-[#54433c]/60 p-4 md:px-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#ffb597] text-[26px]">
                inventory_2
              </span>
              <h2 className="text-[22px] font-black text-[#ffb597] tracking-tight">
                Kardex e Inventario de Insumos
              </h2>
              <span className="text-[12px] font-bold px-2 py-0.5 rounded-full bg-[#352800] text-[#ebc246] border border-[#ebc246]/40">
                {activeCompany.tradeName}
              </span>
            </div>
            <p className="text-[13px] text-[#dac1b8]/80 mt-0.5">
              Control de stock físico en tiempo real con descarga automática por recetas desde el POS.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setIsAdjustModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#2a2827] hover:bg-[#383533] text-[#dac1b8] hover:text-white border border-[#54433c]/60 text-[13px] font-bold transition-all shadow-sm"
            >
              <span className="material-symbols-outlined text-[18px]">tune</span>
              <span>Ajuste / Merma</span>
            </button>

            <button
              onClick={() => setIsAddInsumoModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#823b19] hover:bg-[#9a471f] text-[#ffdbcd] font-bold text-[13px] transition-all shadow-md"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              <span>Nuevo Insumo</span>
            </button>
          </div>
        </div>

        {/* Metrics Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <div className="bg-[#201f1e] p-3 rounded-xl border border-[#54433c]/50">
            <p className="text-[11px] font-semibold text-[#dac1b8]/70 uppercase">Insumos Registrados</p>
            <p className="text-[20px] font-black text-white mt-0.5">{filteredInsumos.length}</p>
          </div>

          <div className="bg-[#201f1e] p-3 rounded-xl border border-[#54433c]/50">
            <p className="text-[11px] font-semibold text-[#dac1b8]/70 uppercase">Stock Valorado Total</p>
            <p className="text-[20px] font-black text-[#ebc246] mt-0.5">
              S/ {totalValuedStock.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>

          <div className="bg-[#201f1e] p-3 rounded-xl border border-[#54433c]/50">
            <p className="text-[11px] font-semibold text-[#dac1b8]/70 uppercase">Insumos en Alerta</p>
            <p className={`text-[20px] font-black mt-0.5 ${lowStockCount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
              {lowStockCount} {lowStockCount > 0 ? 'por reponer' : 'óptimo'}
            </p>
          </div>

          <div className="bg-[#201f1e] p-3 rounded-xl border border-[#54433c]/50">
            <p className="text-[11px] font-semibold text-[#dac1b8]/70 uppercase">Movimientos Hoy</p>
            <p className="text-[20px] font-black text-[#60d4fb] mt-0.5">{filteredMovements.length}</p>
          </div>
        </div>
      </div>

      {/* Tabs and filters */}
      <div className="p-4 md:px-6 flex flex-col md:flex-row gap-3 items-center justify-between border-b border-[#54433c]/40 bg-[#141414]">
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="bg-[#1f1e1d] p-1 rounded-xl border border-[#54433c]/60 flex gap-1">
            <button
              onClick={() => setActiveTab('stock')}
              className={`px-3 py-1.5 rounded-lg text-[13px] font-bold transition-all ${
                activeTab === 'stock'
                  ? 'bg-[#823b19] text-[#ffdbcd] shadow'
                  : 'text-[#dac1b8]/70 hover:text-white'
              }`}
            >
              Existencias Físicas ({filteredInsumos.length})
            </button>
            <button
              onClick={() => setActiveTab('movimientos')}
              className={`px-3 py-1.5 rounded-lg text-[13px] font-bold transition-all ${
                activeTab === 'movimientos'
                  ? 'bg-[#823b19] text-[#ffdbcd] shadow'
                  : 'text-[#dac1b8]/70 hover:text-white'
              }`}
            >
              Movimientos Kardex ({filteredMovements.length})
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto flex-wrap">
          {/* Search bar */}
          <div className="relative flex-1 md:w-64">
            <span className="material-symbols-outlined absolute left-3 top-2.5 text-[#dac1b8]/60 text-[18px]">
              search
            </span>
            <input
              type="text"
              placeholder="Buscar insumo, código o guía..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#1f1e1d] border border-[#54433c]/60 rounded-xl pl-9 pr-3 py-1.5 text-[13px] text-white focus:outline-none focus:border-[#ffb597]"
            />
          </div>

          {activeTab === 'stock' && (
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-[#1f1e1d] border border-[#54433c]/60 rounded-xl px-3 py-1.5 text-[13px] text-[#dac1b8] focus:outline-none focus:border-[#ffb597]"
            >
              <option value="todas">Todas las categorías</option>
              <option value="Carnes & Aves">Carnes &amp; Aves</option>
              <option value="Pescados & Mariscos">Pescados &amp; Mariscos</option>
              <option value="Verduras & Frutas">Verduras &amp; Frutas</option>
              <option value="Abarrotes & Especias">Abarrotes &amp; Especias</option>
              <option value="Bebidas & Licores">Bebidas &amp; Licores</option>
            </select>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-4 md:px-6 custom-scrollbar">
        {activeTab === 'stock' ? (
          <div className="bg-[#1a1918] rounded-2xl border border-[#54433c]/50 overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-[#242221] text-[#dac1b8] font-bold border-b border-[#54433c]/60">
                  <tr>
                    <th className="p-3.5 pl-4">Código</th>
                    <th className="p-3.5">Insumo</th>
                    <th className="p-3.5">Categoría</th>
                    <th className="p-3.5">Empresa</th>
                    <th className="p-3.5 text-right">Stock Actual</th>
                    <th className="p-3.5 text-right">Stock Mínimo</th>
                    <th className="p-3.5 text-right">Costo Unit.</th>
                    <th className="p-3.5 text-right">Valorizado</th>
                    <th className="p-3.5 text-center">Estado</th>
                    <th className="p-3.5 pr-4 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#54433c]/30 text-[#e5e2e1]">
                  {filteredInsumos.map((ins) => {
                    const isLow = ins.currentStock <= ins.minStock;
                    const isCritical = ins.currentStock <= ins.minStock * 0.5;
                    const valued = +(ins.currentStock * ins.costPerUnit).toFixed(2);

                    return (
                      <tr key={ins.id} className="hover:bg-[#232120] transition-colors">
                        <td className="p-3 pl-4 font-mono text-[#dac1b8]/70">{ins.code}</td>
                        <td className="p-3 font-semibold text-white">
                          <div>{ins.name}</div>
                          <span className="text-[11px] text-[#dac1b8]/60">
                            Últ. Compra: {ins.lastPurchaseDate}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded-lg bg-[#2b2827] text-[#dac1b8] text-[11px] font-medium border border-[#54433c]/40">
                            {ins.category}
                          </span>
                        </td>
                        <td className="p-3">
                          <span
                            className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                              ins.companyId === 'el-tayta'
                                ? 'bg-[#823b19]/40 text-[#ffdbcd]'
                                : ins.companyId === 'el-sabroso'
                                ? 'bg-[#ebc246]/20 text-[#ebc246]'
                                : 'bg-[#3b3836] text-white'
                            }`}
                          >
                            {ins.companyId === 'el-tayta'
                              ? 'El Tayta'
                              : ins.companyId === 'el-sabroso'
                              ? 'El Sabroso'
                              : 'Ambas'}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-[14px]">
                          {ins.currentStock} {ins.unit}
                        </td>
                        <td className="p-3 text-right font-mono text-[#dac1b8]/70">
                          {ins.minStock} {ins.unit}
                        </td>
                        <td className="p-3 text-right font-mono text-[#dac1b8]">
                          S/ {ins.costPerUnit.toFixed(2)}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-[#ebc246]">
                          S/ {valued.toFixed(2)}
                        </td>
                        <td className="p-3 text-center">
                          {isCritical ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-950/80 text-rose-300 border border-rose-500/50 text-[11px] font-black">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
                              Crítico
                            </span>
                          ) : isLow ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-500/50 text-[11px] font-bold">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                              Reponer
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 text-[11px] font-semibold">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              Óptimo
                            </span>
                          )}
                        </td>
                        <td className="p-3 pr-4 text-right">
                          <button
                            onClick={() => {
                              setAdjustInsumoId(ins.id);
                              setIsAdjustModalOpen(true);
                            }}
                            className="p-1.5 text-[#dac1b8] hover:text-[#ffb597] hover:bg-[#302c2a] rounded-lg transition-colors"
                            title="Registrar ajuste o merma"
                          >
                            <span className="material-symbols-outlined text-[18px]">edit_note</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-[#1a1918] rounded-2xl border border-[#54433c]/50 overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-[#242221] text-[#dac1b8] font-bold border-b border-[#54433c]/60">
                  <tr>
                    <th className="p-3.5 pl-4">Hora</th>
                    <th className="p-3.5">Insumo</th>
                    <th className="p-3.5">Tipo de Movimiento</th>
                    <th className="p-3.5">Referencia / Comanda</th>
                    <th className="p-3.5 text-right">Cantidad</th>
                    <th className="p-3.5 text-right">Costo Unit.</th>
                    <th className="p-3.5 text-right">Total</th>
                    <th className="p-3.5 text-right">Saldo Ant.</th>
                    <th className="p-3.5 pr-4 text-right">Nuevo Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#54433c]/30 text-[#e5e2e1]">
                  {filteredMovements.map((mov) => {
                    const isEntrada = mov.quantity > 0;
                    return (
                      <tr key={mov.id} className="hover:bg-[#232120] transition-colors">
                        <td className="p-3 pl-4 font-mono text-[12px] text-[#dac1b8]/70">
                          {mov.time}
                        </td>
                        <td className="p-3 font-semibold text-white">{mov.insumoName}</td>
                        <td className="p-3">
                          <span
                            className={`text-[11px] font-bold px-2 py-0.5 rounded-md inline-flex items-center gap-1 ${
                              mov.type === 'ENTRADA_COMPRA'
                                ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-500/40'
                                : mov.type === 'SALIDA_VENTA_POS'
                                ? 'bg-blue-950/70 text-blue-300 border border-blue-500/40'
                                : mov.type === 'AJUSTE_MERMA'
                                ? 'bg-rose-950/70 text-rose-300 border border-rose-500/40'
                                : 'bg-gray-800 text-gray-300'
                            }`}
                          >
                            <span className="material-symbols-outlined text-[14px]">
                              {mov.type === 'ENTRADA_COMPRA'
                                ? 'arrow_downward'
                                : mov.type === 'SALIDA_VENTA_POS'
                                ? 'shopping_bag'
                                : 'warning'}
                            </span>
                            {mov.type === 'ENTRADA_COMPRA'
                              ? 'Entrada Compra'
                              : mov.type === 'SALIDA_VENTA_POS'
                              ? 'Salida Venta POS'
                              : mov.type === 'AJUSTE_MERMA'
                              ? 'Ajuste / Merma'
                              : 'Inventario Inicial'}
                          </span>
                        </td>
                        <td className="p-3 text-[#dac1b8]/90 text-[12px] font-medium">
                          {mov.referenceDoc}
                        </td>
                        <td
                          className={`p-3 text-right font-mono font-bold ${
                            isEntrada ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {isEntrada ? `+${mov.quantity}` : mov.quantity} {mov.unit}
                        </td>
                        <td className="p-3 text-right font-mono text-[#dac1b8]">
                          S/ {mov.unitCost.toFixed(2)}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-white">
                          S/ {mov.totalCost.toFixed(2)}
                        </td>
                        <td className="p-3 text-right font-mono text-[#dac1b8]/70">
                          {mov.stockBefore} {mov.unit}
                        </td>
                        <td className="p-3 pr-4 text-right font-mono font-bold text-[#ebc246]">
                          {mov.stockAfter} {mov.unit}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Ajuste / Merma */}
      {isAdjustModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1f1e1d] border border-[#54433c] rounded-2xl w-full max-w-md p-5 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#54433c]/50">
              <h3 className="text-[17px] font-bold text-[#ffb597] flex items-center gap-2">
                <span className="material-symbols-outlined">tune</span>
                Ajuste Manual de Kardex / Merma
              </h3>
              <button
                onClick={() => setIsAdjustModalOpen(false)}
                className="text-[#dac1b8] hover:text-white p-1"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleSaveAdjustment} className="space-y-3.5 mt-4">
              <div>
                <label className="block text-[12px] font-bold text-[#dac1b8] mb-1">
                  Insumo a Ajustar
                </label>
                <select
                  value={adjustInsumoId}
                  onChange={(e) => setAdjustInsumoId(e.target.value)}
                  required
                  className="w-full bg-[#151414] border border-[#54433c]/60 rounded-xl px-3 py-2 text-[13px] text-white focus:outline-none focus:border-[#ffb597]"
                >
                  <option value="">Seleccionar insumo...</option>
                  {insumos.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} (Stock actual: {i.currentStock} {i.unit})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[12px] font-bold text-[#dac1b8] mb-1">
                    Tipo de Ajuste
                  </label>
                  <select
                    value={adjustType}
                    onChange={(e) => setAdjustType(e.target.value as any)}
                    className="w-full bg-[#151414] border border-[#54433c]/60 rounded-xl px-3 py-2 text-[13px] text-white focus:outline-none focus:border-[#ffb597]"
                  >
                    <option value="AJUSTE_MERMA">Merma / Desecho (-)</option>
                    <option value="ENTRADA_COMPRA">Ajuste Físico (+)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[12px] font-bold text-[#dac1b8] mb-1">
                    Cantidad
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="Ej. 1.5"
                    value={adjustQty}
                    onChange={(e) => setAdjustQty(e.target.value)}
                    className="w-full bg-[#151414] border border-[#54433c]/60 rounded-xl px-3 py-2 text-[13px] text-white focus:outline-none focus:border-[#ffb597]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-bold text-[#dac1b8] mb-1">
                  Motivo / Observación
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Vencimiento, merma en corte o diferencia de inventario"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="w-full bg-[#151414] border border-[#54433c]/60 rounded-xl px-3 py-2 text-[13px] text-white focus:outline-none focus:border-[#ffb597]"
                />
              </div>

              <div className="pt-3 flex gap-2 justify-end border-t border-[#54433c]/40">
                <button
                  type="button"
                  onClick={() => setIsAdjustModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-[13px] text-[#dac1b8] hover:bg-[#2b2827]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-[13px] font-bold bg-[#823b19] hover:bg-[#9a471f] text-[#ffdbcd]"
                >
                  Confirmar Ajuste
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Nuevo Insumo */}
      {isAddInsumoModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1f1e1d] border border-[#54433c] rounded-2xl w-full max-w-md p-5 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#54433c]/50">
              <h3 className="text-[17px] font-bold text-[#ffb597] flex items-center gap-2">
                <span className="material-symbols-outlined">add_box</span>
                Registrar Nuevo Insumo de Cocina
              </h3>
              <button
                onClick={() => setIsAddInsumoModalOpen(false)}
                className="text-[#dac1b8] hover:text-white p-1"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleSaveNewInsumo} className="space-y-3.5 mt-4">
              <div>
                <label className="block text-[12px] font-bold text-[#dac1b8] mb-1">
                  Nombre del Insumo
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Lomo de Cerdo, Cebolla Blanca, etc."
                  value={newInsName}
                  onChange={(e) => setNewInsName(e.target.value)}
                  className="w-full bg-[#151414] border border-[#54433c]/60 rounded-xl px-3 py-2 text-[13px] text-white focus:outline-none focus:border-[#ffb597]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[12px] font-bold text-[#dac1b8] mb-1">
                    Categoría
                  </label>
                  <select
                    value={newInsCategory}
                    onChange={(e) => setNewInsCategory(e.target.value as any)}
                    className="w-full bg-[#151414] border border-[#54433c]/60 rounded-xl px-3 py-2 text-[13px] text-white focus:outline-none focus:border-[#ffb597]"
                  >
                    <option value="Carnes & Aves">Carnes &amp; Aves</option>
                    <option value="Pescados & Mariscos">Pescados &amp; Mariscos</option>
                    <option value="Verduras & Frutas">Verduras &amp; Frutas</option>
                    <option value="Abarrotes & Especias">Abarrotes &amp; Especias</option>
                    <option value="Bebidas & Licores">Bebidas &amp; Licores</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[12px] font-bold text-[#dac1b8] mb-1">
                    Unidad de Medida
                  </label>
                  <select
                    value={newInsUnit}
                    onChange={(e) => setNewInsUnit(e.target.value as any)}
                    className="w-full bg-[#151414] border border-[#54433c]/60 rounded-xl px-3 py-2 text-[13px] text-white focus:outline-none focus:border-[#ffb597]"
                  >
                    <option value="kg">Kilogramos (kg)</option>
                    <option value="g">Gramos (g)</option>
                    <option value="L">Litros (L)</option>
                    <option value="ml">Mililitros (ml)</option>
                    <option value="un">Unidades (un)</option>
                    <option value="bot">Botellas (bot)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[12px] font-bold text-[#dac1b8] mb-1">
                    Stock Inicial
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0"
                    value={newInsStock}
                    onChange={(e) => setNewInsStock(e.target.value)}
                    className="w-full bg-[#151414] border border-[#54433c]/60 rounded-xl px-3 py-2 text-[13px] text-white focus:outline-none focus:border-[#ffb597]"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-bold text-[#dac1b8] mb-1">
                    Stock Mínimo
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="5"
                    value={newInsMinStock}
                    onChange={(e) => setNewInsMinStock(e.target.value)}
                    className="w-full bg-[#151414] border border-[#54433c]/60 rounded-xl px-3 py-2 text-[13px] text-white focus:outline-none focus:border-[#ffb597]"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-bold text-[#dac1b8] mb-1">
                    Costo Unit. (S/)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    placeholder="25.00"
                    value={newInsCost}
                    onChange={(e) => setNewInsCost(e.target.value)}
                    className="w-full bg-[#151414] border border-[#54433c]/60 rounded-xl px-3 py-2 text-[13px] text-white focus:outline-none focus:border-[#ffb597]"
                  />
                </div>
              </div>

              <div className="pt-3 flex gap-2 justify-end border-t border-[#54433c]/40">
                <button
                  type="button"
                  onClick={() => setIsAddInsumoModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-[13px] text-[#dac1b8] hover:bg-[#2b2827]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-[13px] font-bold bg-[#823b19] hover:bg-[#9a471f] text-[#ffdbcd]"
                >
                  Guardar Insumo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
