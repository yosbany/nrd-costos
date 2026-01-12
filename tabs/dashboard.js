// Dashboard with monitoring and top impacts

// Get nrd instance safely (always use window.nrd as it's set globally in index.html)
var nrd = window.nrd;

let dashboardProductsListener = null;
let dashboardRecipesListener = null;
let dashboardInputsListener = null;
let dashboardLaborRolesListener = null;
let dashboardIndirectCostsListener = null;

// Helper function to escape HTML
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Load all data for dashboard
async function loadDashboardData() {
  try {
    // Use window.nrd (already set at the top of the file)
    const nrdInstance = window.nrd || nrd;
    
    if (!nrdInstance) {
      logger.error('nrd instance not found');
      return null;
    }
    
    // Check if services are available
    if (!nrdInstance.products || !nrdInstance.recipes || !nrdInstance.inputs || !nrdInstance.laborRoles || !nrdInstance.indirectCosts) {
      logger.error('Services not available', {
        products: !!nrdInstance.products,
        recipes: !!nrdInstance.recipes,
        inputs: !!nrdInstance.inputs,
        laborRoles: !!nrdInstance.laborRoles,
        indirectCosts: !!nrdInstance.indirectCosts,
        nrdKeys: nrdInstance ? Object.keys(nrdInstance) : 'nrd is null'
      });
      return null;
    }
    
    logger.debug('Loading dashboard data');

    // Load all data
    const [productsSnapshot, recipesSnapshot, inputsSnapshot, laborRolesSnapshot, indirectCostsSnapshot] = await Promise.all([
      nrdInstance.products.getAll(),
      nrdInstance.recipes.getAll(),
      nrdInstance.inputs.getAll(),
      nrdInstance.laborRoles.getAll(),
      nrdInstance.indirectCosts.getAll()
    ]);

    const products = Array.isArray(productsSnapshot)
      ? productsSnapshot.reduce((acc, p) => {
          if (p && p.id) acc[p.id] = p;
          return acc;
        }, {})
      : productsSnapshot || {};

    const recipes = Array.isArray(recipesSnapshot)
      ? recipesSnapshot.reduce((acc, r) => {
          if (r && r.id) acc[r.id] = r;
          return acc;
        }, {})
      : recipesSnapshot || {};

    const inputs = Array.isArray(inputsSnapshot)
      ? inputsSnapshot.reduce((acc, i) => {
          if (i && i.id) acc[i.id] = i;
          return acc;
        }, {})
      : inputsSnapshot || {};

    const laborRoles = Array.isArray(laborRolesSnapshot)
      ? laborRolesSnapshot.reduce((acc, l) => {
          if (l && l.id) acc[l.id] = l;
          return acc;
        }, {})
      : laborRolesSnapshot || {};

    const indirectCosts = Array.isArray(indirectCostsSnapshot)
      ? indirectCostsSnapshot.reduce((acc, c) => {
          if (c && c.id) acc[c.id] = c;
          return acc;
        }, {})
      : indirectCostsSnapshot || {};

    // Convert to arrays for analysis
    const productsArray = Object.values(products);
    const recipesArray = Object.values(recipes);
    const inputsArray = Object.values(inputs);
    const laborRolesArray = Object.values(laborRoles);
    const indirectCostsArray = Object.values(indirectCosts);

    // Calculate products with recipes count
    const activeRecipes = recipesArray.filter(r => r.active !== false);
    const uniqueProductsWithRecipes = new Set(activeRecipes.map(r => r.productId));
    const productsWithRecipesCount = uniqueProductsWithRecipes.size;

    // Calculate indirect cost per product (equal distribution)
    const totalIndirectCosts = indirectCostsArray.reduce((sum, cost) => {
      return sum + (cost.monthlyAmount || 0);
    }, 0);
    const indirectCostPerProduct = productsWithRecipesCount > 0 
      ? totalIndirectCosts / productsWithRecipesCount 
      : 0;

    return {
      products,
      recipes,
      inputs,
      laborRoles,
      indirectCosts,
      productsArray,
      recipesArray,
      inputsArray,
      laborRolesArray,
      indirectCostsArray,
      indirectCostPerProduct,
      productsWithRecipesCount
    };
  } catch (error) {
    console.error('Error loading dashboard data:', error);
    return null;
  }
}

