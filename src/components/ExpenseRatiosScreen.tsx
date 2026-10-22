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
      badgeBg: 'bg-surface-success-strong border-edge-success-7 text-ink-success-2',
      lightBg: 'bg-surface-success-strong-10 border-edge-success-2',
      headline: 'Los gastos están bajo control y alineados con el volumen de ventas.',
      icon: 'verified',
    },
    alerta: {
      color: 'amber',
      label: 'Zona de Alerta (Margen Ajustado)',
      badgeBg: 'bg-surface-warning-strong border-edge-warning-11 text-ink-warning-2',
      lightBg: 'bg-surface-warning-strong-13 border-edge-warning-4',
      headline: 'Atención: Las compras de insumos se acercan al límite recomendado de rentabilidad.',
      icon: 'warning',
    },
    critico: {
      color: 'rose',
      label: '¡Alerta! Se está pasando de gastos',
      badgeBg: 'bg-surface-danger-strong-8 border-edge-danger-11 text-ink-danger-2 animate-pulse',
      lightBg: 'bg-surface-danger-strong-9 border-edge-danger-6',
      headline: '¡Sobrecosto Detectado! El ritmo de compras y egresos supera el margen seguro de ventas.',
      icon: 'crisis_alert',
    },
  }[currentAnalysis.status];

  return (
    <div className="flex-1 flex flex-col h-full bg-panel-20 text-ink-body overflow-y-auto p-4 md:p-6 custom-scrollbar">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-edge-outline-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-ink-brand text-[28px]">
              monitoring
            </span>
            <h2 className="text-[22px] font-black text-ink-brand tracking-tight">
              Control de Gastos &amp; Ratios Financieros
            </h2>
            <span className="text-[12px] font-bold px-2.5 py-0.5 rounded-full bg-surface-tinted text-ink-gold border border-edge-gold-5">
              {activeCompany.tradeName}
            </span>
          </div>
          <p className="text-[13px] text-ink-muted-5 mt-0.5">
            Monitoreo en tiempo real: ¿El negocio se está pasando de gastos en relación a las ventas del POS?
          </p>
        </div>

        {/* Quick Company Switcher for analysis */}
        <div className="flex items-center bg-panel p-1 rounded-xl border border-edge-outline-2 shrink-0">
          <button
            onClick={() => setActiveCompanyId('el-tayta')}
            className={`text-[12px] font-bold px-3 py-1.5 rounded-lg transition-all ${
              activeCompanyId === 'el-tayta'
                ? 'bg-surface-brand-solid text-ink-on-brand shadow-md'
                : 'text-ink-muted-3 hover:text-ink-strong'
            }`}
          >
            El Tayta
          </button>
          <button
            onClick={() => setActiveCompanyId('el-sabroso')}
            className={`text-[12px] font-bold px-3 py-1.5 rounded-lg transition-all ${
              activeCompanyId === 'el-sabroso'
                ? 'bg-surface-gold-2 text-ink-foreground shadow-md'
                : 'text-ink-muted-3 hover:text-ink-strong'
            }`}
          >
            El Sabroso
          </button>
          <button
            onClick={() => setActiveCompanyId('todas')}
            className={`text-[12px] font-bold px-3 py-1.5 rounded-lg transition-all ${
              activeCompanyId === 'todas'
                ? 'bg-panel-53 text-ink-strong shadow-md'
                : 'text-ink-muted-3 hover:text-ink-strong'
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
                  <span className="text-[12px] text-ink-muted-3">
                    Diagnóstico Automático en Base a Ventas y Kardex
                  </span>
                </div>
                <h3 className="text-[20px] md:text-[22px] font-black text-ink-strong mt-1 leading-tight">
                  {statusConfig.headline}
                </h3>
                <p className="text-[13px] text-ink-muted-2 mt-1 max-w-2xl leading-relaxed">
                  {currentAnalysis.message}
                </p>
              </div>
            </div>

            {/* The Food Cost Gauge */}
            <div className="bg-panel-44 border border-edge-outline-2 rounded-2xl p-4 shrink-0 text-center min-w-[160px]">
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted-3">
                Food Cost Real
              </p>
              <p
                className={`text-[36px] font-black tracking-tight leading-none mt-1 ${
                  currentAnalysis.status === 'critico'
                    ? 'text-ink-danger-3'
                    : currentAnalysis.status === 'alerta'
                    ? 'text-ink-warning-3'
                    : 'text-ink-success'
                }`}
              >
                {currentAnalysis.foodCostPctReal}%
              </p>
              <p className="text-[11px] text-ink-muted mt-1">
                Meta recomendada: <strong>&lt; 32.0%</strong>
              </p>
            </div>
          </div>

          {/* Visual Expense Semaphore Bar */}
          <div className="mt-5 pt-4 border-t border-edge-outline-5">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-ink-muted-3 mb-1.5">
              <span>Semáforo de Gastos</span>
              <span className="text-ink-strong">
                Posición Actual: <strong>{currentAnalysis.foodCostPctReal}%</strong>
              </span>
            </div>

            <div className="w-full h-3.5 bg-panel-18 rounded-full overflow-hidden flex relative border border-edge-outline-3">
              <div className="w-[32%] bg-surface-success-4 h-full" title="Zona Óptima: 0% - 32%" />
              <div className="w-[10%] bg-surface-warning-5 h-full" title="Zona Alerta: 32% - 38%" />
              <div className="w-[58%] bg-surface-danger-7 h-full" title="Zona Crítica: > 38%" />

              {/* Indicator Pin */}
              <div
                className="absolute top-0 bottom-0 w-1.5 bg-surface-thumb ratio-marker shadow-[0_0_8px_white] z-10"
                style={{
                  left: `${Math.min(98, Math.max(2, (currentAnalysis.foodCostPctReal / 50) * 100))}%`,
                }}
              />
            </div>

            <div className="flex justify-between text-[10px] text-ink-muted mt-1 font-mono">
              <span>0% (Óptimo)</span>
              <span>32% (Límite sano)</span>
              <span>38% (Alerta de riesgo)</span>
              <span>50%+ (Sobrecosto severo)</span>
            </div>
          </div>
        </div>

        {/* 4 Core Financial Ratio Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-panel-44 p-4 rounded-2xl border border-edge-outline-3 shadow-md">
            <div className="flex items-center justify-between text-ink-muted-3 text-[12px] font-bold uppercase">
              <span>Ventas Netas Totales</span>
              <span className="material-symbols-outlined text-ink-brand text-[18px]">
                point_of_sale
              </span>
            </div>
            <p className="text-[26px] font-black text-ink-strong mt-1">
              S/ {currentAnalysis.totalSales.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-[11px] text-ink-success mt-1 flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">trending_up</span>
              Ingresos facturados por el POS
            </p>
          </div>

          <div className="bg-panel-44 p-4 rounded-2xl border border-edge-outline-3 shadow-md">
            <div className="flex items-center justify-between text-ink-muted-3 text-[12px] font-bold uppercase">
              <span>Compras de Insumos</span>
              <span className="material-symbols-outlined text-ink-gold text-[18px]">
                receipt_long
              </span>
            </div>
            <p className="text-[26px] font-black text-ink-gold mt-1">
              S/ {currentAnalysis.totalPurchases.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-[11px] text-ink-muted-3 mt-1">
              Facturas de proveedores registradas
            </p>
          </div>

          <div className="bg-panel-44 p-4 rounded-2xl border border-edge-outline-3 shadow-md">
            <div className="flex items-center justify-between text-ink-muted-3 text-[12px] font-bold uppercase">
              <span>Food Cost Teórico (BOM)</span>
              <span className="material-symbols-outlined text-ink-info text-[18px]">
                menu_book
              </span>
            </div>
            <p className="text-[26px] font-black text-ink-info mt-1">
              {currentAnalysis.foodCostPctTheoretical}%
            </p>
            <p className="text-[11px] text-ink-muted-3 mt-1">
              Costo según Fichas Técnicas vendidas
            </p>
          </div>

          <div className="bg-panel-44 p-4 rounded-2xl border border-edge-outline-3 shadow-md">
            <div className="flex items-center justify-between text-ink-muted-3 text-[12px] font-bold uppercase">
              <span>Desvío / Merma Estimada</span>
              <span className="material-symbols-outlined text-ink-danger-3 text-[18px]">
                difference
              </span>
            </div>
            <p
              className={`text-[26px] font-black mt-1 ${
                currentAnalysis.variancePct > 5 ? 'text-ink-danger-3' : 'text-ink-success'
              }`}
            >
              {currentAnalysis.variancePct > 0 ? `+${currentAnalysis.variancePct}%` : `${currentAnalysis.variancePct}%`}
            </p>
            <p className="text-[11px] text-ink-muted-3 mt-1">
              Diferencia entre gasto real y receta
            </p>
          </div>
        </div>

        {/* Actionable Recommendations & Diagnostic Findings */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Actionable Suggestions */}
          <div className="bg-panel-44 rounded-2xl border border-edge-outline-3 p-5 shadow-md">
            <div className="flex items-center gap-2 mb-3 pb-2.5 border-b border-edge-outline-5">
              <span className="material-symbols-outlined text-ink-brand">checklist</span>
              <h4 className="text-[16px] font-bold text-ink-strong">
                Recomendaciones para el Administrador
              </h4>
            </div>

            <div className="space-y-2.5">
              {currentAnalysis.recommendations.map((rec, idx) => (
                <div
                  key={idx}
                  className="bg-panel-9 p-3 rounded-xl border border-edge-outline-5 flex items-start gap-2.5 text-[13px]"
                >
                  <span className="w-5 h-5 rounded-full bg-surface-brand-solid text-ink-on-brand flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">
                    {idx + 1}
                  </span>
                  <p className="text-ink-body leading-snug">{rec}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Cross-Company Benchmark Table (Tayta vs Sabroso) */}
          <div className="bg-panel-44 rounded-2xl border border-edge-outline-3 p-5 shadow-md">
            <div className="flex items-center gap-2 mb-3 pb-2.5 border-b border-edge-outline-5">
              <span className="material-symbols-outlined text-ink-gold">compare_arrows</span>
              <h4 className="text-[16px] font-bold text-ink-strong">
                Comparativa: El Tayta vs El Sabroso
              </h4>
            </div>

            <div className="space-y-3">
              {/* Tayta */}
              <div className="bg-panel-9 p-3 rounded-xl border border-edge-outline-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-surface-brand" />
                    <span className="font-bold text-ink-strong text-[13px]">El Tayta (Criollo &amp; Marino)</span>
                  </div>
                  <span
                    className={`text-[12px] font-black px-2 py-0.5 rounded-md ${
                      taytaAnalysis.status === 'critico'
                        ? 'bg-surface-danger-strong-7 text-ink-danger-2'
                        : taytaAnalysis.status === 'alerta'
                        ? 'bg-surface-warning-strong-4 text-ink-warning-2'
                        : 'bg-surface-success-strong-4 text-ink-success-2'
                    }`}
                  >
                    Food Cost: {taytaAnalysis.foodCostPctReal}%
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-edge-outline-8 text-[11px] text-ink-muted-2">
                  <div>Ventas: <strong className="text-ink-strong">S/ {taytaAnalysis.totalSales.toFixed(2)}</strong></div>
                  <div>Compras: <strong className="text-ink-gold">S/ {taytaAnalysis.totalPurchases.toFixed(2)}</strong></div>
                  <div>Estado: <strong className="text-ink-success capitalize">{taytaAnalysis.status}</strong></div>
                </div>
              </div>

              {/* Sabroso */}
              <div className="bg-panel-9 p-3 rounded-xl border border-edge-outline-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-surface-gold-2" />
                    <span className="font-bold text-ink-strong text-[13px]">El Sabroso (Brasas &amp; Grill)</span>
                  </div>
                  <span
                    className={`text-[12px] font-black px-2 py-0.5 rounded-md ${
                      sabrosoAnalysis.status === 'critico'
                        ? 'bg-surface-danger-strong-7 text-ink-danger-2'
                        : sabrosoAnalysis.status === 'alerta'
                        ? 'bg-surface-warning-strong-4 text-ink-warning-2'
                        : 'bg-surface-success-strong-4 text-ink-success-2'
                    }`}
                  >
                    Food Cost: {sabrosoAnalysis.foodCostPctReal}%
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-edge-outline-8 text-[11px] text-ink-muted-2">
                  <div>Ventas: <strong className="text-ink-strong">S/ {sabrosoAnalysis.totalSales.toFixed(2)}</strong></div>
                  <div>Compras: <strong className="text-ink-gold">S/ {sabrosoAnalysis.totalPurchases.toFixed(2)}</strong></div>
                  <div>Estado: <strong className="text-ink-success capitalize">{sabrosoAnalysis.status}</strong></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Interactive Savings & Margin Simulator */}
        <div className="bg-gradient-to-br from-panel-54 to-panel-55 rounded-2xl border border-edge-brand-3 p-5 md:p-6 shadow-xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-edge-outline-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-ink-brand">calculate</span>
                <h4 className="text-[17px] font-black text-ink-strong">
                  Simulador de Impacto en Rentabilidad
                </h4>
              </div>
              <p className="text-[12px] text-ink-muted-5 mt-0.5">
                Proyecta cuánto dinero adicional gana el cliente reduciendo mermas o negociando compras con proveedores.
              </p>
            </div>

            <div className="bg-panel-56 px-4 py-2 rounded-xl border border-edge-outline-2 text-right">
              <span className="text-[11px] text-ink-muted-3 uppercase font-bold">Ahorro Mensual Estimado:</span>
              <p className="text-[20px] font-black text-ink-success font-mono">
                + S/ {potentialMonthlySavings.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between text-[13px]">
              <span className="font-bold text-ink-strong">
                Meta de Reducción de Gastos en Insumos:
              </span>
              <span className="font-mono font-black text-ink-brand text-[16px]">
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
              className="w-full accent-accent-brand cursor-pointer"
            />

            <div className="flex justify-between text-[11px] text-ink-muted font-mono">
              <span>1.0% (Ajuste leve en porciones)</span>
              <span>4.0% (Estandarización de recetas y merma)</span>
              <span>8.0% (Reestructuración total de compras)</span>
            </div>

            <div className="bg-panel-44 p-3 rounded-xl border border-edge-outline-5 text-[12px] text-ink-muted-6 mt-2">
              💡 <strong>Conclusión para el cliente:</strong> Si ajusta las porciones en cocina según la Ficha Técnica oficial y reduce en un <strong>{savingTargetPct}%</strong> el sobrecosto de insumos, obtendrá aproximadamente <strong>S/ {potentialMonthlySavings.toLocaleString('es-PE')}</strong> de ganancia neta líquida directa a su bolsillo cada mes.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
