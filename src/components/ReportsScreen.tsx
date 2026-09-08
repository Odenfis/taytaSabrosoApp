import React, { useMemo } from 'react';
import { usePOS } from '../context/POSContext';

export const ReportsScreen: React.FC = () => {
  const { transactions, orders, tables, totalIngresos, totalEgresos, saldoActual, activeShift } = usePOS();

  // Calculate payment method distribution
  const paymentBreakdown = useMemo(() => {
    let cash = 0;
    let card = 0;
    let yape = 0;

    transactions.forEach((tx) => {
      if (tx.isIncome) {
        if (tx.paymentMethod === 'Tarjeta') card += tx.amount;
        else if (tx.paymentMethod === 'Yape / Plin') yape += tx.amount;
        else cash += tx.amount;
      }
    });

    const total = cash + card + yape || 1;
    return {
      cash: { amount: cash, pct: Math.round((cash / total) * 100) },
      card: { amount: card, pct: Math.round((card / total) * 100) },
      yape: { amount: yape, pct: Math.round((yape / total) * 100) },
      total,
    };
  }, [transactions]);

  // Dish sales aggregate
  const topDishes = [
    { name: 'Lomo Saltado Clásico', count: 28, revenue: 1260.0, share: 85 },
    { name: 'Ceviche Mixto', count: 24, revenue: 1008.0, share: 72 },
    { name: 'Pisco Sour Clásico', count: 32, revenue: 800.0, share: 68 },
    { name: 'Ají de Gallina', count: 18, revenue: 684.0, share: 55 },
    { name: 'Arroz con Mariscos', count: 14, revenue: 672.0, share: 44 },
  ];

  const handlePrintZClosure = () => {
    window.print();
  };

  return (
    <main
      id="reports-screen"
      className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col gap-6 bg-[#121212] select-none"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-[20px] md:text-[24px] font-bold text-[#ffb597] tracking-tight">
            Reportes & Cierre de Caja
          </h2>
          <p className="text-[13px] text-[#dac1b8]/80">
            Resumen estadístico de ventas, ocupación y formas de pago ({activeShift}).
          </p>
        </div>

        <button
          onClick={handlePrintZClosure}
          className="bg-[#ebc246] hover:bg-[#ffe08b] text-[#3d2f00] px-4 py-2.5 rounded-xl font-bold text-[14px] flex items-center gap-2 transition-all shadow-md active:scale-95 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[20px]">print</span>
          <span>Imprimir Cierre Z</span>
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#1c1b1b] border border-[#54433c]/60 rounded-2xl p-4">
          <span className="text-[12px] font-semibold text-[#dac1b8]/80">Venta Bruta</span>
          <h3 className="text-[22px] font-black text-[#60d4fb] mt-1">S/ {totalIngresos.toFixed(2)}</h3>
          <span className="text-[11px] text-emerald-400 mt-1 block">+15.4% vs promedio</span>
        </div>

        <div className="bg-[#1c1b1b] border border-[#54433c]/60 rounded-2xl p-4">
          <span className="text-[12px] font-semibold text-[#dac1b8]/80">Ticket Promedio</span>
          <h3 className="text-[22px] font-black text-[#ebc246] mt-1">S/ 114.50</h3>
          <span className="text-[11px] text-[#dac1b8]/70 mt-1 block">37 comandas cobradas</span>
        </div>

        <div className="bg-[#1c1b1b] border border-[#54433c]/60 rounded-2xl p-4">
          <span className="text-[12px] font-semibold text-[#dac1b8]/80">Ocupación Mesas</span>
          <h3 className="text-[22px] font-black text-[#ffb597] mt-1">
            {Math.round((tables.filter((t) => t.status !== 'libre').length / tables.length) * 100)}%
          </h3>
          <span className="text-[11px] text-[#dac1b8]/70 mt-1 block">
            {tables.filter((t) => t.status !== 'libre').length} de {tables.length} mesas ocupadas
          </span>
        </div>

        <div className="bg-[#1c1b1b] border border-[#54433c]/60 rounded-2xl p-4">
          <span className="text-[12px] font-semibold text-[#dac1b8]/80">Balance Neto Turno</span>
          <h3 className="text-[22px] font-black text-white mt-1">S/ {saldoActual.toFixed(2)}</h3>
          <span className="text-[11px] text-[#dac1b8]/70 mt-1 block">
            Egresos: S/ {totalEgresos.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Charts & Breakdown Bento */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payment Methods Distribution */}
        <div className="bg-[#1c1b1b] border border-[#54433c]/60 rounded-2xl p-5 space-y-4">
          <h3 className="text-[16px] font-bold text-[#e5e2e1] flex items-center gap-2">
            <span className="material-symbols-outlined text-[#ebc246]">pie_chart</span>
            Distribución por Método de Pago
          </h3>

          <div className="space-y-3 pt-2">
            <div>
              <div className="flex justify-between text-[13px] font-semibold mb-1 text-[#e5e2e1]">
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#ebc246]"></span>
                  Efectivo en Caja
                </span>
                <span>S/ {paymentBreakdown.cash.amount.toFixed(2)} ({paymentBreakdown.cash.pct}%)</span>
              </div>
              <div className="w-full h-2.5 bg-[#2a2a2a] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#ebc246] rounded-full"
                  style={{ width: `${paymentBreakdown.cash.pct}%` }}
                ></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-[13px] font-semibold mb-1 text-[#e5e2e1]">
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#60d4fb]"></span>
                  Tarjetas Débito / Crédito
                </span>
                <span>S/ {paymentBreakdown.card.amount.toFixed(2)} ({paymentBreakdown.card.pct}%)</span>
              </div>
              <div className="w-full h-2.5 bg-[#2a2a2a] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#60d4fb] rounded-full"
                  style={{ width: `${paymentBreakdown.card.pct}%` }}
                ></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-[13px] font-semibold mb-1 text-[#e5e2e1]">
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#ffb597]"></span>
                  Billeteras Digitales (Yape / Plin)
                </span>
                <span>S/ {paymentBreakdown.yape.amount.toFixed(2)} ({paymentBreakdown.yape.pct}%)</span>
              </div>
              <div className="w-full h-2.5 bg-[#2a2a2a] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#ffb597] rounded-full"
                  style={{ width: `${paymentBreakdown.yape.pct}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        {/* Top Platos Más Vendidos */}
        <div className="bg-[#1c1b1b] border border-[#54433c]/60 rounded-2xl p-5 space-y-4">
          <h3 className="text-[16px] font-bold text-[#e5e2e1] flex items-center gap-2">
            <span className="material-symbols-outlined text-[#ffb597]">local_fire_department</span>
            Platos Más Vendidos del Turno
          </h3>

          <div className="space-y-3 pt-1">
            {topDishes.map((dish, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-[#54433c]/20">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-[#2a2a2a] text-[#dac1b8] text-[12px] font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <div>
                    <span className="text-[14px] font-semibold text-[#e5e2e1] block">{dish.name}</span>
                    <span className="text-[11px] text-[#dac1b8]/70">{dish.count} órdenes preparadas</span>
                  </div>
                </div>
                <span className="text-[14px] font-bold text-[#ebc246]">
                  S/ {dish.revenue.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
};
