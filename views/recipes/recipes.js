// Recipe management with real-time cost calculations (ES Module)
// Using NRDCommon from CDN (loaded in index.html)
import {
  calculateDirectCost,
  calculateDirectUnitCost,
  calculateSuggestedPrice,
  calculateRealMargin
} from '../../modules/calculations.js';

const logger = window.logger || console;
const escapeHtml = window.escapeHtml || ((text) => {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
});

const PRODUCTION_HOURLY_COST_KEY = 'productionHourlyCost';
const FIXED_COST_PER_HOUR_KEY = 'fixedCostPerHour';
const DEFAULT_TARGET_MARGIN_KEY = 'defaultTargetMargin';
const DEFAULT_PRODUCTION_HOURLY_COST = 352;
const DEFAULT_FIXED_COST_PER_HOUR = 0;
const DEFAULT_TARGET_MARGIN = 25;

let recipesListener = null;
let recipesSearchTerm = '';
let productsData = {};
let productsForRecipeSelector = []; // Productos/variantes para selector: withVariants=true (1 por variante) + withVariants=false (padres sin variantes)
let laborRolesData = {};
let productionHourlyCost = DEFAULT_PRODUCTION_HOURLY_COST;
let fixedCostPerHour = DEFAULT_FIXED_COST_PER_HOUR;
let defaultTargetMargin = DEFAULT_TARGET_MARGIN;

// Product search functionality
let recipeProductSearchTimeout = null;
let recipeProductSearchInputHandler = null;
let recipeProductClickOutsideHandler = null;
let recipeProductKeyboardHandler = null;
let selectedRecipeProductIndex = -1;
let filteredRecipeProducts = [];

// Input/Product search functionality
let inputSearchTimeout = null;
let inputSearchInputHandler = null;
let inputClickOutsideHandler = null;
let inputKeyboardHandler = null;
let selectedInputIndex = -1;
let filteredInputsAndProducts = [];

/**
 * Normaliza variantes: Firebase puede devolver objeto { key: variant } en lugar de array.
 * Convierte a array y asegura que cada variante tenga id.
 */
function normalizeProductVariants(product) {
  if (!product || !product.variants) return product;
  const v = product.variants;
  let variantsArray = [];
  if (Array.isArray(v)) {
    variantsArray = v.map((item, idx) => ({
      ...item,
      id: item.id || item.sku || `v-${idx}`
    }));
  } else if (typeof v === 'object' && v !== null) {
    variantsArray = Object.entries(v).map(([key, item]) => ({
      ...item,
      id: item?.id || key
    }));
  }
  return { ...product, variants: variantsArray };
}

// Load data for calculations
async function loadDataForCalculations() {
  try {
    // Get nrd instance dynamically
    const nrd = window.nrd;
    if (!nrd) {
      logger.error('NRD service not available');
      return;
    }
    
    // productsData: todos los productos (para inputs, cálculos, lookups)
    const productsSnapshot = await nrd.products.getAll();
    const productsArray = Array.isArray(productsSnapshot) ? productsSnapshot : Object.values(productsSnapshot || {});
    productsData = productsArray.reduce((acc, product) => {
      if (product && product.id) {
        acc[product.id] = normalizeProductVariants(product);
      }
      return acc;
    }, {});

    // productsForRecipeSelector: solo productos con role producible (1 por variante o padre sin variantes)
    const [withVariants, withoutVariants] = await Promise.all([
      nrd.products.getAll({ withVariants: true }),
      nrd.products.getAll({ withVariants: false })
    ]);
    const allForSelector = [...(withVariants || []), ...(withoutVariants || [])];
    productsForRecipeSelector = allForSelector.filter(p => p && p.esProducible === true);

    // Load labor roles (for display names in recipe form)
    if (nrd.laborRoles) {
      const laborRolesSnapshot = await nrd.laborRoles.getAll();
      laborRolesData = Array.isArray(laborRolesSnapshot)
        ? laborRolesSnapshot.reduce((acc, role) => {
            if (role && role.id) acc[role.id] = role;
            return acc;
          }, {})
        : laborRolesSnapshot || {};
    }

    // Load config from nrd-data-access Configuraciones
    if (nrd.config) {
      try {
        const [prodVal, fixedVal, targetVal] = await Promise.all([
          nrd.config.get(PRODUCTION_HOURLY_COST_KEY),
          nrd.config.get(FIXED_COST_PER_HOUR_KEY),
          nrd.config.get(DEFAULT_TARGET_MARGIN_KEY)
        ]);
        productionHourlyCost = prodVal ? parseFloat(prodVal) : DEFAULT_PRODUCTION_HOURLY_COST;
        if (isNaN(productionHourlyCost)) productionHourlyCost = DEFAULT_PRODUCTION_HOURLY_COST;
        fixedCostPerHour = fixedVal ? parseFloat(fixedVal) : DEFAULT_FIXED_COST_PER_HOUR;
        if (isNaN(fixedCostPerHour)) fixedCostPerHour = DEFAULT_FIXED_COST_PER_HOUR;
        defaultTargetMargin = targetVal != null && targetVal !== '' ? parseFloat(targetVal) : DEFAULT_TARGET_MARGIN;
        if (isNaN(defaultTargetMargin)) defaultTargetMargin = DEFAULT_TARGET_MARGIN;
      } catch (e) {
        productionHourlyCost = DEFAULT_PRODUCTION_HOURLY_COST;
        fixedCostPerHour = DEFAULT_FIXED_COST_PER_HOUR;
        defaultTargetMargin = DEFAULT_TARGET_MARGIN;
      }
    }
  } catch (error) {
    logger.error('Error loading data for calculations', error);
  }
}

