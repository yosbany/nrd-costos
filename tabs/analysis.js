// Product analysis with real-time calculations and price simulator

// Get nrd instance safely (always use window.nrd as it's set globally in index.html)
const nrd = window.nrd;

let analysisProductsListener = null;
let analysisRecipesListener = null;
let analysisInputsListener = null;
let analysisLaborRolesListener = null;
let analysisIndirectCostsListener = null;

let analysisProductsData = {};
let analysisRecipesData = {};
let analysisInputsData = {};
let analysisLaborRolesData = {};
let analysisIndirectCostsData = {};

// Helper function to escape HTML
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Load all data for analysis
async function loadAnalysisData() {
  try {
    // Load products
    const productsSnapshot = await nrd.products.getAll();
    analysisProductsData = Array.isArray(productsSnapshot)
      ? productsSnapshot.reduce((acc, product) => {
          if (product && product.id) acc[product.id] = product;
          return acc;
        }, {})
      : productsSnapshot || {};

    // Load recipes
    const recipesSnapshot = await nrd.recipes.getAll();
    analysisRecipesData = Array.isArray(recipesSnapshot)
      ? recipesSnapshot.reduce((acc, recipe) => {
          if (recipe && recipe.id) acc[recipe.id] = recipe;
          return acc;
        }, {})
      : recipesSnapshot || {};

    // Load inputs
    const inputsSnapshot = await nrd.inputs.getAll();
    analysisInputsData = Array.isArray(inputsSnapshot)
      ? inputsSnapshot.reduce((acc, input) => {
          if (input && input.id) acc[input.id] = input;
          return acc;
        }, {})
      : inputsSnapshot || {};

    // Load labor roles
    const laborRolesSnapshot = await nrd.laborRoles.getAll();
    analysisLaborRolesData = Array.isArray(laborRolesSnapshot)
      ? laborRolesSnapshot.reduce((acc, role) => {
          if (role && role.id) acc[role.id] = role;
          return acc;
        }, {})
      : laborRolesSnapshot || {};

    // Load indirect costs
    const indirectCostsSnapshot = await nrd.indirectCosts.getAll();
    analysisIndirectCostsData = Array.isArray(indirectCostsSnapshot)
      ? indirectCostsSnapshot.reduce((acc, cost) => {
          if (cost && cost.id) acc[cost.id] = cost;
          return acc;
        }, {})
      : indirectCostsSnapshot || {};

    // Calculate products with recipes count
    const activeRecipes = Object.values(analysisRecipesData).filter(r => r.active !== false);
    const uniqueProductsWithRecipes = new Set(activeRecipes.map(r => r.productId));
    const productsWithRecipesCount = uniqueProductsWithRecipes.size;

    // Calculate indirect cost per product (equal distribution)
    const totalIndirectCosts = Object.values(analysisIndirectCostsData).reduce((sum, cost) => {
      return sum + (cost.monthlyAmount || 0);
    }, 0);
    const indirectCostPerProduct = productsWithRecipesCount > 0 
      ? totalIndirectCosts / productsWithRecipesCount 
      : 0;

    return {
      productsData: analysisProductsData,
      recipesData: analysisRecipesData,
      inputsData: analysisInputsData,
      laborRolesData: analysisLaborRolesData,
      indirectCostsData: analysisIndirectCostsData,
      indirectCostPerProduct,
      productsWithRecipesCount
    };
  } catch (error) {
    logger.error('Error loading analysis data', error);
    return null;
  }
}

// Calculate product analysis
async function calculateProductAnalysis(productId, analysisData) {
  const product = analysisData.productsData[productId];
  if (!product) return null;

  // Find active recipe for this product
  const activeRecipe = Object.values(analysisData.recipesData).find(
    r => r.productId === productId && r.active !== false
  );

  if (!activeRecipe) {
    return {
      product,
      hasRecipe: false,
      message: 'Sin receta definida'
    };
  }

  // Calculate direct cost
  const directCost = await calculateDirectCost(
    activeRecipe,
    analysisData.inputsData,
    analysisData.productsData,
    analysisData.laborRolesData
  );

  // Calculate direct unit cost
  const directUnitCost = calculateDirectUnitCost(directCost, activeRecipe.batchYield || 1);

  // Calculate indirect unit cost
  const indirectUnitCost = calculateIndirectUnitCost(
    analysisData.indirectCostPerProduct,
    activeRecipe.batchYield || 1
  );

  // Calculate total unit cost
  const totalUnitCost = calculateTotalUnitCost(directUnitCost, indirectUnitCost);

  // Calculate suggested price
  const targetMargin = product.targetMargin || 0;
  const suggestedPrice = calculateSuggestedPrice(totalUnitCost, targetMargin);

  // Calculate real margin
  const currentPrice = product.price || 0;
  const realMargin = currentPrice > 0 
    ? calculateRealMargin(currentPrice, totalUnitCost) 
    : 0;

  // Determine profitability status
  const profitabilityStatus = getProfitabilityStatus(realMargin, targetMargin);

  return {
    product,
    activeRecipe,
    hasRecipe: true,
    directCost,
    directUnitCost,
    indirectUnitCost,
    totalUnitCost,
    suggestedPrice,
    currentPrice,
    realMargin,
    targetMargin,
    profitabilityStatus
  };
}

