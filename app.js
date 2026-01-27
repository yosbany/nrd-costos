// Main app controller (ES Module)
// Using NRDCommon from CDN (loaded in index.html)
const logger = window.logger || console;

// Import view initializers
import { initializeDashboard } from './views/dashboard/index.js';
import { initializeRecipes } from './views/recipes/index.js';
import { initializeLaborRoles } from './views/labor-roles/index.js';
import { initializeIndirectCosts } from './views/indirect-costs/index.js';
import { initializeAnalysis } from './views/analysis/index.js';

// Navigation configuration
const NAV_ITEMS = [
  { id: 'dashboard', label: 'Inicio', view: 'dashboard' },
  { id: 'recipes', label: 'Recetas', view: 'recipes' },
  { id: 'labor-roles', label: 'Mano de Obra', view: 'labor-roles' },
  { id: 'indirect-costs', label: 'Costos Indirectos', view: 'indirect-costs' },
  { id: 'analysis', label: 'Análisis', view: 'analysis' }
];

// View initializers map
const VIEW_INITIALIZERS = {
  'dashboard': initializeDashboard,
  'recipes': initializeRecipes,
  'labor-roles': initializeLaborRoles,
  'indirect-costs': initializeIndirectCosts,
  'analysis': initializeAnalysis
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
      <button class="nav-btn flex-1 px-3 sm:px-4 py-3 sm:py-3.5 border-b-2 ${isActive} hover:text-red-600 transition-colors uppercase tracking-wider text-xs sm:text-sm font-light" 
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

/**
 * Initialize app for authenticated user
 */
function initializeAppForUser() {
  logger.info('Initializing app for authenticated user');

  // Hide redirecting screen and show app screen
  const redirectingScreen = document.getElementById('redirecting-screen');
  const appScreen = document.getElementById('app-screen');
  const loginScreen = document.getElementById('login-screen');

  if (redirectingScreen) redirectingScreen.classList.add('hidden');
  if (loginScreen) loginScreen.classList.add('hidden');
  if (appScreen) appScreen.classList.remove('hidden');

  // Initialize navigation
  initializeNavigation();

  // Switch to default view (dashboard)
  setTimeout(() => {
    switchView('dashboard');
  }, 100);
}

// Wait for window.nrd and NRDCommon to be available (they're initialized in index.html)
function waitForNRDAndInitialize() {
  const maxWait = 10000; // 10 seconds
  const startTime = Date.now();
  const checkInterval = 100; // Check every 100ms
  
  const checkNRD = setInterval(() => {
    const nrd = window.nrd;
    const NRDCommon = window.NRDCommon;
    
    if (nrd && nrd.auth && NRDCommon) {
      clearInterval(checkNRD);
      logger.info('NRD, auth, and NRDCommon available, setting up onAuthStateChanged');
      
      // Also listen to the current auth state immediately
      const currentUser = nrd.auth.getCurrentUser();
      if (currentUser) {
        logger.info('Current user found, initializing immediately', { uid: currentUser.uid, email: currentUser.email });
        initializeAppForUser();
      }
      
      nrd.auth.onAuthStateChanged((user) => {
        logger.info('Auth state changed', { hasUser: !!user, uid: user?.uid, email: user?.email });
        if (user) {
          initializeAppForUser();
        } else {
          logger.debug('User not authenticated, app initialization skipped');
        }
      });
    } else if (Date.now() - startTime >= maxWait) {
      clearInterval(checkNRD);
      logger.error('NRD, auth, or NRDCommon not available after timeout', { 
        hasNrd: !!nrd, 
        hasAuth: !!(nrd && nrd.auth),
        hasNRDCommon: !!NRDCommon
      });
    }
  }, checkInterval);
}

// Start waiting for NRD and NRDCommon
waitForNRDAndInitialize();
