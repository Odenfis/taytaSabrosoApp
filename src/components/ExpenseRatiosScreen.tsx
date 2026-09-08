import React, { useState, useMemo } from 'react';
import { usePOS } from '../context/POSContext';
import { CompanyId } from '../types';

export const ExpenseRatiosScreen: React.FC = () => {
  const {
    activeCompanyId,
    setActiveCompanyId,
    activeCompany,
    getCompanyAnalysis,
    expenseAnalysis,
    transactions,
    purchases,
  } = usePOS();

  const [savingTargetPct, setSavingTargetPct] = useState(3.0); // Slider for simulation

  // Analyses for each entity
  const taytaAnalysis = useMemo(() => getCompanyAnalysis('el-tayta'), [transactions, purchases]);
  const sabrosoAnalysis = useMemo(() => getCompanyAnalysis('el-sabroso'), [transactions, purchases]);
  const consolidatedAnalysis = useMemo(() => getCompanyAnalysis('todas'), [transactions, purchases]);

  const currentAnalysis =
    activeCompanyId === 'todas'
      ? consolidatedAnalysis
      : activeCompanyId === 'el-tayta'
      ? taytaAnalysis
      : sabrosoAnalysis;

  // Monthly projection based on today's sales
  const projectedMonthlySales = currentAnalysis.totalSales * 30;
  const potentialMonthlySavings = +(
    projectedMonthlySales *
    (savingTargetPct / 100)
  ).toFixed(2);

  // Status colors & texts
  const statusConfig = {
    optimo: {
      color: 'emerald',
      label: 'Control Óptimo de Gastos',
      badgeBg: 'bg-emerald-950/80 border-emerald-500/60 text-emerald-300',
      lightBg: 'bg-emerald-900/10 border-emerald-500/30',
      headline: 'Los gastos están bajo control y alineados con el volumen de ventas.',
      icon: 'verified',
    },
    alerta: {
      color: 'amber',
      label: 'Zona de Alerta (Margen Ajustado)',
      badgeBg: 'bg-amber-950/80 border-amber-500/60 text-amber-300',
      lightBg: 'bg-amber-900/10 border-amber-500/30',
      headline: 'Atención: Las compras de insumos se acercan al límite recomendado de rentabilidad.',
      icon: 'warning',
    },
    critico: {
      color: 'rose',
      label: '¡Alerta! Se está pasando de gastos',
      badgeBg: 'bg-rose-950/90 border-rose-500/60 text-rose-300 animate-pulse',
      lightBg: 'bg-rose-900/20 border-rose-500/40',
      headline: '¡Sobrecosto Detectado! El ritmo de compras y egresos supera el margen seguro de ventas.',
      icon: 'crisis_alert',
    },
  }[currentAnalysis.status];

  return (
    <div className="flex-1 flex flex-col h-full bg-[#101010] text-[#e5e2e1] overflow-y-auto p-4 md:p-6 custom-scrollbar">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#54433c]/60">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#ffb597] text-[28px]">
              monitoring
            </span>
            <h2 className="text-[22px] font-black text-[#ffb597] tracking-tight">
              Control de Gastos &amp; Ratios Financieros
            </h2>
            <span className="text-[12px] font-bold px-2.5 py-0.5 rounded-full bg-[#352800] text-[#ebc246] border border-[#ebc246]/40">
              {activeCompany.tradeName}
            </span>
          </div>
          <p className="text-[13px] text-[#dac1b8]/80 mt-0.5">
            Monitoreo en tiempo real: ¿El negocio se está pasando de gastos en relación a las ventas del POS?
          </p>
        </div>

        {/* Quick Company Switcher for analysis */}
        <div className="flex items-center bg-[#1c1b1b] p-1 rounded-xl border border-[#54433c]/60 shrink-0">
          <button
            onClick={() => setActiveCompanyId('el-tayta')}
            className={`text-[12px] font-bold px-3 py-1.5 rounded-lg transition-all ${
              activeCompanyId === 'el-tayta'
                ? 'bg-[#823b19] text-[#ffdbcd] shadow-md'
                : 'text-[#dac1b8]/70 hover:text-white'
            }`}
          >
            El Tayta
          </button>
          <button
            onClick={() => setActiveCompanyId('el-sabroso')}
            className={`text-[12px] font-bold px-3 py-1.5 rounded-lg transition-all ${
              activeCompanyId === 'el-sabroso'
                ? 'bg-[#ebc246] text-[#352800] shadow-md'
                : 'text-[#dac1b8]/70 hover:text-white'
            }`}
          >
            El Sabroso
          </button>
          <button
            onClick={() => setActiveCompanyId('todas')}
            className={`text-[12px] font-bold px-3 py-1.5 rounded-lg transition-all ${
              activeCompanyId === 'todas'
                ? 'bg-[#3e3b3a] text-white shadow-md'
                : 'text-[#dac1b8]/70 hover:text-white'
            }`}
          >
            Consolidado
          </button>
        </div>
      </div>

      <div className="space-y-6 mt-6">
        {/* BIG STATUS HERO: Direct Answer to "¿Se está pasando de gastos?" */}
        <div
          className={`rounded-2xl border p-5 md:p-6 shadow-xl relative overflow-hidden transition-all ${statusConfig.lightBg}`}
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div
                className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border ${statusConfig.badgeBg}`}
              >
                <span className="material-symbols-outlined text-[32px]">
                  {statusConfig.icon}
                </span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-black px-2.5 py-0.5 rounded-full border uppercase ${statusConfig.badgeBg}`}>
                    {statusConfig.label}
                  </span>
                  <span className="text-[12px] text-[#dac1b8]/70">
                    Diagnóstico Automático en Base a Ventas y Kardex
                  </span>
                </div>
                <h3 className="text-[20px] md:text-[22px] font-black text-white mt-1 leading-tight">
                  {statusConfig.headline}
                </h3>
                <p className="text-[13px] text-[#dac1b8] mt-1 max-w-2xl leading-relaxed">
                  {currentAnalysis.message}
                </p>
              </div>
            </div>

            {/* The Food Cost Gauge */}
            <div className="bg-[#181716] border border-[#54433c]/60 rounded-2xl p-4 shrink-0 text-center min-w-[160px]">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#dac1b8]/70">
                Food Cost Real
              </p>
              <p
                className={`text-[36px] font-black tracking-tight leading-none mt-1 ${
                  currentAnalysis.status === 'critico'
                    ? 'text-rose-400'
                    : currentAnalysis.status === 'alerta'
                    ? 'text-amber-400'
                    : 'text-emerald-400'
                }`}
              >
                {currentAnalysis.foodCostPctReal}%
              </p>
              <p className="text-[11px] text-[#dac1b8]/60 mt-1">
                Meta recomendada: <strong>&lt; 32.0%</strong>
              </p>
            </div>
          </div>

          {/* Visual Expense Semaphore Bar */}
          <div className="mt-5 pt-4 border-t border-[#54433c]/40">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[#dac1b8]/70 mb-1.5">
              <span>Semáforo de Gastos</span>
              <span className="text-white">
                Posición Actual: <strong>{currentAnalysis.foodCostPctReal}%</strong>
              </span>
            </div>

            <div className="w-full h-3.5 bg-[#252322] rounded-full overflow-hidden flex relative border border-[#54433c]/50">
              <div className="w-[32%] bg-emerald-500/80 h-full" title="Zona Óptima: 0% - 32%" />
              <div className="w-[10%] bg-amber-400/80 h-full" title="Zona Alerta: 32% - 38%" />
              <div className="w-[58%] bg-rose-500/80 h-full" title="Zona Crítica: > 38%" />

              {/* Indicator Pin */}
              <div
                className="absolute top-0 bottom-0 w-1.5 bg-white shadow-[0_0_8px_white] z-10"
                style={{
                  left: `${Math.min(98, Math.max(2, (currentAnalysis.foodCostPctReal / 50) * 100))}%`,
                }}
              />
            </div>

            <div className="flex justify-between text-[10px] text-[#dac1b8]/60 mt-1 font-mono">
              <span>0% (Óptimo)</span>
              <span>32% (Límite sano)</span>
              <span>38% (Alerta de riesgo)</span>
              <span>50%+ (Sobrecosto severo)</span>
            </div>
          </div>
        </div>

        {/* 4 Core Financial Ratio Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#181716] p-4 rounded-2xl border border-[#54433c]/50 shadow-md">
            <div className="flex items-center justify-between text-[#dac1b8]/70 text-[12px] font-bold uppercase">
              <span>Ventas Netas Totales</span>
              <span className="material-symbols-outlined text-[#ffb597] text-[18px]">
                point_of_sale
              </span>
            </div>
            <p className="text-[26px] font-black text-white mt-1">
              S/ {currentAnalysis.totalSales.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">trending_up</span>
              Ingresos facturados por el POS
            </p>
          </div>

          <div className="bg-[#181716] p-4 rounded-2xl border border-[#54433c]/50 shadow-md">
            <div className="flex items-center justify-between text-[#dac1b8]/70 text-[12px] font-bold uppercase">
              <span>Compras de Insumos</span>
              <span className="material-symbols-outlined text-[#ebc246] text-[18px]">
                receipt_long
              </span>
            </div>
            <p className="text-[26px] font-black text-[#ebc246] mt-1">
              S/ {currentAnalysis.totalPurchases.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-[11px] text-[#dac1b8]/70 mt-1">
              Facturas de proveedores registradas
            </p>
          </div>

          <div className="bg-[#181716] p-4 rounded-2xl border border-[#54433c]/50 shadow-md">
            <div className="flex items-center justify-between text-[#dac1b8]/70 text-[12px] font-bold uppercase">
              <span>Food Cost Teórico (BOM)</span>
              <span className="material-symbols-outlined text-[#60d4fb] text-[18px]">
                menu_book
              </span>
            </div>
            <p className="text-[26px] font-black text-[#60d4fb] mt-1">
              {currentAnalysis.foodCostPctTheoretical}%
            </p>
            <p className="text-[11px] text-[#dac1b8]/70 mt-1">
              Costo según Fichas Técnicas vendidas
            </p>
          </div>

          <div className="bg-[#181716] p-4 rounded-2xl border border-[#54433c]/50 shadow-md">
            <div className="flex items-center justify-between text-[#dac1b8]/70 text-[12px] font-bold uppercase">
              <span>Desvío / Merma Estimada</span>
              <span className="material-symbols-outlined text-rose-400 text-[18px]">
                difference
              </span>
            </div>
            <p
              className={`text-[26px] font-black mt-1 ${
                currentAnalysis.variancePct > 5 ? 'text-rose-400' : 'text-emerald-400'
              }`}
            >
              {currentAnalysis.variancePct > 0 ? `+${currentAnalysis.variancePct}%` : `${currentAnalysis.variancePct}%`}
            </p>
            <p className="text-[11px] text-[#dac1b8]/70 mt-1">
              Diferencia entre gasto real y receta
            </p>
          </div>
        </div>

        {/* Actionable Recommendations & Diagnostic Findings */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Actionable Suggestions */}
          <div className="bg-[#181716] rounded-2xl border border-[#54433c]/50 p-5 shadow-md">
            <div className="flex items-center gap-2 mb-3 pb-2.5 border-b border-[#54433c]/40">
              <span className="material-symbols-outlined text-[#ffb597]">checklist</span>
              <h4 className="text-[16px] font-bold text-white">
                Recomendaciones para el Administrador
              </h4>
            </div>

            <div className="space-y-2.5">
              {currentAnalysis.recommendations.map((rec, idx) => (
                <div
                  key={idx}
                  className="bg-[#201f1e] p-3 rounded-xl border border-[#54433c]/40 flex items-start gap-2.5 text-[13px]"
                >
                  <span className="w-5 h-5 rounded-full bg-[#823b19] text-[#ffdbcd] flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">
                    {idx + 1}
                  </span>
                  <p className="text-[#e5e2e1] leading-snug">{rec}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Cross-Company Benchmark Table (Tayta vs Sabroso) */}
          <div className="bg-[#181716] rounded-2xl border border-[#54433c]/50 p-5 shadow-md">
            <div className="flex items-center gap-2 mb-3 pb-2.5 border-b border-[#54433c]/40">
              <span className="material-symbols-outlined text-[#ebc246]">compare_arrows</span>
              <h4 className="text-[16px] font-bold text-white">
                Comparativa: El Tayta vs El Sabroso
              </h4>
            </div>

            <div className="space-y-3">
              {/* Tayta */}
              <div className="bg-[#201f1e] p-3 rounded-xl border border-[#54433c]/40">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#ffb597]" />
                    <span className="font-bold text-white text-[13px]">El Tayta (Criollo &amp; Marino)</span>
                  </div>
                  <span
                    className={`text-[12px] font-black px-2 py-0.5 rounded-md ${
                      taytaAnalysis.status === 'critico'
                        ? 'bg-rose-950 text-rose-300'
                        : taytaAnalysis.status === 'alerta'
                        ? 'bg-amber-950 text-amber-300'
                        : 'bg-emerald-950 text-emerald-300'
                    }`}
                  >
                    Food Cost: {taytaAnalysis.foodCostPctReal}%
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-[#54433c]/30 text-[11px] text-[#dac1b8]">
                  <div>Ventas: <strong className="text-white">S/ {taytaAnalysis.totalSales.toFixed(2)}</strong></div>
                  <div>Compras: <strong className="text-[#ebc246]">S/ {taytaAnalysis.totalPurchases.toFixed(2)}</strong></div>
                  <div>Estado: <strong className="text-emerald-400 capitalize">{taytaAnalysis.status}</strong></div>
                </div>
              </div>

              {/* Sabroso */}
              <div className="bg-[#201f1e] p-3 rounded-xl border border-[#54433c]/40">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#ebc246]" />
                    <span className="font-bold text-white text-[13px]">El Sabroso (Brasas &amp; Grill)</span>
                  </div>
                  <span
                    className={`text-[12px] font-black px-2 py-0.5 rounded-md ${
                      sabrosoAnalysis.status === 'critico'
                        ? 'bg-rose-950 text-rose-300'
                        : sabrosoAnalysis.status === 'alerta'
                        ? 'bg-amber-950 text-amber-300'
                        : 'bg-emerald-950 text-emerald-300'
                    }`}
                  >
                    Food Cost: {sabrosoAnalysis.foodCostPctReal}%
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-[#54433c]/30 text-[11px] text-[#dac1b8]">
                  <div>Ventas: <strong className="text-white">S/ {sabrosoAnalysis.totalSales.toFixed(2)}</strong></div>
                  <div>Compras: <strong className="text-[#ebc246]">S/ {sabrosoAnalysis.totalPurchases.toFixed(2)}</strong></div>
                  <div>Estado: <strong className="text-emerald-400 capitalize">{sabrosoAnalysis.status}</strong></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Interactive Savings & Margin Simulator */}
        <div className="bg-gradient-to-br from-[#201c1a] to-[#151413] rounded-2xl border border-[#ffb597]/40 p-5 md:p-6 shadow-xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#54433c]/50">
            <div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#ffb597]">calculate</span>
                <h4 className="text-[17px] font-black text-white">
                  Simulador de Impacto en Rentabilidad
                </h4>
              </div>
              <p className="text-[12px] text-[#dac1b8]/80 mt-0.5">
                Proyecta cuánto dinero adicional gana el cliente reduciendo mermas o negociando compras con proveedores.
              </p>
            </div>

            <div className="bg-[#292625] px-4 py-2 rounded-xl border border-[#54433c]/60 text-right">
              <span className="text-[11px] text-[#dac1b8]/70 uppercase font-bold">Ahorro Mensual Estimado:</span>
              <p className="text-[20px] font-black text-emerald-400 font-mono">
                + S/ {potentialMonthlySavings.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between text-[13px]">
              <span className="font-bold text-white">
                Meta de Reducción de Gastos en Insumos:
              </span>
              <span className="font-mono font-black text-[#ffb597] text-[16px]">
                {savingTargetPct.toFixed(1)}% de las ventas
              </span>
            </div>

            <input
              type="range"
              min="1.0"
              max="8.0"
              step="0.5"
              value={savingTargetPct}
              onChange={(e) => setSavingTargetPct(parseFloat(e.target.value))}
              className="w-full accent-[#ffb597] cursor-pointer"
            />

            <div className="flex justify-between text-[11px] text-[#dac1b8]/60 font-mono">
              <span>1.0% (Ajuste leve en porciones)</span>
              <span>4.0% (Estandarización de recetas y merma)</span>
              <span>8.0% (Reestructuración total de compras)</span>
            </div>

            <div className="bg-[#181716] p-3 rounded-xl border border-[#54433c]/40 text-[12px] text-[#dac1b8]/90 mt-2">
              💡 <strong>Conclusión para el cliente:</strong> Si ajusta las porciones en cocina según la Ficha Técnica oficial y reduce en un <strong>{savingTargetPct}%</strong> el sobrecosto de insumos, obtendrá aproximadamente <strong>S/ {potentialMonthlySavings.toLocaleString('es-PE')}</strong> de ganancia neta líquida directa a su bolsillo cada mes.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