// Render analysis table
async function renderAnalysisTable() {
  const analysisTable = document.getElementById('analysis-table');
  if (!analysisTable) return;

  const analysisData = await loadAnalysisData();
  if (!analysisData) {
    analysisTable.innerHTML = '<p class="text-gray-600 py-4 text-sm">Error al cargar los datos</p>';
    return;
  }

  // Filter active products only
  const activeProducts = Object.values(analysisData.productsData).filter(p => p.active !== false);

  if (activeProducts.length === 0) {
    analysisTable.innerHTML = '<p class="text-gray-600 py-4 text-sm">No hay productos activos para analizar</p>';
    return;
  }

  // Calculate analysis for each product
  const analyses = [];
  for (const product of activeProducts) {
    const analysis = await calculateProductAnalysis(product.id, analysisData);
    if (analysis) {
      analyses.push(analysis);
    }
  }

  // Sort by profitability status (loss first, then low margin, then profitable)
  const statusOrder = { loss: 0, 'low-margin': 1, profitable: 2, 'no-recipe': 3 };
  analyses.sort((a, b) => {
    const aOrder = a.hasRecipe ? statusOrder[a.profitabilityStatus] : statusOrder['no-recipe'];
    const bOrder = b.hasRecipe ? statusOrder[b.profitabilityStatus] : statusOrder['no-recipe'];
    if (aOrder !== bOrder) return aOrder - bOrder;
    if (a.hasRecipe && b.hasRecipe) {
      return (a.realMargin || 0) - (b.realMargin || 0); // Worst margins first
    }
    return 0;
  });

  // Render table
  let tableHtml = `
    <div class="overflow-x-auto">
      <table class="w-full text-left border-collapse">
        <thead>
          <tr class="border-b border-gray-300">
            <th class="px-3 py-2 text-xs uppercase tracking-wider text-gray-600 font-light">Producto</th>
            <th class="px-3 py-2 text-xs uppercase tracking-wider text-gray-600 font-light">Costo Directo Unit.</th>
            <th class="px-3 py-2 text-xs uppercase tracking-wider text-gray-600 font-light">Costo Indirecto Unit.</th>
            <th class="px-3 py-2 text-xs uppercase tracking-wider text-gray-600 font-light">Costo Total Unit.</th>
            <th class="px-3 py-2 text-xs uppercase tracking-wider text-gray-600 font-light">Precio Actual</th>
            <th class="px-3 py-2 text-xs uppercase tracking-wider text-gray-600 font-light">Precio Sugerido</th>
            <th class="px-3 py-2 text-xs uppercase tracking-wider text-gray-600 font-light">Margen Real</th>
            <th class="px-3 py-2 text-xs uppercase tracking-wider text-gray-600 font-light">Estado</th>
            <th class="px-3 py-2 text-xs uppercase tracking-wider text-gray-600 font-light">Simular</th>
          </tr>
        </thead>
        <tbody>
  `;

  analyses.forEach(analysis => {
    if (!analysis.hasRecipe) {
      tableHtml += `
        <tr class="border-b border-gray-200 hover:bg-gray-50">
          <td class="px-3 py-2 text-sm">${escapeHtml(analysis.product.name)}</td>
          <td class="px-3 py-2 text-sm text-gray-500" colspan="7">${escapeHtml(analysis.message)}</td>
          <td class="px-3 py-2 text-sm">
            <button class="px-3 py-1 text-xs bg-gray-200 text-gray-600 rounded hover:bg-gray-300 transition-colors" disabled>
              Simular
            </button>
          </td>
        </tr>
      `;
      return;
    }

    const statusColor = analysis.profitabilityStatus === 'loss' 
      ? 'text-red-600' 
      : analysis.profitabilityStatus === 'low-margin' 
      ? 'text-orange-600' 
      : 'text-green-600';

    const statusLabel = analysis.profitabilityStatus === 'loss'
      ? 'Pérdida'
      : analysis.profitabilityStatus === 'low-margin'
      ? 'Margen Bajo'
      : 'Rentable';

    tableHtml += `
      <tr class="border-b border-gray-200 hover:bg-gray-50" data-product-id="${analysis.product.id}">
        <td class="px-3 py-2 text-sm font-medium">${escapeHtml(analysis.product.name)}</td>
        <td class="px-3 py-2 text-sm">$${analysis.directUnitCost.toFixed(2)}</td>
        <td class="px-3 py-2 text-sm">$${analysis.indirectUnitCost.toFixed(2)}</td>
        <td class="px-3 py-2 text-sm font-medium">$${analysis.totalUnitCost.toFixed(2)}</td>
        <td class="px-3 py-2 text-sm">$${analysis.currentPrice.toFixed(2)}</td>
        <td class="px-3 py-2 text-sm text-blue-600">$${analysis.suggestedPrice.toFixed(2)}</td>
        <td class="px-3 py-2 text-sm ${statusColor} font-medium">${analysis.realMargin.toFixed(1)}%</td>
        <td class="px-3 py-2 text-sm">
          <span class="px-2 py-1 text-xs rounded ${analysis.profitabilityStatus === 'loss' ? 'bg-red-100 text-red-700' : analysis.profitabilityStatus === 'low-margin' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}">
            ${statusLabel}
          </span>
        </td>
        <td class="px-3 py-2 text-sm">
          <button class="simulate-price-btn px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors" 
            data-product-id="${analysis.product.id}"
            data-total-cost="${analysis.totalUnitCost}"
            data-current-price="${analysis.currentPrice}">
            Simular
          </button>
        </td>
      </tr>
    `;
  });

  tableHtml += `
        </tbody>
      </table>
    </div>
  `;

  analysisTable.innerHTML = tableHtml;

  // Attach event listeners for simulate buttons
  document.querySelectorAll('.simulate-price-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const productId = e.target.dataset.productId;
      const totalCost = parseFloat(e.target.dataset.totalCost);
      const currentPrice = parseFloat(e.target.dataset.currentPrice);
      showPriceSimulator(productId, totalCost, currentPrice);
    });
  });
}

