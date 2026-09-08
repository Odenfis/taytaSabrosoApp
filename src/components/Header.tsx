import React, { useState, useEffect } from 'react';
import { usePOS } from '../context/POSContext';
import { CompanyId } from '../types';

interface HeaderProps {
  onToggleMobileMenu?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onToggleMobileMenu }) => {
  const {
    currentScreen,
    currentUser,
    notifications,
    dismissNotification,
    logout,
    activeCompanyId,
    setActiveCompanyId,
    companies,
    expenseAnalysis,
    setCurrentScreen,
    offlineState,
    lastSyncResult,
  } = usePOS();
  const [time, setTime] = useState<string>('');
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const getScreenTitle = () => {
    switch (currentScreen) {
      case 'mesas':
        return 'Mapa de Mesas & POS';
      case 'kardex':
        return 'Kardex & Control de Stock';
      case 'compras':
        return 'Gestión de Compras & Proveedores';
      case 'recetas':
        return 'Fichas Técnicas & Recetas (BOM)';
      case 'ratios':
        return 'Control de Gastos & Ratios Financieros';
      case 'movimientos':
        return 'Libro de Caja & Movimientos';
      case 'reportes':
        return 'Reportes & Estadísticas';
      case 'configuracion':
        return 'Configuración Multiempresa';
      case 'pedido':
        return 'Toma de Pedidos';
      case 'cobro':
        return 'Cobro y Cierre de Mesa';
      default:
        return 'Tayta & Sabroso POS';
    }
  };

  return (
    <header
      id="top-app-bar"
      className="fixed top-0 right-0 w-[calc(100%-6rem)] md:w-[calc(100%-16rem)] h-16 bg-[#131313] border-b border-[#54433c]/60 z-40 flex justify-between items-center px-3 md:px-6 shadow-sm"
    >
      <div className="flex items-center gap-2 md:gap-3 min-w-0">
        {onToggleMobileMenu && (
          <button
            onClick={onToggleMobileMenu}
            className="md:hidden text-[#dac1b8] hover:text-[#e5e2e1] p-1.5 hover:bg-[#2a2a2a] rounded-lg transition-colors"
          >
            <span className="material-symbols-outlined text-[22px]">menu</span>
          </button>
        )}

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-[17px] md:text-[21px] font-bold text-[#ffb597] tracking-tight truncate">
              {getScreenTitle()}
            </h1>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-3">
        {/* Multi-Company Selector Pill */}
        <div className="flex items-center bg-[#1c1b1b] p-1 rounded-xl border border-[#54433c]/50">
          <button
            onClick={() => setActiveCompanyId('el-tayta')}
            className={`text-[11px] md:text-[12px] font-bold px-2 py-1 rounded-lg transition-all flex items-center gap-1 ${
              activeCompanyId === 'el-tayta'
                ? 'bg-[#823b19] text-[#ffdbcd] shadow-sm'
                : 'text-[#dac1b8]/70 hover:text-white'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-[#ffb597]" />
            <span className="hidden sm:inline">El Tayta</span>
            <span className="sm:hidden">Tayta</span>
          </button>

          <button
            onClick={() => setActiveCompanyId('el-sabroso')}
            className={`text-[11px] md:text-[12px] font-bold px-2 py-1 rounded-lg transition-all flex items-center gap-1 ${
              activeCompanyId === 'el-sabroso'
                ? 'bg-[#ebc246] text-[#352800] shadow-sm'
                : 'text-[#dac1b8]/70 hover:text-white'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-[#ebc246]" />
            <span className="hidden sm:inline">El Sabroso</span>
            <span className="sm:hidden">Sabroso</span>
          </button>

          <button
            onClick={() => setActiveCompanyId('todas')}
            className={`text-[11px] md:text-[12px] font-bold px-2 py-1 rounded-lg transition-all flex items-center gap-1 ${
              activeCompanyId === 'todas'
                ? 'bg-[#3b3836] text-white shadow-sm'
                : 'text-[#dac1b8]/70 hover:text-white'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-[#a39e9b]" />
            <span>Ambas</span>
          </button>
        </div>

        {/* Financial Expense Health Pill */}
        <button
          onClick={() => setCurrentScreen('ratios')}
          className={`hidden lg:flex items-center gap-1.5 px-3 py-1 rounded-xl text-[12px] font-bold border transition-colors ${
            expenseAnalysis.status === 'critico'
              ? 'bg-rose-950/40 border-rose-600/60 text-rose-300 hover:bg-rose-900/50'
              : expenseAnalysis.status === 'alerta'
              ? 'bg-amber-950/40 border-amber-600/60 text-amber-300 hover:bg-amber-900/50'
              : 'bg-emerald-950/30 border-emerald-600/50 text-emerald-300 hover:bg-emerald-900/40'
          }`}
          title="Ver diagnóstico de control de gastos"
        >
          <span
            className={`w-2 h-2 rounded-full ${
              expenseAnalysis.status === 'critico'
                ? 'bg-rose-500 animate-pulse'
                : expenseAnalysis.status === 'alerta'
                ? 'bg-amber-400'
                : 'bg-emerald-400'
            }`}
          />
          <span>Food Cost: {expenseAnalysis.foodCostPctReal}%</span>
          <span className="opacity-70 text-[10px] uppercase">
            ({expenseAnalysis.status === 'critico' ? 'Sobrecosto' : expenseAnalysis.status === 'alerta' ? 'Alerta' : 'Óptimo'})
          </span>
        </button>

        {/* Live Clock */}
        <div className="text-[13px] font-medium text-[#dac1b8] hidden xl:flex items-center gap-1.5 bg-[#1c1b1b] px-3 py-1.5 rounded-lg border border-[#54433c]/40">
          <span className="material-symbols-outlined text-[15px] text-[#ebc246]">schedule</span>
          <span>{time || '12:45 PM'}</span>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1 relative">
          {/* Sync / Connection status */}
        <button
          id="btn-sync-status"
          className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-bold transition-colors ${
            offlineState.isSimulatedOffline
              ? 'bg-amber-950/40 border-amber-600/50 text-amber-300'
              : offlineState.pendingSyncCount > 0
              ? 'bg-orange-950/40 border-orange-600/50 text-orange-300'
              : !offlineState.isOnline
              ? 'bg-rose-950/40 border-rose-600/50 text-rose-300'
              : 'bg-emerald-950/30 border-emerald-600/40 text-emerald-300'
          }`}
          title={
            lastSyncResult
              ? `Última escritura: ${lastSyncResult.op} → ${lastSyncResult.ok ? 'OK' : 'FALLÓ'} (${new Date(lastSyncResult.ts).toLocaleTimeString()})`
              : 'Sin operaciones de escritura aún'
          }
        >
          <span
            className={`w-2 h-2 rounded-full ${
              offlineState.isSimulatedOffline
                ? 'bg-amber-400'
                : offlineState.pendingSyncCount > 0
                ? 'bg-orange-400 animate-pulse'
                : !offlineState.isOnline
                ? 'bg-rose-500 animate-pulse'
                : 'bg-emerald-400'
            }`}
          />
          {offlineState.isSimulatedOffline ? (
            <span>Offline Simulado</span>
          ) : !offlineState.isOnline ? (
            <span>Sin Red</span>
          ) : (
            <span>Online</span>
          )}
          {offlineState.pendingSyncCount > 0 && (
            <span className="bg-[#131313]/70 px-1.5 py-0.5 rounded-md text-[10px]">
              {offlineState.pendingSyncCount} en cola
            </span>
          )}
        </button>

        {/* Notifications button */}
          <button
            id="btn-notifications-toggle"
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative text-[#dac1b8] hover:text-[#e5e2e1] hover:bg-[#2a2a2a] rounded-full p-2 transition-colors"
            title="Notificaciones"
          >
            <span className="material-symbols-outlined text-[22px]">notifications</span>
            {notifications.length > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-[#ebc246] ring-2 ring-[#131313]" />
            )}
          </button>

          {/* User quick profile */}
          <button
            onClick={logout}
            className="text-[#dac1b8] hover:text-[#e5e2e1] hover:bg-[#2a2a2a] rounded-full p-2 transition-colors"
            title="Cuenta / Cerrar Sesión"
          >
            <span className="material-symbols-outlined text-[22px]">account_circle</span>
          </button>

          {/* Notifications Dropdown Drawer */}
          {showNotifications && (
            <div
              id="notifications-drawer"
              className="absolute right-0 top-12 w-80 sm:w-96 bg-[#20201f] border border-[#54433c] rounded-2xl shadow-[0_12px_32px_rgba(0,0,0,0.7)] p-4 z-50 animate-in fade-in zoom-in-95 duration-150"
            >
              <div className="flex items-center justify-between pb-3 border-b border-[#54433c]/50 mb-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#ebc246] text-[20px]">
                    notifications_active
                  </span>
                  <h3 className="text-[15px] font-bold text-[#e5e2e1]">Notificaciones de Turno</h3>
                </div>
                <button
                  onClick={() => setShowNotifications(false)}
                  className="text-[#dac1b8] hover:text-[#e5e2e1] p-1 rounded-lg hover:bg-[#2a2a2a]"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              <div className="max-h-72 overflow-y-auto space-y-2.5 pr-1">
                {notifications.length === 0 ? (
                  <p className="text-[13px] text-[#dac1b8]/70 text-center py-6">
                    No hay notificaciones recientes.
                  </p>
                ) : (
                  notifications.map((notif) => (
                    <div
                      key={notif.id}
                      className="bg-[#1c1b1b] border border-[#54433c]/40 rounded-xl p-3 flex items-start justify-between gap-2 text-left"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              notif.type === 'success'
                                ? 'bg-emerald-400'
                                : notif.type === 'warning'
                                ? 'bg-[#ebc246]'
                                : 'bg-[#60d4fb]'
                            }`}
                          />
                          <p className="text-[13px] font-semibold text-[#e5e2e1]">{notif.title}</p>
                          <span className="text-[11px] text-[#dac1b8]/60 ml-auto">{notif.time}</span>
                        </div>
                        <p className="text-[12px] text-[#dac1b8]/80 leading-snug">{notif.message}</p>
                      </div>
                      <button
                        onClick={() => dismissNotification(notif.id)}
                        className="text-[#dac1b8]/50 hover:text-[#e5e2e1] p-1 shrink-0"
                      >
                        <span className="material-symbols-outlined text-[14px]">close</span>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
