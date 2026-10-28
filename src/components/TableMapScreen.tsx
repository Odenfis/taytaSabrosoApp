import React, { useState, useMemo, useEffect } from 'react';
import { usePOS } from '../context/POSContext';
import { Zone, TableStatus, Table, CompanyId } from '../types';
import { NewTableModal } from './NewTableModal';

export const TableMapScreen: React.FC = () => {
  const {
    tables,
    selectAndOpenTable,
    orders,
    activeCompanyId,
    activeCompany,
    openQuickOrder,
    currentUser,
  } = usePOS();

  const [selectedZone, setSelectedZone] = useState<Zone | 'Todos'>('Todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<TableStatus | 'all'>('all');
  const [isNewTableModalOpen, setIsNewTableModalOpen] = useState(false);

  useEffect(() => setSelectedZone('Todos'), [activeCompanyId]);

  const zones: { id: Zone | 'Todos'; label: string }[] = activeCompanyId !== 'el-sabroso' ? [
    { id: 'Todos', label: 'Todos' }, { id: 'Primer Piso', label: 'Primer Piso' },
    { id: 'Mezanine', label: 'Mezanine' }, { id: 'Jardín', label: 'Jardín' },
    { id: 'Terraza', label: 'Terraza' }, { id: 'Barra', label: 'Barra' },
    { id: 'Delivery', label: 'Delivery' }, { id: 'Llevar', label: 'Llevar' },
  ] : [
    { id: 'Todos', label: 'Todas las Zonas' }, { id: 'Salón Principal', label: 'Salón Principal' },
    { id: 'Zona Brasas', label: 'Zona Brasas' }, { id: 'Terraza', label: 'Terraza' }, { id: 'Barra', label: 'Barra' },
  ];

  // Filtered tables by active company, zone, status, and search
  const companyTables = useMemo(() => {
    if (activeCompanyId === 'todas') return tables;
    return tables.filter((t) => t.companyId === activeCompanyId);
  }, [tables, activeCompanyId]);

  const filteredTables = useMemo(() => {
    return companyTables.filter((table) => {
      const matchZone = selectedZone === 'Todos' || table.zone === selectedZone;
      const matchStatus = statusFilter === 'all' || table.status === statusFilter;
      const matchSearch =
        searchQuery === '' ||
        table.number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        table.zone.toLowerCase().includes(searchQuery.toLowerCase());
      return matchZone && matchStatus && matchSearch;
    });
  }, [companyTables, selectedZone, statusFilter, searchQuery]);

  // Counts
  const counts = useMemo(() => {
    const total = companyTables.length;
    const libres = companyTables.filter((t) => t.status === 'libre').length;
    const ocupadas = companyTables.filter((t) => t.status === 'ocupada').length;
    const porCobrar = companyTables.filter((t) => t.status === 'por_cobrar').length;
    return { total, libres, ocupadas, porCobrar };
  }, [companyTables]);

  return (
    <main
      id="table-map-canvas"
      className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col gap-5 bg-panel-4 select-none custom-scrollbar"
    >
      {/* Top Banner with Company Info and Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-panel-5 p-3.5 rounded-2xl border border-edge-outline-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-panel-6 border border-edge-outline flex items-center justify-center text-ink-brand">
            <span className="material-symbols-outlined">table_restaurant</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[17px] font-black text-ink-strong tracking-tight">
                Salón &amp; Mesas: {activeCompany.name}
              </h2>
            </div>
            <p className="text-[12px] text-ink-muted-3">
              Haz clic en una mesa libre para abrir comanda o en una mesa ocupada para gestionarla.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => openQuickOrder('Barra')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-panel-7 hover:bg-panel-8 text-ink-muted-2 hover:text-ink-strong border border-edge-outline-2 text-[12px] font-bold transition-all"
          >
            <span className="material-symbols-outlined text-[16px]">local_bar</span>
            <span>Venta Barra</span>
          </button>

          {activeCompanyId !== 'el-sabroso' && (['Delivery', 'Llevar'] as const).map((zone) => (
            <button key={zone} onClick={() => openQuickOrder(zone)}
              className="px-3 py-2 rounded-xl bg-panel-7 hover:bg-panel-8 border border-edge-outline-2 text-[12px] font-bold">
              + {zone}
            </button>
          ))}

          {(activeCompanyId === 'el-sabroso' || currentUser?.role === 'Administrador' || currentUser?.role === 'Coordinador') && <button
            onClick={() => setIsNewTableModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-brand-solid hover:bg-surface-brand-hover-bright text-ink-on-brand text-[12px] font-bold transition-all shadow-md"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            <span>Nueva Mesa</span>
          </button>}
        </div>
      </div>

      {/* Zone Tabs & Status Quick Filters */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3">
        {/* Zone Tabs */}
        <div className="flex gap-2 overflow-x-auto w-full lg:w-auto pb-1 hide-scrollbar">
          {zones.map((zone) => {
            const isSelected = selectedZone === zone.id;
            const zoneCount =
              zone.id === 'Todos'
                ? companyTables.length
                : companyTables.filter((t) => t.zone === zone.id).length;

            return (
              <button
                key={zone.id}
                id={`zone-tab-${zone.id.replace(/\s+/g, '-').toLowerCase()}`}
                onClick={() => setSelectedZone(zone.id)}
                className={`px-3.5 py-2 rounded-xl text-[13px] font-semibold whitespace-nowrap flex items-center gap-2 transition-all ${
                  isSelected
                    ? 'bg-surface-brand-solid text-ink-on-brand shadow-md font-bold'
                    : 'bg-panel-9 text-ink-muted-2 border border-edge-outline-3 hover:bg-panel-10'
                }`}
              >
                <span>{zone.label}</span>
                <span
                  className={`text-[11px] px-1.5 py-0.2 rounded-full font-bold ${
                    isSelected
                      ? 'bg-selection-counter text-ink-on-solid'
                      : 'bg-panel-12 text-ink-muted-3'
                  }`}
                >
                  {zoneCount}
                </span>
              </button>
            );
          })}
        </div>

        {/* Status Legend & Quick Filter */}
        <div className="flex items-center gap-2 text-[12px] font-medium bg-panel p-1.5 px-3 rounded-xl border border-edge-outline-2 w-full lg:w-auto overflow-x-auto">
          <button
            onClick={() => setStatusFilter(statusFilter === 'libre' ? 'all' : 'libre')}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors whitespace-nowrap ${
              statusFilter === 'libre' ? 'bg-surface-info ring-1 ring-edge-info' : 'hover:bg-panel-3'
            }`}
          >
            <div className="w-2.5 h-2.5 rounded-full bg-surface-info-2"></div>
            <span className="text-ink-body">Libre ({counts.libres})</span>
          </button>

          <button
            onClick={() => setStatusFilter(statusFilter === 'ocupada' ? 'all' : 'ocupada')}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors whitespace-nowrap ${
              statusFilter === 'ocupada' ? 'bg-surface-danger ring-1 ring-edge-danger' : 'hover:bg-panel-3'
            }`}
          >
            <div className="w-2.5 h-2.5 rounded-full bg-surface-danger-2"></div>
            <span className="text-ink-body">Ocupada ({counts.ocupadas})</span>
          </button>

          <button
            onClick={() => setStatusFilter(statusFilter === 'por_cobrar' ? 'all' : 'por_cobrar')}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors whitespace-nowrap ${
              statusFilter === 'por_cobrar' ? 'bg-surface-gold ring-1 ring-edge-gold' : 'hover:bg-panel-3'
            }`}
          >
            <div className="w-2.5 h-2.5 rounded-full bg-surface-gold-2"></div>
            <span className="text-ink-body">Por Cobrar ({counts.porCobrar})</span>
          </button>

          {statusFilter !== 'all' && (
            <button
              onClick={() => setStatusFilter('all')}
              className="text-ink-muted-2 hover:text-ink-body text-[11px] underline ml-1"
            >
              Ver Todas
            </button>
          )}
        </div>
      </div>

      {/* Tables Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5 pb-20">
        {filteredTables.map((table) => {
          const order = table.currentOrderId ? orders[table.currentOrderId] : null;
          const isOccupied = table.status === 'ocupada';
          const isBilling = table.status === 'por_cobrar';
          const isFree = table.status === 'libre';

          return (
            <button
              key={table.id}
              id={`table-card-${table.id}`}
              onClick={() => selectAndOpenTable(table.id)}
              className={`aspect-square bg-panel-13 border rounded-2xl flex flex-col items-center justify-between p-3.5 relative overflow-hidden transition-all duration-150 active:scale-95 group text-center cursor-pointer ${
                isFree
                  ? 'border-edge-outline-4 hover:bg-panel-3 hover:border-edge-info-2 shadow-sm'
                  : isOccupied
                  ? 'border-edge-danger-2 hover:bg-panel-3 shadow-ui-1 ring-1 ring-edge-danger-3'
                  : 'border-edge-gold-2 hover:bg-panel-3 shadow-ui-2 ring-1 ring-edge-gold-3'
              }`}
            >
              {/* Status Indicator Stripe */}
              <div
                className={`absolute top-0 left-0 w-full ${
                  isFree
                    ? 'h-1 bg-surface-info-2'
                    : isOccupied
                    ? 'h-1.5 bg-surface-danger-2'
                    : 'h-2 bg-surface-gold-2'
                }`}
              />

              {/* Table Header Row */}
              <div className="w-full flex justify-between items-start pt-1">
                <span className="text-[10px] font-bold text-ink-muted-3 uppercase tracking-wider">
                  {table.zone === 'Barra' ? 'SILLA' : table.zone === 'Delivery' || table.zone === 'Llevar' ? 'PEDIDO' : 'MESA'}
                </span>

                {activeCompanyId === 'todas' && (
                  <span
                    className={`text-[9px] font-black px-1.5 py-0.2 rounded ${
                      table.companyId === 'el-tayta'
                        ? 'bg-surface-brand-solid text-ink-on-brand'
                        : 'bg-surface-gold-2 text-ink-foreground'
                    }`}
                  >
                    {table.companyId === 'el-tayta' ? 'Tayta' : 'Sabroso'}
                  </span>
                )}

                <div className="flex items-center gap-0.5 text-ink-muted-2 text-[11px] bg-panel px-1.5 py-0.5 rounded-full border border-edge-outline-5">
                  <span className="material-symbols-outlined text-[13px]">group</span>
                  <span>{table.capacity}</span>
                </div>
              </div>

              {/* Center Table Big Display */}
              <div className="flex flex-col items-center justify-center my-auto">
                <span className="text-[32px] md:text-[36px] font-black text-ink-body tracking-tight leading-none group-hover:text-ink-brand transition-colors">
                  {table.number}
                </span>

                {isFree ? (
                  <span className="text-[11px] font-semibold text-ink-info mt-1.5 bg-surface-info-3 px-2 py-0.5 rounded-full border border-edge-info-3">
                    Libre
                  </span>
                ) : isOccupied ? (
                  <div className="flex items-center gap-1 text-[11px] font-bold text-ink-danger mt-1 bg-surface-danger-3 px-2 py-0.5 rounded-full border border-edge-danger-4">
                    <span className="material-symbols-outlined text-[12px]">timer</span>
                    <span>{table.minutesElapsed || 35}m</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-[11px] font-bold text-ink-gold mt-1 bg-surface-gold-3 px-2 py-0.5 rounded-full border border-edge-gold-4">
                    <span className="material-symbols-outlined text-[12px]">payments</span>
                    <span>Por Cobrar</span>
                  </div>
                )}
              </div>

              {/* Bottom Footer: Amount and Items */}
              <div className="w-full pt-2 border-t border-edge-outline-5 flex justify-between items-center text-[11px]">
                {order && order.total > 0 ? (
                  <>
                    <span className="text-ink-muted-3 font-medium">
                      {order.items.reduce((s, i) => s + i.quantity, 0)} ítems
                    </span>
                    <span className="font-bold text-ink-gold text-[13px] font-mono">
                      S/ {order.total.toFixed(2)}
                    </span>
                  </>
                ) : (
                  <span className="text-ink-muted-4 text-[11px] w-full text-center">
                    Disponible
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* New Table Modal */}
      {isNewTableModalOpen && (
        <NewTableModal onClose={() => setIsNewTableModalOpen(false)} />
      )}
    </main>
  );
};
