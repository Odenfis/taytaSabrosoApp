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
    setCurrentScreen,
    currentUser,
  } = usePOS();

  const [selectedCategory, setSelectedCategory] = useState<ProductCategory | 'todos'>('platos');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingNoteItem, setEditingNoteItem] = useState<{ id: string; name: string; notes: string } | null>(null);

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
      return matchCat && matchSearch;
    });
  }, [products, selectedCategory, searchQuery]);

  const orderItems = currentOrder?.items || [];
  const totalItemCount = orderItems.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <div id="order-taking-screen" className="flex-1 flex flex-col h-full w-full overflow-hidden select-none bg-[#121212]">
      {/* Top Header Bar for Order Taking */}
      <header className="bg-[#131313] border-b border-[#54433c]/60 w-full h-16 flex justify-between items-center px-4 md:px-6 shrink-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            id="btn-back-to-tables"
            onClick={() => setCurrentScreen('mesas')}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[#2a2a2a] text-[#dac1b8] hover:text-[#e5e2e1] transition-colors"
            title="Volver a Mesas"
          >
            <span className="material-symbols-outlined text-[24px]">arrow_back</span>
          </button>
          <div>
            <h1 className="text-[18px] md:text-[20px] font-bold text-[#ffb597] tracking-tight flex items-center gap-2">
              <span>Mesa {currentTable?.number || '01'}</span>
              <span className="text-[12px] font-normal text-[#dac1b8]/70 bg-[#20201f] px-2 py-0.5 rounded-full border border-[#54433c]/40">
                {currentTable?.zone}
              </span>
            </h1>
            <p className="text-[12px] text-[#dac1b8]/80">
              {currentTable?.waiter || currentUser?.name || 'Carlos M.'} (Mesero)
            </p>
          </div>
        </div>

        {/* Search Input in Top Bar */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-[#dac1b8]/60 pointer-events-none">
              <span className="material-symbols-outlined text-[18px]">search</span>
            </span>
            <input
              type="text"
              placeholder="Buscar plato o bebida..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-[#20201f] border border-[#54433c]/60 rounded-full pl-9 pr-3 py-1.5 text-[13px] text-[#e5e2e1] focus:border-[#60d4fb] focus:outline-none w-36 sm:w-60 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 flex items-center pr-2 text-[#dac1b8]/60 hover:text-[#e5e2e1]"
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
        <section className="flex-1 flex flex-col bg-[#121212] overflow-y-auto">
          {/* Category Chips Bar */}
          <div className="flex gap-2.5 p-3 md:p-4 overflow-x-auto hide-scrollbar shrink-0 bg-[#0e0e0e] sticky top-0 z-10 border-b border-[#2a2a2a] shadow-sm">
            {categories.map((cat) => {
              const isActive = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  id={`cat-btn-${cat.id}`}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-5 py-2.5 rounded-xl font-semibold text-[14px] whitespace-nowrap min-h-[44px] flex items-center justify-center transition-all active:scale-95 cursor-pointer ${
                    isActive
                      ? 'bg-[#b08c09] text-[#352800] shadow-[0px_4px_12px_rgba(0,0,0,0.3)]'
                      : 'bg-[#20201f] text-[#e5e2e1] border border-[#54433c] hover:bg-[#2a2a2a]'
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
                  className={`bg-[#20201f] rounded-2xl border border-[#54433c]/80 overflow-hidden flex flex-col transition-all duration-150 group select-none ${
                    isAvailable
                      ? 'active:scale-[0.98] cursor-pointer hover:border-[#ffb597]/60 hover:bg-[#252524] shadow-sm'
                      : 'opacity-50 cursor-not-allowed'
                  }`}
                >
                  {/* Dish Image */}
                  <div className="h-36 w-full bg-[#2a2a2a] relative overflow-hidden">
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
                      <div className="absolute inset-0 bg-black/60 z-10 flex items-center justify-center backdrop-blur-[1px]">
                        <span className="bg-[#93000a] text-[#ffdad6] px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider">
                          Agotado
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Dish Details */}
                  <div className="p-4 flex flex-col flex-1 justify-between gap-3">
                    <div>
                      <h3 className="text-[17px] font-bold text-[#e5e2e1] group-hover:text-[#ffb597] transition-colors leading-tight">
                        {product.name}
                      </h3>
                      <p className="text-[12px] text-[#dac1b8]/80 line-clamp-2 mt-1 leading-relaxed">
                        {product.description}
                      </p>
                    </div>

                    <div className="flex items-center justify-between mt-auto pt-1">
                      <span className="text-[20px] font-bold text-[#ebc246]">
                        S/ {product.price.toFixed(2)}
                      </span>
                      <button
                        type="button"
                        disabled={!isAvailable}
                        aria-label={`Agregar ${product.name}`}
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                          isAvailable
                            ? 'bg-[#823b19] text-[#ffaf8e] hover:bg-[#ffb597] hover:text-[#581d00] active:scale-90 shadow'
                            : 'bg-[#353535] text-[#dac1b8]/40'
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
          className="w-full lg:w-96 bg-[#20201f] border-t lg:border-t-0 lg:border-l border-[#54433c] flex flex-col shrink-0 shadow-[-4px_0_24px_rgba(0,0,0,0.4)] z-20 h-auto lg:h-full max-h-[50vh] lg:max-h-full"
        >
          {/* Sidebar Header */}
          <div className="p-4 border-b border-[#54433c] bg-[#2a2a2a] flex justify-between items-center h-16 shrink-0">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#ffb597] text-[20px]">receipt</span>
              <h2 className="text-[18px] font-bold text-[#e5e2e1]">Comanda Actual</h2>
            </div>
            <span className="bg-[#823b19] text-[#ffaf8e] px-3 py-1 rounded-full text-[12px] font-bold">
              {totalItemCount} {totalItemCount === 1 ? 'Ítem' : 'Ítems'}
            </span>
          </div>

          {/* Order Items List */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 bg-[#131313]">
            {orderItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center my-auto py-12 text-center text-[#dac1b8]/60">
                <span className="material-symbols-outlined text-[42px] mb-2 text-[#54433c]">
                  restaurant_menu
                </span>
                <p className="text-[14px] font-semibold text-[#e5e2e1]">Comanda vacía</p>
                <p className="text-[12px] max-w-[200px] mt-1">
                  Toca cualquier plato del menú a la izquierda para agregarlo al pedido.
                </p>
              </div>
            ) : (
              orderItems.map((item) => (
                <div
                  key={item.id}
                  className="bg-[#1c1b1b] p-3.5 rounded-xl border border-[#54433c]/60 flex flex-col gap-2.5 transition-all shadow-sm"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 pr-2">
                      <h4 className="text-[15px] font-bold text-[#e5e2e1] leading-tight">
                        {item.quantity}x {item.name}
                      </h4>
                      {item.status === 'en_cocina' && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#ebc246] bg-[#ebc246]/10 px-1.5 py-0.5 rounded mt-0.5">
                          <span className="w-1 h-1 rounded-full bg-[#ebc246] animate-ping"></span>
                          En cocina
                        </span>
                      )}
                    </div>
                    <span className="text-[15px] font-bold text-[#e5e2e1] shrink-0">
                      S/ {(item.price * item.quantity).toFixed(2)}
                    </span>
                  </div>

                  {/* Notes and Quantity buttons row */}
                  <div className="flex justify-between items-center pt-1 border-t border-[#54433c]/30">
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
                          ? 'text-[#60d4fb] hover:text-[#b7eaff] bg-[#60d4fb]/10 px-2 py-0.5 rounded-md border border-[#60d4fb]/30'
                          : 'text-[#dac1b8]/70 hover:text-[#e5e2e1]'
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
                    <div className="flex items-center gap-2 bg-[#2a2a2a] rounded-full p-1 border border-[#54433c]">
                      <button
                        type="button"
                        onClick={() => updateItemQuantity(currentTable.id, item.id, -1)}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[#dac1b8] hover:bg-[#353535] hover:text-white transition-colors"
                        title="Disminuir"
                      >
                        <span className="material-symbols-outlined text-[16px]">remove</span>
                      </button>
                      <span className="text-[13px] font-bold text-[#e5e2e1] min-w-[1.5ch] text-center">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateItemQuantity(currentTable.id, item.id, 1)}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[#dac1b8] hover:bg-[#353535] hover:text-white transition-colors"
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
          <div className="bg-[#2a2a2a] p-4 border-t border-[#54433c] flex flex-col gap-3 shrink-0">
            <div className="flex flex-col gap-1.5 text-[14px]">
              <div className="flex justify-between text-[#dac1b8]">
                <span>Subtotal</span>
                <span>S/ {(currentOrder?.subtotal || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-[#dac1b8]">
                <span>IGV (18%)</span>
                <span>S/ {(currentOrder?.igv || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-[18px] font-bold text-[#e5e2e1] pt-2 border-t border-[#54433c]/60">
                <span>Total</span>
                <span className="text-[#ebc246]">
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
                className="w-full h-[48px] bg-[#ffb597] text-[#581d00] hover:bg-[#ffdbcd] font-bold text-[14px] rounded-xl flex items-center justify-center gap-2 shadow-[0_4px_14px_rgba(255,181,151,0.25)] transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
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
                className="w-full h-[48px] border-2 border-[#60d4fb] text-[#60d4fb] hover:bg-[#60d4fb]/10 font-bold text-[14px] rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
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
    </div>
  );
};
