// Main app controller (ES Module)
// Using NRDCommon from CDN (loaded in index.html)
const logger = window.logger || console;

// Import view initializers
import { initializeDashboard } from './views/dashboard/index.js';
import { initializeRecipes } from './views/recipes/index.js';
// Navigation configuration
const NAV_ITEMS = [
  { id: 'dashboard', label: 'Inicio', view: 'dashboard' },
  { id: 'recipes', label: 'Recetas', view: 'recipes' }
];

// View initializers map
const VIEW_INITIALIZERS = {
  'dashboard': initializeDashboard,
  'recipes': initializeRecipes
};

/**
 * Initialize navigation
 */
function initializeNavigation() {
  const navContainer = document.getElementById('app-nav-container');
  if (!navContainer) {
    logger.warn('Navigation container not found');
    return;
  }

  // Create navigation buttons
  const navHTML = NAV_ITEMS.map((item, index) => {
    const isActive = index === 0 ? 'border-red-600 text-red-600 bg-red-50 font-medium' : 'border-transparent text-gray-600';
    return `
      <button class="nav-btn flex-1 px-4 py-3.5 border-b-2 ${isActive} hover:text-red-600 transition-colors uppercase tracking-wider text-xs sm:text-sm font-light min-h-[3rem]" 
              data-view="${item.view}">
        ${item.label}
      </button>
    `;
  }).join('');

  navContainer.innerHTML = navHTML;

  // Setup navigation button handlers
  navContainer.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const viewName = btn.dataset.view;
      if (viewName) {
        switchView(viewName);
      }
    });
  });
}

/**
 * Switch to a specific view
 */
function switchView(viewName) {
  logger.debug('Switching view', { viewName });

  // Hide all views
  document.querySelectorAll('.view').forEach(view => {
    view.classList.add('hidden');
  });

  // Show selected view
  const selectedView = document.getElementById(`${viewName}-view`);
  if (selectedView) {
    selectedView.classList.remove('hidden');
  } else {
    logger.warn('View element not found', { viewName });
  }

  // Update nav buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.remove('border-red-600', 'text-red-600', 'bg-red-50', 'font-medium');
    btn.classList.add('border-transparent', 'text-gray-600');
  });

  const activeBtn = document.querySelector(`[data-view="${viewName}"]`);
  if (activeBtn) {
    activeBtn.classList.remove('border-transparent', 'text-gray-600');
    activeBtn.classList.add('border-red-600', 'text-red-600', 'bg-red-50', 'font-medium');
  }

  // Initialize view if initializer exists
  const initializer = VIEW_INITIALIZERS[viewName];
  if (initializer && typeof initializer === 'function') {
    try {
      initializer();
    } catch (error) {
      logger.error('Error initializing view', { viewName, error });
    }
  } else {
    logger.warn('No initializer found for view', { viewName });
  }
}

function initializeAppForUser(user) {
  logger.info('Initializing app for user', { uid: user.uid, email: user.email });
  initializeNavigation();
  switchView('dashboard');
}

(window.NRDCommon?.startApp || function(fn, opts) {
  window.__nrdStartQueue = window.__nrdStartQueue || [];
  window.__nrdStartQueue.push({ onReady: fn, options: opts || {} });
})(initializeAppForUser, { initDelay: 100 });