// Load recipes
function loadRecipes() {
  const recipesList = document.getElementById('recipes-list');
  if (!recipesList) return;
  
  recipesList.innerHTML = '';

  // Remove previous listener
  if (recipesListener) {
    recipesListener();
    recipesListener = null;
  }

  // Load supporting data first
  loadDataForCalculations();

  // Listen for recipes
  recipesListener = nrd.recipes.onValue(async (recipes) => {
    if (!recipesList) return;
    
    // Reload supporting data for real-time calculations
    await loadDataForCalculations();
    
    recipesList.innerHTML = '';
    
    const recipesDict = Array.isArray(recipes) 
      ? recipes.reduce((acc, recipe) => {
          if (recipe && recipe.id) {
            acc[recipe.id] = recipe;
          }
          return acc;
        }, {})
      : recipes || {};

    if (Object.keys(recipesDict).length === 0) {
      recipesList.innerHTML = `
        <div class="text-center py-8 sm:py-12 border border-gray-200 p-4 sm:p-8">
          <p class="text-gray-600 mb-3 sm:mb-4 text-sm sm:text-base">No hay recetas registradas</p>
        </div>
      `;
      return;
    }

    const isProducible = (product) => {
      if (!product) return false;
      if (product.esProducible === true) return true;
      const variants = product.variants && (Array.isArray(product.variants) ? product.variants : Object.values(product.variants || {}));
      return variants && variants.some(v => v && v.esProducible === true);
    };

    // Filter: solo recetas de productos con role producible
    let recipesToShow = Object.entries(recipesDict).filter(([id, recipe]) => {
      const product = productsData[recipe.productId];
      if (!isProducible(product)) return false;
      if (recipe.variantId && product?.variants) {
        const variant = product.variants.find(v => v.id === recipe.variantId);
        const variantProducible = variant && (variant.esProducible !== undefined ? variant.esProducible === true : product.esProducible === true);
        if (!variantProducible) return false;
      }
      return true;
    });

    if (recipesSearchTerm.trim()) {
      const normalizeSearchText = window.normalizeSearchText || window.NRDCommon?.normalizeSearchText || ((t) => t.toLowerCase());
      const normalizedTerm = normalizeSearchText(recipesSearchTerm.trim());
      recipesToShow = recipesToShow.filter(([id, recipe]) => {
        const product = productsData[recipe.productId];
        const productName = normalizeSearchText(product ? product.name : '');
        return productName.includes(normalizedTerm);
      });
    }
    
    if (recipesToShow.length === 0) {
      recipesList.innerHTML = '<p class="text-center text-gray-600 py-6 sm:py-8 text-sm sm:text-base">No hay recetas que coincidan con la búsqueda</p>';
      return;
    }

    // Calculate costs for each recipe and display
    for (const [id, recipe] of recipesToShow) {
      if (!recipe.active) continue;
      
      const product = productsData[recipe.productId];
      if (!product) continue;

      // Get variant info
      let variantName = '';
      if (recipe.variantId && product.variants) {
        const variant = product.variants.find(v => v.id === recipe.variantId);
        if (variant) {
          variantName = ` - ${variant.name}`;
        }
      }

      const directCost = await calculateDirectCost(recipe, productsData, productionHourlyCost, fixedCostPerHour);
      const directUnitCost = calculateDirectUnitCost(directCost, recipe.batchYield || 1);
      
      const item = document.createElement('div');
      item.className = 'border border-gray-200 p-3 sm:p-4 md:p-6 hover:border-red-600 transition-colors cursor-pointer';
      item.dataset.recipeId = id;
      item.innerHTML = `
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0 mb-2 sm:mb-3">
          <div class="text-base sm:text-lg font-light flex-1">${escapeHtml(product.name)}${variantName ? `<span class="text-gray-500 text-sm">${escapeHtml(variantName)}</span>` : ''}</div>
          <span class="px-2 sm:px-3 py-0.5 sm:py-1 text-xs uppercase tracking-wider border ${recipe.active ? 'border-red-600 text-red-600' : 'border-gray-300 text-gray-600'}">
            ${recipe.active ? 'Activa' : 'Inactiva'}
          </span>
        </div>
        <div class="text-xs sm:text-sm text-gray-600 space-y-1">
          <div>Rendimiento: <span class="font-medium">${parseFloat(recipe.batchYield || 0).toFixed(2)} unidades</span></div>
          <div>Costo del Lote: <span class="text-gray-700 font-medium">$${directCost.toFixed(2)}</span></div>
          <div>Costo Unitario: <span class="text-gray-700 font-medium">$${directUnitCost.toFixed(2)}</span></div>
          ${(() => {
            // Get price from variant if exists, otherwise from product
            let displayPrice = product.price || 0;
            if (recipe.variantId && product.variants) {
              const variant = product.variants.find(v => v.id === recipe.variantId);
              if (variant) {
                displayPrice = variant.price || 0;
              }
            }
            
            if (displayPrice > 0) {
              const margin = displayPrice > 0 && directUnitCost > 0 
                ? ((displayPrice - directUnitCost) / displayPrice * 100) 
                : 0;
              return `
          <div>Precio Venta: <span class="text-red-600 font-medium">$${parseFloat(displayPrice).toFixed(2)}</span></div>
          ${margin !== 0 ? `
          <div>Margen: <span class="${margin < 0 ? 'text-red-600' : 'text-green-600'} font-medium">${margin.toFixed(1)}%</span></div>
          ` : ''}
          `;
            }
            return '';
          })()}
        </div>
      `;
      item.addEventListener('click', () => viewRecipe(id));
      recipesList.appendChild(item);
    }
  });
}

// Show recipe form
function showRecipeForm(recipeId = null) {
  const form = document.getElementById('recipe-form');
  const list = document.getElementById('recipes-list');
  const header = document.querySelector('#recipes-view .flex.flex-col');
  
  if (!form || !list || !header) return;
  
  form.classList.remove('hidden');
  list.style.display = 'none';
  header.style.display = 'none';
  
  const formElement = document.getElementById('recipe-form-element');
  if (formElement) formElement.reset();
  
  const idInput = document.getElementById('recipe-id');
  if (idInput) idInput.value = recipeId || '';

  const title = document.getElementById('recipe-form-title');
  const subtitle = document.getElementById('recipe-form-subtitle');
  const formHeader = document.getElementById('recipe-form-header');
  const saveBtn = document.getElementById('save-recipe-btn');
  
  // Reset inputs list
  const inputsList = document.getElementById('recipe-inputs-list');
  if (inputsList) inputsList.innerHTML = '';
  
  // Limpiar información de unidad de producción
  clearProductionUnitInfo();
  
  if (recipeId) {
    if (title) title.textContent = 'Editar Receta';
    if (subtitle) subtitle.textContent = 'Modifique la información de la receta';
    if (formHeader) {
      formHeader.classList.remove('bg-green-600', 'bg-gray-600');
      formHeader.classList.add('bg-blue-600');
    }
    if (saveBtn) {
      saveBtn.classList.remove('bg-green-600', 'border-green-600', 'hover:bg-green-700');
      saveBtn.classList.add('bg-blue-600', 'border-blue-600', 'hover:bg-blue-700');
    }
    
    (async () => {
      await loadDataForCalculations();
      const recipe = await nrd.recipes.getById(recipeId);
      if (recipe) {
        const productHiddenInput = document.getElementById('recipe-product');
        const productSearchInput = document.getElementById('recipe-product-search');
        const batchYieldInput = document.getElementById('recipe-batch-yield');
        const activeInput = document.getElementById('recipe-active');
        
        const productId = recipe.productId || '';
        if (productHiddenInput) productHiddenInput.value = productId;
        if (productSearchInput && productId) {
          const product = productsData[productId];
          if (product) {
            productSearchInput.value = product.name || '';
          }
        }
        
        // Load variant
        const variantSelect = document.getElementById('recipe-variant');
        if (variantSelect && recipe.variantId) {
          updateRecipeVariantSelector(productId);
          variantSelect.value = recipe.variantId;
          updateProductionUnitInfo(productId, recipe.variantId);
        } else {
          updateRecipeVariantSelector(productId);
          updateProductionUnitInfo(productId, null);
        }
        
        if (batchYieldInput) batchYieldInput.value = recipe.batchYield || '';
        if (activeInput) activeInput.checked = recipe.active !== false;

        const observacionInput = document.getElementById('recipe-observacion');
        if (observacionInput) observacionInput.value = recipe.observacion || '';
        
        // Load labor minutes (new format) or convert from old labor array (hours → min)
        const laborMinutesInput = document.getElementById('recipe-labor-minutes');
        if (laborMinutesInput) {
          if (recipe.laborMinutes !== undefined && recipe.laborMinutes !== null && recipe.laborMinutes !== '') {
            laborMinutesInput.value = recipe.laborMinutes;
          } else if (recipe.labor && Array.isArray(recipe.labor) && recipe.labor.length > 0) {
            const totalHours = recipe.labor.reduce((sum, l) => sum + (l.hours || 0), 0);
            laborMinutesInput.value = Math.round(totalHours * 60 * 100) / 100;
          } else {
            laborMinutesInput.value = '';
          }
        }
        
        // Load inputs
        if (recipe.inputs && Array.isArray(recipe.inputs)) {
          recipe.inputs.forEach(input => {
            addInputRow(input.productId, input.quantity, true);
          });
        }
        
        updateRecipeCalculations();
      }
    })();
  } else {
    if (title) title.textContent = 'Nueva Receta';
    if (subtitle) subtitle.textContent = 'Cree una nueva receta para un producto';
    if (formHeader) {
      formHeader.classList.remove('bg-blue-600', 'bg-gray-600');
      formHeader.classList.add('bg-green-600');
    }
    if (saveBtn) {
      saveBtn.classList.remove('bg-blue-600', 'border-blue-600', 'hover:bg-blue-700');
      saveBtn.classList.add('bg-green-600', 'border-green-600', 'hover:bg-green-700');
    }
    const activeInput = document.getElementById('recipe-active');
    if (activeInput) activeInput.checked = true;
  }
  
  // Load dropdown options
  loadRecipeDropdowns();
}

