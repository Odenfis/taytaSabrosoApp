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
    realtimeStatus,
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
      case 'productos':
        return 'Maestro de Productos';
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
      className="fixed top-0 right-0 w-[calc(100%-6rem)] md:w-[calc(100%-16rem)] h-16 bg-panel-35 border-b border-edge-outline-2 z-40 flex justify-between items-center px-3 md:px-6 shadow-sm"
    >
      <div className="flex items-center gap-2 md:gap-3 min-w-0">
        {onToggleMobileMenu && (
          <button
            onClick={onToggleMobileMenu}
            className="md:hidden text-ink-muted-2 hover:text-ink-body p-1.5 hover:bg-panel-3 rounded-lg transition-colors"
          >
            <span className="material-symbols-outlined text-[22px]">menu</span>
          </button>
        )}

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-[17px] md:text-[21px] font-bold text-ink-brand tracking-tight truncate">
              {getScreenTitle()}
            </h1>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-3">
        {/* Multi-Company Selector Pill */}
        <div className="flex items-center bg-panel p-1 rounded-xl border border-edge-outline-3">
          <button
            onClick={() => setActiveCompanyId('el-tayta')}
            className={`text-[11px] md:text-[12px] font-bold px-2 py-1 rounded-lg transition-all flex items-center gap-1 ${
              activeCompanyId === 'el-tayta'
                ? 'bg-surface-brand-solid text-ink-on-brand shadow-sm'
                : 'text-ink-muted-3 hover:text-ink-strong'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-surface-brand" />
            <span className="hidden sm:inline">El Tayta</span>
            <span className="sm:hidden">Tayta</span>
          </button>

          <button
            onClick={() => setActiveCompanyId('el-sabroso')}
            className={`text-[11px] md:text-[12px] font-bold px-2 py-1 rounded-lg transition-all flex items-center gap-1 ${
              activeCompanyId === 'el-sabroso'
                ? 'bg-surface-gold-2 text-ink-foreground shadow-sm'
                : 'text-ink-muted-3 hover:text-ink-strong'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-surface-gold-2" />
            <span className="hidden sm:inline">El Sabroso</span>
            <span className="sm:hidden">Sabroso</span>
          </button>

          <button
            onClick={() => setActiveCompanyId('todas')}
            className={`text-[11px] md:text-[12px] font-bold px-2 py-1 rounded-lg transition-all flex items-center gap-1 ${
              activeCompanyId === 'todas'
                ? 'bg-panel-27 text-ink-strong shadow-sm'
                : 'text-ink-muted-3 hover:text-ink-strong'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-surface-muted-alt" />
            <span>Ambas</span>
          </button>
        </div>

        {/* Financial Expense Health Pill */}
        <button
          onClick={() => setCurrentScreen('ratios')}
          className={`hidden lg:flex items-center gap-1.5 px-3 py-1 rounded-xl text-[12px] font-bold border transition-colors ${
            expenseAnalysis.status === 'critico'
              ? 'bg-surface-danger-strong-5 border-edge-danger-8 text-ink-danger-2 hover:bg-surface-danger-strong-6'
              : expenseAnalysis.status === 'alerta'
              ? 'bg-surface-warning-strong-3 border-edge-warning-6 text-ink-warning-2 hover:bg-surface-warning-strong-11'
              : 'bg-surface-success-strong-3 border-edge-success-5 text-ink-success-2 hover:bg-surface-success-strong-9'
          }`}
          title="Ver diagnóstico de control de gastos"
        >
          <span
            className={`w-2 h-2 rounded-full ${
              expenseAnalysis.status === 'critico'
                ? 'bg-surface-danger-5 animate-pulse'
                : expenseAnalysis.status === 'alerta'
                ? 'bg-surface-warning'
                : 'bg-surface-success'
            }`}
          />
          <span>Food Cost: {expenseAnalysis.foodCostPctReal}%</span>
          <span className="opacity-70 text-[10px] uppercase">
            ({expenseAnalysis.status === 'critico' ? 'Sobrecosto' : expenseAnalysis.status === 'alerta' ? 'Alerta' : 'Óptimo'})
          </span>
        </button>

        {/* Live Clock */}
        <div className="text-[13px] font-medium text-ink-muted-2 hidden xl:flex items-center gap-1.5 bg-panel px-3 py-1.5 rounded-lg border border-edge-outline-5">
          <span className="material-symbols-outlined text-[15px] text-ink-gold">schedule</span>
          <span>{time || '12:45 PM'}</span>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1 relative">
          {/* Sync / Connection status */}
        <button
          id="btn-sync-status"
          className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-bold transition-colors ${
            offlineState.isSimulatedOffline
              ? 'bg-surface-warning-strong-3 border-edge-warning-7 text-ink-warning-2'
              : offlineState.pendingSyncCount > 0
              ? 'bg-surface-warning-strong-12 border-edge-warning-8 text-ink-warning-4'
              : !offlineState.isOnline
              ? 'bg-surface-danger-strong-5 border-edge-danger-9 text-ink-danger-2'
              : 'bg-surface-success-strong-3 border-edge-success-6 text-ink-success-2'
          }`}
          title={
            lastSyncResult
              ? `Última escritura: ${lastSyncResult.op} → ${lastSyncResult.ok ? 'OK' : 'FALLÓ'} (${new Date(lastSyncResult.ts).toLocaleTimeString()}) • Tiempo real: ${realtimeStatus}`
              : `Sin operaciones de escritura aún • Tiempo real: ${realtimeStatus}`
          }
        >
          <span
            className={`w-2 h-2 rounded-full ${
              offlineState.isSimulatedOffline
                ? 'bg-surface-warning'
                : offlineState.pendingSyncCount > 0
                ? 'bg-surface-warning-3 animate-pulse'
                : !offlineState.isOnline
                ? 'bg-surface-danger-5 animate-pulse'
                : 'bg-surface-success'
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
            <span className="bg-panel-40 px-1.5 py-0.5 rounded-md text-[10px]">
              {offlineState.pendingSyncCount} en cola
            </span>
          )}
          <span
            title={`Tiempo real: ${realtimeStatus}`}
            className={`w-2 h-2 rounded-full ${
              realtimeStatus === 'connected'
                ? 'bg-surface-success'
                : realtimeStatus === 'connecting'
                ? 'bg-surface-warning animate-pulse'
                : 'bg-surface-outline'
            }`}
          />
        </button>

        {/* Notifications button */}
          <button
            id="btn-notifications-toggle"
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative text-ink-muted-2 hover:text-ink-body hover:bg-panel-3 rounded-full p-2 transition-colors"
            title="Notificaciones"
          >
            <span className="material-symbols-outlined text-[22px]">notifications</span>
            {notifications.length > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-surface-gold-2 ring-2 ring-edge-edge-2" />
            )}
          </button>

          {/* User quick profile */}
          <button
            onClick={logout}
            className="text-ink-muted-2 hover:text-ink-body hover:bg-panel-3 rounded-full p-2 transition-colors"
            title="Cuenta / Cerrar Sesión"
          >
            <span className="material-symbols-outlined text-[22px]">account_circle</span>
          </button>

          {/* Notifications Dropdown Drawer */}
          {showNotifications && (
            <div
              id="notifications-drawer"
              className="absolute right-0 top-12 w-80 sm:w-96 bg-panel-13 border border-edge-outline rounded-2xl shadow-ui-7 p-4 z-50 animate-in fade-in zoom-in-95 duration-150"
            >
              <div className="flex items-center justify-between pb-3 border-b border-edge-outline-3 mb-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-ink-gold text-[20px]">
                    notifications_active
                  </span>
                  <h3 className="text-[15px] font-bold text-ink-body">Notificaciones de Turno</h3>
                </div>
                <button
                  onClick={() => setShowNotifications(false)}
                  className="text-ink-muted-2 hover:text-ink-body p-1 rounded-lg hover:bg-panel-3"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              <div className="max-h-72 overflow-y-auto space-y-2.5 pr-1">
                {notifications.length === 0 ? (
                  <p className="text-[13px] text-ink-muted-3 text-center py-6">
                    No hay notificaciones recientes.
                  </p>
                ) : (
                  notifications.map((notif) => (
                    <div
                      key={notif.id}
                      className="bg-panel border border-edge-outline-5 rounded-xl p-3 flex items-start justify-between gap-2 text-left"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              notif.type === 'success'
                                ? 'bg-surface-success'
                                : notif.type === 'warning'
                                ? 'bg-surface-gold-2'
                                : 'bg-surface-info-2'
                            }`}
                          />
                          <p className="text-[13px] font-semibold text-ink-body">{notif.title}</p>
                          <span className="text-[11px] text-ink-muted ml-auto">{notif.time}</span>
                        </div>
                        <p className="text-[12px] text-ink-muted-5 leading-snug">{notif.message}</p>
                      </div>
                      <button
                        onClick={() => dismissNotification(notif.id)}
                        className="text-ink-muted-4 hover:text-ink-body p-1 shrink-0"
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
