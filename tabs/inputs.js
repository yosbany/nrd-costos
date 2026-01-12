// Input management

// Get nrd instance safely (always use window.nrd as it's set globally in index.html)
const nrd = window.nrd;

let inputsListener = null;
let inputsSearchTerm = '';

// Helper function to escape HTML
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Load inputs
function loadInputs() {
  logger.debug('Loading inputs');
  const inputsList = document.getElementById('inputs-list');
  if (!inputsList) {
    logger.warn('Inputs list element not found');
    return;
  }
  
  inputsList.innerHTML = '';

  // Remove previous listener
  if (inputsListener) {
    logger.debug('Removing previous inputs listener');
    inputsListener();
    inputsListener = null;
  }

  // Listen for inputs using NRD Data Access
  logger.debug('Setting up inputs listener');
  inputsListener = nrd.inputs.onValue((inputs) => {
    logger.debug('Inputs data received', { count: Array.isArray(inputs) ? inputs.length : Object.keys(inputs || {}).length });
    if (!inputsList) return;
    inputsList.innerHTML = '';
    
    const inputsDict = Array.isArray(inputs) 
      ? inputs.reduce((acc, input) => {
          if (input && input.id) {
            acc[input.id] = input;
          }
          return acc;
        }, {})
      : inputs || {};

    if (Object.keys(inputsDict).length === 0) {
      inputsList.innerHTML = `
        <div class="text-center py-8 sm:py-12 border border-gray-200 p-4 sm:p-8">
          <p class="text-gray-600 mb-3 sm:mb-4 text-sm sm:text-base">No hay insumos registrados</p>
        </div>
      `;
      return;
    }

    // Filter by search term if active
    let inputsToShow = Object.entries(inputsDict);
    if (inputsSearchTerm.trim()) {
      const searchLower = inputsSearchTerm.toLowerCase().trim();
      inputsToShow = inputsToShow.filter(([id, input]) => {
        const name = input.name ? input.name.toLowerCase() : '';
        const unit = input.unit ? input.unit.toLowerCase() : '';
        const supplier = input.supplier ? input.supplier.toLowerCase() : '';
        const price = input.unitPrice ? parseFloat(input.unitPrice).toString() : '';
        
        return name.includes(searchLower) || 
               unit.includes(searchLower) ||
               supplier.includes(searchLower) ||
               price.includes(searchLower);
      });
    }
    
    if (inputsToShow.length === 0) {
      inputsList.innerHTML = '<p class="text-center text-gray-600 py-6 sm:py-8 text-sm sm:text-base">No hay insumos que coincidan con la búsqueda</p>';
      return;
    }

    inputsToShow.forEach(([id, input]) => {
      const item = document.createElement('div');
      item.className = 'border border-gray-200 p-3 sm:p-4 md:p-6 hover:border-red-600 transition-colors cursor-pointer';
      item.dataset.inputId = id;
      item.innerHTML = `
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0 mb-2 sm:mb-3">
          <div class="text-base sm:text-lg font-light flex-1">${escapeHtml(input.name)}</div>
        </div>
        <div class="text-xs sm:text-sm text-gray-600">
          <div class="mb-1">Unidad: <span class="font-medium">${escapeHtml(input.unit || '')}</span></div>
          <div class="mb-1">Precio Unitario: <span class="text-red-600 font-medium">$${parseFloat(input.unitPrice || 0).toFixed(2)}</span></div>
          ${input.supplier ? `<div class="mb-1">Proveedor: <span class="font-medium">${escapeHtml(input.supplier)}</span></div>` : ''}
        </div>
      `;
      item.addEventListener('click', () => viewInput(id));
      inputsList.appendChild(item);
    });
  });
}