// Load dropdown options for products, inputs, and labor roles
async function loadRecipeDropdowns() {
  await loadDataForCalculations();
  
  // Setup search components
  setupRecipeProductSearch();
  setupInputSearch();
}

// Search recipe product (main product)
function searchRecipeProduct(query) {
  const searchInput = document.getElementById('recipe-product-search');
  const resultsDiv = document.getElementById('recipe-product-search-results');
  const hiddenInput = document.getElementById('recipe-product');
  
  if (!searchInput || !resultsDiv || !hiddenInput) return;
  
  const normalizeSearchText = window.normalizeSearchText || window.NRDCommon?.normalizeSearchText || ((t) => t.toLowerCase());
  const searchTerm = normalizeSearchText(query.trim());
  
  if (searchTerm.length === 0) {
    resultsDiv.classList.add('hidden');
    return;
  }
  
  // Filter: productos producibles del selector (cada variante es un item, o padre sin variantes)
  const filtered = productsForRecipeSelector.filter(p => {
    if (!p || p.active === false || !p.esProducible || !p.name) return false;
    const displayName = p.productName && p.variantId ? `${p.productName} ${p.name}` : p.name;
    return normalizeSearchText(displayName).includes(searchTerm);
  });
  
  filteredRecipeProducts = filtered;
  selectedRecipeProductIndex = -1;
  
  // Build results HTML
  let resultsHTML = '';
  
  if (filtered.length === 0) {
    resultsHTML = '<div class="px-3 py-2 text-sm text-gray-500">No se encontraron productos producibles</div>';
  } else {
    resultsHTML = filtered.map((product, index) => {
      const displayName = product.productName && product.variantId ? `${product.productName} - ${product.name}` : product.name;
      const productId = product.productId || product.id;
      const variantId = product.variantId || '';
      return `
      <div class="recipe-product-search-item px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0" 
           data-product-id="${productId}" 
           data-variant-id="${escapeHtml(variantId)}"
           data-product-name="${escapeHtml(displayName)}"
           data-index="${index}">
        <div class="font-light text-sm">${escapeHtml(displayName)}</div>
        <div class="text-xs text-gray-600">$${parseFloat(product.price || 0).toFixed(2)}</div>
      </div>
    `;
    }).join('');
  }
  
  resultsDiv.innerHTML = resultsHTML;
  resultsDiv.classList.remove('hidden');
  
  // Attach click handlers
  document.querySelectorAll('.recipe-product-search-item').forEach(item => {
    item.addEventListener('click', () => {
      selectRecipeProduct(item, searchInput, resultsDiv, hiddenInput);
    });
  });
}

// Select recipe product
function selectRecipeProduct(item, searchInput, resultsDiv, hiddenInput) {
  const productId = item.dataset.productId;
  const variantId = item.dataset.variantId || '';
  const productName = item.dataset.productName;
  
  if (hiddenInput) hiddenInput.value = productId;
  if (searchInput) searchInput.value = productName;
  if (resultsDiv) resultsDiv.classList.add('hidden');
  
  selectedRecipeProductIndex = -1;
  
  // Variant: si viene del selector (variante como item), usar data-variant-id; si no, mostrar selector
  const variantContainer = document.getElementById('recipe-variant-container');
  const variantInput = document.getElementById('recipe-variant');
  if (variantContainer && variantInput) {
    if (variantId) {
      updateRecipeVariantSelector(productId); // poblar opciones
      variantInput.value = variantId;
      variantContainer.classList.add('hidden'); // ya seleccionado, ocultar
      variantInput.required = false;
    } else {
      updateRecipeVariantSelector(productId);
    }
  }
  
  // Actualizar información de unidad de producción
  updateProductionUnitInfo(productId, variantId);
  
  updateRecipeCalculations();
}

// Update production unit info display
function updateProductionUnitInfo(productId, variantId = null) {
  const product = productsData[productId];
  if (!product) {
    clearProductionUnitInfo();
    return;
  }
  
  // Obtener unidad de producción: primero de variante si existe, luego del producto padre
  let unidadProduccion = null;
  if (variantId && product.variants) {
    const variant = product.variants.find(v => v.id === variantId);
    if (variant) {
      unidadProduccion = variant.unidadProduccion || product.unidadProduccion;
    }
  } else {
    unidadProduccion = product.unidadProduccion;
  }
  
  const batchYieldLabel = document.querySelector('label[for="recipe-batch-yield"]');
  const batchYieldInput = document.getElementById('recipe-batch-yield');
  const batchYieldInfo = document.getElementById('recipe-batch-yield-info');
  
  if (unidadProduccion) {
    // Mostrar unidad de producción en el label
    if (batchYieldLabel) {
      batchYieldLabel.textContent = `Rendimiento del Lote (${unidadProduccion})`;
    }
    if (batchYieldInput) {
      batchYieldInput.placeholder = `Cantidad de ${unidadProduccion} que rinde el lote`;
    }
    // Mostrar mensaje informativo
    if (batchYieldInfo) {
      batchYieldInfo.textContent = `Las unidades de rendimiento deben ser en ${unidadProduccion} (unidad de producción del producto)`;
      batchYieldInfo.classList.remove('hidden', 'text-red-600');
      batchYieldInfo.classList.add('text-gray-500');
    }
  } else {
    // No tiene unidad de producción: mostrar advertencia
    if (batchYieldLabel) {
      batchYieldLabel.textContent = 'Rendimiento del Lote (unidades)';
    }
    if (batchYieldInput) {
      batchYieldInput.placeholder = 'Cantidad de unidades que rinde el lote';
    }
    if (batchYieldInfo) {
      batchYieldInfo.textContent = '⚠️ Este producto no tiene unidad de producción configurada. Debe configurar la unidad de producción en el producto antes de crear la receta.';
      batchYieldInfo.classList.remove('hidden', 'text-gray-500');
      batchYieldInfo.classList.add('text-red-600');
    }
  }
}

// Clear production unit info
function clearProductionUnitInfo() {
  const batchYieldLabel = document.querySelector('label[for="recipe-batch-yield"]');
  const batchYieldInput = document.getElementById('recipe-batch-yield');
  const batchYieldInfo = document.getElementById('recipe-batch-yield-info');
  
  if (batchYieldLabel) {
    batchYieldLabel.textContent = 'Rendimiento del Lote (unidades)';
  }
  if (batchYieldInput) {
    batchYieldInput.placeholder = 'Cantidad de unidades que rinde el lote';
  }
  if (batchYieldInfo) {
    batchYieldInfo.classList.add('hidden');
  }
}

