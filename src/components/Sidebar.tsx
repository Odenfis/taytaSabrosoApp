import React from 'react';
import { usePOS } from '../context/POSContext';
import { ScreenType, CompanyId } from '../types';

interface SidebarProps {
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onCloseMobile }) => {
  const {
    currentScreen,
    setCurrentScreen,
    currentUser,
    logout,
    activeCompanyId,
    setActiveCompanyId,
    companies,
    expenseAnalysis,
    insumos,
    activeShift,
    setIsShiftModalOpen,
  } = usePOS();

  const lowStockCount = insumos.filter((i) => i.currentStock <= i.minStock).length;

  const navItems: { id: ScreenType; label: string; icon: string; badge?: string; badgeColor?: string }[] = [
    { id: 'mesas', label: 'Mesas & POS', icon: 'table_restaurant' },
    {
      id: 'kardex',
      label: 'Kardex & Stock',
      icon: 'inventory_2',
      badge: lowStockCount > 0 ? `${lowStockCount}` : undefined,
      badgeColor: 'bg-rose-500 text-white',
    },
    { id: 'compras', label: 'Compras & Facturas', icon: 'shopping_cart_checkout' },
    { id: 'recetas', label: 'Fichas & Recetas', icon: 'menu_book' },
    {
      id: 'ratios',
      label: 'Control de Gastos',
      icon: 'monitoring',
      badge:
        expenseAnalysis.status === 'critico'
          ? 'ALERTA'
          : expenseAnalysis.status === 'alerta'
          ? 'REV'
          : 'OK',
      badgeColor:
        expenseAnalysis.status === 'critico'
          ? 'bg-red-500 text-white animate-pulse'
          : expenseAnalysis.status === 'alerta'
          ? 'bg-amber-500 text-black'
          : 'bg-emerald-600 text-white',
    },
    { id: 'movimientos', label: 'Libro de Caja', icon: 'receipt_long' },
    { id: 'bancos', label: 'Cuentas & Bancos', icon: 'account_balance' },
    { id: 'reportes', label: 'Reportes & Métricas', icon: 'assessment' },
    { id: 'configuracion', label: 'Configuración', icon: 'settings' },
  ];

  const handleNavClick = (screen: ScreenType) => {
    setCurrentScreen(screen);
    if (onCloseMobile) onCloseMobile();
  };

  return (
    <aside
      id="pos-sidebar"
      className="fixed left-0 top-0 h-full w-24 md:w-64 flex flex-col bg-[#161515] border-r border-[#54433c]/60 z-50 transition-all select-none"
    >
      <div className="h-full flex flex-col pt-4 pb-3">
        {/* Brand Header: Tayta & Sabroso Unified Brand */}
        <div className="px-3 md:px-5 mb-4 flex flex-col items-center md:items-start gap-2.5">
          <div className="flex items-center gap-3 w-full">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#823b19] via-[#4d2511] to-[#201511] border border-[#ffb597]/40 p-1 flex items-center justify-center shadow-lg overflow-hidden shrink-0 group">
              <span className="material-symbols-outlined text-[#ffb597] text-[26px]">restaurant_menu</span>
            </div>
            <div className="hidden md:block min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="text-[17px] font-black text-[#ffb597] tracking-tight leading-tight truncate">
                  Tayta &amp; Sabroso
                </h1>
              </div>
              <p className="text-[11px] font-semibold text-[#dac1b8]/70 tracking-wider uppercase">
                Holding Gastronómico
              </p>
            </div>
          </div>

          {/* Company Switcher Pill */}
          <div className="hidden md:flex flex-col w-full gap-1 pt-2 border-t border-[#54433c]/40">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#dac1b8]/60">
              Empresa Activa
            </span>
            <div className="grid grid-cols-3 gap-1 bg-[#101010] p-1 rounded-xl border border-[#54433c]/50">
              <button
                id="btn-switch-tayta"
                onClick={() => setActiveCompanyId('el-tayta')}
                className={`text-[11px] font-bold py-1.5 px-1 rounded-lg transition-all text-center truncate ${
                  activeCompanyId === 'el-tayta'
                    ? 'bg-[#823b19] text-[#ffdbcd] shadow-md'
                    : 'text-[#dac1b8]/70 hover:text-[#ffb597] hover:bg-[#202020]'
                }`}
                title="El Tayta (Criollo & Marino)"
              >
                Tayta
              </button>
              <button
                id="btn-switch-sabroso"
                onClick={() => setActiveCompanyId('el-sabroso')}
                className={`text-[11px] font-bold py-1.5 px-1 rounded-lg transition-all text-center truncate ${
                  activeCompanyId === 'el-sabroso'
                    ? 'bg-[#ebc246] text-[#352800] shadow-md'
                    : 'text-[#dac1b8]/70 hover:text-[#ebc246] hover:bg-[#202020]'
                }`}
                title="El Sabroso (Brasas & Parrillas)"
              >
                Sabroso
              </button>
              <button
                id="btn-switch-todas"
                onClick={() => setActiveCompanyId('todas')}
                className={`text-[11px] font-bold py-1.5 px-1 rounded-lg transition-all text-center truncate ${
                  activeCompanyId === 'todas'
                    ? 'bg-[#403a38] text-white shadow-md'
                    : 'text-[#dac1b8]/70 hover:text-white hover:bg-[#202020]'
                }`}
                title="Consolidado (Ambas empresas)"
              >
                Ambas
              </button>
            </div>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 flex flex-col gap-1.5 px-2 overflow-y-auto custom-scrollbar">
          {navItems.map((item) => {
            const isActive = currentScreen === item.id;
            return (
              <button
                key={item.id}
                id={`nav-${item.id}`}
                onClick={() => handleNavClick(item.id)}
                className={`flex items-center justify-between p-2.5 md:p-3 mx-0.5 rounded-xl text-left transition-all duration-150 relative ${
                  isActive
                    ? 'bg-[#823b19] text-[#ffdbcd] font-bold shadow-md scale-[0.99]'
                    : 'text-[#dac1b8] hover:bg-[#222121] hover:text-[#e5e2e1]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`material-symbols-outlined text-[22px] shrink-0 ${
                      isActive ? 'fill text-[#ffdbcd]' : 'text-[#dac1b8]'
                    }`}
                  >
                    {item.icon}
                  </span>
                  <span className="hidden md:block text-[13px] font-medium tracking-wide truncate">
                    {item.label}
                  </span>
                </div>

                {item.badge && (
                  <span
                    className={`hidden md:inline-flex text-[10px] font-black px-1.5 py-0.5 rounded-md ${
                      item.badgeColor || 'bg-[#b08c09] text-black'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom User Info & Financial Ratio Status Indicator */}
        <div className="px-2.5 pt-3 border-t border-[#54433c]/40 mt-auto flex flex-col gap-2">
          {/* Quick Expense Ratio mini-card on desktop */}
          <div
            onClick={() => setCurrentScreen('ratios')}
            className="hidden md:flex items-center justify-between bg-[#1f1d1d] hover:bg-[#282626] cursor-pointer p-2 rounded-xl border border-[#54433c]/40 transition-colors"
            title="Ver Control de Gastos y Ratios Financieros"
          >
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  expenseAnalysis.status === 'critico'
                    ? 'bg-rose-500 animate-ping'
                    : expenseAnalysis.status === 'alerta'
                    ? 'bg-amber-400'
                    : 'bg-emerald-400'
                }`}
              />
              <span className="text-[11px] font-bold text-[#e5e2e1]">Food Cost %:</span>
            </div>
            <span
              className={`text-[12px] font-black ${
                expenseAnalysis.status === 'critico'
                  ? 'text-rose-400'
                  : expenseAnalysis.status === 'alerta'
                  ? 'text-amber-400'
                  : 'text-emerald-400'
              }`}
            >
              {expenseAnalysis.foodCostPctReal}%
            </span>
          </div>

          {/* Turno Controller Button */}
          <button
            id="btn-sidebar-shift"
            type="button"
            onClick={() => setIsShiftModalOpen(true)}
            className="w-full bg-[#201f1f] hover:bg-[#2c2a2a] border border-[#54433c]/60 hover:border-[#ffb597]/50 rounded-xl p-2 flex items-center justify-between text-left transition-all group cursor-pointer"
            title="Arqueo y Cierre de Turno"
          >
            <div className="flex items-center gap-2">
              <span className={`material-symbols-outlined text-[18px] ${activeShift === 'Día' ? 'text-amber-400' : 'text-indigo-400'}`}>
                {activeShift === 'Día' ? 'wb_sunny' : 'bedtime'}
              </span>
              <div className="hidden md:block">
                <span className="text-[10px] text-[#dac1b8]/60 uppercase font-bold block leading-none">Turno Activo</span>
                <span className="text-[12px] font-bold text-white leading-tight">Turno {activeShift}</span>
              </div>
            </div>
            <span className="hidden md:block material-symbols-outlined text-[16px] text-[#dac1b8]/50 group-hover:text-[#ffb597]">
              sync_alt
            </span>
          </button>

          {currentUser && (
            <div className="bg-[#1f1d1d] border border-[#54433c]/50 rounded-xl p-2 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-full bg-[#823b19] text-[#ffdbcd] flex items-center justify-center font-bold text-[12px] shrink-0 border border-[#a28c84]/40">
                  {currentUser.name.charAt(0)}
                </div>
                <div className="hidden md:block min-w-0">
                  <p className="text-[12px] font-semibold text-[#e5e2e1] truncate leading-tight">
                    {currentUser.name}
                  </p>
                  <p className="text-[10px] text-[#dac1b8]/70 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
                    {currentUser.role}
                  </p>
                </div>
              </div>

              <button
                id="btn-logout"
                onClick={logout}
                title="Cerrar sesión"
                className="hidden md:flex p-1 text-[#dac1b8] hover:text-[#ffb4ab] hover:bg-[#353535] rounded-lg transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">logout</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
