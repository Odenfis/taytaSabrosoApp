import React, { useState } from 'react';
import { usePOS } from '../context/POSContext';
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
    setCurrentScreen,
  } = usePOS();

  const printerList = printers || thermalPrinters || [];
  const handleAddPrinter = addPrinter || addThermalPrinter;
  const handleUpdatePrinter = updatePrinter || updateThermalPrinter;
  const handleDeletePrinter = deletePrinter || deleteThermalPrinter;

  const [activeTab, setActiveTab] = useState<'empresa' | 'impresoras' | 'offline' | 'mantenimiento'>('impresoras');
  const [isSaved, setIsSaved] = useState(false);

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
      className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col gap-5 bg-[#121212] select-none"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[24px] text-[#ffb597]">settings</span>
            <h2 className="text-[20px] md:text-[24px] font-bold text-[#ffb597] tracking-tight">
              Configuración del Sistema Multiempresa
            </h2>
          </div>
          <p className="text-[13px] text-[#dac1b8]/80 mt-0.5">
            Gestión de impresoras térmicas, conectividad offline, datos de locales y mantenimiento
          </p>
        </div>

        {/* Quick link to Bank Accounts */}
        <button
          onClick={() => setCurrentScreen('bancos')}
          className="px-3.5 py-2 rounded-xl bg-[#202020] hover:bg-[#2a2a2a] border border-[#54433c] text-[#ffdbcd] text-[13px] font-bold flex items-center gap-2 transition-all shadow-sm"
        >
          <span className="material-symbols-outlined text-[18px] text-[#ebc246]">account_balance</span>
          <span>Ir a Cuentas Bancarias</span>
        </button>
      </div>

      {isSaved && (
        <div className="bg-[#60d4fb]/10 border border-[#60d4fb]/40 rounded-xl p-3.5 text-[#60d4fb] text-[13px] font-semibold flex items-center gap-2 animate-in fade-in">
          <span className="material-symbols-outlined text-[18px]">check_circle</span>
          <span>Ajustes guardados correctamente.</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-[#54433c]/40 pb-2">
        <button
          onClick={() => setActiveTab('impresoras')}
          className={`px-4 py-2 rounded-xl text-[13px] font-bold transition-all flex items-center gap-2 ${
            activeTab === 'impresoras'
              ? 'bg-[#823b19] text-[#ffdbcd] shadow-sm'
              : 'text-[#dac1b8]/70 hover:text-white hover:bg-[#202020]'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">print</span>
          Impresoras Térmicas ({printerList.length})
        </button>

        <button
          onClick={() => setActiveTab('offline')}
          className={`px-4 py-2 rounded-xl text-[13px] font-bold transition-all flex items-center gap-2 ${
            activeTab === 'offline'
              ? 'bg-[#823b19] text-[#ffdbcd] shadow-sm'
              : 'text-[#dac1b8]/70 hover:text-white hover:bg-[#202020]'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">wifi_off</span>
          Modo Offline &amp; Resiliencia
        </button>

        <button
          onClick={() => setActiveTab('empresa')}
          className={`px-4 py-2 rounded-xl text-[13px] font-bold transition-all flex items-center gap-2 ${
            activeTab === 'empresa'
              ? 'bg-[#823b19] text-[#ffdbcd] shadow-sm'
              : 'text-[#dac1b8]/70 hover:text-white hover:bg-[#202020]'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">store</span>
          Datos de Locales &amp; RUC
        </button>

        <button
          onClick={() => setActiveTab('mantenimiento')}
          className={`px-4 py-2 rounded-xl text-[13px] font-bold transition-all flex items-center gap-2 ${
            activeTab === 'mantenimiento'
              ? 'bg-[#823b19] text-[#ffdbcd] shadow-sm'
              : 'text-[#dac1b8]/70 hover:text-white hover:bg-[#202020]'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">restart_alt</span>
          Mantenimiento &amp; Reset Demo
        </button>
      </div>

      {/* Tab: Impresoras Térmicas */}
      {activeTab === 'impresoras' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-[#181717] p-4 rounded-2xl border border-[#54433c]/50">
            <div>
              <h3 className="text-[16px] font-bold text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-[#ebc246]">receipt</span>
                Red de Impresoras Térmicas (ESC/POS)
              </h3>
              <p className="text-[12px] text-[#dac1b8]/70">
                Enrutamiento automático de comandas de cocina caliente, cevichería, barra y tickets de caja
              </p>
            </div>
            <button
              onClick={openNewPrinterModal}
              className="px-4 py-2 rounded-xl bg-[#823b19] hover:bg-[#9a451e] text-[#ffdbcd] font-bold text-[13px] flex items-center gap-2 shadow-md transition-all shrink-0"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              Agregar Impresora
            </button>
          </div>

          {printerList.length === 0 ? (
            <div className="bg-[#181717] border border-[#54433c]/40 rounded-2xl p-8 text-center">
              <span className="material-symbols-outlined text-4xl text-[#dac1b8]/40 mb-2">print_disabled</span>
              <p className="text-white font-bold">No hay impresoras configuradas</p>
              <p className="text-xs text-[#dac1b8]/60 mt-1">Haga clic en &quot;Agregar Impresora&quot; para registrar un terminal térmico ESC/POS.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {printerList.map((printer) => (
                <div
                  key={printer.id}
                  className="bg-[#1c1b1b] border border-[#54433c]/60 hover:border-[#ffb597]/50 rounded-2xl p-4 sm:p-5 flex flex-col justify-between shadow-lg transition-all"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#242323] border border-[#54433c] flex items-center justify-center text-[#ffb597]">
                          <span className="material-symbols-outlined text-[24px]">print</span>
                        </div>
                        <div>
                          <h4 className="text-[16px] font-bold text-white leading-tight">{printer.name}</h4>
                          <span className="text-[11px] text-[#dac1b8]/70">{getRoleLabel(printer.role)}</span>
                        </div>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 ${
                          printer.status === 'online'
                            ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/40'
                            : 'bg-rose-950/60 text-rose-300 border border-rose-500/40'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            printer.status === 'online' ? 'bg-emerald-400' : 'bg-rose-400'
                          }`}
                        />
                        {printer.status === 'online' ? 'En Línea' : 'Desconectada'}
                      </span>
                    </div>

                    <div className="bg-[#141313] p-3 rounded-xl border border-[#54433c]/40 space-y-2 text-[12px] mb-3">
                      <div className="flex justify-between">
                        <span className="text-[#dac1b8]/60 font-semibold">Conexión:</span>
                        <span className="font-mono text-[#ffb597]">
                          {printer.connectionType} {printer.ipAddress ? `(${printer.ipAddress}:${printer.port})` : ''}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#dac1b8]/60 font-semibold">Ancho de Papel:</span>
                        <span className="text-white font-medium">{printer.paperWidth}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#dac1b8]/60 font-semibold">Corte Automático:</span>
                        <span className="text-emerald-400">{printer.autoCut ? 'Activado' : 'Manual'}</span>
                      </div>
                      <div>
                        <span className="text-[#dac1b8]/60 font-semibold block mb-1">Categorías Asignadas:</span>
                        <div className="flex flex-wrap gap-1">
                          {(printer.categoriesMapped || []).map((cat, idx) => (
                            <span
                              key={idx}
                              className="bg-[#242323] text-[#dac1b8] text-[10px] font-medium px-2 py-0.5 rounded border border-[#54433c]/30"
                            >
                              {cat}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#54433c]/40 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => testPrint(printer.id)}
                      className="px-3 py-1.5 rounded-xl bg-[#242323] hover:bg-[#2d2c2c] border border-[#54433c] text-[#ffdbcd] text-[12px] font-bold flex items-center gap-1.5 transition-all"
                    >
                      <span className="material-symbols-outlined text-[15px] text-[#ebc246]">play_arrow</span>
                      Probar Impresión
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEditPrinterModal(printer)}
                        className="text-[#dac1b8]/70 hover:text-white p-1.5 rounded-lg hover:bg-[#2a2a2a] transition-colors"
                        title="Editar configuración"
                      >
                        <span className="material-symbols-outlined text-[18px]">edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeletePrinter?.(printer.id)}
                        className="text-rose-400/70 hover:text-rose-300 p-1.5 rounded-lg hover:bg-rose-950/40 transition-colors"
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
        <div className="bg-[#1c1b1b] border border-[#54433c]/60 rounded-2xl p-5 sm:p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center border ${
                  offlineState.isOnline
                    ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-400'
                    : 'bg-amber-950/50 border-amber-500/40 text-amber-400'
                }`}
              >
                <span className="material-symbols-outlined text-[28px]">
                  {offlineState.isOnline ? 'wifi' : 'wifi_off'}
                </span>
              </div>
              <div>
                <h3 className="text-[17px] font-bold text-white">
                  Motor de Persistencia Local &amp; Desconexión
                </h3>
                <p className="text-[13px] text-[#dac1b8]/70">
                  Estado actual: <strong className={offlineState.isOnline ? 'text-emerald-400' : 'text-amber-400'}>
                    {offlineState.isOnline ? 'Conectado al Servidor (Online)' : 'Modo Autónomo Local (Offline)'}
                  </strong>
                </p>
              </div>
            </div>

            <button
              onClick={toggleSimulatedOffline}
              className={`px-4 py-2 rounded-xl text-[12px] font-bold border transition-all ${
                offlineState.isOnline
                  ? 'bg-amber-950/60 border-amber-500/50 text-amber-300 hover:bg-amber-900/60'
                  : 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300 hover:bg-emerald-900/60'
              }`}
            >
              {offlineState.isOnline ? 'Simular Corte de Internet' : 'Reconectar Internet'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-[#141313] p-4 rounded-xl border border-[#54433c]/40 text-center">
              <span className="text-[11px] uppercase font-semibold text-[#dac1b8]/60">Operaciones en Cola Local</span>
              <p className="text-[24px] font-black text-white mt-1">{offlineState.pendingSyncCount}</p>
            </div>
            <div className="bg-[#141313] p-4 rounded-xl border border-[#54433c]/40 text-center">
              <span className="text-[11px] uppercase font-semibold text-[#dac1b8]/60">Última Sincronización</span>
              <p className="text-[16px] font-bold text-[#ebc246] mt-2">{offlineState.lastSyncTime}</p>
            </div>
            <div className="bg-[#141313] p-4 rounded-xl border border-[#54433c]/40 text-center flex flex-col justify-center">
              <button
                onClick={syncOfflineQueue}
                className="px-3 py-2 rounded-xl bg-[#823b19] hover:bg-[#9a451e] text-[#ffdbcd] font-bold text-[12px] flex items-center justify-center gap-1.5 shadow"
              >
                <span className="material-symbols-outlined text-[16px]">cloud_sync</span>
                Forzar Sincronización
              </button>
            </div>
          </div>

          <div className="bg-[#141313] p-4 rounded-xl border border-[#54433c]/50 space-y-2 text-[12px] text-[#dac1b8]/80">
            <h4 className="font-bold text-[#ffdbcd] flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-[#ebc246]">verified</span>
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
          <div className="bg-[#1c1b1b] border border-[#54433c]/60 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2.5 pb-2 border-b border-[#54433c]/40">
              <span className="w-3 h-3 rounded-full bg-[#ffb597]" />
              <h3 className="text-[17px] font-bold text-white">El Tayta (Criollo &amp; Marino)</h3>
            </div>
            <div className="space-y-2 text-[13px]">
              <div>
                <span className="text-[#dac1b8]/60 block text-[11px] font-bold uppercase">Razón Social</span>
                <p className="font-semibold text-white">El Tayta Gastronomía Peruana S.A.C.</p>
              </div>
              <div>
                <span className="text-[#dac1b8]/60 block text-[11px] font-bold uppercase">R.U.C.</span>
                <p className="font-mono text-white">20601234567</p>
              </div>
              <div>
                <span className="text-[#dac1b8]/60 block text-[11px] font-bold uppercase">Dirección Sede</span>
                <p className="text-white">Av. Javier Prado Este 1420, San Borja, Lima</p>
              </div>
              <div>
                <span className="text-[#dac1b8]/60 block text-[11px] font-bold uppercase">Especialidad</span>
                <p className="text-[#ffb597]">Cevichería tradicional, mariscos y comida criolla</p>
              </div>
            </div>
          </div>

          <div className="bg-[#1c1b1b] border border-[#54433c]/60 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2.5 pb-2 border-b border-[#54433c]/40">
              <span className="w-3 h-3 rounded-full bg-[#ebc246]" />
              <h3 className="text-[17px] font-bold text-white">El Sabroso (Brasas &amp; Parrillas)</h3>
            </div>
            <div className="space-y-2 text-[13px]">
              <div>
                <span className="text-[#dac1b8]/60 block text-[11px] font-bold uppercase">Razón Social</span>
                <p className="font-semibold text-white">El Sabroso Brasas &amp; Parrillas E.I.R.L.</p>
              </div>
              <div>
                <span className="text-[#dac1b8]/60 block text-[11px] font-bold uppercase">R.U.C.</span>
                <p className="font-mono text-white">20609876543</p>
              </div>
              <div>
                <span className="text-[#dac1b8]/60 block text-[11px] font-bold uppercase">Dirección Sede</span>
                <p className="text-white">Av. Las Palmeras 890, Los Olivos, Lima</p>
              </div>
              <div>
                <span className="text-[#dac1b8]/60 block text-[11px] font-bold uppercase">Especialidad</span>
                <p className="text-[#ebc246]">Pollería a la leña, cortes a la parrilla y anticuchos</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Mantenimiento */}
      {activeTab === 'mantenimiento' && (
        <div className="bg-[#1c1b1b] border border-[#54433c]/60 rounded-2xl p-5 space-y-4">
          <h3 className="text-[16px] font-bold text-[#ffb4ab] flex items-center gap-2">
            <span className="material-symbols-outlined text-[#ffb4ab]">restart_alt</span>
            Datos y Mantenimiento de Prueba
          </h3>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <span className="text-[14px] font-semibold text-[#e5e2e1] block">
                Restaurar Datos de Demostración
              </span>
              <p className="text-[12px] text-[#dac1b8]/70">
                Reinicia mesas, pedidos activos, cuentas bancarias, insumos y transacciones a su estado demo original.
              </p>
            </div>

            <button
              type="button"
              onClick={resetToDemoData}
              className="bg-[#3b1219] hover:bg-[#521923] text-[#ffb4ab] border border-[#ffb4ab]/40 px-4 py-2 rounded-xl text-[13px] font-bold transition-all active:scale-95 cursor-pointer shrink-0"
            >
              Restablecer Demo
            </button>
          </div>
        </div>
      )}

      {/* Modal: Add/Edit Thermal Printer */}
      {isPrinterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[#1c1b1b] border border-[#54433c] rounded-2xl w-full max-w-lg p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#54433c]/60 pb-3">
              <h3 className="text-[17px] font-bold text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-[#ebc246]">print</span>
                {editingPrinter ? 'Editar Impresora Térmica' : 'Registrar Nueva Impresora'}
              </h3>
              <button
                onClick={() => setIsPrinterModalOpen(false)}
                className="text-[#dac1b8]/60 hover:text-white p-1 rounded-lg hover:bg-[#2a2a2a]"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <form onSubmit={handleSavePrinter} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-bold uppercase text-[#dac1b8]/70 mb-1">
                  Nombre Identificador *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Ticketera Cocina Caliente #1"
                  value={printerFormData.name}
                  onChange={(e) => setPrinterFormData({ ...printerFormData, name: e.target.value })}
                  className="w-full bg-[#141313] border border-[#54433c] rounded-xl px-3 py-2 text-[13px] text-white focus:outline-none focus:border-[#ffb597]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-[#dac1b8]/70 mb-1">
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
                    className="w-full bg-[#141313] border border-[#54433c] rounded-xl px-3 py-2 text-[13px] text-white focus:outline-none"
                  >
                    <option value="cocina_caliente">Cocina Caliente (Pollos &amp; Parrillas)</option>
                    <option value="cocina_fria">Cocina Fría (Cevichería)</option>
                    <option value="barra">Barra &amp; Bebidas</option>
                    <option value="caja">Caja / Boleta</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-[#dac1b8]/70 mb-1">
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
                    className="w-full bg-[#141313] border border-[#54433c] rounded-xl px-3 py-2 text-[13px] text-white focus:outline-none"
                  >
                    <option value="el-tayta">El Tayta</option>
                    <option value="el-sabroso">El Sabroso</option>
                    <option value="ambas">Ambas Empresas</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-[#dac1b8]/70 mb-1">
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
                    className="w-full bg-[#141313] border border-[#54433c] rounded-xl px-3 py-2 text-[13px] text-white focus:outline-none"
                  >
                    <option value="LAN_TCP">Red Ethernet (LAN / TCP IP)</option>
                    <option value="USB">USB Directo</option>
                    <option value="BLUETOOTH">Bluetooth Térmica</option>
                    <option value="BROWSER_PRINT">Impresión por Navegador</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-[#dac1b8]/70 mb-1">
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
                    className="w-full bg-[#141313] border border-[#54433c] rounded-xl px-3 py-2 text-[13px] text-white focus:outline-none"
                  >
                    <option value="80mm">80mm (Estándar POS)</option>
                    <option value="58mm">58mm (Móvil / Mini)</option>
                  </select>
                </div>
              </div>

              {printerFormData.connectionType === 'LAN_TCP' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-[#dac1b8]/70 mb-1">
                      Dirección IP Estática
                    </label>
                    <input
                      type="text"
                      placeholder="192.168.1.200"
                      value={printerFormData.ipAddress}
                      onChange={(e) => setPrinterFormData({ ...printerFormData, ipAddress: e.target.value })}
                      className="w-full bg-[#141313] border border-[#54433c] rounded-xl px-3 py-2 text-[13px] font-mono text-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-[#dac1b8]/70 mb-1">
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
                      className="w-full bg-[#141313] border border-[#54433c] rounded-xl px-3 py-2 text-[13px] font-mono text-white focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-2 text-[12px] text-[#dac1b8] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={printerFormData.autoCut}
                    onChange={(e) => setPrinterFormData({ ...printerFormData, autoCut: e.target.checked })}
                    className="w-4 h-4 accent-[#823b19]"
                  />
                  <span>Corte Automático (AutoCut)</span>
                </label>

                <label className="flex items-center gap-2 text-[12px] text-[#dac1b8] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={printerFormData.beepOnPrint}
                    onChange={(e) => setPrinterFormData({ ...printerFormData, beepOnPrint: e.target.checked })}
                    className="w-4 h-4 accent-[#823b19]"
                  />
                  <span>Alerta Sonora (Buzzer)</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#54433c]/40">
                <button
                  type="button"
                  onClick={() => setIsPrinterModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-[13px] font-bold text-[#dac1b8] hover:bg-[#2a2a2a]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#823b19] hover:bg-[#9a451e] text-[#ffdbcd] font-bold text-[13px] shadow-md"
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