// Update variant selector based on selected product
function updateRecipeVariantSelector(productId) {
  const variantContainer = document.getElementById('recipe-variant-container');
  const variantSelect = document.getElementById('recipe-variant');
  
  if (!variantContainer || !variantSelect) return;
  
  const product = productsData[productId];
  const variants = product?.variants;
  const hasVariants = variants && (Array.isArray(variants) ? variants.length > 0 : Object.keys(variants || {}).length > 0);
  if (!product || !hasVariants) {
    // Product has no variants, hide selector
    variantContainer.classList.add('hidden');
    variantSelect.value = '';
    variantSelect.required = false;
    // Actualizar unidad de producción sin variante
    updateProductionUnitInfo(productId, null);
    return;
  }
  
  // Product has variants, show selector
  variantContainer.classList.remove('hidden');
  variantSelect.required = true;
  
  // Clear and populate options (variants ya normalizadas en productsData)
  variantSelect.innerHTML = '<option value="">Seleccione una variante...</option>';
  const variantsList = Array.isArray(product.variants) ? product.variants : Object.entries(product.variants || {}).map(([k, v]) => ({ ...v, id: v?.id || k }));
  variantsList.forEach((variant, idx) => {
    if (variant.active !== false && variant.name) {
      const variantId = variant.id || variant.sku || `v-${idx}`;
      const option = document.createElement('option');
      option.value = variantId;
      option.textContent = `${variant.name} - $${parseFloat(variant.price || 0).toFixed(2)}`;
      variantSelect.appendChild(option);
    }
  });
  
  // Agregar listener para cuando cambie la variante
  variantSelect.onchange = () => {
    const selectedVariantId = variantSelect.value;
    updateProductionUnitInfo(productId, selectedVariantId || null);
    updateRecipeCalculations();
  };
  
  // Si no hay variante seleccionada, mostrar unidad del producto padre
  if (!variantSelect.value) {
    updateProductionUnitInfo(productId, null);
  }
}

// Setup recipe product search
function setupRecipeProductSearch() {
  const searchInput = document.getElementById('recipe-product-search');
  const resultsDiv = document.getElementById('recipe-product-search-results');
  
  if (!searchInput || !resultsDiv) return;
  
  // Remove previous listeners
  if (recipeProductSearchInputHandler) {
    searchInput.removeEventListener('input', recipeProductSearchInputHandler);
  }
  
  // Add input listener
  recipeProductSearchInputHandler = (e) => {
    clearTimeout(recipeProductSearchTimeout);
    recipeProductSearchTimeout = setTimeout(() => {
      searchRecipeProduct(e.target.value);
    }, 200);
  };
  searchInput.addEventListener('input', recipeProductSearchInputHandler);
  
  // Keyboard navigation
  if (recipeProductKeyboardHandler) {
    searchInput.removeEventListener('keydown', recipeProductKeyboardHandler);
  }
  
  recipeProductKeyboardHandler = (e) => {
    const items = document.querySelectorAll('.recipe-product-search-item');
    const totalItems = items.length;
    
    if (totalItems === 0) return;
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedRecipeProductIndex = selectedRecipeProductIndex >= totalItems - 1 ? 0 : selectedRecipeProductIndex + 1;
      updateRecipeProductSelection(items);
      if (items[selectedRecipeProductIndex]) {
        items[selectedRecipeProductIndex].scrollIntoView({ block: 'nearest' });
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedRecipeProductIndex = selectedRecipeProductIndex <= 0 ? totalItems - 1 : selectedRecipeProductIndex - 1;
      updateRecipeProductSelection(items);
      if (items[selectedRecipeProductIndex]) {
        items[selectedRecipeProductIndex].scrollIntoView({ block: 'nearest' });
      }
    } else if (e.key === 'Enter' && selectedRecipeProductIndex >= 0) {
      e.preventDefault();
      const selectedItem = items[selectedRecipeProductIndex];
      if (selectedItem) {
        const hiddenInput = document.getElementById('recipe-product');
        selectRecipeProduct(selectedItem, searchInput, resultsDiv, hiddenInput);
      }
    } else if (e.key === 'Escape') {
      resultsDiv.classList.add('hidden');
      selectedRecipeProductIndex = -1;
    }
  };
  
  searchInput.addEventListener('keydown', recipeProductKeyboardHandler);
  
  // Click outside handler
  if (recipeProductClickOutsideHandler) {
    document.removeEventListener('click', recipeProductClickOutsideHandler);
  }
  
  recipeProductClickOutsideHandler = (e) => {
    if (resultsDiv && !searchInput.contains(e.target) && !resultsDiv.contains(e.target)) {
      resultsDiv.classList.add('hidden');
      selectedRecipeProductIndex = -1;
    }
  };
  document.addEventListener('click', recipeProductClickOutsideHandler);
}

// Update recipe product selection highlighting
function updateRecipeProductSelection(items) {
  items.forEach((item, index) => {
    if (index === selectedRecipeProductIndex) {
      item.classList.add('bg-red-50', 'border-red-200');
      item.classList.remove('hover:bg-gray-50');
    } else {
      item.classList.remove('bg-red-50', 'border-red-200');
      item.classList.add('hover:bg-gray-50');
    }
  });
}

// Search products with esInsumo: true (for recipe inputs)
function searchInputsAndProducts(query) {
  const searchInput = document.getElementById('add-input-search');
  const resultsDiv = document.getElementById('add-input-search-results');
  
  if (!searchInput || !resultsDiv) return;
  
  const normalizeSearchText = window.normalizeSearchText || window.NRDCommon?.normalizeSearchText || ((t) => t.toLowerCase());
  const searchTerm = normalizeSearchText(query.trim());
  
  if (searchTerm.length === 0) {
    resultsDiv.classList.add('hidden');
    return;
  }
  
  // Filter only products with esInsumo: true
  const products = Object.values(productsData)
    .filter(p => p.active !== false && p.esInsumo === true && p.name && normalizeSearchText(p.name).includes(searchTerm));
  
  filteredInputsAndProducts = products;
  selectedInputIndex = -1;
  
  // Build results HTML
  let resultsHTML = '';
  
  if (products.length === 0) {
    resultsHTML = '<div class="px-3 py-2 text-sm text-gray-500">No se encontraron productos con rol de insumo</div>';
  } else {
    resultsHTML = products.map((product, index) => {
      const displayName = product.name || 'Sin nombre';
      const unit = product.unidadVenta || product.unidadProduccion || 'unidad';
      const displayInfo = `Producto - ${unit} - $${parseFloat(product.cost || 0).toFixed(2)}`;
      
      return `
        <div class="input-search-item px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0" 
             data-item-id="${product.id}" 
             data-item-name="${escapeHtml(displayName)}"
             data-index="${index}">
          <div class="font-light text-sm">${escapeHtml(displayName)}</div>
          <div class="text-xs text-gray-600">${displayInfo}</div>
        </div>
      `;
    }).join('');
  }
  
  resultsDiv.innerHTML = resultsHTML;
  resultsDiv.classList.remove('hidden');
  
  // Attach click handlers
  document.querySelectorAll('.input-search-item').forEach(item => {
    item.addEventListener('click', () => {
      selectInputOrProduct(item, searchInput, resultsDiv);
    });
  });
}