// Show input form
function showInputForm(inputId = null) {
  const form = document.getElementById('input-form');
  const list = document.getElementById('inputs-list');
  const header = document.querySelector('#inputs-view .flex.flex-col');
  const title = document.getElementById('input-form-title');
  const formHeader = document.getElementById('input-form-header');
  const saveBtn = document.getElementById('save-input-btn');
  
  if (!form || !list || !header) return;
  
  form.classList.remove('hidden');
  list.style.display = 'none';
  header.style.display = 'none';
  
  const formElement = document.getElementById('input-form-element');
  if (formElement) formElement.reset();
  
  const idInput = document.getElementById('input-id');
  if (idInput) idInput.value = inputId || '';

  const subtitle = document.getElementById('input-form-subtitle');
  
  if (inputId) {
    if (title) title.textContent = 'Editar Insumo';
    if (subtitle) subtitle.textContent = 'Modifique la información del insumo';
    if (formHeader) {
      formHeader.classList.remove('bg-green-600', 'bg-gray-600');
      formHeader.classList.add('bg-blue-600');
    }
    if (saveBtn) {
      saveBtn.classList.remove('bg-green-600', 'border-green-600', 'hover:bg-green-700');
      saveBtn.classList.add('bg-blue-600', 'border-blue-600', 'hover:bg-blue-700');
    }
    (async () => {
      const input = await nrd.inputs.getById(inputId);
      if (input) {
        const nameInput = document.getElementById('input-name');
        const unitInput = document.getElementById('input-unit');
        const priceInput = document.getElementById('input-unit-price');
        const supplierInput = document.getElementById('input-supplier');
        
        if (nameInput) nameInput.value = input.name || '';
        if (unitInput) unitInput.value = input.unit || '';
        if (priceInput) priceInput.value = input.unitPrice || '';
        if (supplierInput) supplierInput.value = input.supplier || '';
      }
    })();
  } else {
    if (title) title.textContent = 'Nuevo Insumo';
    if (subtitle) subtitle.textContent = 'Agregue un nuevo insumo';
    if (formHeader) {
      formHeader.classList.remove('bg-blue-600', 'bg-gray-600');
      formHeader.classList.add('bg-green-600');
    }
    if (saveBtn) {
      saveBtn.classList.remove('bg-blue-600', 'border-blue-600', 'hover:bg-blue-700');
      saveBtn.classList.add('bg-green-600', 'border-green-600', 'hover:bg-green-700');
    }
  }
}

// Hide input form
function hideInputForm() {
  const form = document.getElementById('input-form');
  const list = document.getElementById('inputs-list');
  const header = document.querySelector('#inputs-view .flex.flex-col');
  
  if (form) form.classList.add('hidden');
  if (list) list.style.display = 'block';
  if (header) header.style.display = 'flex';
}

// Save input
async function saveInput(inputId, inputData) {
  if (inputId) {
    await nrd.inputs.update(inputId, inputData);
    return { key: inputId };
  } else {
    const id = await nrd.inputs.create(inputData);
    return { key: id, getKey: () => id };
  }
}

// View input detail
async function viewInput(inputId) {
  logger.debug('Viewing input', { inputId });
  try {
    const input = await nrd.inputs.getById(inputId);
    if (!input) {
      logger.warn('Input not found', { inputId });
      await showError('Insumo no encontrado');
      return;
    }
    logger.debug('Input loaded successfully', { inputId, name: input.name });

    const list = document.getElementById('inputs-list');
    const header = document.querySelector('#inputs-view .flex.flex-col');
    const form = document.getElementById('input-form');
    const detail = document.getElementById('input-detail');
    
    if (list) list.style.display = 'none';
    if (header) header.style.display = 'none';
    if (form) form.classList.add('hidden');
    if (detail) detail.classList.remove('hidden');

    const detailContent = document.getElementById('input-detail-content');
    if (detailContent) {
      detailContent.innerHTML = `
        <div class="space-y-3 sm:space-y-4">
          <div class="flex justify-between py-2 sm:py-3 border-b border-gray-200">
            <span class="text-gray-600 font-light text-sm sm:text-base">Nombre:</span>
            <span class="font-light text-sm sm:text-base">${escapeHtml(input.name)}</span>
          </div>
          <div class="flex justify-between py-2 sm:py-3 border-b border-gray-200">
            <span class="text-gray-600 font-light text-sm sm:text-base">Unidad:</span>
            <span class="font-light text-sm sm:text-base">${escapeHtml(input.unit || '')}</span>
          </div>
          <div class="flex justify-between py-2 sm:py-3 border-b border-gray-200">
            <span class="text-gray-600 font-light text-sm sm:text-base">Precio Unitario:</span>
            <span class="font-light text-sm sm:text-base text-red-600 font-medium">$${parseFloat(input.unitPrice || 0).toFixed(2)}</span>
          </div>
          ${input.supplier ? `
          <div class="flex justify-between py-2 sm:py-3 border-b border-gray-200">
            <span class="text-gray-600 font-light text-sm sm:text-base">Proveedor:</span>
            <span class="font-light text-sm sm:text-base">${escapeHtml(input.supplier)}</span>
          </div>
          ` : ''}
          ${input.lastUpdated ? `
          <div class="flex justify-between py-2 sm:py-3 border-b border-gray-200">
            <span class="text-gray-600 font-light text-sm sm:text-base">Última Actualización:</span>
            <span class="font-light text-sm sm:text-base">${new Date(input.lastUpdated).toLocaleDateString()}</span>
          </div>
          ` : ''}
        </div>
      `;
    }

    // Attach button handlers
    const editBtn = document.getElementById('edit-input-detail-btn');
    const deleteBtn = document.getElementById('delete-input-detail-btn');
    
    if (editBtn) {
      editBtn.onclick = () => {
        if (detail) detail.classList.add('hidden');
        showInputForm(inputId);
      };
    }
    
    if (deleteBtn) {
      deleteBtn.onclick = () => deleteInputHandler(inputId);
    }
  } catch (error) {
    logger.error('Failed to load input', error);
    await showError('Error al cargar insumo: ' + error.message);
  }
}

