import { insumoSelectable } from '../lib/insumoCatalog';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { usePOS } from '../context/POSContext';
import { PRODUCT_CATEGORIES, uuid } from '../lib/productCatalog';
import { Recipe, RecipeIngredient, CompanyId, Product, ProductCategory } from '../types';

export const RecipesScreen: React.FC = () => {
  const {
    recipes,
    products,
    insumos,
    activeCompanyId,
    activeCompany,
    saveRecipe, catalogTarget, setCatalogTarget, setCurrentScreen, setActiveCompanyId,
  } = usePOS();

  const [productMode, setProductMode] = useState<'existing' | 'new'>('existing');
  const [allowRelink, setAllowRelink] = useState(false);
  const [linkedFilter, setLinkedFilter] = useState<string | null>(null);
  const [ackDuplicate, setAckDuplicate] = useState(false);
  const newIds = useRef({ recipe: uuid(), product: uuid() });
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  const [recipeCategory, setRecipeCategory] = useState<ProductCategory>('platos');
  const [saveError, setSaveError] = useState('');
  const [savingRecipe, setSavingRecipe] = useState(false);
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
      return !r.isDeleted && matchCompany && matchSearch && (!linkedFilter || r.productId === linkedFilter);
    });
  }, [recipes, activeCompanyId, searchTerm, linkedFilter]);

  // Seguir el registro completo del contexto, también tras cambios desde Productos/socket.
  useEffect(() => {
    setSelectedRecipe((prev) => filteredRecipes.find((r) => r.id === prev?.id) ?? filteredRecipes[0] ?? null);
  }, [filteredRecipes]);

  // Real-time calculation for modal
  const modalTotalCost = useMemo(() => {
    return ingredients.reduce((sum, ing) => sum + (ing.subtotalCost || 0), 0);
  }, [ingredients]);

  const modalPriceNum = parseFloat(salePrice) || 1;
  const modalFoodCostPct = modalPriceNum > 0 ? +((modalTotalCost / modalPriceNum) * 100).toFixed(2) : 0;

  // Open modal to edit existing recipe
  const openEditModal = (recipe: Recipe) => {
    setProductMode(recipe.productId ? 'existing' : 'new'); setAllowRelink(false); setAckDuplicate(false);
    newIds.current = { recipe: recipe.id, product: uuid() };
    setEditingRecipeId(recipe.id); setSaveError(''); setRecipeCategory(recipe.category as ProductCategory);
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
    setLinkedFilter(null);
    newIds.current = { recipe: uuid(), product: uuid() };
    setProductMode('existing'); setAllowRelink(false); setAckDuplicate(false);
    setEditingRecipeId(null); setSaveError(''); setRecipeCategory('platos');
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
          item.costPerUnit = +found.costPerUnit.toFixed(2);
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
    setProductId(prodId); setAckDuplicate(false);
    setProductMode('existing');
    const prod = products.find((p) => p.id === prodId);
    if (prod) {
      setProductName(prod.name);
      setSalePrice(prod.price.toString());
      setTargetCompany(prod.companyId);
      setRecipeCategory(prod.category);
    }
  };

  const handleSaveRecipeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingRecipe || !productName || !salePrice) return;
    setSaveError('');

    if (productMode === 'existing' && !productId) { setSaveError('Seleccione el producto al que pertenece esta ficha.'); return; }
    if (productMode === 'new' && similarProducts.length && !ackDuplicate) { setSaveError('Revise los productos similares o confirme que desea crear otro.'); return; }
    const validIngredients = ingredients.filter((ing) => ing.insumoId && ing.quantity > 0);
    const price = +(parseFloat(salePrice) || 1).toFixed(2);
    const normalizedIngredients = validIngredients.map((ing) => {
      const qty = +(parseFloat(ing.quantity as any) || 0).toFixed(2);
      const cost = +(parseFloat(ing.costPerUnit as any) || 0).toFixed(2);
      return { ...ing, quantity: qty, costPerUnit: cost, subtotalCost: +(qty * cost).toFixed(2) };
    });
    const totalCost = +normalizedIngredients.reduce((s, i) => s + i.subtotalCost, 0).toFixed(2);
    const foodCostPct = +((totalCost / price) * 100).toFixed(2);

    const recipeId = editingRecipeId ?? newIds.current.recipe;

    const newRecipe: Recipe = {
      id: recipeId,
      companyId: targetCompany,
      productId: productMode === 'existing' ? productId : newIds.current.product,
      productName: productName.trim(),
      category: recipeCategory,
      portions: parseInt(portions) || 1,
      salePrice: price,
      ingredients: normalizedIngredients,
      totalCost,
      theoreticalFoodCostPct: foodCostPct,
      preparationNotes: preparationNotes.trim() || undefined,
    };

    setSavingRecipe(true);
    try {
      await saveRecipe(newRecipe);
      setSelectedRecipe(newRecipe);
      setIsEditModalOpen(false);
    } catch (err) { setSaveError(err instanceof Error ? err.message : 'No se pudo guardar la ficha.'); }
    finally { setSavingRecipe(false); }
  };

  const similarProducts = products.filter((p) => !p.isDeleted && p.companyId === targetCompany &&
    p.name.trim().toLocaleLowerCase('es') === productName.trim().toLocaleLowerCase('es'));
  useEffect(() => { setAckDuplicate(false); }, [productName, targetCompany]);
  useEffect(() => {
    if (!catalogTarget || catalogTarget.action === 'editProduct') return;
    const product = products.find((p) => p.id === catalogTarget.productId && !p.isDeleted);
    if (product) {
      setSearchTerm('');
      if (catalogTarget.action === 'createRecipe') {
        openNewRecipeModal(); handleProductSelect(product.id);
      } else {
        setLinkedFilter(product.id);
        setSelectedRecipe(recipes.find((r) => !r.isDeleted && r.productId === product.id && r.companyId === product.companyId) ?? null);
      }
    }
    setCatalogTarget(null);
  }, [catalogTarget]);

  return (
    <div className="flex-1 flex flex-col h-full bg-panel-20 text-ink-body overflow-hidden">
      {linkedFilter && <div className="flex items-center justify-between px-5 py-2 text-xs text-ink-muted-2 bg-panel-41">
        <span>Fichas del producto seleccionado ({filteredRecipes.length})</span><button onClick={() => setLinkedFilter(null)} className="text-ink-brand">Mostrar todas</button>
      </div>}
      {/* Top Header */}
      <div className="bg-panel-21 border-b border-edge-outline-2 p-4 md:px-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-ink-brand text-[26px]">
                menu_book
              </span>
              <h2 className="text-[22px] font-black text-ink-brand tracking-tight">
                Fichas Técnicas &amp; Manejo de Recetas
              </h2>
              <span className="text-[12px] font-bold px-2 py-0.5 rounded-full bg-surface-tinted text-ink-gold border border-edge-gold-5">
                {activeCompany.tradeName}
              </span>
            </div>
            <p className="text-[13px] text-ink-muted-5 mt-0.5">
              Estructura de insumos (BOM) por plato, costeo estándar y Food Cost teórico para control de márgenes.
            </p>
          </div>

          <button
            onClick={openNewRecipeModal}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-surface-brand-solid hover:bg-surface-brand-hover-bright text-ink-on-brand font-bold text-[13px] transition-all shadow-md shrink-0"
          >
            <span className="material-symbols-outlined text-[18px]">add_circle</span>
            <span>Nueva Ficha Técnica</span>
          </button>
        </div>
      </div>

      {/* Main Split Layout: Left List, Right Detail */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left Side: Recipe Cards List */}
        <div className="w-full md:w-80 lg:w-96 border-r border-edge-outline-3 flex flex-col bg-panel-22 overflow-hidden">
          <div className="p-3 border-b border-edge-outline-5">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-ink-muted text-[18px]">
                search
              </span>
              <input
                type="text"
                placeholder="Buscar receta o plato..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-panel-14 border border-edge-outline-2 rounded-xl pl-9 pr-3 py-1.5 text-[12px] text-ink-strong focus:outline-none focus:border-edge-brand"
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
                      ? 'bg-surface-tinted-4 border-edge-brand shadow-md'
                      : 'bg-panel-42 border-edge-outline-5 hover:border-edge-outline hover:bg-panel-9'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            recipe.companyId === 'el-tayta'
                              ? 'bg-surface-brand-solid-2 text-ink-heading-brand'
                              : 'bg-surface-gold text-ink-gold'
                          }`}
                        >
                          {recipe.companyId === 'el-tayta' ? 'Tayta' : 'Sabroso'}
                        </span>
                        <span className="text-[11px] text-ink-muted uppercase font-semibold">
                          {recipe.portions} porción
                        </span>
                      </div>
                      <h4 className="text-[14px] font-bold text-ink-strong truncate leading-tight">
                        {recipe.productName}
                      </h4>
                    </div>

                    <span
                      className={`text-[11px] font-black px-2 py-0.5 rounded-full shrink-0 ${
                        isWarning
                          ? 'bg-surface-danger-strong-7 text-ink-danger-2 border border-edge-danger-10'
                          : isGoodMargin
                          ? 'bg-surface-success-strong-4 text-ink-success-2 border border-edge-success-6'
                          : 'bg-surface-warning-strong-4 text-ink-warning-2 border border-edge-warning-9'
                      }`}
                    >
                      {recipe.theoreticalFoodCostPct.toFixed(2)}% FC
                    </span>
                  </div>

                  <div className="mt-2.5 pt-2 border-t border-edge-outline-8 flex items-center justify-between text-[12px]">
                    <span className="text-ink-muted-3">
                      Costo: <strong className="text-ink-strong">S/ {recipe.totalCost.toFixed(2)}</strong>
                    </span>
                    <span className="text-ink-muted-3">
                      P. Venta: <strong className="text-ink-gold">S/ {recipe.salePrice.toFixed(2)}</strong>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Side: Selected Recipe Detailed View */}
        <div className="flex-1 flex flex-col bg-panel-20 overflow-y-auto p-4 md:p-6 custom-scrollbar">
          {selectedRecipe ? (
            <div className="space-y-5">
              {selectedRecipe.productId && <button onClick={() => {
                setActiveCompanyId(selectedRecipe.companyId);
                setCatalogTarget({ productId: selectedRecipe.productId, action: 'editProduct' });
                setCurrentScreen('productos');
              }} className="text-sm text-ink-brand hover:underline">Ver producto en el maestro</button>}
              {/* Recipe Header Banner */}
              <div className="bg-panel-23 border border-edge-outline-2 rounded-2xl p-5 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                        selectedRecipe.companyId === 'el-tayta'
                          ? 'bg-surface-brand-solid-7 text-ink-heading-brand'
                          : 'bg-surface-gold text-ink-gold'
                      }`}
                    >
                      {selectedRecipe.companyId === 'el-tayta' ? 'El Tayta' : 'El Sabroso'}
                    </span>
                    <span className="text-[12px] text-ink-muted-3">
                      Ficha Técnica #{selectedRecipe.id}
                    </span>
                  </div>
                  <h3 className="text-[24px] font-black text-ink-strong tracking-tight">
                    {selectedRecipe.productName}
                  </h3>
                  {selectedRecipe.preparationNotes && (
                    <p className="text-[13px] text-ink-muted-5 mt-1 max-w-xl">
                      {selectedRecipe.preparationNotes}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => openEditModal(selectedRecipe)}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-panel-7 hover:bg-panel-8 text-ink-muted-2 hover:text-ink-strong border border-edge-outline-2 text-[13px] font-bold transition-all"
                  >
                    <span className="material-symbols-outlined text-[18px]">edit</span>
                    <span>Modificar Ficha</span>
                  </button>
                </div>
              </div>

              {/* Financial KPI breakdown for the dish */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-panel-43 p-3.5 rounded-xl border border-edge-outline-3">
                  <p className="text-[11px] font-semibold text-ink-muted-3 uppercase">
                    Precio de Venta POS
                  </p>
                  <p className="text-[22px] font-black text-ink-gold mt-0.5">
                    S/ {selectedRecipe.salePrice.toFixed(2)}
                  </p>
                </div>

                <div className="bg-panel-43 p-3.5 rounded-xl border border-edge-outline-3">
                  <p className="text-[11px] font-semibold text-ink-muted-3 uppercase">
                    Costo Teórico (Insumos)
                  </p>
                  <p className="text-[22px] font-black text-ink-strong mt-0.5">
                    S/ {selectedRecipe.totalCost.toFixed(2)}
                  </p>
                </div>

                <div className="bg-panel-43 p-3.5 rounded-xl border border-edge-outline-3">
                  <p className="text-[11px] font-semibold text-ink-muted-3 uppercase">
                    Food Cost Teórico
                  </p>
                  <p
                    className={`text-[22px] font-black mt-0.5 ${
                      selectedRecipe.theoreticalFoodCostPct <= 30
                        ? 'text-ink-success'
                        : selectedRecipe.theoreticalFoodCostPct <= 35
                        ? 'text-ink-warning-3'
                        : 'text-ink-danger-3'
                    }`}
                  >
                    {selectedRecipe.theoreticalFoodCostPct.toFixed(2)}%
                  </p>
                </div>

                <div className="bg-panel-43 p-3.5 rounded-xl border border-edge-outline-3">
                  <p className="text-[11px] font-semibold text-ink-muted-3 uppercase">
                    Margen Bruto (S/)
                  </p>
                  <p className="text-[22px] font-black text-ink-success mt-0.5">
                    S/ {(selectedRecipe.salePrice - selectedRecipe.totalCost).toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Ingredients Breakdown Table (BOM) */}
              <div className="bg-panel-44 rounded-2xl border border-edge-outline-3 overflow-hidden shadow-md">
                <div className="p-3.5 bg-panel-25 border-b border-edge-outline-2 flex items-center justify-between">
                  <h4 className="text-[14px] font-bold text-ink-brand flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[18px]">kitchen</span>
                    Composición de Insumos por Porción ({selectedRecipe.ingredients.length} insumos)
                  </h4>
                  <span className="text-[11px] text-ink-muted-3">
                    Se deduce automáticamente al enviar comanda al POS
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[13px]">
                    <thead className="bg-panel-45 text-ink-muted-2 font-bold border-b border-edge-outline-5">
                      <tr>
                        <th className="p-3 pl-4">Insumo Requerido</th>
                        <th className="p-3 text-right">Cantidad por Porción</th>
                        <th className="p-3 text-right">Costo Unit. de Reposición</th>
                        <th className="p-3 text-right">Subtotal Insumo</th>
                        <th className="p-3 pr-4 text-right">% del Costo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-edge-outline-6 text-ink-body">
                      {selectedRecipe.ingredients.map((ing, idx) => {
                        const pctOfCost =
                          selectedRecipe.totalCost > 0
                            ? +((ing.subtotalCost / selectedRecipe.totalCost) * 100).toFixed(2)
                            : 0;

                        return (
                          <tr key={idx} className="hover:bg-panel-9 transition-colors">
                            <td className="p-3 pl-4 font-semibold text-ink-strong">
                              {ing.insumoName}
                            </td>
                            <td className="p-3 text-right font-mono font-bold">
                              {Number(ing.quantity).toFixed(2)} {ing.unit}
                            </td>
                            <td className="p-3 text-right font-mono text-ink-muted-2">
                              S/ {ing.costPerUnit.toFixed(2)} / {ing.unit}
                            </td>
                            <td className="p-3 text-right font-mono font-bold text-ink-strong">
                              S/ {ing.subtotalCost.toFixed(2)}
                            </td>
                            <td className="p-3 pr-4 text-right font-mono text-ink-gold">
                              {pctOfCost}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-panel-46 font-bold text-ink-strong border-t border-edge-outline-2">
                      <tr>
                        <td colSpan={3} className="p-3 pl-4 text-ink-brand">
                          Costo Total de Insumos por Porción
                        </td>
                        <td className="p-3 text-right font-mono text-ink-gold text-[15px]">
                          S/ {selectedRecipe.totalCost.toFixed(2)}
                        </td>
                        <td className="p-3 pr-4 text-right font-mono text-ink-success">100%</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-ink-muted py-12">
              <span className="material-symbols-outlined text-[48px] text-ink-outline mb-2">
                menu_book
              </span>
              <p className="text-[16px] font-semibold">Selecciona una receta del panel lateral.</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal: Crear / Modificar Ficha Técnica */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-surface-scrim-5 backdrop-blur-sm z-50 flex items-center justify-center p-3 md:p-6 overflow-y-auto">
          <div className="bg-panel-14 border border-edge-outline rounded-2xl w-full max-w-2xl p-5 shadow-2xl animate-in zoom-in-95 duration-150 my-auto">
            <div className="flex items-center justify-between pb-3 border-b border-edge-outline-3">
              <h3 className="text-[18px] font-black text-ink-brand flex items-center gap-2">
                <span className="material-symbols-outlined">menu_book</span>
                Configurar Ficha Técnica / Receta (BOM)
              </h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="text-ink-muted-2 hover:text-ink-strong p-1"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleSaveRecipeSubmit} className="space-y-4 mt-4">
              {!editingRecipeId && <fieldset className="flex flex-wrap gap-4 text-sm text-ink-muted-2">
                <legend className="mb-2 text-xs">Producto de esta ficha</legend>
                <label><input type="radio" name="product-mode" checked={productMode === 'existing'} onChange={() => { setProductMode('existing'); setProductId(''); }} /> Usar producto existente</label>
                <label><input type="radio" name="product-mode" checked={productMode === 'new'} onChange={() => { setProductMode('new'); setProductId(''); }} /> Crear producto nuevo</label>
              </fieldset>}
              {editingRecipeId && <div className="text-xs text-ink-muted-2">
                <p>La ficha conserva su empresa y producto vinculado.</p>
                {!allowRelink ? <button type="button" onClick={() => { setAllowRelink(true); setProductMode('existing'); }} className="mt-2 text-ink-brand">Cambiar producto vinculado</button>
                : <p className="mt-2 text-ink-warning">Elija otro producto de la misma empresa. Sus campos comerciales se actualizarán al guardar esta ficha.</p>}
              </div>}
              {/* Product and Company Selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[12px] font-bold text-ink-muted-2 mb-1">
                    Empresa
                  </label>
                  <select
                    value={targetCompany}
                    disabled={!!editingRecipeId}
                    onChange={(e) => { setTargetCompany(e.target.value as CompanyId); setProductId(''); }}
                    className="w-full bg-panel-12 border border-edge-outline-2 rounded-xl px-3 py-2 text-[13px] text-ink-strong focus:outline-none focus:border-edge-brand"
                  >
                    <option value="el-tayta">El Tayta (Criollo/Marino)</option>
                    <option value="el-sabroso">El Sabroso (Brasas/Grill)</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[12px] font-bold text-ink-muted-2 mb-1">
                    Producto existente de la misma empresa
                  </label>
                  <select
                    value={productMode === 'existing' ? productId : ''}
                    disabled={productMode === 'new' || (!!editingRecipeId && !allowRelink)}
                    required={productMode === 'existing'}
                    onChange={(e) => handleProductSelect(e.target.value)}
                    className="w-full bg-panel-12 border border-edge-outline-2 rounded-xl px-3 py-2 text-[13px] text-ink-strong focus:outline-none focus:border-edge-brand"
                  >
                    <option value="">Seleccionar plato existente...</option>
                    {products
                      .filter((p) => !p.isDeleted && p.companyId === targetCompany)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} (S/ {p.price.toFixed(2)}){recipes.some((r) => !r.isDeleted && r.productId === p.id && r.companyId === p.companyId) ? ' · Con ficha' : ' · Sin ficha'}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {productMode === 'new' && similarProducts.length > 0 && <div className="rounded-xl border border-edge-warning-10 bg-surface-warning-strong-2 p-3 text-xs text-ink-warning-5">
                <p>Ya existe un producto con este nombre en esta empresa.</p>
                {similarProducts.map((p) => <button key={p.id} type="button" onClick={() => handleProductSelect(p.id)} className="block mt-2 underline">Usar {p.name} · S/ {p.price.toFixed(2)}</button>)}
                <label className="mt-3 flex items-center gap-2"><input type="checkbox" checked={ackDuplicate} onChange={(e) => setAckDuplicate(e.target.checked)} />Crear otro producto de todos modos</label>
              </div>}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[12px] font-bold text-ink-muted-2 mb-1">
                    Nombre del Plato
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Lomo Saltado"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    className="w-full bg-panel-12 border border-edge-outline-2 rounded-xl px-3 py-2 text-[13px] text-ink-strong focus:outline-none focus:border-edge-brand"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-bold text-ink-muted-2 mb-1">
                    Precio de Venta (S/)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="45.00"
                    value={salePrice}
                    onChange={(e) => setSalePrice(e.target.value)}
                    className="w-full bg-panel-12 border border-edge-outline-2 rounded-xl px-3 py-2 text-[13px] text-ink-strong focus:outline-none focus:border-edge-brand"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-bold text-ink-muted-2 mb-1">
                    Porciones por Preparación
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={portions}
                    onChange={(e) => setPortions(e.target.value)}
                    className="w-full bg-panel-12 border border-edge-outline-2 rounded-xl px-3 py-2 text-[13px] text-ink-strong focus:outline-none focus:border-edge-brand"
                  />
                </div>
              </div>

              <label className="block text-xs text-ink-muted-2">Categoría del producto
                <select value={recipeCategory} onChange={(e) => setRecipeCategory(e.target.value as ProductCategory)} className="mt-1 w-full bg-panel-12 border border-edge-outline-2 rounded-xl px-3 py-2 text-sm">
                  {Object.entries(PRODUCT_CATEGORIES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
              </label>
              {saveError && <p role="alert" className="text-sm text-ink-warning">{saveError}</p>}
              {/* Dynamic Ingredients Table */}
              <div className="border border-edge-outline-3 rounded-xl overflow-hidden bg-panel-12">
                <div className="p-2.5 bg-panel-18 flex items-center justify-between border-b border-edge-outline-3">
                  <span className="text-[12px] font-bold uppercase tracking-wider text-ink-brand">
                    Insumos de la Receta (BOM)
                  </span>
                  <button
                    type="button"
                    onClick={handleAddIngredientRow}
                    className="flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg bg-surface-brand-solid text-ink-on-brand"
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
                          className="w-full bg-panel-9 border border-edge-outline-2 rounded-lg px-2.5 py-1.5 text-[12px] text-ink-strong focus:outline-none"
                        >
                          <option value="">Seleccionar insumo de almacén...</option>
                          {insumos.filter(insumoSelectable).filter((i) => i.companyId === 'ambas' || i.companyId === targetCompany).map((i) => (
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
                          min="0.01"
                          placeholder="Cant."
                          value={ing.quantity}
                          onChange={(e) => handleIngredientChange(idx, 'quantity', e.target.value)}
                          required
                          className="w-full bg-panel-9 border border-edge-outline-2 rounded-lg px-2 py-1.5 text-[12px] text-ink-strong text-right focus:outline-none"
                        />
                      </div>

                      <span className="text-[12px] text-ink-muted-3 w-8">{ing.unit}</span>

                      <div className="w-20 text-right font-mono font-bold text-[12px] text-ink-strong">
                        S/ {(ing.subtotalCost || 0).toFixed(2)}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveIngredientRow(idx)}
                        disabled={ingredients.length <= 1}
                        className="p-1 text-ink-danger-3 hover:text-ink-danger-2 disabled:opacity-30"
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                  ))}
                </div>

                {/* Real-time Food Cost indicator in modal */}
                <div className="p-3 bg-panel-9 border-t border-edge-outline-5 flex items-center justify-between text-[13px]">
                  <div>
                    <span className="text-ink-muted-3">Costo Teórico:</span>{' '}
                    <strong className="font-mono text-ink-strong">S/ {modalTotalCost.toFixed(2)}</strong>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-ink-muted-3">Food Cost Teórico:</span>{' '}
                    <span
                      className={`font-mono font-black text-[14px] ${
                        modalFoodCostPct <= 30
                          ? 'text-ink-success'
                          : modalFoodCostPct <= 35
                          ? 'text-ink-warning-3'
                          : 'text-ink-danger-3'
                      }`}
                    >
                      {modalFoodCostPct}%
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-bold text-ink-muted-2 mb-1">
                  Notas de Preparación / Estándar de Cocina
                </label>
                <input
                  type="text"
                  placeholder="Ej. Tiempo de cocción, emplatado o tipo de salsa"
                  value={preparationNotes}
                  onChange={(e) => setPreparationNotes(e.target.value)}
                  className="w-full bg-panel-12 border border-edge-outline-2 rounded-xl px-3 py-2 text-[13px] text-ink-strong focus:outline-none focus:border-edge-brand"
                />
              </div>

              <div className="pt-3 flex gap-2 justify-end border-t border-edge-outline-5">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-[13px] text-ink-muted-2 hover:bg-panel-26"
                >
                  Cancelar
                </button>
                <button
                  type="submit" disabled={savingRecipe}
                  className="px-4 py-2 rounded-xl text-[13px] font-bold bg-surface-brand-solid hover:bg-surface-brand-hover-bright text-ink-on-brand"
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
