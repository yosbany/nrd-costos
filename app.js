// Main app controller

// Navigation
let currentView = null;

function switchView(viewName) {
  // Prevent duplicate loading
  if (currentView === viewName) {
    logger.debug('View already active, skipping', { viewName });
    return;
  }
  
  logger.info('Switching view', { from: currentView, to: viewName });
  currentView = viewName;

  // Hide all views
  const views = ['dashboard', 'recipes', 'inputs', 'labor-roles', 'indirect-costs', 'products', 'analysis'];
  views.forEach(view => {
    const viewElement = document.getElementById(`${view}-view`);
    if (viewElement) {
      viewElement.classList.add('hidden');
    }
  });

  // Show selected view
  const selectedView = document.getElementById(`${viewName}-view`);
  if (selectedView) {
    selectedView.classList.remove('hidden');
    logger.debug('View shown', { viewName });
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
  } else {
    logger.warn('Active nav button not found', { viewName });
  }

  // Load data for the view
  logger.debug('Loading view data', { viewName });
  if (viewName === 'inputs') {
    if (typeof initializeInputs === 'function') {
      initializeInputs();
    } else if (typeof loadInputs === 'function') {
      loadInputs();
    }
  } else if (viewName === 'labor-roles') {
    if (typeof initializeLaborRoles === 'function') {
      initializeLaborRoles();
    } else if (typeof loadLaborRoles === 'function') {
      loadLaborRoles();
    }
  } else if (viewName === 'indirect-costs') {
    if (typeof initializeIndirectCosts === 'function') {
      initializeIndirectCosts();
    } else if (typeof loadIndirectCosts === 'function') {
      loadIndirectCosts();
    }
  } else if (viewName === 'products') {
    if (typeof initializeProducts === 'function') {
      initializeProducts();
    } else if (typeof loadProducts === 'function') {
      loadProducts();
    }
  } else if (viewName === 'recipes') {
    if (typeof initializeRecipes === 'function') {
      initializeRecipes();
    } else if (typeof loadRecipes === 'function') {
      loadRecipes();
    }
  } else if (viewName === 'analysis') {
    if (typeof initializeAnalysis === 'function') {
      initializeAnalysis();
    } else if (typeof renderAnalysisTable === 'function') {
      renderAnalysisTable();
    }
  } else if (viewName === 'dashboard') {
    if (typeof initializeDashboard === 'function') {
      initializeDashboard();
    } else if (typeof renderDashboard === 'function') {
      renderDashboard();
    }
  }
  
  logger.debug('View switched successfully', { viewName });
}

// Nav button handlers - use event delegation
function setupNavButtons() {
  logger.debug('Setting up nav button handlers');
  document.querySelectorAll('.nav-btn').forEach(btn => {
    // Remove existing listeners by cloning
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    
    newBtn.addEventListener('click', () => {
      const view = newBtn.dataset.view;
      logger.debug('Nav button clicked', { view });
      switchView(view);
    });
  });
  logger.debug('Nav button handlers attached');
}

// Helper function to wait for services to be available
function waitForServices(maxWait = 5000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const checkServices = () => {
      const nrdInstance = typeof nrd !== 'undefined' ? nrd : window.nrd;
      if (!nrdInstance) {
        if (Date.now() - startTime >= maxWait) {
          reject(new Error('NRD instance not found'));
          return;
        }
        setTimeout(checkServices, 100);
        return;
      }
      
      const servicesAvailable = nrdInstance.products && nrdInstance.recipes && 
                                nrdInstance.inputs && nrdInstance.laborRoles && 
                                nrdInstance.indirectCosts;
      
      if (servicesAvailable) {
        resolve(nrdInstance);
      } else if (Date.now() - startTime >= maxWait) {
        reject(new Error('Services not available after timeout'));
      } else {
        setTimeout(checkServices, 100);
      }
    };
    checkServices();
  });
}

// Initialize app using NRD Data Access
nrd.auth.onAuthStateChanged((user) => {
  if (user) {
    logger.info('User authenticated, initializing app', { uid: user.uid, email: user.email });
    // Wait for services to be available, then setup nav buttons and default view
    waitForServices(5000)
      .then(() => {
        logger.debug('Services available, setting up app');
        // Setup nav buttons after DOM is ready
        setTimeout(() => {
          setupNavButtons();
          // Default to dashboard view
          switchView('dashboard');
        }, 100);
      })
      .catch((error) => {
        logger.error('Failed to initialize services', error);
        // Still setup nav buttons, but show error in dashboard
        setTimeout(() => {
          setupNavButtons();
          switchView('dashboard');
        }, 100);
      });
  } else {
    logger.debug('User not authenticated, app initialization skipped');
  }
});
