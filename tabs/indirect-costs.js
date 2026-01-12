// Indirect costs management

// Get nrd instance safely (always use window.nrd as it's set globally in index.html)
const nrd = window.nrd;

let indirectCostsListener = null;
let indirectCostsSearchTerm = '';

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function loadIndirectCosts() {
  const indirectCostsList = document.getElementById('indirect-costs-list');
  if (!indirectCostsList) return;
  
  indirectCostsList.innerHTML = '';

  if (indirectCostsListener) {
    indirectCostsListener();
    indirectCostsListener = null;
  }

  indirectCostsListener = nrd.indirectCosts.onValue((indirectCosts) => {
    if (!indirectCostsList) return;
    indirectCostsList.innerHTML = '';
    
    const indirectCostsDict = Array.isArray(indirectCosts) 
      ? indirectCosts.reduce((acc, cost) => {
          if (cost && cost.id) {
            acc[cost.id] = cost;
          }
          return acc;
        }, {})
      : indirectCosts || {};

    if (Object.keys(indirectCostsDict).length === 0) {
      indirectCostsList.innerHTML = `
        <div class="text-center py-8 sm:py-12 border border-gray-200 p-4 sm:p-8">
          <p class="text-gray-600 mb-3 sm:mb-4 text-sm sm:text-base">No hay costos indirectos registrados</p>
        </div>
      `;
      return;
    }

    let indirectCostsToShow = Object.entries(indirectCostsDict);
    if (indirectCostsSearchTerm.trim()) {
      const searchLower = indirectCostsSearchTerm.toLowerCase().trim();
      indirectCostsToShow = indirectCostsToShow.filter(([id, cost]) => {
        const name = cost.name ? cost.name.toLowerCase() : '';
        const amount = cost.monthlyAmount ? parseFloat(cost.monthlyAmount).toString() : '';
        return name.includes(searchLower) || amount.includes(searchLower);
      });
    }
    
    if (indirectCostsToShow.length === 0) {
      indirectCostsList.innerHTML = '<p class="text-center text-gray-600 py-6 sm:py-8 text-sm sm:text-base">No hay costos que coincidan con la búsqueda</p>';
      return;
    }

    indirectCostsToShow.forEach(([id, cost]) => {
      const item = document.createElement('div');
      item.className = 'border border-gray-200 p-3 sm:p-4 md:p-6 hover:border-red-600 transition-colors cursor-pointer';
      item.dataset.costId = id;
      item.innerHTML = `
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0 mb-2 sm:mb-3">
          <div class="text-base sm:text-lg font-light flex-1">${escapeHtml(cost.name)}</div>
        </div>
        <div class="text-xs sm:text-sm text-gray-600">
          <div class="mb-1">Monto Mensual: <span class="text-red-600 font-medium">$${parseFloat(cost.monthlyAmount || 0).toFixed(2)}</span></div>
          <div class="mb-1">Método: <span class="font-medium">${cost.prorationMethod === 'units' ? 'Por Unidades' : 'Por Horas'}</span></div>
        </div>
      `;
      item.addEventListener('click', () => viewIndirectCost(id));
      indirectCostsList.appendChild(item);
    });
  });
}

function showIndirectCostForm(costId = null) {
  const form = document.getElementById('indirect-cost-form');
  const list = document.getElementById('indirect-costs-list');
  const header = document.querySelector('#indirect-costs-view .flex.flex-col');
  const title = document.getElementById('indirect-cost-form-title');
  const formHeader = document.getElementById('indirect-cost-form-header');
  const saveBtn = document.getElementById('save-indirect-cost-btn');
  
  if (!form || !list || !header) return;
  
  form.classList.remove('hidden');
  list.style.display = 'none';
  header.style.display = 'none';
  
  const formElement = document.getElementById('indirect-cost-form-element');
  if (formElement) formElement.reset();
  
  const idInput = document.getElementById('indirect-cost-id');
  if (idInput) idInput.value = costId || '';

  const subtitle = document.getElementById('indirect-cost-form-subtitle');
  
  if (costId) {
    if (title) title.textContent = 'Editar Costo Indirecto';
    if (subtitle) subtitle.textContent = 'Modifique la información del costo indirecto';
    if (formHeader) {
      formHeader.classList.remove('bg-green-600', 'bg-gray-600');
      formHeader.classList.add('bg-blue-600');
    }
    if (saveBtn) {
      saveBtn.classList.remove('bg-green-600', 'border-green-600', 'hover:bg-green-700');
      saveBtn.classList.add('bg-blue-600', 'border-blue-600', 'hover:bg-blue-700');
    }
    (async () => {
      const cost = await nrd.indirectCosts.getById(costId);
      if (cost) {
        const nameInput = document.getElementById('indirect-cost-name');
        const amountInput = document.getElementById('indirect-cost-monthly-amount');
        const methodInput = document.getElementById('indirect-cost-proration-method');
        
        if (nameInput) nameInput.value = cost.name || '';
        if (amountInput) amountInput.value = cost.monthlyAmount || '';
        if (methodInput) methodInput.value = cost.prorationMethod || 'units';
      }
    })();
  } else {
    if (title) title.textContent = 'Nuevo Costo Indirecto';
    if (subtitle) subtitle.textContent = 'Agregue un nuevo costo indirecto';
    if (formHeader) {
      formHeader.classList.remove('bg-blue-600', 'bg-gray-600');
      formHeader.classList.add('bg-green-600');
    }
    if (saveBtn) {
      saveBtn.classList.remove('bg-blue-600', 'border-blue-600', 'hover:bg-blue-700');
      saveBtn.classList.add('bg-green-600', 'border-green-600', 'hover:bg-green-700');
    }
    const methodInput = document.getElementById('indirect-cost-proration-method');
    if (methodInput) methodInput.value = 'units';
  }
}