// Select product (as input)
function selectInputOrProduct(item, searchInput, resultsDiv) {
  const itemId = item.dataset.itemId;
  const itemName = item.dataset.itemName;
  
  const hiddenInput = document.getElementById('add-input-select');
  
  if (hiddenInput) hiddenInput.value = itemId;
  if (searchInput) searchInput.value = itemName;
  if (resultsDiv) resultsDiv.classList.add('hidden');
  
  selectedInputIndex = -1;
}

// Setup input search
function setupInputSearch() {
  const searchInput = document.getElementById('add-input-search');
  const resultsDiv = document.getElementById('add-input-search-results');
  
  if (!searchInput || !resultsDiv) return;
  
  // Remove previous listeners
  if (inputSearchInputHandler) {
    searchInput.removeEventListener('input', inputSearchInputHandler);
  }
  
  // Add input listener
  inputSearchInputHandler = (e) => {
    clearTimeout(inputSearchTimeout);
    inputSearchTimeout = setTimeout(() => {
      searchInputsAndProducts(e.target.value);
    }, 200);
  };
  searchInput.addEventListener('input', inputSearchInputHandler);
  
  // Keyboard navigation
  if (inputKeyboardHandler) {
    searchInput.removeEventListener('keydown', inputKeyboardHandler);
  }
  
  inputKeyboardHandler = (e) => {
    const items = document.querySelectorAll('.input-search-item');
    const totalItems = items.length;
    
    if (totalItems === 0) return;
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedInputIndex = selectedInputIndex >= totalItems - 1 ? 0 : selectedInputIndex + 1;
      updateInputSelection(items);
      if (items[selectedInputIndex]) {
        items[selectedInputIndex].scrollIntoView({ block: 'nearest' });
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedInputIndex = selectedInputIndex <= 0 ? totalItems - 1 : selectedInputIndex - 1;
      updateInputSelection(items);
      if (items[selectedInputIndex]) {
        items[selectedInputIndex].scrollIntoView({ block: 'nearest' });
      }
    } else if (e.key === 'Enter' && selectedInputIndex >= 0) {
      e.preventDefault();
      const selectedItem = items[selectedInputIndex];
      if (selectedItem) {
        selectInputOrProduct(selectedItem, searchInput, resultsDiv);
      }
    } else if (e.key === 'Escape') {
      resultsDiv.classList.add('hidden');
      selectedInputIndex = -1;
    }
  };
  
  searchInput.addEventListener('keydown', inputKeyboardHandler);
  
  // Click outside handler
  if (inputClickOutsideHandler) {
    document.removeEventListener('click', inputClickOutsideHandler);
  }
  
  inputClickOutsideHandler = (e) => {
    if (resultsDiv && !searchInput.contains(e.target) && !resultsDiv.contains(e.target)) {
      resultsDiv.classList.add('hidden');
      selectedInputIndex = -1;
    }
  };
  document.addEventListener('click', inputClickOutsideHandler);
}

// Update input selection highlighting
function updateInputSelection(items) {
  items.forEach((item, index) => {
    if (index === selectedInputIndex) {
      item.classList.add('bg-red-50', 'border-red-200');
      item.classList.remove('hover:bg-gray-50');
    } else {
      item.classList.remove('bg-red-50', 'border-red-200');
      item.classList.add('hover:bg-gray-50');
    }
  });
}

// Add input row to recipe (using product with esInsumo: true)
function addInputRow(productId = '', quantity = '', allowRemove = true) {
  const inputsList = document.getElementById('recipe-inputs-list');
  if (!inputsList) return;
  
  const row = document.createElement('div');
  row.className = 'flex flex-col sm:flex-row gap-2 sm:gap-3 items-start sm:items-center p-2 sm:p-3 border border-gray-200 rounded mb-2';
  
  const product = productsData[productId];
  const productName = product?.name || 'Producto';
  const currentPrice = product?.cost || 0;
  const unit = product?.unidadVenta || product?.unidadProduccion || 'unidad';
  
  row.innerHTML = `
    <input type="hidden" class="input-id" value="${escapeHtml(productId)}">
    <div class="flex-1">
      <div class="text-sm font-medium">${escapeHtml(productName)}</div>
      <div class="text-xs text-gray-500">Producto (Insumo) - Precio actual: $${parseFloat(currentPrice).toFixed(2)}/${unit}</div>
    </div>
    <div class="w-full sm:w-32">
      <label class="block text-xs text-gray-600 mb-1">Cantidad</label>
      <input type="number" class="input-quantity w-full px-2 py-1 border border-gray-300 rounded text-sm" 
        step="0.01" min="0" value="${quantity}" required>
    </div>
    <div class="w-full sm:w-32">
      <label class="block text-xs text-gray-600 mb-1">Subtotal</label>
      <div class="text-sm font-medium text-gray-700" data-subtotal>$${(parseFloat(quantity || 0) * parseFloat(currentPrice)).toFixed(2)}</div>
    </div>
    ${allowRemove ? `
    <button type="button" class="remove-input-btn px-3 py-1 text-red-600 hover:bg-red-50 border border-red-600 rounded text-sm transition-colors">
      Eliminar
    </button>
    ` : ''}
  `;
  
  // Add event listener for quantity change
  const quantityInput = row.querySelector('.input-quantity');
  if (quantityInput) {
    quantityInput.addEventListener('input', () => {
      updateInputRowSubtotal(row);
      updateRecipeCalculations();
    });
  }
  
  // Add event listener for remove button
  if (allowRemove) {
    const removeBtn = row.querySelector('.remove-input-btn');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        row.remove();
        updateRecipeCalculations();
      });
    }
  }
  
  inputsList.appendChild(row);
}

// Update input row subtotal
function updateInputRowSubtotal(row) {
  const productId = row.querySelector('.input-id')?.value;
  const quantity = parseFloat(row.querySelector('.input-quantity')?.value || 0);
  const subtotalEl = row.querySelector('[data-subtotal]');
  
  if (!subtotalEl || !productId) return;
  
  const product = productsData[productId];
  const currentPrice = product?.cost || 0;
  
  subtotalEl.textContent = `$${(quantity * parseFloat(currentPrice)).toFixed(2)}`;
}