// Back to inputs list
function backToInputs() {
  const list = document.getElementById('inputs-list');
  const header = document.querySelector('#inputs-view .flex.flex-col');
  const detail = document.getElementById('input-detail');
  
  if (list) list.style.display = 'block';
  if (header) header.style.display = 'flex';
  if (detail) detail.classList.add('hidden');
}

// Delete input handler
async function deleteInputHandler(inputId) {
  logger.debug('Delete input requested', { inputId });
  const confirmed = await showConfirm('Eliminar Insumo', '¿Está seguro de eliminar este insumo?');
  if (!confirmed) {
    logger.debug('Input deletion cancelled', { inputId });
    return;
  }

  const user = getCurrentUser();
  logger.info('Deleting input', { inputId });
  try {
    await nrd.inputs.delete(inputId);
    logger.audit('ENTITY_DELETE', { entity: 'input', id: inputId, uid: user?.uid, email: user?.email, timestamp: Date.now() });
    logger.info('Input deleted successfully', { inputId });
    backToInputs();
  } catch (error) {
    logger.error('Failed to delete input', error);
    await showError('Error al eliminar insumo: ' + error.message);
  }
}

// Input form submit handler
let inputFormHandlerSetup = false;
function setupInputFormHandler() {
  if (inputFormHandlerSetup) return;
  const formElement = document.getElementById('input-form-element');
  if (!formElement) return;
  
  inputFormHandlerSetup = true;
  formElement.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const inputId = document.getElementById('input-id')?.value;
    const name = document.getElementById('input-name')?.value.trim();
    const unit = document.getElementById('input-unit')?.value.trim();
    const unitPrice = parseFloat(document.getElementById('input-unit-price')?.value);
    const supplier = document.getElementById('input-supplier')?.value.trim();

    if (!name || !unit || isNaN(unitPrice) || unitPrice <= 0) {
      await showError('Por favor complete todos los campos requeridos correctamente (nombre, unidad y precio > 0)');
      return;
    }

    try {
      const inputData = { name, unit, unitPrice };
      if (supplier) {
        inputData.supplier = supplier;
      }
      // Update lastUpdated timestamp when price is changed
      if (inputId) {
        const existing = await nrd.inputs.getById(inputId);
        if (existing && existing.unitPrice !== unitPrice) {
          inputData.lastUpdated = Date.now();
        }
      }
      await saveInput(inputId || null, inputData);
      hideInputForm();
    } catch (error) {
      logger.error('Failed to save input', error);
      await showError('Error al guardar insumo: ' + error.message);
    }
  });
}

// Initialize inputs tab
function initializeInputs() {
  setupInputFormHandler();
  
  // Search input handler
  const searchInput = document.getElementById('inputs-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      inputsSearchTerm = e.target.value;
      loadInputs();
    });
  }

  // New input button
  const newBtn = document.getElementById('new-input-btn');
  if (newBtn) {
    newBtn.addEventListener('click', () => {
      showInputForm();
    });
  }

  // Cancel input form
  const cancelBtn = document.getElementById('cancel-input-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      hideInputForm();
    });
  }

  // Close input form button
  const closeBtn = document.getElementById('close-input-form');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      hideInputForm();
    });
  }

  // Back to inputs button
  const backBtn = document.getElementById('back-to-inputs');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      backToInputs();
    });
  }

  // Close input detail button
  const closeDetailBtn = document.getElementById('close-input-detail-btn');
  if (closeDetailBtn) {
    closeDetailBtn.addEventListener('click', () => {
      backToInputs();
    });
  }

  // Load inputs on initialization
  loadInputs();
}
