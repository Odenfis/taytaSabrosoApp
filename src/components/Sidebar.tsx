import { ThemeSelector } from './ThemeSelector';
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
      badgeColor: 'bg-surface-danger-5 text-ink-on-solid',
    },
    { id: 'compras', label: 'Compras & Facturas', icon: 'shopping_cart_checkout' },
    { id: 'productos', label: 'Productos', icon: 'restaurant_menu' },
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
          ? 'bg-surface-danger-6 text-ink-on-solid animate-pulse'
          : expenseAnalysis.status === 'alerta'
          ? 'bg-surface-warning-4 text-ink-on-light'
          : 'bg-surface-success-2 text-ink-on-solid',
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
      className="fixed left-0 top-0 h-full w-24 md:w-64 flex flex-col bg-panel-2 border-r border-edge-outline-2 z-50 transition-all select-none"
    >
      <div className="h-full flex flex-col pt-4 pb-3">
        {/* Brand Header: Tayta & Sabroso Unified Brand */}
        <div className="px-3 md:px-5 mb-4 flex flex-col items-center md:items-start gap-2.5">
          <div className="flex items-center gap-3 w-full">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-surface-brand-solid-5 via-surface-tinted-5 to-panel-47 border border-edge-brand-3 p-1 flex items-center justify-center shadow-lg overflow-hidden shrink-0 group">
              <span className="material-symbols-outlined text-ink-brand text-[26px]">restaurant_menu</span>
            </div>
            <div className="hidden md:block min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="text-[17px] font-black text-ink-brand tracking-tight leading-tight truncate">
                  Tayta &amp; Sabroso
                </h1>
              </div>
              <p className="text-[11px] font-semibold text-ink-muted-3 tracking-wider uppercase">
                Holding Gastronómico
              </p>
            </div>
          </div>

          {/* Company Switcher Pill */}
          <div className="hidden md:flex flex-col w-full gap-1 pt-2 border-t border-edge-outline-5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">
              Empresa Activa
            </span>
            <div className="grid grid-cols-3 gap-1 bg-panel-20 p-1 rounded-xl border border-edge-outline-3">
              <button
                id="btn-switch-tayta"
                onClick={() => setActiveCompanyId('el-tayta')}
                className={`text-[11px] font-bold py-1.5 px-1 rounded-lg transition-all text-center truncate ${
                  activeCompanyId === 'el-tayta'
                    ? 'bg-surface-brand-solid text-ink-on-brand shadow-md'
                    : 'text-ink-muted-3 hover:text-ink-brand hover:bg-panel-38'
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
                    ? 'bg-surface-gold-2 text-ink-foreground shadow-md'
                    : 'text-ink-muted-3 hover:text-ink-gold hover:bg-panel-38'
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
                    ? 'bg-panel-48 text-ink-strong shadow-md'
                    : 'text-ink-muted-3 hover:text-ink-strong hover:bg-panel-38'
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
                    ? 'bg-surface-brand-solid text-ink-on-brand font-bold shadow-md scale-[0.99]'
                    : 'text-ink-muted-2 hover:bg-panel-49 hover:text-ink-body'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`material-symbols-outlined text-[22px] shrink-0 ${
                      isActive ? 'fill text-ink-on-brand' : 'text-ink-muted-2'
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
                      item.badgeColor || 'bg-surface-gold-solid text-ink-on-light'
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
        <div className="px-2.5 pt-3 border-t border-edge-outline-5 mt-auto flex flex-col gap-2">
          <ThemeSelector compact />
          {/* Quick Expense Ratio mini-card on desktop */}
          <div
            onClick={() => setCurrentScreen('ratios')}
            className="hidden md:flex items-center justify-between bg-panel-50 hover:bg-panel-51 cursor-pointer p-2 rounded-xl border border-edge-outline-5 transition-colors"
            title="Ver Control de Gastos y Ratios Financieros"
          >
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  expenseAnalysis.status === 'critico'
                    ? 'bg-surface-danger-5 animate-ping'
                    : expenseAnalysis.status === 'alerta'
                    ? 'bg-surface-warning'
                    : 'bg-surface-success'
                }`}
              />
              <span className="text-[11px] font-bold text-ink-body">Food Cost %:</span>
            </div>
            <span
              className={`text-[12px] font-black ${
                expenseAnalysis.status === 'critico'
                  ? 'text-ink-danger-3'
                  : expenseAnalysis.status === 'alerta'
                  ? 'text-ink-warning-3'
                  : 'text-ink-success'
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
            className="w-full bg-panel-31 hover:bg-panel-52 border border-edge-outline-2 hover:border-edge-brand-6 rounded-xl p-2 flex items-center justify-between text-left transition-all group cursor-pointer"
            title="Arqueo y Cierre de Turno"
          >
            <div className="flex items-center gap-2">
              <span className={`material-symbols-outlined text-[18px] ${activeShift === 'Día' ? 'text-ink-warning-3' : 'text-ink-accent'}`}>
                {activeShift === 'Día' ? 'wb_sunny' : 'bedtime'}
              </span>
              <div className="hidden md:block">
                <span className="text-[10px] text-ink-muted uppercase font-bold block leading-none">Turno Activo</span>
                <span className="text-[12px] font-bold text-ink-strong leading-tight">Turno {activeShift}</span>
              </div>
            </div>
            <span className="hidden md:block material-symbols-outlined text-[16px] text-ink-muted-4 group-hover:text-ink-brand">
              sync_alt
            </span>
          </button>

          {currentUser && (
            <div className="bg-panel-50 border border-edge-outline-3 rounded-xl p-2 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-full bg-surface-brand-solid text-ink-on-brand flex items-center justify-center font-bold text-[12px] shrink-0 border border-edge-outline-strong">
                  {currentUser.name.charAt(0)}
                </div>
                <div className="hidden md:block min-w-0">
                  <p className="text-[12px] font-semibold text-ink-body truncate leading-tight">
                    {currentUser.name}
                  </p>
                  <p className="text-[10px] text-ink-muted-3 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-surface-success-3 inline-block"></span>
                    {currentUser.role}
                  </p>
                </div>
              </div>

              <button
                id="btn-logout"
                onClick={logout}
                title="Cerrar sesión"
                className="hidden md:flex p-1 text-ink-muted-2 hover:text-ink-danger hover:bg-panel-17 rounded-lg transition-colors"
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