// Update recipe calculations display
async function updateRecipeCalculations() {
  const calculationsEl = document.getElementById('recipe-calculations');
  if (!calculationsEl) return;
  
  const productHiddenInput = document.getElementById('recipe-product');
  const batchYieldInput = document.getElementById('recipe-batch-yield');
  
  const productId = productHiddenInput?.value;
  const batchYield = parseFloat(batchYieldInput?.value || 0);
  
  if (!productId || batchYield <= 0) {
    calculationsEl.innerHTML = '<p class="text-gray-500 text-sm">Complete el producto y el rendimiento para ver los cálculos</p>';
    return;
  }
  
  // Build recipe object from form
  const inputs = [];
  const inputsRows = document.querySelectorAll('#recipe-inputs-list > div');
  inputsRows.forEach(row => {
    const productId = row.querySelector('.input-id')?.value;
    const quantity = parseFloat(row.querySelector('.input-quantity')?.value || 0);
    if (productId && quantity > 0) {
      inputs.push({ productId, quantity });
    }
  });
  
  const laborMinutesInput = document.getElementById('recipe-labor-minutes');
  const laborMinutes = laborMinutesInput ? parseFloat(laborMinutesInput.value || 0) : 0;
  
  const recipe = {
    productId,
    batchYield,
    inputs,
    laborMinutes: isNaN(laborMinutes) || laborMinutes <= 0 ? undefined : laborMinutes
  };
  
  const directCost = await calculateDirectCost(recipe, productsData, productionHourlyCost, fixedCostPerHour);
  const directUnitCost = calculateDirectUnitCost(directCost, batchYield);
  
  // Desglose para mostrar en Cálculos Finales
  let inputsCost = 0;
  for (const inp of inputs) {
    const product = productsData[inp.productId];
    if (product && product.cost !== undefined) {
      inputsCost += inp.quantity * product.cost;
    }
  }
  const fixedCostVal = parseFloat(fixedCostPerHour) || 0;
  let laborCost = 0;
  let fixedCost = 0;
  const laborMins = isNaN(laborMinutes) || laborMinutes <= 0 ? 0 : laborMinutes;
  if (laborMins > 0) {
    laborCost = (laborMins / 60) * productionHourlyCost;
    fixedCost = fixedCostVal > 0 ? (laborMins / 60) * fixedCostVal : 0;
  }
  
  const product = productsData[productId];
  const targetMargin = (product?.targetMargin != null && product?.targetMargin !== '' && !isNaN(parseFloat(product.targetMargin)))
    ? parseFloat(product.targetMargin)
    : defaultTargetMargin;
  const suggestedPrice = calculateSuggestedPrice(directUnitCost, targetMargin);
  const currentPrice = product?.price || 0;
  const realMargin = currentPrice > 0 ? calculateRealMargin(currentPrice, directUnitCost) : 0;
  
  calculationsEl.innerHTML = `
    <div class="space-y-2 text-sm">
      <div class="flex justify-between py-1 border-b border-gray-200">
        <span class="text-gray-600">Mano de obra <span class="text-gray-500">($${parseFloat(productionHourlyCost).toFixed(0)}/h)</span>:</span>
        <span class="font-medium">$${laborCost.toFixed(2)}</span>
      </div>
      <div class="flex justify-between py-1 border-b border-gray-200">
        <span class="text-gray-600">Gastos fijos <span class="text-gray-500">($${fixedCostVal.toFixed(0)}/h)</span>:</span>
        <span class="font-medium">$${fixedCost.toFixed(2)}</span>
      </div>
      <div class="flex justify-between py-1 border-b border-gray-200">
        <span class="text-gray-600">Insumos:</span>
        <span class="font-medium">$${inputsCost.toFixed(2)}</span>
      </div>
      <div class="flex justify-between py-1 border-b border-gray-200">
        <span class="text-gray-600">Costo del Lote:</span>
        <span class="font-medium">$${directCost.toFixed(2)}</span>
      </div>
      <div class="flex justify-between py-1 border-b border-gray-200">
        <span class="text-gray-600">Costo Unitario:</span>
        <span class="font-medium">$${directUnitCost.toFixed(2)}</span>
      </div>
      ${targetMargin > 0 ? `
      <div class="flex justify-between py-1 border-b border-gray-200">
        <span class="text-gray-600">Precio Sugerido (${targetMargin}% margen):</span>
        <span class="font-medium text-blue-600">$${suggestedPrice.toFixed(2)}</span>
      </div>
      ` : ''}
      ${currentPrice > 0 ? `
      <div class="flex justify-between py-1 border-b border-gray-200">
        <span class="text-gray-600">Precio Actual:</span>
        <span class="font-medium text-red-600">$${currentPrice.toFixed(2)}</span>
      </div>
      <div class="flex justify-between py-1 border-b border-gray-200">
        <span class="text-gray-600">Margen Real:</span>
        <span class="font-medium ${realMargin < 0 ? 'text-red-600' : realMargin < targetMargin ? 'text-orange-600' : 'text-green-600'}">${realMargin.toFixed(1)}%</span>
      </div>
      ` : ''}
    </div>
  `;
}

// Hide recipe form
function hideRecipeForm() {
  const form = document.getElementById('recipe-form');
  const list = document.getElementById('recipes-list');
  const header = document.querySelector('#recipes-view .flex.flex-col');
  
  if (form) form.classList.add('hidden');
  if (list) list.style.display = 'block';
  if (header) header.style.display = 'flex';
}

// Save recipe
async function saveRecipe(recipeId, recipeData) {
  if (recipeId) {
    await nrd.recipes.update(recipeId, recipeData);
    return { key: recipeId };
  } else {
    recipeData.createdAt = Date.now();
    const id = await nrd.recipes.create(recipeData);
    return { key: id, getKey: () => id };
  }
}