function hideIndirectCostForm() {
  const form = document.getElementById('indirect-cost-form');
  const list = document.getElementById('indirect-costs-list');
  const header = document.querySelector('#indirect-costs-view .flex.flex-col');
  
  if (form) form.classList.add('hidden');
  if (list) list.style.display = 'block';
  if (header) header.style.display = 'flex';
}

async function saveIndirectCost(costId, costData) {
  const user = getCurrentUser();
  if (costId) {
    logger.info('Updating indirect cost', { costId, name: costData.name });
    await nrd.indirectCosts.update(costId, costData);
    logger.audit('ENTITY_UPDATE', { entity: 'indirectCost', id: costId, data: costData, uid: user?.uid, email: user?.email, timestamp: Date.now() });
    logger.info('Indirect cost updated successfully', { costId });
    return { key: costId };
  } else {
    logger.info('Creating new indirect cost', { name: costData.name });
    const id = await nrd.indirectCosts.create(costData);
    logger.audit('ENTITY_CREATE', { entity: 'indirectCost', id, data: costData, uid: user?.uid, email: user?.email, timestamp: Date.now() });
    logger.info('Indirect cost created successfully', { id, name: costData.name });
    return { key: id, getKey: () => id };
  }
}

async function viewIndirectCost(costId) {
  logger.debug('Viewing indirect cost', { costId });
  try {
    const cost = await nrd.indirectCosts.getById(costId);
    if (!cost) {
      logger.warn('Indirect cost not found', { costId });
      await showError('Costo indirecto no encontrado');
      return;
    }
    logger.debug('Indirect cost loaded successfully', { costId, name: cost.name });

    const list = document.getElementById('indirect-costs-list');
    const header = document.querySelector('#indirect-costs-view .flex.flex-col');
    const form = document.getElementById('indirect-cost-form');
    const detail = document.getElementById('indirect-cost-detail');
    
    if (list) list.style.display = 'none';
    if (header) header.style.display = 'none';
    if (form) form.classList.add('hidden');
    if (detail) detail.classList.remove('hidden');

    const detailContent = document.getElementById('indirect-cost-detail-content');
    if (detailContent) {
      detailContent.innerHTML = `
        <div class="space-y-3 sm:space-y-4">
          <div class="flex justify-between py-2 sm:py-3 border-b border-gray-200">
            <span class="text-gray-600 font-light text-sm sm:text-base">Nombre:</span>
            <span class="font-light text-sm sm:text-base">${escapeHtml(cost.name)}</span>
          </div>
          <div class="flex justify-between py-2 sm:py-3 border-b border-gray-200">
            <span class="text-gray-600 font-light text-sm sm:text-base">Monto Mensual:</span>
            <span class="font-light text-sm sm:text-base text-red-600 font-medium">$${parseFloat(cost.monthlyAmount || 0).toFixed(2)}</span>
          </div>
          <div class="flex justify-between py-2 sm:py-3 border-b border-gray-200">
            <span class="text-gray-600 font-light text-sm sm:text-base">Método de Prorrateo:</span>
            <span class="font-light text-sm sm:text-base">${cost.prorationMethod === 'units' ? 'Por Unidades' : 'Por Horas'}</span>
          </div>
          <div class="bg-blue-50 border border-blue-200 p-3 rounded text-xs text-blue-800">
            <strong>Nota:</strong> Los costos indirectos se distribuyen igualmente entre todos los productos con recetas activas.
          </div>
        </div>
      `;
    }

    const editBtn = document.getElementById('edit-indirect-cost-detail-btn');
    const deleteBtn = document.getElementById('delete-indirect-cost-detail-btn');
    
    if (editBtn) {
      editBtn.onclick = () => {
        if (detail) detail.classList.add('hidden');
        showIndirectCostForm(costId);
      };
    }
    
    if (deleteBtn) {
      deleteBtn.onclick = () => deleteIndirectCostHandler(costId);
    }
  } catch (error) {
    logger.error('Failed to load indirect cost', error);
    await showError('Error al cargar costo indirecto: ' + error.message);
  }
}