// Show price simulator modal
async function showPriceSimulator(productId, totalCost, currentPrice) {
  const product = analysisProductsData[productId];
  if (!product) return;

  const simulatorModal = document.getElementById('price-simulator-modal');
  const simulatorProductName = document.getElementById('simulator-product-name');
  const simulatorCurrentPrice = document.getElementById('simulator-current-price');
  const simulatorNewPrice = document.getElementById('simulator-new-price');
  const simulatorTotalCost = document.getElementById('simulator-total-cost');
  const simulatorResult = document.getElementById('simulator-result');

  if (!simulatorModal || !simulatorProductName || !simulatorNewPrice || !simulatorResult) return;

  simulatorProductName.textContent = product.name || 'Producto';
  if (simulatorTotalCost) simulatorTotalCost.textContent = `$${totalCost.toFixed(2)}`;
  if (simulatorCurrentPrice) simulatorCurrentPrice.textContent = `$${currentPrice.toFixed(2)}`;
  
  simulatorNewPrice.value = currentPrice.toFixed(2);
  simulatorNewPrice.dataset.totalCost = totalCost.toString();
  simulatorNewPrice.dataset.currentPrice = currentPrice.toString();

  // Update result on input change
  const updateSimulation = () => {
    const newPrice = parseFloat(simulatorNewPrice.value) || 0;
    const cost = parseFloat(simulatorNewPrice.dataset.totalCost || totalCost);
    
    if (newPrice <= 0) {
      simulatorResult.innerHTML = '<p class="text-gray-500 text-sm">Ingrese un precio válido</p>';
      return;
    }

    const newMargin = calculateRealMargin(newPrice, cost);
    const marginDiff = newMargin - calculateRealMargin(currentPrice, cost);
    const priceDiff = newPrice - currentPrice;

    const marginColor = newMargin < 0 
      ? 'text-red-600' 
      : newMargin < (product.targetMargin || 0) 
      ? 'text-orange-600' 
      : 'text-green-600';

    simulatorResult.innerHTML = `
      <div class="space-y-2 text-sm">
        <div class="flex justify-between py-1 border-b border-gray-200">
          <span class="text-gray-600">Nuevo Margen:</span>
          <span class="font-medium ${marginColor}">${newMargin.toFixed(1)}%</span>
        </div>
        <div class="flex justify-between py-1 border-b border-gray-200">
          <span class="text-gray-600">Variación de Margen:</span>
          <span class="font-medium ${marginDiff >= 0 ? 'text-green-600' : 'text-red-600'}">
            ${marginDiff >= 0 ? '+' : ''}${marginDiff.toFixed(1)}%
          </span>
        </div>
        <div class="flex justify-between py-1 border-b border-gray-200">
          <span class="text-gray-600">Variación de Precio:</span>
          <span class="font-medium ${priceDiff >= 0 ? 'text-green-600' : 'text-red-600'}">
            ${priceDiff >= 0 ? '+' : ''}$${Math.abs(priceDiff).toFixed(2)}
          </span>
        </div>
        ${product.targetMargin ? `
        <div class="flex justify-between py-1 border-b border-gray-200">
          <span class="text-gray-600">Margen Objetivo:</span>
          <span class="font-medium">${product.targetMargin.toFixed(1)}%</span>
        </div>
        <div class="flex justify-between py-1">
          <span class="text-gray-600">Estado:</span>
          <span class="font-medium ${newMargin < 0 ? 'text-red-600' : newMargin < product.targetMargin ? 'text-orange-600' : 'text-green-600'}">
            ${newMargin < 0 ? 'Pérdida' : newMargin < product.targetMargin ? 'Margen Bajo' : 'Rentable'}
          </span>
        </div>
        ` : ''}
      </div>
    `;
  };

  simulatorNewPrice.addEventListener('input', updateSimulation);
  updateSimulation(); // Initial calculation

  simulatorModal.classList.remove('hidden');

  // Close button
  const closeBtn = document.getElementById('simulator-close-btn');
  if (closeBtn) {
    closeBtn.onclick = () => {
      simulatorModal.classList.add('hidden');
      simulatorNewPrice.removeEventListener('input', updateSimulation);
    };
  }

  // Background click to close
  simulatorModal.onclick = (e) => {
    if (e.target === simulatorModal) {
      simulatorModal.classList.add('hidden');
      simulatorNewPrice.removeEventListener('input', updateSimulation);
    }
  };
}