// View recipe detail
async function viewRecipe(recipeId) {
  showSpinner('Cargando receta...');
  try {
    await loadDataForCalculations();
    const recipe = await nrd.recipes.getById(recipeId);
    if (!recipe) {
      await showError('Receta no encontrada');
      return;
    }

    const product = productsData[recipe.productId];
    if (!product) {
      await showError('Producto asociado no encontrado');
      return;
    }

    const directCost = await calculateDirectCost(recipe, productsData, productionHourlyCost, fixedCostPerHour);
    const directUnitCost = calculateDirectUnitCost(directCost, recipe.batchYield || 1);
    const targetMargin = (product.targetMargin != null && product.targetMargin !== '' && !isNaN(parseFloat(product.targetMargin)))
      ? parseFloat(product.targetMargin)
      : defaultTargetMargin;
    const suggestedPrice = calculateSuggestedPrice(directUnitCost, targetMargin);
    const currentPrice = product.price || 0;
    const realMargin = currentPrice > 0 ? calculateRealMargin(currentPrice, directUnitCost) : 0;

    const list = document.getElementById('recipes-list');
    const header = document.querySelector('#recipes-view .flex.flex-col');
    const form = document.getElementById('recipe-form');
    const detail = document.getElementById('recipe-detail');
    
    if (list) list.style.display = 'none';
    if (header) header.style.display = 'none';
    if (form) form.classList.add('hidden');
    if (detail) detail.classList.remove('hidden');

    const detailContent = document.getElementById('recipe-detail-content');
    if (detailContent) {
      let inputsCost = 0;
      let inputsHtml = '<p class="text-gray-500 text-sm">No hay insumos</p>';
      if (recipe.inputs && recipe.inputs.length > 0) {
        inputsHtml = '<div class="space-y-2">';
        for (const recipeInput of recipe.inputs) {
          const productId = recipeInput.productId || recipeInput.inputId;
          const prod = productsData[productId];
          const inputName = prod?.name || 'Producto';
          const unitPrice = prod?.cost || 0;
          const unit = prod?.unidadVenta || prod?.unidadProduccion || 'unidad';
          const lineCost = parseFloat(recipeInput.quantity || 0) * parseFloat(unitPrice);
          inputsCost += lineCost;
          inputsHtml += `
            <div class="flex flex-col sm:flex-row sm:justify-between gap-1 py-2 border-b border-gray-200 text-sm">
              <span class="break-words">${escapeHtml(inputName)} (Producto)</span>
              <span class="sm:text-right shrink-0">${parseFloat(recipeInput.quantity || 0).toFixed(2)} ${unit} × $${parseFloat(unitPrice).toFixed(2)} = <span class="font-medium">$${lineCost.toFixed(2)}</span></span>
            </div>
          `;
        }
        inputsHtml += '</div>';
      }

      let laborCost = 0;
      let fixedCost = 0;
      const fixedCostVal = parseFloat(fixedCostPerHour) || 0;
      let laborHtml = '<p class="text-gray-500 text-sm">No hay mano de obra</p>';
      const laborMins = parseFloat(recipe.laborMinutes);
      if (!isNaN(laborMins) && laborMins > 0) {
        laborCost = (laborMins / 60) * productionHourlyCost;
        fixedCost = fixedCostVal > 0 ? (laborMins / 60) * fixedCostVal : 0;
        laborHtml = `
          <div class="flex flex-col sm:flex-row sm:justify-between gap-1 py-2 border-b border-gray-200 text-sm">
            <span>Mano de obra</span>
            <span class="sm:text-right shrink-0">${laborMins.toFixed(2)} min × $${parseFloat(productionHourlyCost).toFixed(0)}/h = <span class="font-medium">$${laborCost.toFixed(2)}</span></span>
          </div>
          ${fixedCost > 0 ? `
          <div class="flex flex-col sm:flex-row sm:justify-between gap-1 py-2 border-b border-gray-200 text-sm">
            <span>Gastos fijos por tiempo</span>
            <span class="sm:text-right shrink-0">${laborMins.toFixed(2)} min × $${fixedCostVal.toFixed(0)}/h = <span class="font-medium">$${fixedCost.toFixed(2)}</span></span>
          </div>
          ` : ''}
        `;
      } else if (recipe.labor && recipe.labor.length > 0) {
        let totalHours = 0;
        laborHtml = '<div class="space-y-2">';
        for (const recipeLabor of recipe.labor) {
          const hrs = parseFloat(recipeLabor.hours || 0);
          totalHours += hrs;
          const roleName = laborRolesData[recipeLabor.roleId]?.name || 'Rol';
          const hourlyCost = productionHourlyCost;
          laborHtml += `
            <div class="flex flex-col sm:flex-row sm:justify-between gap-1 py-2 border-b border-gray-200 text-sm">
              <span>${escapeHtml(roleName)}</span>
              <span class="sm:text-right shrink-0">${hrs.toFixed(2)} horas × $${parseFloat(hourlyCost).toFixed(0)} = <span class="font-medium">$${(hrs * parseFloat(hourlyCost)).toFixed(2)}</span></span>
            </div>
          `;
        }
        laborCost = totalHours * productionHourlyCost;
        fixedCost = fixedCostVal > 0 ? totalHours * fixedCostVal : 0;
        laborHtml += '</div>';
      }

      // Get variant info if exists
      let variantInfo = '';
      if (recipe.variantId && product.variants) {
        const variant = product.variants.find(v => v.id === recipe.variantId);
        if (variant) {
          const fullSku = variant.skuSuffix && product.sku ? `${product.sku}_${variant.skuSuffix}` : '';
          variantInfo = `
          <div class="flex justify-between py-2 sm:py-3 border-b border-gray-200">
            <span class="text-gray-600 font-light text-sm sm:text-base">Variante:</span>
            <span class="font-light text-sm sm:text-base">${escapeHtml(variant.name)} - $${parseFloat(variant.price || 0).toFixed(2)}</span>
          </div>
          ${fullSku ? `
          <div class="flex justify-between py-2 sm:py-3 border-b border-gray-200">
            <span class="text-gray-600 font-light text-sm sm:text-base">SKU Variante:</span>
            <span class="font-light text-sm sm:text-base font-mono">${escapeHtml(fullSku)}</span>
          </div>
          ` : ''}
          `;
        }
      }
      
      detailContent.innerHTML = `
        <div class="space-y-4">
          <div class="flex justify-between py-2 sm:py-3 border-b border-gray-200">
            <span class="text-gray-600 font-light text-sm sm:text-base">Producto:</span>
            <span class="font-light text-sm sm:text-base">${escapeHtml(product.name)}</span>
          </div>
          ${variantInfo}
          <div class="flex justify-between py-2 sm:py-3 border-b border-gray-200">
            <span class="text-gray-600 font-light text-sm sm:text-base">Rendimiento del Lote:</span>
            <span class="font-light text-sm sm:text-base">${parseFloat(recipe.batchYield || 0).toFixed(2)} unidades</span>
          </div>
          <div class="py-2 sm:py-3 border-b border-gray-200">
            <div class="text-gray-600 font-light text-sm sm:text-base mb-2">Insumos:</div>
            ${inputsHtml}
          </div>
          <div class="py-2 sm:py-3 border-b border-gray-200">
            <div class="text-gray-600 font-light text-sm sm:text-base mb-2">Tiempo del Lote (minutos):</div>
            ${laborHtml}
          </div>
          <div class="py-2 sm:py-3 border-b border-gray-200">
            <div class="text-gray-600 font-light text-sm sm:text-base mb-3">Cálculos Finales:</div>
            <div class="space-y-3 text-sm">
              <div class="space-y-2">
                <div class="flex justify-between py-1 border-b border-gray-100">
                  <span>Mano de obra <span class="text-gray-500">($${parseFloat(productionHourlyCost).toFixed(0)}/h)</span>:</span>
                  <span class="font-medium">$${laborCost.toFixed(2)}</span>
                </div>
                <div class="flex justify-between py-1 border-b border-gray-100">
                  <span>Gastos fijos <span class="text-gray-500">($${fixedCostVal.toFixed(0)}/h)</span>:</span>
                  <span class="font-medium">$${fixedCost.toFixed(2)}</span>
                </div>
                <div class="flex justify-between py-1 border-b border-gray-100">
                  <span>Insumos:</span>
                  <span class="font-medium">$${inputsCost.toFixed(2)}</span>
                </div>
                <div class="flex justify-between pt-2">
                  <span>Costo del Lote:</span>
                  <span class="font-medium">$${directCost.toFixed(2)}</span>
                </div>
                <div class="flex justify-between">
                  <span>Costo Unitario:</span>
                  <span class="font-medium">$${directUnitCost.toFixed(2)}</span>
                </div>
                ${currentPrice > 0 ? `
                <div class="flex justify-between">
                  <span>Precio Actual:</span>
                  <span class="font-medium text-red-600">$${currentPrice.toFixed(2)}</span>
                </div>
                <div class="flex justify-between">
                  <span>Margen Real:</span>
                  <span class="font-medium ${realMargin < 0 ? 'text-red-600' : realMargin < targetMargin ? 'text-orange-600' : 'text-green-600'}">${realMargin.toFixed(1)}%</span>
                </div>
                ` : ''}
              </div>
            </div>
          </div>
          <div class="flex justify-between py-2 sm:py-3 border-b border-gray-200">
            <span class="text-gray-600 font-light text-sm sm:text-base">Estado:</span>
            <span class="px-2 sm:px-3 py-0.5 sm:py-1 text-xs uppercase tracking-wider border ${recipe.active ? 'border-red-600 text-red-600' : 'border-gray-300 text-gray-600'}">
              ${recipe.active ? 'Activa' : 'Inactiva'}
            </span>
          </div>
          <div class="py-2 sm:py-3 border-b border-gray-200">
            <div class="text-gray-600 font-light text-sm sm:text-base mb-1">Observación o procedimiento:</div>
            <div class="text-sm text-gray-800 whitespace-pre-wrap">${recipe.observacion ? escapeHtml(recipe.observacion) : '<span class="text-gray-400">—</span>'}</div>
          </div>
        </div>
      `;
    }

    const editBtn = document.getElementById('edit-recipe-detail-btn');
    const deleteBtn = document.getElementById('delete-recipe-detail-btn');
    
    if (editBtn) {
      editBtn.onclick = () => {
        if (detail) detail.classList.add('hidden');
        showRecipeForm(recipeId);
      };
    }
    
    if (deleteBtn) {
      deleteBtn.onclick = () => deleteRecipeHandler(recipeId);
    }

    const printBtn = document.getElementById('print-recipe-detail-btn');
    if (printBtn) {
      printBtn.onclick = () => window.print();
    }
  } catch (error) {
    await showError('Error al cargar receta: ' + error.message);
  } finally {
    hideSpinner();
  }
}

