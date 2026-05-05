// Dashboard with monitoring and top impacts (ES Module)
// Using NRDCommon from CDN (loaded in index.html)
const logger = window.logger || console;

// Import calculation functions from modules
import {
  calculateDirectUnitCost,
  calculateTotalUnitCost,
  calculateRealMargin,
  calculateSuggestedPrice,
  getProductsWithIssues,
  getTopInputs
} from '../../modules/calculations.js';

const PRODUCTION_HOURLY_COST_KEY = 'productionHourlyCost';
const FIXED_COST_PER_HOUR_KEY = 'fixedCostPerHour';
const DEFAULT_TARGET_MARGIN_KEY = 'defaultTargetMargin';
const DEFAULT_PRODUCTION_HOURLY_COST = 352;
const DEFAULT_FIXED_COST_PER_HOUR = 0;
const DEFAULT_TARGET_MARGIN = 25;

let dashboardProductsListener = null;
let dashboardRecipesListener = null;

// Load all data for dashboard
async function loadDashboardData() {
  try {
    // Get nrd instance dynamically (initialized in index.html)
    const nrdInstance = window.nrd;
    
    if (!nrdInstance) {
      logger.error('nrd instance not found');
      return null;
    }
    
    // Check if services are available
    if (!nrdInstance.products || !nrdInstance.recipes) {
      logger.error('Services not available', {
        products: !!nrdInstance.products,
        recipes: !!nrdInstance.recipes,
        nrdKeys: nrdInstance ? Object.keys(nrdInstance) : 'nrd is null'
      });
      return null;
    }
    
    logger.debug('Loading dashboard data');

    // Load config values (productionHourlyCost, fixedCostPerHour, defaultTargetMargin from nrd-data-access Configuraciones)
    let productionHourlyCost = DEFAULT_PRODUCTION_HOURLY_COST;
    let fixedCostPerHour = DEFAULT_FIXED_COST_PER_HOUR;
    let defaultTargetMargin = DEFAULT_TARGET_MARGIN;
    if (nrdInstance.config) {
      try {
        const [prodVal, fixedVal, targetVal] = await Promise.all([
          nrdInstance.config.get(PRODUCTION_HOURLY_COST_KEY),
          nrdInstance.config.get(FIXED_COST_PER_HOUR_KEY),
          nrdInstance.config.get(DEFAULT_TARGET_MARGIN_KEY)
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

    // Load all data
    const [productsSnapshot, recipesSnapshot] = await Promise.all([
      nrdInstance.products.getAll(),
      nrdInstance.recipes.getAll()
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

    const productsArray = Object.values(products);
    const isProducible = (p) => {
      if (!p) return false;
      if (p.esProducible === true) return true;
      const variants = p.variants && (Array.isArray(p.variants) ? p.variants : Object.values(p.variants || {}));
      return variants && variants.some(v => v && v.esProducible === true);
    };
    const producibleProductsArray = productsArray.filter(isProducible);
    const recipesArray = Object.values(recipes);
    const inputsArray = productsArray.filter(p => p.esInsumo === true);
    const activeRecipes = recipesArray.filter(r => r.active !== false);
    const producibleIds = new Set(producibleProductsArray.map(p => p.id));
    const uniqueProductsWithRecipes = new Set(activeRecipes.map(r => r.productId).filter(id => producibleIds.has(id)));
    const productsWithRecipesCount = uniqueProductsWithRecipes.size;

    return {
      products,
      recipes,
      productsArray,
      producibleProductsArray,
      recipesArray,
      inputsArray,
      productsWithRecipesCount,
      productionHourlyCost,
      fixedCostPerHour,
      defaultTargetMargin
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

  // Get products with issues (solo productos con role producible)
  const productsWithIssues = await getProductsWithIssues(
    data.producibleProductsArray,
    data.recipesArray,
    {
      products: data.products,
      productionHourlyCost: data.productionHourlyCost,
      fixedCostPerHour: data.fixedCostPerHour,
      defaultTargetMargin: data.defaultTargetMargin
    }
  );

  // Get top inputs (products with esInsumo: true)
  const topInputs = getTopInputs(data.inputsArray, data.recipesArray, data.products, 10);

  // Calculate summary
  const productsWithRecipes = data.productsWithRecipesCount;
  const totalRecipes = data.recipesArray.filter(r => r.active !== false).length;
  const totalInputs = data.inputsArray.length;

  const highIssues = productsWithIssues.filter(i => i.severity === 'high');
  const mediumIssues = productsWithIssues.filter(i => i.severity === 'medium');
  const highSeverityIssues = highIssues.length;
  const mediumSeverityIssues = mediumIssues.length;
  const lowSeverityIssues = productsWithIssues.filter(i => i.severity === 'low').length;

  const lossMarginInfo = highIssues.length > 0
    ? (() => {
        const avg = highIssues.reduce((s, i) => s + (i.realMargin ?? 0), 0) / highIssues.length;
        return `margen prom: ${avg.toFixed(1)}%`;
      })()
    : '';
  const lowMarginInfo = mediumIssues.length > 0
    ? (() => {
        const avgReal = mediumIssues.reduce((s, i) => s + (i.realMargin ?? 0), 0) / mediumIssues.length;
        const avgTarget = mediumIssues.reduce((s, i) => s + (i.targetMargin ?? 0), 0) / mediumIssues.length;
        const variacion = avgReal - avgTarget;
        return `margen prom: ${avgReal.toFixed(1)}% (objetivo ${avgTarget.toFixed(0)}%) · var. ${variacion >= 0 ? '+' : ''}${variacion.toFixed(1)} pp`;
      })()
    : '';

  // Render dashboard
  dashboardContent.innerHTML = `
    <!-- Summary Section -->
    <div class="mb-6 sm:mb-8">
      <h2 class="text-lg sm:text-xl font-light text-gray-800 mb-4">Resumen General</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div class="bg-white border border-gray-200 p-3 sm:p-4 rounded">
          <div class="text-xs sm:text-sm text-gray-600 uppercase tracking-wider mb-1">Recetas</div>
          <div class="text-xl sm:text-2xl font-light text-gray-800">${totalRecipes}</div>
          <div class="text-xs text-gray-500 mt-1">activas</div>
        </div>
        <div class="bg-white border border-gray-200 p-3 sm:p-4 rounded">
          <div class="text-xs sm:text-sm text-gray-600 uppercase tracking-wider mb-1">Productos (Insumos)</div>
          <div class="text-xl sm:text-2xl font-light text-gray-800">${totalInputs}</div>
        </div>
        <div class="bg-white border border-gray-200 p-3 sm:p-4 rounded">
          <div class="text-xs sm:text-sm text-gray-600 uppercase tracking-wider mb-1">Mano de obra por hora</div>
          <div class="text-xl sm:text-2xl font-light text-gray-800">$${Number(data.productionHourlyCost || 0).toLocaleString('es-CL', { maximumFractionDigits: 0 })}/h</div>
          <div class="text-xs text-gray-500 mt-1">desde config</div>
        </div>
        <div class="bg-white border border-gray-200 p-3 sm:p-4 rounded">
          <div class="text-xs sm:text-sm text-gray-600 uppercase tracking-wider mb-1">Gasto fijo por hora</div>
          <div class="text-xl sm:text-2xl font-light text-gray-800">$${Number(data.fixedCostPerHour || 0).toLocaleString('es-CL', { maximumFractionDigits: 0 })}/h</div>
          <div class="text-xs text-gray-500 mt-1">desde config</div>
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
          <div class="text-xs text-red-600/80 mt-1">umbral: margen &lt; 0%</div>
          ${lossMarginInfo ? `<div class="text-xs text-red-600/80 mt-0.5">${lossMarginInfo}</div>` : ''}
        </div>
        <div class="bg-orange-50 border border-orange-200 p-3 sm:p-4 rounded">
          <div class="text-xs sm:text-sm text-orange-600 uppercase tracking-wider mb-1">Márgenes Bajos</div>
          <div class="text-xl sm:text-2xl font-light text-orange-600">${mediumSeverityIssues}</div>
          <div class="text-xs text-orange-600/80 mt-1">umbral: margen &lt; objetivo (general ${Number(data.defaultTargetMargin || 0).toFixed(0)}%)</div>
          ${lowMarginInfo ? `<div class="text-xs text-orange-600/80 mt-0.5">${lowMarginInfo}</div>` : ''}
        </div>
        <div class="bg-yellow-50 border border-yellow-200 p-3 sm:p-4 rounded">
          <div class="text-xs sm:text-sm text-yellow-600 uppercase tracking-wider mb-1">Sin Receta</div>
          <div class="text-xl sm:text-2xl font-light text-yellow-600">${lowSeverityIssues}</div>
          <div class="text-xs text-yellow-600/80 mt-1">sin receta definida</div>
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
                <h3 class="text-sm sm:text-base font-medium text-gray-800 flex-1">${(window.escapeHtml || ((t) => t || ''))(issue.product.name)}</h3>
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
      <h2 class="text-lg sm:text-xl font-light text-gray-800 mb-4">Top 10 Productos (Insumos) Más Impactantes</h2>
      ${topInputs.length > 0 ? `
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        ${topInputs.map((item, index) => `
          <div class="bg-white border border-gray-200 rounded p-3 sm:p-4 shadow-sm">
            <div class="flex items-start justify-between mb-2">
              <h3 class="text-sm sm:text-base font-medium text-gray-800 flex-1">
                <span class="text-gray-500 font-light">${index + 1}.</span> ${(window.escapeHtml || ((t) => t || ''))(item.product.name)}
              </h3>
            </div>
            <div class="space-y-2 text-xs sm:text-sm">
              <div class="flex justify-between items-center py-1 border-b border-gray-100">
                <span class="text-gray-600">Costo Unitario:</span>
                <span class="font-medium">$${parseFloat(item.product.cost || 0).toFixed(2)}/${item.product.unidadVenta || item.product.unidadProduccion || 'unidad'}</span>
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
        <p class="text-gray-600 text-sm sm:text-base">No hay productos con rol de insumo registrados</p>
      </div>
      `}
    </div>

  `;
}

// Initialize dashboard tab
let initializeDashboardRetryCount = 0;
const MAX_RETRIES = 10; // Maximum 10 retries (3 seconds total)

/**
 * Initialize dashboard view
 */
export function initializeDashboard() {
  // Get nrd instance dynamically (initialized in index.html)
  const nrdInstance = window.nrd;
  
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
    recipes: !!nrdInstance.recipes
  };
  
  const allServicesAvailable = servicesStatus.products && servicesStatus.recipes;
  
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

  dashboardProductsListener = nrdInstance.products.onValue(() => {
    renderDashboard();
  });

  dashboardRecipesListener = nrdInstance.recipes.onValue(() => {
    renderDashboard();
  });

  // Initial render
  renderDashboard();
}