// Initialize analysis tab
function initializeAnalysis() {
  // Check if services are available
  if (!nrd.products || !nrd.recipes || !nrd.inputs || !nrd.laborRoles || !nrd.indirectCosts) {
    const analysisTable = document.getElementById('analysis-table');
    if (analysisTable) {
      analysisTable.innerHTML = `
        <div class="bg-yellow-50 border border-yellow-200 p-4 sm:p-6 rounded text-center">
          <p class="text-yellow-700 text-sm sm:text-base mb-2">
            ⚠️ Los servicios aún no están disponibles. Esto puede deberse a que el CDN no se ha actualizado.
          </p>
          <p class="text-yellow-600 text-xs sm:text-sm">
            Por favor, espera unos minutos y recarga la página, o verifica que la biblioteca se haya actualizado correctamente.
          </p>
        </div>
      `;
    }
    return;
  }

  // Setup listeners for real-time updates
  if (analysisProductsListener) analysisProductsListener();
  if (analysisRecipesListener) analysisRecipesListener();
  if (analysisInputsListener) analysisInputsListener();
  if (analysisLaborRolesListener) analysisLaborRolesListener();
  if (analysisIndirectCostsListener) analysisIndirectCostsListener();

  analysisProductsListener = nrd.products.onValue(() => {
    renderAnalysisTable();
  });

  analysisRecipesListener = nrd.recipes.onValue(() => {
    renderAnalysisTable();
  });

  analysisInputsListener = nrd.inputs.onValue(() => {
    renderAnalysisTable();
  });

  analysisLaborRolesListener = nrd.laborRoles.onValue(() => {
    renderAnalysisTable();
  });

  if (nrd.indirectCosts) {
    analysisIndirectCostsListener = nrd.indirectCosts.onValue(() => {
      renderAnalysisTable();
    });
  }

  // Initial render
  renderAnalysisTable();
}