// Render dashboard
async function renderDashboard() {
  const dashboardContent = document.getElementById('dashboard-content');
  if (!dashboardContent) return;

  const data = await loadDashboardData();
  if (!data) {
    dashboardContent.innerHTML = '<p class="text-gray-600 py-4 text-sm">Error al cargar los datos del dashboard</p>';
    return;
  }

  // Get products with issues
  const productsWithIssues = getProductsWithIssues(
    data.productsArray,
    data.recipesArray,
    {
      inputs: data.inputs,
      products: data.products,
      laborRoles: data.laborRoles,
      indirectCostPerProduct: data.indirectCostPerProduct
    }
  );

  // Get top inputs
  const topInputs = getTopInputs(data.inputsArray, data.recipesArray, data.inputs, 10);

  // Get top labor roles
  const topLaborRoles = getTopLaborRoles(data.laborRolesArray, data.recipesArray, data.laborRoles, 10);

  // Get top indirect costs
  const topIndirectCosts = getTopIndirectCosts(data.indirectCostsArray, 10);

  // Calculate summary
  const totalProducts = data.productsArray.filter(p => p.active !== false).length;
  const productsWithRecipes = data.productsWithRecipesCount;
  const productsWithoutRecipes = totalProducts - productsWithRecipes;
  const totalRecipes = data.recipesArray.filter(r => r.active !== false).length;
  const totalInputs = data.inputsArray.length;
  const totalLaborRoles = data.laborRolesArray.length;
  const totalIndirectCosts = data.indirectCostsArray.length;
  const totalMonthlyIndirectCosts = data.indirectCostsArray.reduce((sum, cost) => sum + (cost.monthlyAmount || 0), 0);

  const highSeverityIssues = productsWithIssues.filter(i => i.severity === 'high').length;
  const mediumSeverityIssues = productsWithIssues.filter(i => i.severity === 'medium').length;
  const lowSeverityIssues = productsWithIssues.filter(i => i.severity === 'low').length;

  // Render dashboard
  dashboardContent.innerHTML = `
    <!-- Summary Section -->
    <div class="mb-6 sm:mb-8">
      <h2 class="text-lg sm:text-xl font-light text-gray-800 mb-4">Resumen General</h2>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div class="bg-white border border-gray-200 p-3 sm:p-4 rounded">
          <div class="text-xs sm:text-sm text-gray-600 uppercase tracking-wider mb-1">Productos</div>
          <div class="text-xl sm:text-2xl font-light text-gray-800">${totalProducts}</div>
          <div class="text-xs text-gray-500 mt-1">${productsWithRecipes} con receta</div>
        </div>
        <div class="bg-white border border-gray-200 p-3 sm:p-4 rounded">
          <div class="text-xs sm:text-sm text-gray-600 uppercase tracking-wider mb-1">Recetas</div>
          <div class="text-xl sm:text-2xl font-light text-gray-800">${totalRecipes}</div>
          <div class="text-xs text-gray-500 mt-1">activas</div>
        </div>
        <div class="bg-white border border-gray-200 p-3 sm:p-4 rounded">
          <div class="text-xs sm:text-sm text-gray-600 uppercase tracking-wider mb-1">Insumos</div>
          <div class="text-xl sm:text-2xl font-light text-gray-800">${totalInputs}</div>
        </div>
        <div class="bg-white border border-gray-200 p-3 sm:p-4 rounded">
          <div class="text-xs sm:text-sm text-gray-600 uppercase tracking-wider mb-1">Costos Indirectos</div>
          <div class="text-xl sm:text-2xl font-light text-gray-800">$${totalMonthlyIndirectCosts.toFixed(2)}</div>
          <div class="text-xs text-gray-500 mt-1">mensuales</div>
        </div>
      </div>
    </div>

    <!-- Issues Monitor Section -->
    <div class="mb-6 sm:mb-8">
      <h2 class="text-lg sm:text-xl font-light text-gray-800 mb-4">Monitor de Recetas Problemáticas</h2>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-4">
        <div class="bg-red-50 border border-red-200 p-3 sm:p-4 rounded">
          <div class="text-xs sm:text-sm text-red-600 uppercase tracking-wider mb-1">Pérdidas</div>
          <div class="text-xl sm:text-2xl font-light text-red-600">${highSeverityIssues}</div>
        </div>
        <div class="bg-orange-50 border border-orange-200 p-3 sm:p-4 rounded">
          <div class="text-xs sm:text-sm text-orange-600 uppercase tracking-wider mb-1">Márgenes Bajos</div>
          <div class="text-xl sm:text-2xl font-light text-orange-600">${mediumSeverityIssues}</div>
        </div>
        <div class="bg-yellow-50 border border-yellow-200 p-3 sm:p-4 rounded">
          <div class="text-xs sm:text-sm text-yellow-600 uppercase tracking-wider mb-1">Sin Receta</div>
          <div class="text-xl sm:text-2xl font-light text-yellow-600">${lowSeverityIssues}</div>
        </div>
      </div>
      ${productsWithIssues.length > 0 ? `
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        ${productsWithIssues.slice(0, 10).map(issue => {
          const severityColor = issue.severity === 'high' 
            ? 'text-red-600' 
            : issue.severity === 'medium' 
            ? 'text-orange-600' 
            : 'text-yellow-600';
          
          const severityBg = issue.severity === 'high'
            ? 'bg-red-100 text-red-700 border-red-200'
            : issue.severity === 'medium'
            ? 'bg-orange-100 text-orange-700 border-orange-200'
            : 'bg-yellow-100 text-yellow-700 border-yellow-200';

          const severityBorder = issue.severity === 'high'
            ? 'border-red-200'
            : issue.severity === 'medium'
            ? 'border-orange-200'
            : 'border-yellow-200';

          const issueLabel = issue.issue === 'loss'
            ? 'Pérdida'
            : issue.issue === 'low-margin'
            ? 'Margen Bajo'
            : 'Sin Receta';

          return `
            <div class="bg-white border ${severityBorder} rounded p-3 sm:p-4 shadow-sm">
              <div class="flex items-start justify-between mb-2">
                <h3 class="text-sm sm:text-base font-medium text-gray-800 flex-1">${escapeHtml(issue.product.name)}</h3>
                <span class="px-2 py-1 text-xs rounded ${severityBg} ml-2 whitespace-nowrap">${issueLabel}</span>
              </div>
              <div class="space-y-2 text-xs sm:text-sm">
                <div class="flex justify-between items-center py-1 border-b border-gray-100">
                  <span class="text-gray-600">Margen:</span>
                  <span class="font-medium ${severityColor}">${issue.realMargin !== undefined ? `${issue.realMargin.toFixed(1)}%` : '-'}</span>
                </div>
                <div class="flex justify-between items-center py-1 border-b border-gray-100">
                  <span class="text-gray-600">Precio Actual:</span>
                  <span class="font-medium">${issue.price !== undefined ? `$${issue.price.toFixed(2)}` : '-'}</span>
                </div>
                <div class="flex justify-between items-center py-1">
                  <span class="text-gray-600">Precio Sugerido:</span>
                  <span class="font-medium text-blue-600">${issue.suggestedPrice !== undefined ? `$${issue.suggestedPrice.toFixed(2)}` : '-'}</span>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
      ` : `
      <div class="bg-green-50 border border-green-200 p-4 sm:p-6 rounded text-center">
        <p class="text-green-700 text-sm sm:text-base">✓ No hay productos con problemas identificados</p>
      </div>
      `}
    </div>

    <!-- Top Inputs Section -->
    <div class="mb-6 sm:mb-8">
      <h2 class="text-lg sm:text-xl font-light text-gray-800 mb-4">Top 10 Insumos Más Impactantes</h2>
      ${topInputs.length > 0 ? `
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        ${topInputs.map((item, index) => `
          <div class="bg-white border border-gray-200 rounded p-3 sm:p-4 shadow-sm">
            <div class="flex items-start justify-between mb-2">
              <h3 class="text-sm sm:text-base font-medium text-gray-800 flex-1">
                <span class="text-gray-500 font-light">${index + 1}.</span> ${escapeHtml(item.input.name)}
              </h3>
            </div>
            <div class="space-y-2 text-xs sm:text-sm">
              <div class="flex justify-between items-center py-1 border-b border-gray-100">
                <span class="text-gray-600">Precio Unitario:</span>
                <span class="font-medium">$${parseFloat(item.input.unitPrice || 0).toFixed(2)}/${item.input.unit || 'unidad'}</span>
              </div>
              <div class="flex justify-between items-center py-1 border-b border-gray-100">
                <span class="text-gray-600">Impacto Total:</span>
                <span class="font-medium text-red-600">$${item.totalImpact.toFixed(2)}</span>
              </div>
              <div class="flex justify-between items-center py-1">
                <span class="text-gray-600">Recetas:</span>
                <span class="text-gray-600">${item.recipeCount} receta(s)</span>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
      ` : `
      <div class="bg-gray-50 border border-gray-200 p-4 sm:p-6 rounded text-center">
        <p class="text-gray-600 text-sm sm:text-base">No hay insumos registrados</p>
      </div>
      `}
    </div>

    <!-- Top Labor Roles Section -->
    <div class="mb-6 sm:mb-8">
      <h2 class="text-lg sm:text-xl font-light text-gray-800 mb-4">Top 10 Roles de Mano de Obra Más Impactantes</h2>
      ${topLaborRoles.length > 0 ? `
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        ${topLaborRoles.map((item, index) => `
          <div class="bg-white border border-gray-200 rounded p-3 sm:p-4 shadow-sm">
            <div class="flex items-start justify-between mb-2">
              <h3 class="text-sm sm:text-base font-medium text-gray-800 flex-1">
                <span class="text-gray-500 font-light">${index + 1}.</span> ${escapeHtml(item.role.name)}
              </h3>
            </div>
            <div class="space-y-2 text-xs sm:text-sm">
              <div class="flex justify-between items-center py-1 border-b border-gray-100">
                <span class="text-gray-600">Costo Hora:</span>
                <span class="font-medium">$${parseFloat(item.role.hourlyCost || 0).toFixed(2)}/hora</span>
              </div>
              <div class="flex justify-between items-center py-1 border-b border-gray-100">
                <span class="text-gray-600">Impacto Total:</span>
                <span class="font-medium text-red-600">$${item.totalImpact.toFixed(2)}</span>
              </div>
              <div class="flex justify-between items-center py-1 border-b border-gray-100">
                <span class="text-gray-600">Horas Totales:</span>
                <span class="text-gray-600">${item.totalHours.toFixed(2)} horas</span>
              </div>
              <div class="flex justify-between items-center py-1">
                <span class="text-gray-600">Recetas:</span>
                <span class="text-gray-600">${item.recipeCount} receta(s)</span>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
      ` : `
      <div class="bg-gray-50 border border-gray-200 p-4 sm:p-6 rounded text-center">
        <p class="text-gray-600 text-sm sm:text-base">No hay roles de mano de obra registrados</p>
      </div>
      `}
    </div>

    <!-- Top Indirect Costs Section -->
    <div class="mb-6 sm:mb-8">
      <h2 class="text-lg sm:text-xl font-light text-gray-800 mb-4">Top 10 Costos Indirectos</h2>
      ${topIndirectCosts.length > 0 ? `
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        ${topIndirectCosts.map((item, index) => `
          <div class="bg-white border border-gray-200 rounded p-3 sm:p-4 shadow-sm">
            <div class="flex items-start justify-between mb-2">
              <h3 class="text-sm sm:text-base font-medium text-gray-800 flex-1">
                <span class="text-gray-500 font-light">${index + 1}.</span> ${escapeHtml(item.cost.name)}
              </h3>
            </div>
            <div class="space-y-2 text-xs sm:text-sm">
              <div class="flex justify-between items-center py-1 border-b border-gray-100">
                <span class="text-gray-600">Monto Mensual:</span>
                <span class="font-medium text-red-600">$${parseFloat(item.cost.monthlyAmount || 0).toFixed(2)}</span>
              </div>
              <div class="flex justify-between items-center py-1 border-b border-gray-100">
                <span class="text-gray-600">% del Total:</span>
                <span class="text-gray-600">${item.percentage.toFixed(1)}%</span>
              </div>
              <div class="flex justify-between items-center py-1">
                <span class="text-gray-600">Método:</span>
                <span class="text-gray-600">${item.cost.prorationMethod === 'units' ? 'Por Unidades' : 'Por Horas'}</span>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
      ` : `
      <div class="bg-gray-50 border border-gray-200 p-4 sm:p-6 rounded text-center">
        <p class="text-gray-600 text-sm sm:text-base">No hay costos indirectos registrados</p>
      </div>
      `}
    </div>
  `;
}

// Initialize dashboard tab
let initializeDashboardRetryCount = 0;
const MAX_RETRIES = 10; // Maximum 10 retries (3 seconds total)

function initializeDashboard() {
  // Use window.nrd (already set at the top of the file)
  const nrdInstance = window.nrd || nrd;
  
  // Check if nrd instance exists
  if (!nrdInstance) {
    const dashboardContent = document.getElementById('dashboard-content');
    if (dashboardContent) {
      dashboardContent.innerHTML = `
        <div class="bg-red-50 border border-red-200 p-4 sm:p-6 rounded text-center">
          <p class="text-red-700 text-sm sm:text-base mb-2">
            ⚠️ Error: El objeto nrd no está disponible
          </p>
          <p class="text-red-600 text-xs sm:text-sm">
            Verifica que la biblioteca NRD Data Access se haya cargado correctamente.
          </p>
        </div>
      `;
    }
    console.error('nrd instance not found. window.nrd:', window.nrd);
    initializeDashboardRetryCount = 0; // Reset counter on return
    return;
  }
  
  // Check if services are available
  const servicesStatus = {
    products: !!nrdInstance.products,
    recipes: !!nrdInstance.recipes,
    inputs: !!nrdInstance.inputs,
    laborRoles: !!nrdInstance.laborRoles,
    indirectCosts: !!nrdInstance.indirectCosts
  };
  
  const allServicesAvailable = servicesStatus.products && servicesStatus.recipes && 
                                servicesStatus.inputs && servicesStatus.laborRoles && 
                                servicesStatus.indirectCosts;
  
  if (!allServicesAvailable) {
    initializeDashboardRetryCount++;
    
    if (initializeDashboardRetryCount >= MAX_RETRIES) {
      // Maximum retries reached, show error message
      logger.error('Services not available after maximum retries', servicesStatus);
      const dashboardContent = document.getElementById('dashboard-content');
      if (dashboardContent) {
        const missingServices = [];
        if (!servicesStatus.products) missingServices.push('products');
        if (!servicesStatus.recipes) missingServices.push('recipes');
        if (!servicesStatus.inputs) missingServices.push('inputs');
        if (!servicesStatus.laborRoles) missingServices.push('laborRoles');
        if (!servicesStatus.indirectCosts) missingServices.push('indirectCosts');
        
        dashboardContent.innerHTML = `
          <div class="bg-red-50 border border-red-200 p-4 sm:p-6 rounded text-center">
            <p class="text-red-700 text-sm sm:text-base mb-2">
              ⚠️ Error: Servicios no disponibles
            </p>
            <p class="text-red-600 text-xs sm:text-sm mb-2">
              Los siguientes servicios no están disponibles en la librería:
            </p>
            <ul class="text-red-600 text-xs sm:text-sm text-left list-disc list-inside mb-3">
              ${missingServices.map(s => `<li>${s}</li>`).join('')}
            </ul>
            <p class="text-red-600 text-xs sm:text-sm">
              Verifica que la versión de la librería NRD Data Access incluya estos servicios.
              Los servicios disponibles son: ${Object.keys(nrdInstance).filter(k => typeof nrdInstance[k] === 'object' && nrdInstance[k] !== null && 'getAll' in nrdInstance[k]).join(', ')}
            </p>
          </div>
        `;
      }
      initializeDashboardRetryCount = 0; // Reset counter
      return;
    }
    
    logger.warn('Services not available yet, retrying...', {
      ...servicesStatus,
      retryCount: initializeDashboardRetryCount,
      maxRetries: MAX_RETRIES
    });
    
    // Retry after a short delay
    setTimeout(() => {
      initializeDashboard();
    }, 300);
    return;
  }
  
  // Reset counter on success
  initializeDashboardRetryCount = 0;

  // Setup listeners for real-time updates
  if (dashboardProductsListener) dashboardProductsListener();
  if (dashboardRecipesListener) dashboardRecipesListener();
  if (dashboardInputsListener) dashboardInputsListener();
  if (dashboardLaborRolesListener) dashboardLaborRolesListener();
  if (dashboardIndirectCostsListener) dashboardIndirectCostsListener();

  dashboardProductsListener = nrdInstance.products.onValue(() => {
    renderDashboard();
  });

  dashboardRecipesListener = nrdInstance.recipes.onValue(() => {
    renderDashboard();
  });

  dashboardInputsListener = nrdInstance.inputs.onValue(() => {
    renderDashboard();
  });

  dashboardLaborRolesListener = nrdInstance.laborRoles.onValue(() => {
    renderDashboard();
  });

  if (nrdInstance.indirectCosts) {
    dashboardIndirectCostsListener = nrdInstance.indirectCosts.onValue(() => {
      renderDashboard();
    });
  }

  // Initial render
  renderDashboard();
}
