import { ThemeSelector } from './ThemeSelector';
import React, { useState } from 'react';
import { usePOS } from '../context/POSContext';
import { apiClient } from '../lib/api';
import { ThermalPrinterConfig, PrinterRole, PrinterConnectionType, CompanyId } from '../types';

export const SettingsScreen: React.FC = () => {
  const {
    currentUser,
    resetToDemoData,
    addNotification,
    printers,
    thermalPrinters,
    addPrinter,
    addThermalPrinter,
    updatePrinter,
    updateThermalPrinter,
    deletePrinter,
    deleteThermalPrinter,
    testPrint,
    offlineState,
    toggleSimulatedOffline,
    syncOfflineQueue,
    setIsOfflineModalOpen,
    activeCompanyId,
    activeCompany,
    companies,
    setCurrentScreen,
  } = usePOS();

  const printerList = printers || thermalPrinters || [];
  const handleAddPrinter = addPrinter || addThermalPrinter;
  const handleUpdatePrinter = updatePrinter || updateThermalPrinter;
  const handleDeletePrinter = deletePrinter || deleteThermalPrinter;

  const [activeTab, setActiveTab] = useState<'empresa' | 'impresoras' | 'offline' | 'mantenimiento' | 'apariencia' | 'seguridad'>('impresoras');
  const [isSaved, setIsSaved] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [repeatPin, setRepeatPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinSaved, setPinSaved] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);

  const saveSupervisorPin = async (event: React.FormEvent) => {
    event.preventDefault(); setPinError(''); setPinSaved(false);
    if (newPin !== repeatPin) { setPinError('Los PIN nuevos no coinciden.'); return; }
    setPinBusy(true);
    try {
      await apiClient.patch('/auth/pin', { currentPin, newPin });
      setCurrentPin(''); setNewPin(''); setRepeatPin(''); setPinSaved(true);
    } catch (error) { setPinError(error instanceof Error ? error.message : 'No se pudo cambiar el PIN.'); }
    finally { setPinBusy(false); }
  };

  // Printer Form State for new printer modal
  const [isPrinterModalOpen, setIsPrinterModalOpen] = useState(false);
  const [editingPrinter, setEditingPrinter] = useState<ThermalPrinterConfig | null>(null);
  const [printerFormData, setPrinterFormData] = useState<Omit<ThermalPrinterConfig, 'id'>>({
    companyId: activeCompanyId === 'todas' ? 'el-tayta' : activeCompanyId,
    name: '',
    role: 'cocina_caliente',
    connectionType: 'LAN_TCP',
    ipAddress: '192.168.1.200',
    port: 9100,
    paperWidth: '80mm',
    autoCut: true,
    beepOnPrint: true,
    categoriesMapped: ['Cocina', 'Parrillas'],
    status: 'online',
    isEnabled: true,
  });

  const openNewPrinterModal = () => {
    setEditingPrinter(null);
    setPrinterFormData({
      companyId: activeCompanyId === 'todas' ? 'el-tayta' : activeCompanyId,
      name: '',
      role: 'cocina_caliente',
      connectionType: 'LAN_TCP',
      ipAddress: '192.168.1.200',
      port: 9100,
      paperWidth: '80mm',
      autoCut: true,
      beepOnPrint: true,
      categoriesMapped: ['Cocina'],
      status: 'online',
      isEnabled: true,
    });
    setIsPrinterModalOpen(true);
  };

  const openEditPrinterModal = (printer: ThermalPrinterConfig) => {
    setEditingPrinter(printer);
    setPrinterFormData({
      companyId: printer.companyId,
      name: printer.name,
      role: printer.role,
      connectionType: printer.connectionType,
      ipAddress: printer.ipAddress || '',
      port: printer.port || 9100,
      paperWidth: printer.paperWidth,
      autoCut: printer.autoCut,
      beepOnPrint: printer.beepOnPrint,
      categoriesMapped: printer.categoriesMapped,
      status: printer.status,
      isEnabled: printer.isEnabled,
    });
    setIsPrinterModalOpen(true);
  };

  const handleSavePrinter = (e: React.FormEvent) => {
    e.preventDefault();
    if (!printerFormData.name.trim()) return;

    if (editingPrinter) {
      handleUpdatePrinter?.(editingPrinter.id, printerFormData);
      addNotification('Impresora Actualizada', `${printerFormData.name} ha sido guardada.`, 'success');
    } else {
      handleAddPrinter?.(printerFormData);
      addNotification('Impresora Agregada', `${printerFormData.name} registrada correctamente.`, 'success');
    }
    setIsPrinterModalOpen(false);
  };

  const getRoleLabel = (role: PrinterRole) => {
    switch (role) {
      case 'cocina_fria':
        return 'Cocina Fría (Ceviches & Entradas)';
      case 'cocina_caliente':
        return 'Cocina Caliente / Pollería & Parrillas';
      case 'barra':
        return 'Barra & Tragos';
      case 'caja':
        return 'Caja / Ticket Cliente';
      default:
        return role;
    }
  };

  return (
    <main
      id="settings-screen"
      className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col gap-5 bg-panel-4 select-none"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[24px] text-ink-brand">settings</span>
            <h2 className="text-[20px] md:text-[24px] font-bold text-ink-brand tracking-tight">
              Configuración del Sistema Multiempresa
            </h2>
          </div>
          <p className="text-[13px] text-ink-muted-5 mt-0.5">
            Gestión de impresoras térmicas, conectividad offline, datos de locales y mantenimiento
          </p>
        </div>

        {/* Quick link to Bank Accounts */}
        <button
          onClick={() => setCurrentScreen('bancos')}
          className="px-3.5 py-2 rounded-xl bg-panel-38 hover:bg-panel-3 border border-edge-outline text-ink-heading-brand text-[13px] font-bold flex items-center gap-2 transition-all shadow-sm"
        >
          <span className="material-symbols-outlined text-[18px] text-ink-gold">account_balance</span>
          <span>Ir a Cuentas Bancarias</span>
        </button>
      </div>

      {isSaved && (
        <div className="bg-surface-info-3 border border-edge-info-7 rounded-xl p-3.5 text-ink-info text-[13px] font-semibold flex items-center gap-2 animate-in fade-in">
          <span className="material-symbols-outlined text-[18px]">check_circle</span>
          <span>Ajustes guardados correctamente.</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-edge-outline-5 pb-2">
        <button
          onClick={() => setActiveTab('impresoras')}
          className={`px-4 py-2 rounded-xl text-[13px] font-bold transition-all flex items-center gap-2 ${
            activeTab === 'impresoras'
              ? 'bg-surface-brand-solid text-ink-on-brand shadow-sm'
              : 'text-ink-muted-3 hover:text-ink-strong hover:bg-panel-38'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">print</span>
          Impresoras Térmicas ({printerList.length})
        </button>

        <button
          onClick={() => setActiveTab('offline')}
          className={`px-4 py-2 rounded-xl text-[13px] font-bold transition-all flex items-center gap-2 ${
            activeTab === 'offline'
              ? 'bg-surface-brand-solid text-ink-on-brand shadow-sm'
              : 'text-ink-muted-3 hover:text-ink-strong hover:bg-panel-38'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">wifi_off</span>
          Modo Offline &amp; Resiliencia
        </button>

        <button
          onClick={() => setActiveTab('empresa')}
          className={`px-4 py-2 rounded-xl text-[13px] font-bold transition-all flex items-center gap-2 ${
            activeTab === 'empresa'
              ? 'bg-surface-brand-solid text-ink-on-brand shadow-sm'
              : 'text-ink-muted-3 hover:text-ink-strong hover:bg-panel-38'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">store</span>
          Datos de Locales &amp; RUC
        </button>

        <button
          onClick={() => setActiveTab('mantenimiento')}
          className={`px-4 py-2 rounded-xl text-[13px] font-bold transition-all flex items-center gap-2 ${
            activeTab === 'mantenimiento'
              ? 'bg-surface-brand-solid text-ink-on-brand shadow-sm'
              : 'text-ink-muted-3 hover:text-ink-strong hover:bg-panel-38'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">restart_alt</span>
          Mantenimiento &amp; Reset Demo
        </button>
        <button type="button" onClick={() => setActiveTab('apariencia')} aria-pressed={activeTab === 'apariencia'} className={`px-4 py-2 rounded-xl text-[13px] font-bold flex items-center gap-2 ${activeTab === 'apariencia' ? 'bg-primary-container text-on-primary-fixed' : 'text-on-surface-variant hover:bg-surface-container'}`}><span aria-hidden="true" className="material-symbols-outlined text-[18px]">palette</span>Apariencia</button>
        {currentUser?.role === 'Administrador' && <button type="button" onClick={() => setActiveTab('seguridad')} aria-pressed={activeTab === 'seguridad'} className={`px-4 py-2 rounded-xl text-[13px] font-bold flex items-center gap-2 ${activeTab === 'seguridad' ? 'bg-primary-container text-on-primary-fixed' : 'text-on-surface-variant hover:bg-surface-container'}`}><span aria-hidden="true" className="material-symbols-outlined text-[18px]">lock</span>Seguridad</button>}
      </div>

      {activeTab === 'seguridad' && currentUser?.role === 'Administrador' && <section className="rounded-2xl border border-outline-variant bg-surface-container-low p-5 space-y-4 max-w-lg">
        <h2 className="text-lg font-bold text-primary">PIN de administrador</h2>
        <p className="text-sm text-on-surface-variant">El PIN personal autoriza correcciones de medios de pago. Cambie el PIN inicial antes de usar esta función.</p>
        <form onSubmit={(event) => void saveSupervisorPin(event)} className="space-y-3">
          <label className="block text-sm">PIN actual<input type="password" autoComplete="off" value={currentPin} onChange={(event) => setCurrentPin(event.target.value)} required className="mt-1 w-full rounded-lg border border-edge-outline-2 bg-panel-3 p-2 text-ink-body" /></label>
          <label className="block text-sm">Nuevo PIN (6 a 12 dígitos)<input type="password" inputMode="numeric" pattern="[0-9]{6,12}" autoComplete="new-password" value={newPin} onChange={(event) => setNewPin(event.target.value)} required className="mt-1 w-full rounded-lg border border-edge-outline-2 bg-panel-3 p-2 text-ink-body" /></label>
          <label className="block text-sm">Repetir nuevo PIN<input type="password" inputMode="numeric" pattern="[0-9]{6,12}" autoComplete="new-password" value={repeatPin} onChange={(event) => setRepeatPin(event.target.value)} required className="mt-1 w-full rounded-lg border border-edge-outline-2 bg-panel-3 p-2 text-ink-body" /></label>
          {pinError && <p role="alert" className="text-sm text-ink-danger">{pinError}</p>}
          {pinSaved && <p role="status" className="text-sm text-ink-success">PIN actualizado. Use el nuevo PIN para iniciar sesión y autorizar correcciones.</p>}
          <button type="submit" disabled={pinBusy || !offlineState.isOnline || offlineState.isSimulatedOffline} className="rounded-lg bg-surface-gold-2 px-4 py-2 font-semibold text-ink-on-accent disabled:opacity-50">{pinBusy ? 'Guardando…' : 'Cambiar PIN'}</button>
        </form>
      </section>}

      {activeTab === 'apariencia' && <section className="rounded-2xl border border-outline-variant bg-surface-container-low p-5 space-y-4">
        <h2 className="text-lg font-bold text-primary">Apariencia</h2>
        <p className="text-sm text-on-surface-variant">Elige un tema para este navegador. Se aplica también al inicio de sesión y funciona sin conexión.</p>
        <div className="max-w-sm"><ThemeSelector /></div>
      </section>}

      {/* Tab: Impresoras Térmicas */}
      {activeTab === 'impresoras' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-panel-21 p-4 rounded-2xl border border-edge-outline-3">
            <div>
              <h3 className="text-[16px] font-bold text-ink-strong flex items-center gap-2">
                <span className="material-symbols-outlined text-ink-gold">receipt</span>
                Red de Impresoras Térmicas (ESC/POS)
              </h3>
              <p className="text-[12px] text-ink-muted-3">
                Enrutamiento automático de comandas de cocina caliente, cevichería, barra y tickets de caja
              </p>
            </div>
            <button
              onClick={openNewPrinterModal}
              className="px-4 py-2 rounded-xl bg-surface-brand-solid hover:bg-surface-brand-hover-alt text-ink-on-brand font-bold text-[13px] flex items-center gap-2 shadow-md transition-all shrink-0"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              Agregar Impresora
            </button>
          </div>

          {printerList.length === 0 ? (
            <div className="bg-panel-21 border border-edge-outline-5 rounded-2xl p-8 text-center">
              <span className="material-symbols-outlined text-4xl text-ink-muted-8 mb-2">print_disabled</span>
              <p className="text-ink-strong font-bold">No hay impresoras configuradas</p>
              <p className="text-xs text-ink-muted mt-1">Haga clic en &quot;Agregar Impresora&quot; para registrar un terminal térmico ESC/POS.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {printerList.map((printer) => (
                <div
                  key={printer.id}
                  className="bg-panel border border-edge-outline-2 hover:border-edge-brand-6 rounded-2xl p-4 sm:p-5 flex flex-col justify-between shadow-lg transition-all"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-panel-33 border border-edge-outline flex items-center justify-center text-ink-brand">
                          <span className="material-symbols-outlined text-[24px]">print</span>
                        </div>
                        <div>
                          <h4 className="text-[16px] font-bold text-ink-strong leading-tight">{printer.name}</h4>
                          <span className="text-[11px] text-ink-muted-3">{getRoleLabel(printer.role)}</span>
                        </div>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 ${
                          printer.status === 'online'
                            ? 'bg-surface-success-strong-5 text-ink-success-2 border border-edge-success'
                            : 'bg-surface-danger-strong-4 text-ink-danger-2 border border-edge-danger-6'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            printer.status === 'online' ? 'bg-surface-success' : 'bg-surface-danger-4'
                          }`}
                        />
                        {printer.status === 'online' ? 'En Línea' : 'Desconectada'}
                      </span>
                    </div>

                    <div className="bg-panel-29 p-3 rounded-xl border border-edge-outline-5 space-y-2 text-[12px] mb-3">
                      <div className="flex justify-between">
                        <span className="text-ink-muted font-semibold">Conexión:</span>
                        <span className="font-mono text-ink-brand">
                          {printer.connectionType} {printer.ipAddress ? `(${printer.ipAddress}:${printer.port})` : ''}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ink-muted font-semibold">Ancho de Papel:</span>
                        <span className="text-ink-strong font-medium">{printer.paperWidth}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ink-muted font-semibold">Corte Automático:</span>
                        <span className="text-ink-success">{printer.autoCut ? 'Activado' : 'Manual'}</span>
                      </div>
                      <div>
                        <span className="text-ink-muted font-semibold block mb-1">Categorías Asignadas:</span>
                        <div className="flex flex-wrap gap-1">
                          {(printer.categoriesMapped || []).map((cat, idx) => (
                            <span
                              key={idx}
                              className="bg-panel-33 text-ink-muted-2 text-[10px] font-medium px-2 py-0.5 rounded border border-edge-outline-8"
                            >
                              {cat}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-edge-outline-5 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => testPrint(printer.id)}
                      className="px-3 py-1.5 rounded-xl bg-panel-33 hover:bg-panel-39 border border-edge-outline text-ink-heading-brand text-[12px] font-bold flex items-center gap-1.5 transition-all"
                    >
                      <span className="material-symbols-outlined text-[15px] text-ink-gold">play_arrow</span>
                      Probar Impresión
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEditPrinterModal(printer)}
                        className="text-ink-muted-3 hover:text-ink-strong p-1.5 rounded-lg hover:bg-panel-3 transition-colors"
                        title="Editar configuración"
                      >
                        <span className="material-symbols-outlined text-[18px]">edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeletePrinter?.(printer.id)}
                        className="text-ink-danger-4 hover:text-ink-danger-2 p-1.5 rounded-lg hover:bg-surface-danger-strong-5 transition-colors"
                        title="Eliminar impresora"
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Resiliencia & Modo Offline */}
      {activeTab === 'offline' && (
        <div className="bg-panel border border-edge-outline-2 rounded-2xl p-5 sm:p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center border ${
                  offlineState.isOnline
                    ? 'bg-surface-success-strong-6 border-edge-success text-ink-success'
                    : 'bg-surface-warning-strong-8 border-edge-warning-3 text-ink-warning-3'
                }`}
              >
                <span className="material-symbols-outlined text-[28px]">
                  {offlineState.isOnline ? 'wifi' : 'wifi_off'}
                </span>
              </div>
              <div>
                <h3 className="text-[17px] font-bold text-ink-strong">
                  Motor de Persistencia Local &amp; Desconexión
                </h3>
                <p className="text-[13px] text-ink-muted-3">
                  Estado actual: <strong className={offlineState.isOnline ? 'text-ink-success' : 'text-ink-warning-3'}>
                    {offlineState.isOnline ? 'Conectado al Servidor (Online)' : 'Modo Autónomo Local (Offline)'}
                  </strong>
                </p>
              </div>
            </div>

            <button
              onClick={toggleSimulatedOffline}
              className={`px-4 py-2 rounded-xl text-[12px] font-bold border transition-all ${
                offlineState.isOnline
                  ? 'bg-surface-warning-strong-7 border-edge-warning-2 text-ink-warning-2 hover:bg-surface-warning-strong-10'
                  : 'bg-surface-success-strong-5 border-edge-success-3 text-ink-success-2 hover:bg-surface-success-strong-8'
              }`}
            >
              {offlineState.isOnline ? 'Simular Corte de Internet' : 'Reconectar Internet'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-panel-29 p-4 rounded-xl border border-edge-outline-5 text-center">
              <span className="text-[11px] uppercase font-semibold text-ink-muted">Operaciones en Cola Local</span>
              <p className="text-[24px] font-black text-ink-strong mt-1">{offlineState.pendingSyncCount}</p>
            </div>
            <div className="bg-panel-29 p-4 rounded-xl border border-edge-outline-5 text-center">
              <span className="text-[11px] uppercase font-semibold text-ink-muted">Última Sincronización</span>
              <p className="text-[16px] font-bold text-ink-gold mt-2">{offlineState.lastSyncTime}</p>
            </div>
            <div className="bg-panel-29 p-4 rounded-xl border border-edge-outline-5 text-center flex flex-col justify-center">
              <button
                onClick={syncOfflineQueue}
                className="px-3 py-2 rounded-xl bg-surface-brand-solid hover:bg-surface-brand-hover-alt text-ink-on-brand font-bold text-[12px] flex items-center justify-center gap-1.5 shadow"
              >
                <span className="material-symbols-outlined text-[16px]">cloud_sync</span>
                Forzar Sincronización
              </button>
            </div>
          </div>

          <div className="bg-panel-29 p-4 rounded-xl border border-edge-outline-3 space-y-2 text-[12px] text-ink-muted-5">
            <h4 className="font-bold text-ink-heading-brand flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-ink-gold">verified</span>
              Garantía de Servicio en Restaurante:
            </h4>
            <p>
              Si se produce una caída del proveedor de internet o fallo en el router, los mozos pueden seguir comandando, los cocineros recibiendo tickets y los cajeros cobrando con normalidad. Toda la información queda en el almacenamiento seguro del navegador (IndexedDB) con IDs idempotentes.
            </p>
          </div>
        </div>
      )}

      {/* Tab: Empresa */}
      {activeTab === 'empresa' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {companies.map((company) => (
            <div key={company.id} className="bg-panel border border-edge-outline-2 rounded-2xl p-5 space-y-4">
              <h3 className="text-[17px] font-bold text-ink-strong">{company.tradeName}</h3>
              <div className="space-y-2 text-[13px]">
                <p><span className="text-ink-muted block text-[11px] font-bold uppercase">Razón Social</span>{company.name}</p>
                <p><span className="text-ink-muted block text-[11px] font-bold uppercase">R.U.C.</span>{company.ruc}</p>
                <p><span className="text-ink-muted block text-[11px] font-bold uppercase">Dirección Sede</span>{company.address}</p>
                <p><span className="text-ink-muted block text-[11px] font-bold uppercase">Especialidad</span>{company.specialty}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab: Mantenimiento */}
      {!import.meta.env.PROD && activeTab === 'mantenimiento' && (
        <div className="bg-panel border border-edge-outline-2 rounded-2xl p-5 space-y-4">
          <h3 className="text-[16px] font-bold text-ink-danger flex items-center gap-2">
            <span className="material-symbols-outlined text-ink-danger">restart_alt</span>
            Datos y Mantenimiento de Prueba
          </h3>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <span className="text-[14px] font-semibold text-ink-body block">
                Restaurar Datos de Demostración
              </span>
              <p className="text-[12px] text-ink-muted-3">
                Reinicia mesas, pedidos activos, cuentas bancarias, insumos y transacciones a su estado demo original.
              </p>
            </div>

            <button
              type="button"
              onClick={resetToDemoData}
              className="bg-surface-danger-tinted hover:bg-surface-danger-tinted-2 text-ink-danger border border-edge-danger-7 px-4 py-2 rounded-xl text-[13px] font-bold transition-all active:scale-95 cursor-pointer shrink-0"
            >
              Restablecer Demo
            </button>
          </div>
        </div>
      )}

      {/* Modal: Add/Edit Thermal Printer */}
      {isPrinterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-surface-scrim backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-panel border border-edge-outline rounded-2xl w-full max-w-lg p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-edge-outline-2 pb-3">
              <h3 className="text-[17px] font-bold text-ink-strong flex items-center gap-2">
                <span className="material-symbols-outlined text-ink-gold">print</span>
                {editingPrinter ? 'Editar Impresora Térmica' : 'Registrar Nueva Impresora'}
              </h3>
              <button
                onClick={() => setIsPrinterModalOpen(false)}
                className="text-ink-muted hover:text-ink-strong p-1 rounded-lg hover:bg-panel-3"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <form onSubmit={handleSavePrinter} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-bold uppercase text-ink-muted-3 mb-1">
                  Nombre Identificador *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Ticketera Cocina Caliente #1"
                  value={printerFormData.name}
                  onChange={(e) => setPrinterFormData({ ...printerFormData, name: e.target.value })}
                  className="w-full bg-panel-29 border border-edge-outline rounded-xl px-3 py-2 text-[13px] text-ink-strong focus:outline-none focus:border-edge-brand"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-ink-muted-3 mb-1">
                    Rol / Destino
                  </label>
                  <select
                    value={printerFormData.role}
                    onChange={(e) =>
                      setPrinterFormData({
                        ...printerFormData,
                        role: e.target.value as PrinterRole,
                      })
                    }
                    className="w-full bg-panel-29 border border-edge-outline rounded-xl px-3 py-2 text-[13px] text-ink-strong focus:outline-none"
                  >
                    <option value="cocina_caliente">Cocina Caliente (Pollos &amp; Parrillas)</option>
                    <option value="cocina_fria">Cocina Fría (Cevichería)</option>
                    <option value="barra">Barra &amp; Bebidas</option>
                    <option value="caja">Caja / Boleta</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-ink-muted-3 mb-1">
                    Empresa Asignada
                  </label>
                  <select
                    value={printerFormData.companyId}
                    onChange={(e) =>
                      setPrinterFormData({
                        ...printerFormData,
                        companyId: e.target.value as CompanyId | 'ambas',
                      })
                    }
                    className="w-full bg-panel-29 border border-edge-outline rounded-xl px-3 py-2 text-[13px] text-ink-strong focus:outline-none"
                  >
                    <option value="el-tayta">El Tayta</option>
                    <option value="el-sabroso">El Sabroso</option>
                    <option value="ambas">Ambas Empresas</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-ink-muted-3 mb-1">
                    Tipo de Conexión
                  </label>
                  <select
                    value={printerFormData.connectionType}
                    onChange={(e) =>
                      setPrinterFormData({
                        ...printerFormData,
                        connectionType: e.target.value as PrinterConnectionType,
                      })
                    }
                    className="w-full bg-panel-29 border border-edge-outline rounded-xl px-3 py-2 text-[13px] text-ink-strong focus:outline-none"
                  >
                    <option value="LAN_TCP">Red Ethernet (LAN / TCP IP)</option>
                    <option value="USB">USB Directo</option>
                    <option value="BLUETOOTH">Bluetooth Térmica</option>
                    <option value="BROWSER_PRINT">Impresión por Navegador</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-ink-muted-3 mb-1">
                    Ancho de Papel
                  </label>
                  <select
                    value={printerFormData.paperWidth}
                    onChange={(e) =>
                      setPrinterFormData({
                        ...printerFormData,
                        paperWidth: e.target.value as '80mm' | '58mm',
                      })
                    }
                    className="w-full bg-panel-29 border border-edge-outline rounded-xl px-3 py-2 text-[13px] text-ink-strong focus:outline-none"
                  >
                    <option value="80mm">80mm (Estándar POS)</option>
                    <option value="58mm">58mm (Móvil / Mini)</option>
                  </select>
                </div>
              </div>

              {printerFormData.connectionType === 'LAN_TCP' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-ink-muted-3 mb-1">
                      Dirección IP Estática
                    </label>
                    <input
                      type="text"
                      placeholder="192.168.1.200"
                      value={printerFormData.ipAddress}
                      onChange={(e) => setPrinterFormData({ ...printerFormData, ipAddress: e.target.value })}
                      className="w-full bg-panel-29 border border-edge-outline rounded-xl px-3 py-2 text-[13px] font-mono text-ink-strong focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-ink-muted-3 mb-1">
                      Puerto (Default 9100)
                    </label>
                    <input
                      type="number"
                      value={printerFormData.port}
                      onChange={(e) =>
                        setPrinterFormData({
                          ...printerFormData,
                          port: parseInt(e.target.value) || 9100,
                        })
                      }
                      className="w-full bg-panel-29 border border-edge-outline rounded-xl px-3 py-2 text-[13px] font-mono text-ink-strong focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-2 text-[12px] text-ink-muted-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={printerFormData.autoCut}
                    onChange={(e) => setPrinterFormData({ ...printerFormData, autoCut: e.target.checked })}
                    className="w-4 h-4 accent-accent-brand-solid"
                  />
                  <span>Corte Automático (AutoCut)</span>
                </label>

                <label className="flex items-center gap-2 text-[12px] text-ink-muted-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={printerFormData.beepOnPrint}
                    onChange={(e) => setPrinterFormData({ ...printerFormData, beepOnPrint: e.target.checked })}
                    className="w-4 h-4 accent-accent-brand-solid"
                  />
                  <span>Alerta Sonora (Buzzer)</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-edge-outline-5">
                <button
                  type="button"
                  onClick={() => setIsPrinterModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-[13px] font-bold text-ink-muted-2 hover:bg-panel-3"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-surface-brand-solid hover:bg-surface-brand-hover-alt text-ink-on-brand font-bold text-[13px] shadow-md"
                >
                  {editingPrinter ? 'Guardar Cambios' : 'Registrar Impresora'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
};
