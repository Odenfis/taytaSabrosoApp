import React, { useState, useMemo } from 'react';
import { usePOS } from '../context/POSContext';
import { ProductCategory, Product, OrderItem } from '../types';
import { ItemNotesModal } from './ItemNotesModal';

export const OrderTakingScreen: React.FC = () => {
  const {
    selectedTableId,
    tables,
    products,
    orders,
    addItemToOrder,
    updateItemQuantity,
    updateItemNotes,
    removeItemFromOrder,
    sendToKitchen,
    proceedToPayment,
    confirmDispatchAndProceed,
    dismissKitchenConfirm,
    pendingKitchenConfirm,
    setCurrentScreen,
    currentUser,
  } = usePOS();

  const [selectedCategory, setSelectedCategory] = useState<ProductCategory | 'todos'>('platos');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingNoteItem, setEditingNoteItem] = useState<{ id: string; name: string; notes: string } | null>(null);
  const [isDispatchingKitchen, setIsDispatchingKitchen] = useState(false);

  // Active table
  const currentTable = useMemo(() => {
    return tables.find((t) => t.id === selectedTableId) || tables[0];
  }, [tables, selectedTableId]);

  // Current order for this table
  const currentOrder = useMemo(() => {
    if (!currentTable || !currentTable.currentOrderId) return null;
    return orders[currentTable.currentOrderId] || null;
  }, [currentTable, orders]);

  const categories: { id: ProductCategory | 'todos'; label: string }[] = [
    { id: 'platos', label: 'Platos de Fondo' },
    { id: 'entradas', label: 'Entradas' },
    { id: 'brasas', label: 'Brasas' },
    { id: 'bebidas', label: 'Bebidas' },
    { id: 'postres', label: 'Postres' },
    { id: 'todos', label: 'Todos' },
  ];

  // Filtered products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchCat = selectedCategory === 'todos' || p.category === selectedCategory;
      const matchSearch =
        searchQuery === '' ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description.toLowerCase().includes(searchQuery.toLowerCase());
      return !p.isDeleted && p.companyId === currentTable?.companyId && matchCat && matchSearch;
    });
  }, [products, selectedCategory, searchQuery, currentTable?.companyId]);

  const orderItems = currentOrder?.items || [];
  const totalItemCount = orderItems.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <div id="order-taking-screen" className="flex-1 flex flex-col h-full w-full overflow-hidden select-none bg-panel-4">
      {/* Top Header Bar for Order Taking */}
      <header className="bg-panel-35 border-b border-edge-outline-2 w-full h-16 flex justify-between items-center px-4 md:px-6 shrink-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            id="btn-back-to-tables"
            onClick={() => setCurrentScreen('mesas')}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-panel-3 text-ink-muted-2 hover:text-ink-body transition-colors"
            title="Volver a Mesas"
          >
            <span className="material-symbols-outlined text-[24px]">arrow_back</span>
          </button>
          <div>
            <h1 className="text-[18px] md:text-[20px] font-bold text-ink-brand tracking-tight flex items-center gap-2">
              <span>Mesa {currentTable?.number || '01'}</span>
              <span className="text-[12px] font-normal text-ink-muted-3 bg-panel-13 px-2 py-0.5 rounded-full border border-edge-outline-5">
                {currentTable?.zone}
              </span>
            </h1>
            <p className="text-[12px] text-ink-muted-5">
              {currentTable?.waiter || currentUser?.name || 'Carlos M.'} (Mesero)
            </p>
          </div>
        </div>

        {/* Search Input in Top Bar */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-ink-muted pointer-events-none">
              <span className="material-symbols-outlined text-[18px]">search</span>
            </span>
            <input
              type="text"
              placeholder="Buscar plato o bebida..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-panel-13 border border-edge-outline-2 rounded-full pl-9 pr-3 py-1.5 text-[13px] text-ink-body focus:border-edge-info-6 focus:outline-none w-36 sm:w-60 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 flex items-center pr-2 text-ink-muted hover:text-ink-body"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content (Split view: Menu on Left, Order Sidebar on Right) */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        {/* Left Side: Product Menu Area */}
        <section className="flex-1 flex flex-col bg-panel-4 overflow-y-auto">
          {/* Category Chips Bar */}
          <div className="flex gap-2.5 p-3 md:p-4 overflow-x-auto hide-scrollbar shrink-0 bg-panel-36 sticky top-0 z-10 border-b border-edge-edge shadow-sm">
            {categories.map((cat) => {
              const isActive = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  id={`cat-btn-${cat.id}`}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-5 py-2.5 rounded-xl font-semibold text-[14px] whitespace-nowrap min-h-[44px] flex items-center justify-center transition-all active:scale-95 cursor-pointer ${
                    isActive
                      ? 'bg-surface-gold-solid text-ink-foreground shadow-ui-4'
                      : 'bg-panel-13 text-ink-body border border-edge-outline hover:bg-panel-3'
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>

          {/* Menu Items Grid */}
          <div className="p-4 md:p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-24 lg:pb-8">
            {filteredProducts.map((product) => {
              const isAvailable = product.available;
              return (
                <div
                  key={product.id}
                  id={`prod-card-${product.id}`}
                  onClick={() => isAvailable && addItemToOrder(currentTable.id, product)}
                  className={`bg-panel-13 rounded-2xl border border-edge-outline-4 overflow-hidden flex flex-col transition-all duration-150 group select-none ${
                    isAvailable
                      ? 'active:scale-[0.98] cursor-pointer hover:border-edge-brand-5 hover:bg-panel-37 shadow-sm'
                      : 'opacity-50 cursor-not-allowed'
                  }`}
                >
                  {/* Dish Image */}
                  <div className="h-36 w-full bg-panel-3 relative overflow-hidden">
                    <img
                      src={product.image}
                      alt={product.name}
                      className={`w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 ${
                        !isAvailable ? 'grayscale' : ''
                      }`}
                      onError={(e) => {
                        // Fallback food banner if image fails
                        e.currentTarget.src =
                          'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop&q=80';
                      }}
                    />
                    {!isAvailable && (
                      <div className="absolute inset-0 bg-surface-scrim-3 z-10 flex items-center justify-center backdrop-blur-[1px]">
                        <span className="bg-surface-danger-solid-2 text-ink-danger-soft px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider">
                          Agotado
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Dish Details */}
                  <div className="p-4 flex flex-col flex-1 justify-between gap-3">
                    <div>
                      <h3 className="text-[17px] font-bold text-ink-body group-hover:text-ink-brand transition-colors leading-tight">
                        {product.name}
                      </h3>
                      <p className="text-[12px] text-ink-muted-5 line-clamp-2 mt-1 leading-relaxed">
                        {product.description}
                      </p>
                    </div>

                    <div className="flex items-center justify-between mt-auto pt-1">
                      <span className="text-[20px] font-bold text-ink-gold">
                        S/ {product.price.toFixed(2)}
                      </span>
                      <button
                        type="button"
                        disabled={!isAvailable}
                        aria-label={`Agregar ${product.name}`}
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                          isAvailable
                            ? 'bg-surface-brand-solid text-ink-action-accent hover:bg-surface-brand hover:text-ink-on-accent-4 active:scale-90 shadow'
                            : 'bg-panel-17 text-ink-muted-8'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[20px]">add</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Right Side: Order Sidebar ("Comanda Actual") */}
        <aside
          id="order-sidebar"
          className="w-full lg:w-96 bg-panel-13 border-t lg:border-t-0 lg:border-l border-edge-outline flex flex-col shrink-0 shadow-ui-5 z-20 h-auto lg:h-full max-h-[50vh] lg:max-h-full"
        >
          {/* Sidebar Header */}
          <div className="p-4 border-b border-edge-outline bg-panel-3 flex justify-between items-center h-16 shrink-0">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-ink-brand text-[20px]">receipt</span>
              <h2 className="text-[18px] font-bold text-ink-body">Comanda Actual</h2>
            </div>
            <span className="bg-surface-brand-solid text-ink-action-accent px-3 py-1 rounded-full text-[12px] font-bold">
              {totalItemCount} {totalItemCount === 1 ? 'Ítem' : 'Ítems'}
            </span>
          </div>

          {/* Order Items List */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 bg-panel-35">
            {orderItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center my-auto py-12 text-center text-ink-muted">
                <span className="material-symbols-outlined text-[42px] mb-2 text-ink-outline">
                  restaurant_menu
                </span>
                <p className="text-[14px] font-semibold text-ink-body">Comanda vacía</p>
                <p className="text-[12px] max-w-[200px] mt-1">
                  Toca cualquier plato del menú a la izquierda para agregarlo al pedido.
                </p>
              </div>
            ) : (
              orderItems.map((item) => (
                <div
                  key={item.id}
                  className="bg-panel p-3.5 rounded-xl border border-edge-outline-2 flex flex-col gap-2.5 transition-all shadow-sm"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 pr-2">
                      <h4 className="text-[15px] font-bold text-ink-body leading-tight">
                        {item.quantity}x {item.name}
                      </h4>
                      {item.status === 'en_cocina' && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-ink-gold bg-surface-gold-3 px-1.5 py-0.5 rounded mt-0.5">
                          <span className="w-1 h-1 rounded-full bg-surface-gold-2 animate-ping"></span>
                          En cocina
                        </span>
                      )}
                    </div>
                    <span className="text-[15px] font-bold text-ink-body shrink-0">
                      S/ {(item.price * item.quantity).toFixed(2)}
                    </span>
                  </div>

                  {/* Notes and Quantity buttons row */}
                  <div className="flex justify-between items-center pt-1 border-t border-edge-outline-8">
                    {/* Note button */}
                    <button
                      type="button"
                      onClick={() =>
                        setEditingNoteItem({
                          id: item.id,
                          name: item.name,
                          notes: item.notes || '',
                        })
                      }
                      className={`flex items-center gap-1 text-[12px] font-medium transition-colors ${
                        item.notes
                          ? 'text-ink-info hover:text-ink-info-soft bg-surface-info-3 px-2 py-0.5 rounded-md border border-edge-info-3'
                          : 'text-ink-muted-3 hover:text-ink-body'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[15px]">
                        {item.notes ? 'edit_note' : 'add_notes'}
                      </span>
                      <span className="truncate max-w-[130px]">
                        {item.notes || 'Nota'}
                      </span>
                    </button>

                    {/* Quantity controls */}
                    <div className="flex items-center gap-2 bg-panel-3 rounded-full p-1 border border-edge-outline">
                      <button
                        type="button"
                        onClick={() => updateItemQuantity(currentTable.id, item.id, -1)}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-ink-muted-2 hover:bg-panel-17 hover:text-ink-strong transition-colors"
                        title="Disminuir"
                      >
                        <span className="material-symbols-outlined text-[16px]">remove</span>
                      </button>
                      <span className="text-[13px] font-bold text-ink-body min-w-[1.5ch] text-center">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateItemQuantity(currentTable.id, item.id, 1)}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-ink-muted-2 hover:bg-panel-17 hover:text-ink-strong transition-colors"
                        title="Aumentar"
                      >
                        <span className="material-symbols-outlined text-[16px]">add</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Order Totals & Action Buttons */}
          <div className="bg-panel-3 p-4 border-t border-edge-outline flex flex-col gap-3 shrink-0">
            <div className="flex flex-col gap-1.5 text-[14px]">
              <div className="flex justify-between text-ink-muted-2">
                <span>Subtotal sin IGV</span>
                <span>S/ {(currentOrder?.subtotal || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-ink-muted-2">
                <span>IGV incluido (18%)</span>
                <span>S/ {(currentOrder?.igv || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-[18px] font-bold text-ink-body pt-2 border-t border-edge-outline-2">
                <span>Total</span>
                <span className="text-ink-gold">
                  S/ {(currentOrder?.total || 0).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex flex-col gap-2.5 mt-1">
              <button
                id="btn-send-to-kitchen"
                type="button"
                disabled={orderItems.length === 0}
                onClick={() => sendToKitchen(currentTable.id)}
                className="w-full h-[48px] bg-surface-brand text-ink-on-accent-4 hover:bg-surface-on-brand font-bold text-[14px] rounded-xl flex items-center justify-center gap-2 shadow-ui-6 transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <span className="material-symbols-outlined fill text-[20px]">
                  restaurant_menu
                </span>
                <span>Enviar a Cocina</span>
              </button>

              <button
                id="btn-proceed-to-payment"
                type="button"
                disabled={orderItems.length === 0}
                onClick={() => proceedToPayment(currentTable.id)}
                className="w-full h-[48px] border-2 border-edge-info-6 text-ink-info hover:bg-surface-info-3 font-bold text-[14px] rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">
                  point_of_sale
                </span>
                <span>Cobrar Mesa</span>
              </button>
            </div>
          </div>
        </aside>
      </main>

      {/* Item Notes Modal */}
      {editingNoteItem && (
        <ItemNotesModal
          isOpen={true}
          itemName={editingNoteItem.name}
          currentNotes={editingNoteItem.notes}
          onClose={() => setEditingNoteItem(null)}
          onSave={(notes) => {
            updateItemNotes(currentTable.id, editingNoteItem.id, notes);
            setEditingNoteItem(null);
          }}
        />
      )}

      {/* Confirmación: despachar a cocina antes de cobrar (regla Kardex) */}
      {pendingKitchenConfirm && pendingKitchenConfirm.tableId === currentTable?.id && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-scrim-2 p-4">
          <div className="w-full max-w-md bg-panel-3 border border-edge-outline rounded-2xl shadow-2xl p-6 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-ink-gold text-[28px] fill">local_fire_department</span>
              <h3 className="text-[16px] font-bold text-ink-body">
                Ítems sin enviar a cocina
              </h3>
            </div>
            <p className="text-[13px] text-ink-muted-2 leading-relaxed">
              Hay <span className="font-bold text-ink-gold">{pendingKitchenConfirm.itemCount} ítem(s)</span> de la mesa{' '}
              <span className="font-bold text-ink-body">{currentTable.number}</span> que aún no fueron enviados a cocina.
              Si cobras sin despachar, los insumos NO se descontarán del Kardex.
            </p>
            <p className="text-[13px] text-ink-muted-2 leading-relaxed">
              ¿Enviar a Cocina ahora y continuar al cobro?
            </p>
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                disabled={isDispatchingKitchen}
                onClick={() => {
                  setIsDispatchingKitchen(true);
                  confirmDispatchAndProceed(currentTable.id).finally(() => setIsDispatchingKitchen(false));
                }}
                className="flex-1 h-[44px] bg-surface-brand text-ink-on-accent-4 hover:bg-surface-on-brand font-bold text-[13px] rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-wait cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">restaurant_menu</span>
                <span>{isDispatchingKitchen ? 'Enviando...' : 'Enviar a Cocina y Cobrar'}</span>
              </button>
              <button
                type="button"
                disabled={isDispatchingKitchen}
                onClick={dismissKitchenConfirm}
                className="flex-1 h-[44px] border-2 border-edge-outline text-ink-muted-2 hover:bg-panel-17 hover:text-ink-strong font-bold text-[13px] rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
              >
                <span>Cancelar</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
