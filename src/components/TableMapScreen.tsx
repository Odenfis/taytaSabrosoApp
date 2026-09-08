import React, { useState, useMemo } from 'react';
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
  } = usePOS();

  const [selectedZone, setSelectedZone] = useState<Zone | 'Todos'>('Todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<TableStatus | 'all'>('all');
  const [isNewTableModalOpen, setIsNewTableModalOpen] = useState(false);

  const zones: { id: Zone | 'Todos'; label: string }[] = [
    { id: 'Todos', label: 'Todas las Zonas' },
    { id: 'Salón Principal', label: 'Salón Principal' },
    { id: 'Zona Brasas', label: 'Zona Brasas' },
    { id: 'Terraza', label: 'Terraza' },
    { id: 'Barra', label: 'Barra' },
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
      className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col gap-5 bg-[#121212] select-none custom-scrollbar"
    >
      {/* Top Banner with Company Info and Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#191817] p-3.5 rounded-2xl border border-[#54433c]/50">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-[#282625] border border-[#54433c] flex items-center justify-center text-[#ffb597]">
            <span className="material-symbols-outlined">table_restaurant</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[17px] font-black text-white tracking-tight">
                Salón &amp; Mesas: {activeCompany.name}
              </h2>
            </div>
            <p className="text-[12px] text-[#dac1b8]/70">
              Haz clic en una mesa libre para abrir comanda o en una mesa ocupada para gestionarla.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => openQuickOrder('Barra')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#2a2827] hover:bg-[#383533] text-[#dac1b8] hover:text-white border border-[#54433c]/60 text-[12px] font-bold transition-all"
          >
            <span className="material-symbols-outlined text-[16px]">local_bar</span>
            <span>Venta Barra</span>
          </button>

          <button
            onClick={() => setIsNewTableModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#823b19] hover:bg-[#9a471f] text-[#ffdbcd] text-[12px] font-bold transition-all shadow-md"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            <span>Nueva Mesa</span>
          </button>
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
                    ? 'bg-[#823b19] text-[#ffdbcd] shadow-md font-bold'
                    : 'bg-[#201f1e] text-[#dac1b8] border border-[#54433c]/50 hover:bg-[#2a2928]'
                }`}
              >
                <span>{zone.label}</span>
                <span
                  className={`text-[11px] px-1.5 py-0.2 rounded-full font-bold ${
                    isSelected
                      ? 'bg-[#3d2f00]/30 text-white'
                      : 'bg-[#151414] text-[#dac1b8]/70'
                  }`}
                >
                  {zoneCount}
                </span>
              </button>
            );
          })}
        </div>

        {/* Status Legend & Quick Filter */}
        <div className="flex items-center gap-2 text-[12px] font-medium bg-[#1c1b1b] p-1.5 px-3 rounded-xl border border-[#54433c]/60 w-full lg:w-auto overflow-x-auto">
          <button
            onClick={() => setStatusFilter(statusFilter === 'libre' ? 'all' : 'libre')}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors whitespace-nowrap ${
              statusFilter === 'libre' ? 'bg-[#60d4fb]/20 ring-1 ring-[#60d4fb]' : 'hover:bg-[#2a2a2a]'
            }`}
          >
            <div className="w-2.5 h-2.5 rounded-full bg-[#60d4fb]"></div>
            <span className="text-[#e5e2e1]">Libre ({counts.libres})</span>
          </button>

          <button
            onClick={() => setStatusFilter(statusFilter === 'ocupada' ? 'all' : 'ocupada')}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors whitespace-nowrap ${
              statusFilter === 'ocupada' ? 'bg-[#ffb4ab]/20 ring-1 ring-[#ffb4ab]' : 'hover:bg-[#2a2a2a]'
            }`}
          >
            <div className="w-2.5 h-2.5 rounded-full bg-[#ffb4ab]"></div>
            <span className="text-[#e5e2e1]">Ocupada ({counts.ocupadas})</span>
          </button>

          <button
            onClick={() => setStatusFilter(statusFilter === 'por_cobrar' ? 'all' : 'por_cobrar')}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors whitespace-nowrap ${
              statusFilter === 'por_cobrar' ? 'bg-[#ebc246]/20 ring-1 ring-[#ebc246]' : 'hover:bg-[#2a2a2a]'
            }`}
          >
            <div className="w-2.5 h-2.5 rounded-full bg-[#ebc246]"></div>
            <span className="text-[#e5e2e1]">Por Cobrar ({counts.porCobrar})</span>
          </button>

          {statusFilter !== 'all' && (
            <button
              onClick={() => setStatusFilter('all')}
              className="text-[#dac1b8] hover:text-[#e5e2e1] text-[11px] underline ml-1"
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
              className={`aspect-square bg-[#20201f] border rounded-2xl flex flex-col items-center justify-between p-3.5 relative overflow-hidden transition-all duration-150 active:scale-95 group text-center cursor-pointer ${
                isFree
                  ? 'border-[#54433c]/80 hover:bg-[#2a2a2a] hover:border-[#60d4fb]/50 shadow-sm'
                  : isOccupied
                  ? 'border-[#ffb4ab]/80 hover:bg-[#2a2a2a] shadow-[0px_6px_20px_rgba(255,180,171,0.15)] ring-1 ring-[#ffb4ab]/30'
                  : 'border-[#ebc246] hover:bg-[#2a2a2a] shadow-[0px_6px_20px_rgba(235,194,70,0.2)] ring-1 ring-[#ebc246]/40'
              }`}
            >
              {/* Status Indicator Stripe */}
              <div
                className={`absolute top-0 left-0 w-full ${
                  isFree
                    ? 'h-1 bg-[#60d4fb]'
                    : isOccupied
                    ? 'h-1.5 bg-[#ffb4ab]'
                    : 'h-2 bg-[#ebc246]'
                }`}
              />

              {/* Table Header Row */}
              <div className="w-full flex justify-between items-start pt-1">
                <span className="text-[10px] font-bold text-[#dac1b8]/70 uppercase tracking-wider">
                  {table.zone.includes('Barra') ? 'BARRA' : 'MESA'}
                </span>

                {activeCompanyId === 'todas' && (
                  <span
                    className={`text-[9px] font-black px-1.5 py-0.2 rounded ${
                      table.companyId === 'el-tayta'
                        ? 'bg-[#823b19] text-[#ffdbcd]'
                        : 'bg-[#ebc246] text-[#352800]'
                    }`}
                  >
                    {table.companyId === 'el-tayta' ? 'Tayta' : 'Sabroso'}
                  </span>
                )}

                <div className="flex items-center gap-0.5 text-[#dac1b8] text-[11px] bg-[#1c1b1b] px-1.5 py-0.5 rounded-full border border-[#54433c]/40">
                  <span className="material-symbols-outlined text-[13px]">group</span>
                  <span>{table.capacity}</span>
                </div>
              </div>

              {/* Center Table Big Display */}
              <div className="flex flex-col items-center justify-center my-auto">
                <span className="text-[32px] md:text-[36px] font-black text-[#e5e2e1] tracking-tight leading-none group-hover:text-[#ffb597] transition-colors">
                  {table.number}
                </span>

                {isFree ? (
                  <span className="text-[11px] font-semibold text-[#60d4fb] mt-1.5 bg-[#60d4fb]/10 px-2 py-0.5 rounded-full border border-[#60d4fb]/30">
                    Libre
                  </span>
                ) : isOccupied ? (
                  <div className="flex items-center gap-1 text-[11px] font-bold text-[#ffb4ab] mt-1 bg-[#ffb4ab]/10 px-2 py-0.5 rounded-full border border-[#ffb4ab]/30">
                    <span className="material-symbols-outlined text-[12px]">timer</span>
                    <span>{table.minutesElapsed || 35}m</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-[11px] font-bold text-[#ebc246] mt-1 bg-[#ebc246]/10 px-2 py-0.5 rounded-full border border-[#ebc246]/30">
                    <span className="material-symbols-outlined text-[12px]">payments</span>
                    <span>Por Cobrar</span>
                  </div>
                )}
              </div>

              {/* Bottom Footer: Amount and Items */}
              <div className="w-full pt-2 border-t border-[#54433c]/40 flex justify-between items-center text-[11px]">
                {order && order.total > 0 ? (
                  <>
                    <span className="text-[#dac1b8]/70 font-medium">
                      {order.items.reduce((s, i) => s + i.quantity, 0)} ítems
                    </span>
                    <span className="font-bold text-[#ebc246] text-[13px] font-mono">
                      S/ {order.total.toFixed(2)}
                    </span>
                  </>
                ) : (
                  <span className="text-[#dac1b8]/50 text-[11px] w-full text-center">
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
