// Recipe management with real-time cost calculations

// Get nrd instance safely (always use window.nrd as it's set globally in index.html)
var nrd = window.nrd;

let recipesListener = null;
let recipesSearchTerm = '';
let inputsData = {};
let productsData = {};
let laborRolesData = {};

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

// Labor search functionality
let laborSearchTimeout = null;
let laborSearchInputHandler = null;
let laborClickOutsideHandler = null;
let laborKeyboardHandler = null;
let selectedLaborIndex = -1;
let filteredLabors = [];

// Helper function to escape HTML
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Load data for calculations
async function loadDataForCalculations() {
  try {
    // Load inputs
    const inputsSnapshot = await nrd.inputs.getAll();
    inputsData = Array.isArray(inputsSnapshot) 
      ? inputsSnapshot.reduce((acc, input) => {
          if (input && input.id) acc[input.id] = input;
          return acc;
        }, {})
      : inputsSnapshot || {};

    // Load products
    const productsSnapshot = await nrd.products.getAll();
    productsData = Array.isArray(productsSnapshot)
      ? productsSnapshot.reduce((acc, product) => {
          if (product && product.id) acc[product.id] = product;
          return acc;
        }, {})
      : productsSnapshot || {};

    // Load labor roles
    const laborRolesSnapshot = await nrd.laborRoles.getAll();
    laborRolesData = Array.isArray(laborRolesSnapshot)
      ? laborRolesSnapshot.reduce((acc, role) => {
          if (role && role.id) acc[role.id] = role;
          return acc;
        }, {})
      : laborRolesSnapshot || {};
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

    // Filter by search term if active
    let recipesToShow = Object.entries(recipesDict);
    if (recipesSearchTerm.trim()) {
      const searchLower = recipesSearchTerm.toLowerCase().trim();
      recipesToShow = recipesToShow.filter(([id, recipe]) => {
        const product = productsData[recipe.productId];
        const productName = product ? product.name.toLowerCase() : '';
        return productName.includes(searchLower);
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

      const directCost = await calculateDirectCost(recipe, inputsData, productsData, laborRolesData);
      const directUnitCost = calculateDirectUnitCost(directCost, recipe.batchYield || 1);
      
      const item = document.createElement('div');
      item.className = 'border border-gray-200 p-3 sm:p-4 md:p-6 hover:border-red-600 transition-colors cursor-pointer';
      item.dataset.recipeId = id;
      item.innerHTML = `
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0 mb-2 sm:mb-3">
          <div class="text-base sm:text-lg font-light flex-1">${escapeHtml(product.name)}</div>
          <span class="px-2 sm:px-3 py-0.5 sm:py-1 text-xs uppercase tracking-wider border ${recipe.active ? 'border-red-600 text-red-600' : 'border-gray-300 text-gray-600'}">
            ${recipe.active ? 'Activa' : 'Inactiva'}
          </span>
        </div>
        <div class="text-xs sm:text-sm text-gray-600 space-y-1">
          <div>Rendimiento: <span class="font-medium">${parseFloat(recipe.batchYield || 0).toFixed(2)} unidades</span></div>
          <div>Costo Directo Lote: <span class="text-gray-700 font-medium">$${directCost.toFixed(2)}</span></div>
          <div>Costo Directo Unitario: <span class="text-gray-700 font-medium">$${directUnitCost.toFixed(2)}</span></div>
          ${product.price ? `
          <div>Precio Venta: <span class="text-red-600 font-medium">$${parseFloat(product.price).toFixed(2)}</span></div>
          ${product.price && directUnitCost > 0 ? `
          <div>Margen: <span class="${((product.price - directUnitCost) / product.price * 100) < 0 ? 'text-red-600' : 'text-green-600'} font-medium">${((product.price - directUnitCost) / product.price * 100).toFixed(1)}%</span></div>
          ` : ''}
          ` : ''}
          <div class="text-xs text-gray-500 mt-2">
            ${recipe.inputs ? `${recipe.inputs.length} insumo(s)` : '0 insumos'} | 
            ${recipe.labor ? `${recipe.labor.length} rol(es) de mano de obra` : '0 roles'}
          </div>
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
  
  // Reset inputs and labor lists
  const inputsList = document.getElementById('recipe-inputs-list');
  const laborList = document.getElementById('recipe-labor-list');
  if (inputsList) inputsList.innerHTML = '';
  if (laborList) laborList.innerHTML = '';
  
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
        if (batchYieldInput) batchYieldInput.value = recipe.batchYield || '';
        if (activeInput) activeInput.checked = recipe.active !== false;
        
        // Load inputs
        if (recipe.inputs && Array.isArray(recipe.inputs)) {
          recipe.inputs.forEach(input => {
            addInputRow(input.inputId, input.inputType, input.quantity, false);
          });
        }
        
        // Load labor
        if (recipe.labor && Array.isArray(recipe.labor)) {
          recipe.labor.forEach(labor => {
            addLaborRow(labor.roleId, labor.hours, false);
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
  setupLaborSearch();
}

// Search recipe product (main product)
function searchRecipeProduct(query) {
  const searchInput = document.getElementById('recipe-product-search');
  const resultsDiv = document.getElementById('recipe-product-search-results');
  const hiddenInput = document.getElementById('recipe-product');
  
  if (!searchInput || !resultsDiv || !hiddenInput) return;
  
  const searchTerm = query.toLowerCase().trim();
  
  if (searchTerm.length === 0) {
    resultsDiv.classList.add('hidden');
    return;
  }
  
  // Filter products
  const filtered = Object.values(productsData)
    .filter(p => p.active !== false && p.name && p.name.toLowerCase().includes(searchTerm));
  
  filteredRecipeProducts = filtered;
  selectedRecipeProductIndex = -1;
  
  // Build results HTML
  let resultsHTML = '';
  
  if (filtered.length === 0) {
    resultsHTML = '<div class="px-3 py-2 text-sm text-gray-500">No se encontraron productos</div>';
  } else {
    resultsHTML = filtered.map((product, index) => `
      <div class="recipe-product-search-item px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0" 
           data-product-id="${product.id}" 
           data-product-name="${escapeHtml(product.name)}"
           data-index="${index}">
        <div class="font-light text-sm">${escapeHtml(product.name)}</div>
        <div class="text-xs text-gray-600">$${parseFloat(product.price || 0).toFixed(2)}</div>
      </div>
    `).join('');
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
  const productName = item.dataset.productName;
  
  if (hiddenInput) hiddenInput.value = productId;
  if (searchInput) searchInput.value = productName;
  if (resultsDiv) resultsDiv.classList.add('hidden');
  
  selectedRecipeProductIndex = -1;
  updateRecipeCalculations();
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

// Search inputs and products (for recipe inputs)
function searchInputsAndProducts(query) {
  const searchInput = document.getElementById('add-input-search');
  const resultsDiv = document.getElementById('add-input-search-results');
  
  if (!searchInput || !resultsDiv) return;
  
  const searchTerm = query.toLowerCase().trim();
  
  if (searchTerm.length === 0) {
    resultsDiv.classList.add('hidden');
    return;
  }
  
  // Filter inputs and products
  const inputs = Object.values(inputsData)
    .filter(input => input.name && input.name.toLowerCase().includes(searchTerm))
    .map(input => ({ ...input, type: 'input' }));
  
  const products = Object.values(productsData)
    .filter(p => p.active !== false && p.name && p.name.toLowerCase().includes(searchTerm))
    .map(product => ({ ...product, type: 'product' }));
  
  const filtered = [...inputs, ...products];
  filteredInputsAndProducts = filtered;
  selectedInputIndex = -1;
  
  // Build results HTML
  let resultsHTML = '';
  
  if (filtered.length === 0) {
    resultsHTML = '<div class="px-3 py-2 text-sm text-gray-500">No se encontraron insumos o productos</div>';
  } else {
    resultsHTML = filtered.map((item, index) => {
      const displayName = item.name || 'Sin nombre';
      const displayInfo = item.type === 'input' 
        ? `Insumo - ${item.unit || 'unidad'} - $${parseFloat(item.unitPrice || 0).toFixed(2)}`
        : `Producto - $${parseFloat(item.cost || 0).toFixed(2)}`;
      
      return `
        <div class="input-search-item px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0" 
             data-item-id="${item.id}" 
             data-item-type="${item.type}"
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

// Select input or product
function selectInputOrProduct(item, searchInput, resultsDiv) {
  const itemId = item.dataset.itemId;
  const itemType = item.dataset.itemType;
  const itemName = item.dataset.itemName;
  
  const hiddenInput = document.getElementById('add-input-select');
  const typeInput = document.getElementById('add-input-type');
  
  if (hiddenInput) hiddenInput.value = itemId;
  if (typeInput) typeInput.value = itemType;
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

// Search labor roles
function searchLabors(query) {
  const searchInput = document.getElementById('add-labor-search');
  const resultsDiv = document.getElementById('add-labor-search-results');
  
  if (!searchInput || !resultsDiv) return;
  
  const searchTerm = query.toLowerCase().trim();
  
  if (searchTerm.length === 0) {
    resultsDiv.classList.add('hidden');
    return;
  }
  
  // Filter labor roles
  const filtered = Object.values(laborRolesData)
    .filter(role => role.name && role.name.toLowerCase().includes(searchTerm));
  
  filteredLabors = filtered;
  selectedLaborIndex = -1;
  
  // Build results HTML
  let resultsHTML = '';
  
  if (filtered.length === 0) {
    resultsHTML = '<div class="px-3 py-2 text-sm text-gray-500">No se encontraron roles</div>';
  } else {
    resultsHTML = filtered.map((role, index) => {
      const displayName = role.name || 'Sin nombre';
      const hourlyCost = parseFloat(role.hourlyCost || 0).toFixed(2);
      
      return `
        <div class="labor-search-item px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0" 
             data-role-id="${role.id}" 
             data-role-name="${escapeHtml(displayName)}"
             data-index="${index}">
          <div class="font-light text-sm">${escapeHtml(displayName)}</div>
          <div class="text-xs text-gray-600">$${hourlyCost}/hora</div>
        </div>
      `;
    }).join('');
  }
  
  resultsDiv.innerHTML = resultsHTML;
  resultsDiv.classList.remove('hidden');
  
  // Attach click handlers
  document.querySelectorAll('.labor-search-item').forEach(item => {
    item.addEventListener('click', () => {
      selectLabor(item, searchInput, resultsDiv);
    });
  });
}

// Select labor role
function selectLabor(item, searchInput, resultsDiv) {
  const roleId = item.dataset.roleId;
  const roleName = item.dataset.roleName;
  
  const hiddenInput = document.getElementById('add-labor-select');
  
  if (hiddenInput) hiddenInput.value = roleId;
  if (searchInput) searchInput.value = roleName;
  if (resultsDiv) resultsDiv.classList.add('hidden');
  
  selectedLaborIndex = -1;
}

// Setup labor search
function setupLaborSearch() {
  const searchInput = document.getElementById('add-labor-search');
  const resultsDiv = document.getElementById('add-labor-search-results');
  
  if (!searchInput || !resultsDiv) return;
  
  // Remove previous listeners
  if (laborSearchInputHandler) {
    searchInput.removeEventListener('input', laborSearchInputHandler);
  }
  
  // Add input listener
  laborSearchInputHandler = (e) => {
    clearTimeout(laborSearchTimeout);
    laborSearchTimeout = setTimeout(() => {
      searchLabors(e.target.value);
    }, 200);
  };
  searchInput.addEventListener('input', laborSearchInputHandler);
  
  // Keyboard navigation
  if (laborKeyboardHandler) {
    searchInput.removeEventListener('keydown', laborKeyboardHandler);
  }
  
  laborKeyboardHandler = (e) => {
    const items = document.querySelectorAll('.labor-search-item');
    const totalItems = items.length;
    
    if (totalItems === 0) return;
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedLaborIndex = selectedLaborIndex >= totalItems - 1 ? 0 : selectedLaborIndex + 1;
      updateLaborSelection(items);
      if (items[selectedLaborIndex]) {
        items[selectedLaborIndex].scrollIntoView({ block: 'nearest' });
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedLaborIndex = selectedLaborIndex <= 0 ? totalItems - 1 : selectedLaborIndex - 1;
      updateLaborSelection(items);
      if (items[selectedLaborIndex]) {
        items[selectedLaborIndex].scrollIntoView({ block: 'nearest' });
      }
    } else if (e.key === 'Enter' && selectedLaborIndex >= 0) {
      e.preventDefault();
      const selectedItem = items[selectedLaborIndex];
      if (selectedItem) {
        selectLabor(selectedItem, searchInput, resultsDiv);
      }
    } else if (e.key === 'Escape') {
      resultsDiv.classList.add('hidden');
      selectedLaborIndex = -1;
    }
  };
  
  searchInput.addEventListener('keydown', laborKeyboardHandler);
  
  // Click outside handler
  if (laborClickOutsideHandler) {
    document.removeEventListener('click', laborClickOutsideHandler);
  }
  
  laborClickOutsideHandler = (e) => {
    if (resultsDiv && !searchInput.contains(e.target) && !resultsDiv.contains(e.target)) {
      resultsDiv.classList.add('hidden');
      selectedLaborIndex = -1;
    }
  };
  document.addEventListener('click', laborClickOutsideHandler);
}

// Update labor selection highlighting
function updateLaborSelection(items) {
  items.forEach((item, index) => {
    if (index === selectedLaborIndex) {
      item.classList.add('bg-red-50', 'border-red-200');
      item.classList.remove('hover:bg-gray-50');
    } else {
      item.classList.remove('bg-red-50', 'border-red-200');
      item.classList.add('hover:bg-gray-50');
    }
  });
}

// Add input row to recipe
function addInputRow(inputId = '', inputType = 'input', quantity = '', allowRemove = true) {
  const inputsList = document.getElementById('recipe-inputs-list');
  if (!inputsList) return;
  
  const row = document.createElement('div');
  row.className = 'flex flex-col sm:flex-row gap-2 sm:gap-3 items-start sm:items-center p-2 sm:p-3 border border-gray-200 rounded mb-2';
  
  const inputName = inputType === 'product' 
    ? (productsData[inputId]?.name || 'Producto')
    : (inputsData[inputId]?.name || 'Insumo');
  
  const currentPrice = inputType === 'product'
    ? (productsData[inputId]?.cost || 0)
    : (inputsData[inputId]?.unitPrice || 0);
  
  const unit = inputType === 'product'
    ? 'unidad'
    : (inputsData[inputId]?.unit || 'unidad');
  
  row.innerHTML = `
    <input type="hidden" class="input-id" value="${escapeHtml(inputId)}">
    <input type="hidden" class="input-type" value="${escapeHtml(inputType)}">
    <div class="flex-1">
      <div class="text-sm font-medium">${escapeHtml(inputName)}</div>
      <div class="text-xs text-gray-500">${inputType === 'product' ? 'Producto' : 'Insumo'} - Precio actual: $${parseFloat(currentPrice).toFixed(2)}/${unit}</div>
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
  const inputId = row.querySelector('.input-id')?.value;
  const inputType = row.querySelector('.input-type')?.value;
  const quantity = parseFloat(row.querySelector('.input-quantity')?.value || 0);
  const subtotalEl = row.querySelector('[data-subtotal]');
  
  if (!subtotalEl || !inputId) return;
  
  const currentPrice = inputType === 'product'
    ? (productsData[inputId]?.cost || 0)
    : (inputsData[inputId]?.unitPrice || 0);
  
  subtotalEl.textContent = `$${(quantity * parseFloat(currentPrice)).toFixed(2)}`;
}

// Add labor row to recipe
function addLaborRow(roleId = '', hours = '', allowRemove = true) {
  const laborList = document.getElementById('recipe-labor-list');
  if (!laborList) return;
  
  const row = document.createElement('div');
  row.className = 'flex flex-col sm:flex-row gap-2 sm:gap-3 items-start sm:items-center p-2 sm:p-3 border border-gray-200 rounded mb-2';
  
  const roleName = laborRolesData[roleId]?.name || 'Rol';
  const hourlyCost = laborRolesData[roleId]?.hourlyCost || 0;
  
  row.innerHTML = `
    <input type="hidden" class="labor-role-id" value="${escapeHtml(roleId)}">
    <div class="flex-1">
      <div class="text-sm font-medium">${escapeHtml(roleName)}</div>
      <div class="text-xs text-gray-500">Costo actual: $${parseFloat(hourlyCost).toFixed(2)}/hora</div>
    </div>
    <div class="w-full sm:w-32">
      <label class="block text-xs text-gray-600 mb-1">Horas</label>
      <input type="number" class="labor-hours w-full px-2 py-1 border border-gray-300 rounded text-sm" 
        step="0.1" min="0" value="${hours}" required>
    </div>
    <div class="w-full sm:w-32">
      <label class="block text-xs text-gray-600 mb-1">Subtotal</label>
      <div class="text-sm font-medium text-gray-700" data-subtotal>$${(parseFloat(hours || 0) * parseFloat(hourlyCost)).toFixed(2)}</div>
    </div>
    ${allowRemove ? `
    <button type="button" class="remove-labor-btn px-3 py-1 text-red-600 hover:bg-red-50 border border-red-600 rounded text-sm transition-colors">
      Eliminar
    </button>
    ` : ''}
  `;
  
  // Add event listener for hours change
  const hoursInput = row.querySelector('.labor-hours');
  if (hoursInput) {
    hoursInput.addEventListener('input', () => {
      updateLaborRowSubtotal(row);
      updateRecipeCalculations();
    });
  }
  
  // Add event listener for remove button
  if (allowRemove) {
    const removeBtn = row.querySelector('.remove-labor-btn');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        row.remove();
        updateRecipeCalculations();
      });
    }
  }
  
  laborList.appendChild(row);
}

// Update labor row subtotal
function updateLaborRowSubtotal(row) {
  const roleId = row.querySelector('.labor-role-id')?.value;
  const hours = parseFloat(row.querySelector('.labor-hours')?.value || 0);
  const subtotalEl = row.querySelector('[data-subtotal]');
  
  if (!subtotalEl || !roleId) return;
  
  const hourlyCost = laborRolesData[roleId]?.hourlyCost || 0;
  subtotalEl.textContent = `$${(hours * parseFloat(hourlyCost)).toFixed(2)}`;
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
    const inputId = row.querySelector('.input-id')?.value;
    const inputType = row.querySelector('.input-type')?.value;
    const quantity = parseFloat(row.querySelector('.input-quantity')?.value || 0);
    if (inputId && inputType && quantity > 0) {
      inputs.push({ inputId, inputType, quantity });
    }
  });
  
  const labor = [];
  const laborRows = document.querySelectorAll('#recipe-labor-list > div');
  laborRows.forEach(row => {
    const roleId = row.querySelector('.labor-role-id')?.value;
    const hours = parseFloat(row.querySelector('.labor-hours')?.value || 0);
    if (roleId && hours > 0) {
      labor.push({ roleId, hours });
    }
  });
  
  const recipe = {
    productId,
    batchYield,
    inputs,
    labor
  };
  
  const directCost = await calculateDirectCost(recipe, inputsData, productsData, laborRolesData);
  const directUnitCost = calculateDirectUnitCost(directCost, batchYield);
  
  const product = productsData[productId];
  const targetMargin = product?.targetMargin || 0;
  const suggestedPrice = calculateSuggestedPrice(directUnitCost, targetMargin);
  const currentPrice = product?.price || 0;
  const realMargin = currentPrice > 0 ? calculateRealMargin(currentPrice, directUnitCost) : 0;
  
  calculationsEl.innerHTML = `
    <div class="space-y-2 text-sm">
      <div class="flex justify-between py-1 border-b border-gray-200">
        <span class="text-gray-600">Costo Directo del Lote:</span>
        <span class="font-medium">$${directCost.toFixed(2)}</span>
      </div>
      <div class="flex justify-between py-1 border-b border-gray-200">
        <span class="text-gray-600">Costo Directo Unitario:</span>
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

    const directCost = await calculateDirectCost(recipe, inputsData, productsData, laborRolesData);
    const directUnitCost = calculateDirectUnitCost(directCost, recipe.batchYield || 1);
    const targetMargin = product.targetMargin || 0;
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
      let inputsHtml = '<p class="text-gray-500 text-sm">No hay insumos</p>';
      if (recipe.inputs && recipe.inputs.length > 0) {
        inputsHtml = '<div class="space-y-2">';
        for (const recipeInput of recipe.inputs) {
          const inputName = recipeInput.inputType === 'product'
            ? (productsData[recipeInput.inputId]?.name || 'Producto')
            : (inputsData[recipeInput.inputId]?.name || 'Insumo');
          const unitPrice = recipeInput.inputType === 'product'
            ? (productsData[recipeInput.inputId]?.cost || 0)
            : (inputsData[recipeInput.inputId]?.unitPrice || 0);
          const unit = recipeInput.inputType === 'product'
            ? 'unidad'
            : (inputsData[recipeInput.inputId]?.unit || 'unidad');
          inputsHtml += `
            <div class="flex justify-between py-2 border-b border-gray-200 text-sm">
              <span>${escapeHtml(inputName)} (${recipeInput.inputType === 'product' ? 'Producto' : 'Insumo'})</span>
              <span>${parseFloat(recipeInput.quantity || 0).toFixed(2)} ${unit} × $${parseFloat(unitPrice).toFixed(2)} = <span class="font-medium">$${(parseFloat(recipeInput.quantity || 0) * parseFloat(unitPrice)).toFixed(2)}</span></span>
            </div>
          `;
        }
        inputsHtml += '</div>';
      }

      let laborHtml = '<p class="text-gray-500 text-sm">No hay mano de obra</p>';
      if (recipe.labor && recipe.labor.length > 0) {
        laborHtml = '<div class="space-y-2">';
        for (const recipeLabor of recipe.labor) {
          const roleName = laborRolesData[recipeLabor.roleId]?.name || 'Rol';
          const hourlyCost = laborRolesData[recipeLabor.roleId]?.hourlyCost || 0;
          laborHtml += `
            <div class="flex justify-between py-2 border-b border-gray-200 text-sm">
              <span>${escapeHtml(roleName)}</span>
              <span>${parseFloat(recipeLabor.hours || 0).toFixed(2)} horas × $${parseFloat(hourlyCost).toFixed(2)} = <span class="font-medium">$${(parseFloat(recipeLabor.hours || 0) * parseFloat(hourlyCost)).toFixed(2)}</span></span>
            </div>
          `;
        }
        laborHtml += '</div>';
      }

      detailContent.innerHTML = `
        <div class="space-y-4">
          <div class="flex justify-between py-2 sm:py-3 border-b border-gray-200">
            <span class="text-gray-600 font-light text-sm sm:text-base">Producto:</span>
            <span class="font-light text-sm sm:text-base">${escapeHtml(product.name)}</span>
          </div>
          <div class="flex justify-between py-2 sm:py-3 border-b border-gray-200">
            <span class="text-gray-600 font-light text-sm sm:text-base">Rendimiento del Lote:</span>
            <span class="font-light text-sm sm:text-base">${parseFloat(recipe.batchYield || 0).toFixed(2)} unidades</span>
          </div>
          <div class="py-2 sm:py-3 border-b border-gray-200">
            <div class="text-gray-600 font-light text-sm sm:text-base mb-2">Insumos:</div>
            ${inputsHtml}
          </div>
          <div class="py-2 sm:py-3 border-b border-gray-200">
            <div class="text-gray-600 font-light text-sm sm:text-base mb-2">Mano de Obra:</div>
            ${laborHtml}
          </div>
          <div class="py-2 sm:py-3 border-b border-gray-200">
            <div class="text-gray-600 font-light text-sm sm:text-base mb-2">Cálculos:</div>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between">
                <span>Costo Directo del Lote:</span>
                <span class="font-medium">$${directCost.toFixed(2)}</span>
              </div>
              <div class="flex justify-between">
                <span>Costo Directo Unitario:</span>
                <span class="font-medium">$${directUnitCost.toFixed(2)}</span>
              </div>
              ${targetMargin > 0 ? `
              <div class="flex justify-between">
                <span>Precio Sugerido (${targetMargin}% margen):</span>
                <span class="font-medium text-blue-600">$${suggestedPrice.toFixed(2)}</span>
              </div>
              ` : ''}
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
          <div class="flex justify-between py-2 sm:py-3 border-b border-gray-200">
            <span class="text-gray-600 font-light text-sm sm:text-base">Estado:</span>
            <span class="px-2 sm:px-3 py-0.5 sm:py-1 text-xs uppercase tracking-wider border ${recipe.active ? 'border-red-600 text-red-600' : 'border-gray-300 text-gray-600'}">
              ${recipe.active ? 'Activa' : 'Inactiva'}
            </span>
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
  } catch (error) {
    await showError('Error al cargar receta: ' + error.message);
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

  try {
    await nrd.recipes.delete(recipeId);
    backToRecipes();
  } catch (error) {
    await showError('Error al eliminar receta: ' + error.message);
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
    const batchYield = parseFloat(document.getElementById('recipe-batch-yield')?.value);
    const active = document.getElementById('recipe-active')?.checked;

    if (!productId) {
      await showError('Por favor seleccione un producto');
      return;
    }

    if (isNaN(batchYield) || batchYield <= 0) {
      await showError('El rendimiento del lote debe ser un número mayor a 0');
      return;
    }

    // Collect inputs
    const inputs = [];
    const inputsRows = document.querySelectorAll('#recipe-inputs-list > div');
    inputsRows.forEach(row => {
      const inputId = row.querySelector('.input-id')?.value;
      const inputType = row.querySelector('.input-type')?.value;
      const quantity = parseFloat(row.querySelector('.input-quantity')?.value || 0);
      if (inputId && inputType && quantity > 0) {
        inputs.push({ inputId, inputType, quantity });
      }
    });

    // Collect labor
    const labor = [];
    const laborRows = document.querySelectorAll('#recipe-labor-list > div');
    laborRows.forEach(row => {
      const roleId = row.querySelector('.labor-role-id')?.value;
      const hours = parseFloat(row.querySelector('.labor-hours')?.value || 0);
      if (roleId && hours > 0) {
        labor.push({ roleId, hours });
      }
    });

    try {
      const recipeData = { 
        productId, 
        batchYield, 
        inputs, 
        labor, 
        active 
      };
      
      if (!recipeId) {
        recipeData.createdAt = Date.now();
      }
      
      await saveRecipe(recipeId || null, recipeData);
      hideRecipeForm();
    } catch (error) {
      await showError('Error al guardar receta: ' + error.message);
    }
  });
  
  // Add input button
  const addInputBtn = document.getElementById('add-input-btn');
  if (addInputBtn) {
    addInputBtn.addEventListener('click', () => {
      const hiddenInput = document.getElementById('add-input-select');
      const typeInput = document.getElementById('add-input-type');
      const searchInput = document.getElementById('add-input-search');
      const quantityInput = document.getElementById('add-input-quantity');
      
      const inputId = hiddenInput?.value;
      const inputType = typeInput?.value || 'input';
      const quantity = quantityInput?.value || '';
      
      if (!inputId) {
        showError('Por favor seleccione un insumo o producto');
        return;
      }
      
      if (!quantity || parseFloat(quantity) <= 0) {
        showError('Por favor ingrese una cantidad mayor a 0');
        return;
      }
      
      addInputRow(inputId, inputType, quantity);
      updateRecipeCalculations();
      
      // Reset form
      if (hiddenInput) hiddenInput.value = '';
      if (typeInput) typeInput.value = 'input';
      if (searchInput) searchInput.value = '';
      if (quantityInput) quantityInput.value = '';
    });
  }
  
  // Add labor button
  const addLaborBtn = document.getElementById('add-labor-btn');
  if (addLaborBtn) {
    addLaborBtn.addEventListener('click', () => {
      const hiddenInput = document.getElementById('add-labor-select');
      const searchInput = document.getElementById('add-labor-search');
      const hoursInput = document.getElementById('add-labor-hours');
      
      const roleId = hiddenInput?.value;
      const hours = hoursInput?.value || '';
      
      if (!roleId) {
        showError('Por favor seleccione un rol');
        return;
      }
      
      if (!hours || parseFloat(hours) <= 0) {
        showError('Por favor ingrese horas mayores a 0');
        return;
      }
      
      addLaborRow(roleId, hours);
      updateRecipeCalculations();
      
      // Reset form
      if (hiddenInput) hiddenInput.value = '';
      if (searchInput) searchInput.value = '';
      if (hoursInput) hoursInput.value = '';
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

// Initialize recipes tab
function initializeRecipes() {
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