// Back to recipes list
function backToRecipes() {
  const list = document.getElementById('recipes-list');
  const header = document.querySelector('#recipes-view .flex.flex-col');
  const detail = document.getElementById('recipe-detail');
  
  if (list) list.style.display = 'block';
  if (header) header.style.display = 'flex';
  if (detail) detail.classList.add('hidden');
}

// Delete recipe handler
async function deleteRecipeHandler(recipeId) {
  const confirmed = await showConfirm('Eliminar Receta', '¿Está seguro de eliminar esta receta?');
  if (!confirmed) return;

  showSpinner('Eliminando receta...');
  try {
    await nrd.recipes.delete(recipeId);
    backToRecipes();
  } catch (error) {
    await showError('Error al eliminar receta: ' + error.message);
  } finally {
    hideSpinner();
  }
}

// Recipe form submit handler
let recipeFormHandlerSetup = false;
function setupRecipeFormHandler() {
  if (recipeFormHandlerSetup) return;
  const formElement = document.getElementById('recipe-form-element');
  if (!formElement) return;
  
  recipeFormHandlerSetup = true;
  formElement.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const recipeId = document.getElementById('recipe-id')?.value;
    const productId = document.getElementById('recipe-product')?.value;
    const variantId = document.getElementById('recipe-variant')?.value || null;
    const batchYield = parseFloat(document.getElementById('recipe-batch-yield')?.value);
    const active = document.getElementById('recipe-active')?.checked;
    const observacion = document.getElementById('recipe-observacion')?.value?.trim() || '';

    if (!productId) {
      await showError('Por favor seleccione un producto');
      return;
    }

    // Validate variant selection
    const product = productsData[productId];
    if (product && product.variants && product.variants.length > 0) {
      if (!variantId) {
        await showError('Este producto tiene variantes. Debe seleccionar una variante para la receta.');
        return;
      }
    } else {
      if (variantId) {
        await showError('Este producto no tiene variantes.');
        return;
      }
    }

    if (isNaN(batchYield) || batchYield <= 0) {
      await showError('El rendimiento del lote debe ser un número mayor a 0');
      return;
    }

    // Validar que el producto tenga unidad de producción configurada
    if (!product) {
      await showError('Producto no encontrado');
      return;
    }
    
    let unidadProduccion = null;
    if (variantId && product.variants) {
      const variant = product.variants.find(v => v.id === variantId);
      if (variant) {
        unidadProduccion = variant.unidadProduccion || product.unidadProduccion;
      }
    } else {
      unidadProduccion = product.unidadProduccion;
    }
    
    if (!unidadProduccion) {
      const productDisplayName = variantId && product.variants 
        ? `${product.name} - ${product.variants.find(v => v.id === variantId)?.name || 'variante'}`
        : product.name;
      await showError(
        `El producto "${productDisplayName}" no tiene unidad de producción configurada. ` +
        `Debe configurar la unidad de producción en el producto antes de crear la receta. ` +
        `Vaya a la gestión de productos y agregue una unidad de medida de tipo "Producción" para este producto.`
      );
      return;
    }

    // Collect inputs (products with esInsumo: true)
    const inputs = [];
    const inputsRows = document.querySelectorAll('#recipe-inputs-list > div');
    inputsRows.forEach(row => {
      const productId = row.querySelector('.input-id')?.value;
      const quantity = parseFloat(row.querySelector('.input-quantity')?.value || 0);
      if (productId && quantity > 0) {
        inputs.push({ productId, quantity });
      }
    });

    // Labor minutes (0 or empty = no labor cost)
    const laborMinutesInput = document.getElementById('recipe-labor-minutes');
    const laborMinutes = laborMinutesInput ? parseFloat(laborMinutesInput.value || 0) : 0;

    showSpinner('Guardando receta...');
    try {
      const recipeData = { 
        productId, 
        batchYield, 
        inputs, 
        active 
      };
      
      if (!isNaN(laborMinutes) && laborMinutes > 0) {
        recipeData.laborMinutes = laborMinutes;
      }
      
      if (variantId) {
        recipeData.variantId = variantId;
      }

      recipeData.observacion = observacion;
      
      if (!recipeId) {
        recipeData.createdAt = Date.now();
      }
      
      await saveRecipe(recipeId || null, recipeData);
      hideRecipeForm();
    } catch (error) {
      await showError('Error al guardar receta: ' + error.message);
    } finally {
      hideSpinner();
    }
  });
  
  // Add input button
  const addInputBtn = document.getElementById('add-input-btn');
  if (addInputBtn) {
    addInputBtn.addEventListener('click', () => {
      const hiddenInput = document.getElementById('add-input-select');
      const searchInput = document.getElementById('add-input-search');
      const quantityInput = document.getElementById('add-input-quantity');
      
      const productId = hiddenInput?.value;
      const quantity = quantityInput?.value || '';
      
      if (!productId) {
        showError('Por favor seleccione un producto con rol de insumo');
        return;
      }
      
      // Verify that the product has esInsumo: true
      const product = productsData[productId];
      if (!product || product.esInsumo !== true) {
        showError('El producto seleccionado debe tener el rol de insumo activado');
        return;
      }
      
      if (!quantity || parseFloat(quantity) <= 0) {
        showError('Por favor ingrese una cantidad mayor a 0');
        return;
      }
      
      addInputRow(productId, quantity);
      updateRecipeCalculations();
      
      // Reset form
      if (hiddenInput) hiddenInput.value = '';
      if (searchInput) searchInput.value = '';
      if (quantityInput) quantityInput.value = '';
    });
  }
  
  // Update calculations when labor minutes change
  const laborMinutesInput = document.getElementById('recipe-labor-minutes');
  if (laborMinutesInput) {
    laborMinutesInput.addEventListener('input', () => {
      updateRecipeCalculations();
    });
  }
  
  // Update calculations on change
  // Product selection updates calculations in selectRecipeProduct()
  const batchYieldInput = document.getElementById('recipe-batch-yield');
  
  if (batchYieldInput) {
    batchYieldInput.addEventListener('input', () => {
      updateRecipeCalculations();
    });
  }
}

/**
 * Initialize recipes view
 */
export function initializeRecipes() {
  setupRecipeFormHandler();
  
  const searchInput = document.getElementById('recipes-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      recipesSearchTerm = e.target.value;
      loadRecipes();
    });
  }

  const newBtn = document.getElementById('new-recipe-btn');
  if (newBtn) {
    newBtn.addEventListener('click', () => {
      showRecipeForm();
    });
  }

  const cancelBtn = document.getElementById('cancel-recipe-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      hideRecipeForm();
    });
  }

  const closeBtn = document.getElementById('close-recipe-form');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      hideRecipeForm();
    });
  }

  const backBtn = document.getElementById('back-to-recipes');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      backToRecipes();
    });
  }

  const closeDetailBtn = document.getElementById('close-recipe-detail-btn');
  if (closeDetailBtn) {
    closeDetailBtn.addEventListener('click', () => {
      backToRecipes();
    });
  }

  loadRecipes();
}
