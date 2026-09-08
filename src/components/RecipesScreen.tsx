import React, { useState, useMemo } from 'react';
import { usePOS } from '../context/POSContext';
import { Recipe, RecipeIngredient, CompanyId, Product } from '../types';

export const RecipesScreen: React.FC = () => {
  const {
    recipes,
    products,
    insumos,
    activeCompanyId,
    activeCompany,
    saveRecipe,
  } = usePOS();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(recipes[0] || null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Form State for creating/editing recipe
  const [targetCompany, setTargetCompany] = useState<CompanyId>(
    activeCompanyId === 'todas' ? 'el-tayta' : activeCompanyId
  );
  const [productId, setProductId] = useState('');
  const [productName, setProductName] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [portions, setPortions] = useState('1');
  const [preparationNotes, setPreparationNotes] = useState('');
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([
    { insumoId: '', insumoName: '', quantity: 0.1, unit: 'kg', costPerUnit: 0, subtotalCost: 0 },
  ]);

  // Filtered recipes
  const filteredRecipes = useMemo(() => {
    return recipes.filter((r) => {
      const matchCompany = activeCompanyId === 'todas' || r.companyId === activeCompanyId;
      const matchSearch =
        r.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.category.toLowerCase().includes(searchTerm.toLowerCase());
      return matchCompany && matchSearch;
    });
  }, [recipes, activeCompanyId, searchTerm]);

  // Set default selected recipe if current is null or out of filter
  useMemo(() => {
    if (filteredRecipes.length > 0) {
      if (!selectedRecipe || !filteredRecipes.some((r) => r.id === selectedRecipe.id)) {
        setSelectedRecipe(filteredRecipes[0]);
      }
    }
  }, [filteredRecipes]);

  // Real-time calculation for modal
  const modalTotalCost = useMemo(() => {
    return ingredients.reduce((sum, ing) => sum + (ing.subtotalCost || 0), 0);
  }, [ingredients]);

  const modalPriceNum = parseFloat(salePrice) || 1;
  const modalFoodCostPct = modalPriceNum > 0 ? +((modalTotalCost / modalPriceNum) * 100).toFixed(2) : 0;

  // Open modal to edit existing recipe
  const openEditModal = (recipe: Recipe) => {
    setTargetCompany(recipe.companyId);
    setProductId(recipe.productId);
    setProductName(recipe.productName);
    setSalePrice(recipe.salePrice.toString());
    setPortions(recipe.portions.toString());
    setPreparationNotes(recipe.preparationNotes || '');
    setIngredients(recipe.ingredients.length > 0 ? recipe.ingredients : [
      { insumoId: '', insumoName: '', quantity: 0.1, unit: 'kg', costPerUnit: 0, subtotalCost: 0 }
    ]);
    setIsEditModalOpen(true);
  };

  // Open modal for new recipe
  const openNewRecipeModal = () => {
    const comp = activeCompanyId === 'todas' ? 'el-tayta' : activeCompanyId;
    setTargetCompany(comp);
    setProductId('');
    setProductName('');
    setSalePrice('35.00');
    setPortions('1');
    setPreparationNotes('');
    setIngredients([
      { insumoId: '', insumoName: '', quantity: 0.1, unit: 'kg', costPerUnit: 0, subtotalCost: 0 },
    ]);
    setIsEditModalOpen(true);
  };

  const handleIngredientChange = (index: number, field: keyof RecipeIngredient, value: any) => {
    setIngredients((prev) => {
      const updated = [...prev];
      const item = { ...updated[index], [field]: value };

      if (field === 'insumoId') {
        const found = insumos.find((i) => i.id === value);
        if (found) {
          item.insumoName = found.name;
          item.unit = found.unit;
          item.costPerUnit = found.costPerUnit;
        }
      }

      if (field === 'quantity' || field === 'costPerUnit' || field === 'insumoId') {
        const qty = parseFloat(item.quantity as any) || 0;
        const cost = parseFloat(item.costPerUnit as any) || 0;
        item.subtotalCost = +(qty * cost).toFixed(2);
      }

      updated[index] = item;
      return updated;
    });
  };

  const handleAddIngredientRow = () => {
    setIngredients((prev) => [
      ...prev,
      { insumoId: '', insumoName: '', quantity: 0.1, unit: 'kg', costPerUnit: 0, subtotalCost: 0 },
    ]);
  };

  const handleRemoveIngredientRow = (index: number) => {
    if (ingredients.length <= 1) return;
    setIngredients((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleProductSelect = (prodId: string) => {
    setProductId(prodId);
    const prod = products.find((p) => p.id === prodId);
    if (prod) {
      setProductName(prod.name);
      setSalePrice(prod.price.toString());
      setTargetCompany(prod.companyId);
    }
  };

  const handleSaveRecipeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productName || !salePrice) return;

    const validIngredients = ingredients.filter((ing) => ing.insumoId && ing.quantity > 0);
    const totalCost = +validIngredients.reduce((s, i) => s + i.subtotalCost, 0).toFixed(2);
    const price = parseFloat(salePrice) || 1;
    const foodCostPct = +((totalCost / price) * 100).toFixed(2);

    const recipeId = selectedRecipe && selectedRecipe.productName === productName
      ? selectedRecipe.id
      : `rec-${Date.now()}`;

    const newRecipe: Recipe = {
      id: recipeId,
      companyId: targetCompany,
      productId: productId || `prod-${Date.now()}`,
      productName: productName.trim(),
      category: 'platos',
      portions: parseInt(portions) || 1,
      salePrice: price,
      ingredients: validIngredients,
      totalCost,
      theoreticalFoodCostPct: foodCostPct,
      preparationNotes: preparationNotes.trim() || undefined,
    };

    saveRecipe(newRecipe);
    setSelectedRecipe(newRecipe);
    setIsEditModalOpen(false);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#101010] text-[#e5e2e1] overflow-hidden">
      {/* Top Header */}
      <div className="bg-[#181717] border-b border-[#54433c]/60 p-4 md:px-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#ffb597] text-[26px]">
                menu_book
              </span>
              <h2 className="text-[22px] font-black text-[#ffb597] tracking-tight">
                Fichas Técnicas &amp; Manejo de Recetas
              </h2>
              <span className="text-[12px] font-bold px-2 py-0.5 rounded-full bg-[#352800] text-[#ebc246] border border-[#ebc246]/40">
                {activeCompany.tradeName}
              </span>
            </div>
            <p className="text-[13px] text-[#dac1b8]/80 mt-0.5">
              Estructura de insumos (BOM) por plato, costeo estándar y Food Cost teórico para control de márgenes.
            </p>
          </div>

          <button
            onClick={openNewRecipeModal}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#823b19] hover:bg-[#9a471f] text-[#ffdbcd] font-bold text-[13px] transition-all shadow-md shrink-0"
          >
            <span className="material-symbols-outlined text-[18px]">add_circle</span>
            <span>Nueva Ficha Técnica</span>
          </button>
        </div>
      </div>

      {/* Main Split Layout: Left List, Right Detail */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left Side: Recipe Cards List */}
        <div className="w-full md:w-80 lg:w-96 border-r border-[#54433c]/50 flex flex-col bg-[#141414] overflow-hidden">
          <div className="p-3 border-b border-[#54433c]/40">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-2.5 top-2.5 text-[#dac1b8]/60 text-[18px]">
                search
              </span>
              <input
                type="text"
                placeholder="Buscar receta o plato..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[#1f1e1d] border border-[#54433c]/60 rounded-xl pl-9 pr-3 py-1.5 text-[12px] text-white focus:outline-none focus:border-[#ffb597]"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2.5 space-y-2 custom-scrollbar">
            {filteredRecipes.map((recipe) => {
              const isSelected = selectedRecipe?.id === recipe.id;
              const isGoodMargin = recipe.theoreticalFoodCostPct <= 30;
              const isWarning = recipe.theoreticalFoodCostPct > 35;

              return (
                <div
                  key={recipe.id}
                  onClick={() => setSelectedRecipe(recipe)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#2a221f] border-[#ffb597] shadow-md'
                      : 'bg-[#1b1a19] border-[#54433c]/40 hover:border-[#54433c] hover:bg-[#201f1e]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            recipe.companyId === 'el-tayta'
                              ? 'bg-[#823b19]/40 text-[#ffdbcd]'
                              : 'bg-[#ebc246]/20 text-[#ebc246]'
                          }`}
                        >
                          {recipe.companyId === 'el-tayta' ? 'Tayta' : 'Sabroso'}
                        </span>
                        <span className="text-[11px] text-[#dac1b8]/60 uppercase font-semibold">
                          {recipe.portions} porción
                        </span>
                      </div>
                      <h4 className="text-[14px] font-bold text-white truncate leading-tight">
                        {recipe.productName}
                      </h4>
                    </div>

                    <span
                      className={`text-[11px] font-black px-2 py-0.5 rounded-full shrink-0 ${
                        isWarning
                          ? 'bg-rose-950 text-rose-300 border border-rose-600/40'
                          : isGoodMargin
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-600/40'
                          : 'bg-amber-950 text-amber-300 border border-amber-600/40'
                      }`}
                    >
                      {recipe.theoreticalFoodCostPct.toFixed(1)}% FC
                    </span>
                  </div>

                  <div className="mt-2.5 pt-2 border-t border-[#54433c]/30 flex items-center justify-between text-[12px]">
                    <span className="text-[#dac1b8]/70">
                      Costo: <strong className="text-white">S/ {recipe.totalCost.toFixed(2)}</strong>
                    </span>
                    <span className="text-[#dac1b8]/70">
                      P. Venta: <strong className="text-[#ebc246]">S/ {recipe.salePrice.toFixed(2)}</strong>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Side: Selected Recipe Detailed View */}
        <div className="flex-1 flex flex-col bg-[#101010] overflow-y-auto p-4 md:p-6 custom-scrollbar">
          {selectedRecipe ? (
            <div className="space-y-5">
              {/* Recipe Header Banner */}
              <div className="bg-[#1a1918] border border-[#54433c]/60 rounded-2xl p-5 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                        selectedRecipe.companyId === 'el-tayta'
                          ? 'bg-[#823b19]/60 text-[#ffdbcd]'
                          : 'bg-[#ebc246]/20 text-[#ebc246]'
                      }`}
                    >
                      {selectedRecipe.companyId === 'el-tayta' ? 'El Tayta' : 'El Sabroso'}
                    </span>
                    <span className="text-[12px] text-[#dac1b8]/70">
                      Ficha Técnica #{selectedRecipe.id}
                    </span>
                  </div>
                  <h3 className="text-[24px] font-black text-white tracking-tight">
                    {selectedRecipe.productName}
                  </h3>
                  {selectedRecipe.preparationNotes && (
                    <p className="text-[13px] text-[#dac1b8]/80 mt-1 max-w-xl">
                      {selectedRecipe.preparationNotes}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => openEditModal(selectedRecipe)}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#2a2827] hover:bg-[#383533] text-[#dac1b8] hover:text-white border border-[#54433c]/60 text-[13px] font-bold transition-all"
                  >
                    <span className="material-symbols-outlined text-[18px]">edit</span>
                    <span>Modificar Ficha</span>
                  </button>
                </div>
              </div>

              {/* Financial KPI breakdown for the dish */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-[#1c1b1a] p-3.5 rounded-xl border border-[#54433c]/50">
                  <p className="text-[11px] font-semibold text-[#dac1b8]/70 uppercase">
                    Precio de Venta POS
                  </p>
                  <p className="text-[22px] font-black text-[#ebc246] mt-0.5">
                    S/ {selectedRecipe.salePrice.toFixed(2)}
                  </p>
                </div>

                <div className="bg-[#1c1b1a] p-3.5 rounded-xl border border-[#54433c]/50">
                  <p className="text-[11px] font-semibold text-[#dac1b8]/70 uppercase">
                    Costo Teórico (Insumos)
                  </p>
                  <p className="text-[22px] font-black text-white mt-0.5">
                    S/ {selectedRecipe.totalCost.toFixed(2)}
                  </p>
                </div>

                <div className="bg-[#1c1b1a] p-3.5 rounded-xl border border-[#54433c]/50">
                  <p className="text-[11px] font-semibold text-[#dac1b8]/70 uppercase">
                    Food Cost Teórico
                  </p>
                  <p
                    className={`text-[22px] font-black mt-0.5 ${
                      selectedRecipe.theoreticalFoodCostPct <= 30
                        ? 'text-emerald-400'
                        : selectedRecipe.theoreticalFoodCostPct <= 35
                        ? 'text-amber-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {selectedRecipe.theoreticalFoodCostPct.toFixed(1)}%
                  </p>
                </div>

                <div className="bg-[#1c1b1a] p-3.5 rounded-xl border border-[#54433c]/50">
                  <p className="text-[11px] font-semibold text-[#dac1b8]/70 uppercase">
                    Margen Bruto (S/)
                  </p>
                  <p className="text-[22px] font-black text-emerald-400 mt-0.5">
                    S/ {(selectedRecipe.salePrice - selectedRecipe.totalCost).toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Ingredients Breakdown Table (BOM) */}
              <div className="bg-[#181716] rounded-2xl border border-[#54433c]/50 overflow-hidden shadow-md">
                <div className="p-3.5 bg-[#232120] border-b border-[#54433c]/60 flex items-center justify-between">
                  <h4 className="text-[14px] font-bold text-[#ffb597] flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[18px]">kitchen</span>
                    Composición de Insumos por Porción ({selectedRecipe.ingredients.length} insumos)
                  </h4>
                  <span className="text-[11px] text-[#dac1b8]/70">
                    Se deduce automáticamente al enviar comanda al POS
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[13px]">
                    <thead className="bg-[#1c1a19] text-[#dac1b8] font-bold border-b border-[#54433c]/40">
                      <tr>
                        <th className="p-3 pl-4">Insumo Requerido</th>
                        <th className="p-3 text-right">Cantidad por Porción</th>
                        <th className="p-3 text-right">Costo Unit. de Reposición</th>
                        <th className="p-3 text-right">Subtotal Insumo</th>
                        <th className="p-3 pr-4 text-right">% del Costo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#54433c]/30 text-[#e5e2e1]">
                      {selectedRecipe.ingredients.map((ing, idx) => {
                        const pctOfCost =
                          selectedRecipe.totalCost > 0
                            ? +((ing.subtotalCost / selectedRecipe.totalCost) * 100).toFixed(1)
                            : 0;

                        return (
                          <tr key={idx} className="hover:bg-[#201f1e] transition-colors">
                            <td className="p-3 pl-4 font-semibold text-white">
                              {ing.insumoName}
                            </td>
                            <td className="p-3 text-right font-mono font-bold">
                              {ing.quantity} {ing.unit}
                            </td>
                            <td className="p-3 text-right font-mono text-[#dac1b8]">
                              S/ {ing.costPerUnit.toFixed(2)} / {ing.unit}
                            </td>
                            <td className="p-3 text-right font-mono font-bold text-white">
                              S/ {ing.subtotalCost.toFixed(2)}
                            </td>
                            <td className="p-3 pr-4 text-right font-mono text-[#ebc246]">
                              {pctOfCost}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-[#211f1e] font-bold text-white border-t border-[#54433c]/60">
                      <tr>
                        <td colSpan={3} className="p-3 pl-4 text-[#ffb597]">
                          Costo Total de Insumos por Porción
                        </td>
                        <td className="p-3 text-right font-mono text-[#ebc246] text-[15px]">
                          S/ {selectedRecipe.totalCost.toFixed(2)}
                        </td>
                        <td className="p-3 pr-4 text-right font-mono text-emerald-400">100%</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-[#dac1b8]/60 py-12">
              <span className="material-symbols-outlined text-[48px] text-[#54433c] mb-2">
                menu_book
              </span>
              <p className="text-[16px] font-semibold">Selecciona una receta del panel lateral.</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal: Crear / Modificar Ficha Técnica */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-3 md:p-6 overflow-y-auto">
          <div className="bg-[#1f1e1d] border border-[#54433c] rounded-2xl w-full max-w-2xl p-5 shadow-2xl animate-in zoom-in-95 duration-150 my-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#54433c]/50">
              <h3 className="text-[18px] font-black text-[#ffb597] flex items-center gap-2">
                <span className="material-symbols-outlined">menu_book</span>
                Configurar Ficha Técnica / Receta (BOM)
              </h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="text-[#dac1b8] hover:text-white p-1"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleSaveRecipeSubmit} className="space-y-4 mt-4">
              {/* Product and Company Selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[12px] font-bold text-[#dac1b8] mb-1">
                    Empresa
                  </label>
                  <select
                    value={targetCompany}
                    onChange={(e) => setTargetCompany(e.target.value as CompanyId)}
                    className="w-full bg-[#151414] border border-[#54433c]/60 rounded-xl px-3 py-2 text-[13px] text-white focus:outline-none focus:border-[#ffb597]"
                  >
                    <option value="el-tayta">El Tayta (Criollo/Marino)</option>
                    <option value="el-sabroso">El Sabroso (Brasas/Grill)</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[12px] font-bold text-[#dac1b8] mb-1">
                    Vincular a Plato del Menú (o escribir nombre)
                  </label>
                  <select
                    value={productId}
                    onChange={(e) => handleProductSelect(e.target.value)}
                    className="w-full bg-[#151414] border border-[#54433c]/60 rounded-xl px-3 py-2 text-[13px] text-white focus:outline-none focus:border-[#ffb597]"
                  >
                    <option value="">Seleccionar plato existente...</option>
                    {products
                      .filter((p) => p.companyId === targetCompany)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} (S/ {p.price.toFixed(2)})
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[12px] font-bold text-[#dac1b8] mb-1">
                    Nombre del Plato
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Lomo Saltado"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    className="w-full bg-[#151414] border border-[#54433c]/60 rounded-xl px-3 py-2 text-[13px] text-white focus:outline-none focus:border-[#ffb597]"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-bold text-[#dac1b8] mb-1">
                    Precio de Venta (S/)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    required
                    placeholder="45.00"
                    value={salePrice}
                    onChange={(e) => setSalePrice(e.target.value)}
                    className="w-full bg-[#151414] border border-[#54433c]/60 rounded-xl px-3 py-2 text-[13px] text-white focus:outline-none focus:border-[#ffb597]"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-bold text-[#dac1b8] mb-1">
                    Porciones por Preparación
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={portions}
                    onChange={(e) => setPortions(e.target.value)}
                    className="w-full bg-[#151414] border border-[#54433c]/60 rounded-xl px-3 py-2 text-[13px] text-white focus:outline-none focus:border-[#ffb597]"
                  />
                </div>
              </div>

              {/* Dynamic Ingredients Table */}
              <div className="border border-[#54433c]/50 rounded-xl overflow-hidden bg-[#151414]">
                <div className="p-2.5 bg-[#252322] flex items-center justify-between border-b border-[#54433c]/50">
                  <span className="text-[12px] font-bold uppercase tracking-wider text-[#ffb597]">
                    Insumos de la Receta (BOM)
                  </span>
                  <button
                    type="button"
                    onClick={handleAddIngredientRow}
                    className="flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg bg-[#823b19] text-[#ffdbcd]"
                  >
                    <span className="material-symbols-outlined text-[14px]">add</span>
                    Agregar Insumo
                  </button>
                </div>

                <div className="p-3 space-y-2 max-h-56 overflow-y-auto custom-scrollbar">
                  {ingredients.map((ing, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <div className="flex-1">
                        <select
                          value={ing.insumoId}
                          onChange={(e) => handleIngredientChange(idx, 'insumoId', e.target.value)}
                          required
                          className="w-full bg-[#201f1e] border border-[#54433c]/60 rounded-lg px-2.5 py-1.5 text-[12px] text-white focus:outline-none"
                        >
                          <option value="">Seleccionar insumo de almacén...</option>
                          {insumos.map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.name} (S/ {i.costPerUnit.toFixed(2)}/{i.unit})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="w-20">
                        <input
                          type="number"
                          step="0.01"
                          min="0.001"
                          placeholder="Cant."
                          value={ing.quantity}
                          onChange={(e) => handleIngredientChange(idx, 'quantity', e.target.value)}
                          required
                          className="w-full bg-[#201f1e] border border-[#54433c]/60 rounded-lg px-2 py-1.5 text-[12px] text-white text-right focus:outline-none"
                        />
                      </div>

                      <span className="text-[12px] text-[#dac1b8]/70 w-8">{ing.unit}</span>

                      <div className="w-20 text-right font-mono font-bold text-[12px] text-white">
                        S/ {(ing.subtotalCost || 0).toFixed(2)}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveIngredientRow(idx)}
                        disabled={ingredients.length <= 1}
                        className="p-1 text-rose-400 hover:text-rose-300 disabled:opacity-30"
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                  ))}
                </div>

                {/* Real-time Food Cost indicator in modal */}
                <div className="p-3 bg-[#201f1e] border-t border-[#54433c]/40 flex items-center justify-between text-[13px]">
                  <div>
                    <span className="text-[#dac1b8]/70">Costo Teórico:</span>{' '}
                    <strong className="font-mono text-white">S/ {modalTotalCost.toFixed(2)}</strong>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[#dac1b8]/70">Food Cost Teórico:</span>{' '}
                    <span
                      className={`font-mono font-black text-[14px] ${
                        modalFoodCostPct <= 30
                          ? 'text-emerald-400'
                          : modalFoodCostPct <= 35
                          ? 'text-amber-400'
                          : 'text-rose-400'
                      }`}
                    >
                      {modalFoodCostPct}%
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-bold text-[#dac1b8] mb-1">
                  Notas de Preparación / Estándar de Cocina
                </label>
                <input
                  type="text"
                  placeholder="Ej. Tiempo de cocción, emplatado o tipo de salsa"
                  value={preparationNotes}
                  onChange={(e) => setPreparationNotes(e.target.value)}
                  className="w-full bg-[#151414] border border-[#54433c]/60 rounded-xl px-3 py-2 text-[13px] text-white focus:outline-none focus:border-[#ffb597]"
                />
              </div>

              <div className="pt-3 flex gap-2 justify-end border-t border-[#54433c]/40">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-[13px] text-[#dac1b8] hover:bg-[#2b2827]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-[13px] font-bold bg-[#823b19] hover:bg-[#9a471f] text-[#ffdbcd]"
                >
                  Guardar Ficha Técnica
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