function backToIndirectCosts() {
  const list = document.getElementById('indirect-costs-list');
  const header = document.querySelector('#indirect-costs-view .flex.flex-col');
  const detail = document.getElementById('indirect-cost-detail');
  
  if (list) list.style.display = 'block';
  if (header) header.style.display = 'flex';
  if (detail) detail.classList.add('hidden');
}

async function deleteIndirectCostHandler(costId) {
  logger.debug('Delete indirect cost requested', { costId });
  const confirmed = await showConfirm('Eliminar Costo Indirecto', '¿Está seguro de eliminar este costo indirecto?');
  if (!confirmed) {
    logger.debug('Indirect cost deletion cancelled', { costId });
    return;
  }

  const user = getCurrentUser();
  logger.info('Deleting indirect cost', { costId });
  try {
    await nrd.indirectCosts.delete(costId);
    logger.audit('ENTITY_DELETE', { entity: 'indirectCost', id: costId, uid: user?.uid, email: user?.email, timestamp: Date.now() });
    logger.info('Indirect cost deleted successfully', { costId });
    backToIndirectCosts();
  } catch (error) {
    logger.error('Failed to delete indirect cost', error);
    await showError('Error al eliminar costo indirecto: ' + error.message);
  }
}

let indirectCostFormHandlerSetup = false;
function setupIndirectCostFormHandler() {
  if (indirectCostFormHandlerSetup) return;
  const formElement = document.getElementById('indirect-cost-form-element');
  if (!formElement) return;
  
  indirectCostFormHandlerSetup = true;
  formElement.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const costId = document.getElementById('indirect-cost-id')?.value;
    const name = document.getElementById('indirect-cost-name')?.value.trim();
    const monthlyAmount = parseFloat(document.getElementById('indirect-cost-monthly-amount')?.value);
    const prorationMethod = document.getElementById('indirect-cost-proration-method')?.value;

    if (!name || isNaN(monthlyAmount) || monthlyAmount <= 0 || !prorationMethod) {
      logger.warn('Indirect cost form validation failed', { hasName: !!name, monthlyAmount, prorationMethod });
      await showError('Por favor complete todos los campos requeridos correctamente (nombre, monto mensual > 0 y método)');
      return;
    }

    logger.debug('Indirect cost form submitted', { costId, name, monthlyAmount, prorationMethod });
    try {
      const costData = { name, monthlyAmount, prorationMethod };
      await saveIndirectCost(costId || null, costData);
      hideIndirectCostForm();
    } catch (error) {
      logger.error('Failed to save indirect cost', error);
      await showError('Error al guardar costo indirecto: ' + error.message);
    }
  });
}

function initializeIndirectCosts() {
  setupIndirectCostFormHandler();
  
  const searchInput = document.getElementById('indirect-costs-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      indirectCostsSearchTerm = e.target.value;
      loadIndirectCosts();
    });
  }

  const newBtn = document.getElementById('new-indirect-cost-btn');
  if (newBtn) {
    newBtn.addEventListener('click', () => {
      showIndirectCostForm();
    });
  }

  const cancelBtn = document.getElementById('cancel-indirect-cost-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      hideIndirectCostForm();
    });
  }

  const closeBtn = document.getElementById('close-indirect-cost-form');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      hideIndirectCostForm();
    });
  }

  const backBtn = document.getElementById('back-to-indirect-costs');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      backToIndirectCosts();
    });
  }

  const closeDetailBtn = document.getElementById('close-indirect-cost-detail-btn');
  if (closeDetailBtn) {
    closeDetailBtn.addEventListener('click', () => {
      backToIndirectCosts();
    });
  }

  loadIndirectCosts();
}
