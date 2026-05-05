// Labor roles management (ES Module)
// Using NRDCommon from CDN (loaded in index.html)
const logger = window.logger || console;
const escapeHtml = window.escapeHtml || ((text) => {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
});

let laborRolesListener = null;
let laborRolesSearchTerm = '';

// Load labor roles
function loadLaborRoles() {
  logger.debug('Loading labor roles');
  const laborRolesList = document.getElementById('labor-roles-list');
  if (!laborRolesList) {
    logger.warn('Labor roles list element not found');
    return;
  }
  
  laborRolesList.innerHTML = '';

  if (laborRolesListener) {
    logger.debug('Removing previous labor roles listener');
    laborRolesListener();
    laborRolesListener = null;
  }

  logger.debug('Setting up labor roles listener');
  const nrd = window.nrd;
  if (!nrd) {
    logger.error('NRD service not available');
    return;
  }
  
  laborRolesListener = nrd.laborRoles.onValue((laborRoles) => {
    logger.debug('Labor roles data received', { count: Array.isArray(laborRoles) ? laborRoles.length : Object.keys(laborRoles || {}).length });
    if (!laborRolesList) return;
    laborRolesList.innerHTML = '';
    
    const laborRolesDict = Array.isArray(laborRoles) 
      ? laborRoles.reduce((acc, role) => {
          if (role && role.id) {
            acc[role.id] = role;
          }
          return acc;
        }, {})
      : laborRoles || {};

    if (Object.keys(laborRolesDict).length === 0) {
      laborRolesList.innerHTML = `
        <div class="text-center py-8 sm:py-12 border border-gray-200 p-4 sm:p-8">
          <p class="text-gray-600 mb-3 sm:mb-4 text-sm sm:text-base">No hay roles de mano de obra registrados</p>
        </div>
      `;
      return;
    }

    let laborRolesToShow = Object.entries(laborRolesDict);
    if (laborRolesSearchTerm.trim()) {
      const searchLower = laborRolesSearchTerm.toLowerCase().trim();
      laborRolesToShow = laborRolesToShow.filter(([id, role]) => {
        const name = role.name ? role.name.toLowerCase() : '';
        const cost = role.hourlyCost ? parseFloat(role.hourlyCost).toString() : '';
        return name.includes(searchLower) || cost.includes(searchLower);
      });
    }
    
    if (laborRolesToShow.length === 0) {
      laborRolesList.innerHTML = '<p class="text-center text-gray-600 py-6 sm:py-8 text-sm sm:text-base">No hay roles que coincidan con la búsqueda</p>';
      return;
    }

    laborRolesToShow.forEach(([id, role]) => {
      const item = document.createElement('div');
      item.className = 'border border-gray-200 p-3 sm:p-4 md:p-6 hover:border-red-600 transition-colors cursor-pointer';
      item.dataset.roleId = id;
      item.innerHTML = `
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0 mb-2 sm:mb-3">
          <div class="text-base sm:text-lg font-light flex-1">${escapeHtml(role.name)}</div>
        </div>
        <div class="text-xs sm:text-sm text-gray-600">
          Costo Hora: <span class="text-red-600 font-medium">$${parseFloat(role.hourlyCost || 0).toFixed(2)}</span>
        </div>
      `;
      item.addEventListener('click', () => viewLaborRole(id));
      laborRolesList.appendChild(item);
    });
  });
}

// Show labor role form
function showLaborRoleForm(roleId = null) {
  const form = document.getElementById('labor-role-form');
  const list = document.getElementById('labor-roles-list');
  const header = document.querySelector('#labor-roles-view .flex.flex-col');
  const title = document.getElementById('labor-role-form-title');
  const formHeader = document.getElementById('labor-role-form-header');
  const saveBtn = document.getElementById('save-labor-role-btn');
  
  if (!form || !list || !header) return;
  
  form.classList.remove('hidden');
  list.style.display = 'none';
  header.style.display = 'none';
  
  const formElement = document.getElementById('labor-role-form-element');
  if (formElement) formElement.reset();
  
  const idInput = document.getElementById('labor-role-id');
  if (idInput) idInput.value = roleId || '';

  const subtitle = document.getElementById('labor-role-form-subtitle');
  
  if (roleId) {
    if (title) title.textContent = 'Editar Rol';
    if (subtitle) subtitle.textContent = 'Modifique la información del rol';
    if (formHeader) {
      formHeader.classList.remove('bg-green-600', 'bg-gray-600');
      formHeader.classList.add('bg-blue-600');
    }
    if (saveBtn) {
      saveBtn.classList.remove('bg-green-600', 'border-green-600', 'hover:bg-green-700');
      saveBtn.classList.add('bg-blue-600', 'border-blue-600', 'hover:bg-blue-700');
    }
    (async () => {
      const nrd = window.nrd;
      if (!nrd) {
        await (window.showError || alert)('Servicio no disponible');
        return;
      }
      const role = await nrd.laborRoles.getById(roleId);
      if (role) {
        const nameInput = document.getElementById('labor-role-name');
        const costInput = document.getElementById('labor-role-hourly-cost');
        
        if (nameInput) nameInput.value = role.name || '';
        if (costInput) costInput.value = role.hourlyCost || '';
      }
    })();
  } else {
    if (title) title.textContent = 'Nuevo Rol';
    if (subtitle) subtitle.textContent = 'Agregue un nuevo rol de mano de obra';
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

// Hide labor role form
function hideLaborRoleForm() {
  const form = document.getElementById('labor-role-form');
  const list = document.getElementById('labor-roles-list');
  const header = document.querySelector('#labor-roles-view .flex.flex-col');
  
  if (form) form.classList.add('hidden');
  if (list) list.style.display = 'block';
  if (header) header.style.display = 'flex';
}

// Save labor role
async function saveLaborRole(roleId, roleData) {
  const user = getCurrentUser();
  if (roleId) {
    logger.info('Updating labor role', { roleId, name: roleData.name });
    const nrd = window.nrd;
    if (!nrd) {
      await (window.showError || alert)('Servicio no disponible');
      return;
    }
    await nrd.laborRoles.update(roleId, roleData);
    logger.audit('ENTITY_UPDATE', { entity: 'laborRole', id: roleId, data: roleData, uid: user?.uid, email: user?.email, timestamp: Date.now() });
    logger.info('Labor role updated successfully', { roleId });
    return { key: roleId };
  } else {
    logger.info('Creating new labor role', { name: roleData.name });
    const nrd = window.nrd;
    if (!nrd) {
      await (window.showError || alert)('Servicio no disponible');
      return;
    }
    const id = await nrd.laborRoles.create(roleData);
    logger.audit('ENTITY_CREATE', { entity: 'laborRole', id, data: roleData, uid: user?.uid, email: user?.email, timestamp: Date.now() });
    logger.info('Labor role created successfully', { id, name: roleData.name });
    return { key: id, getKey: () => id };
  }
}

// View labor role detail
async function viewLaborRole(roleId) {
  logger.debug('Viewing labor role', { roleId });
  try {
    const role = await nrd.laborRoles.getById(roleId);
    if (!role) {
      logger.warn('Labor role not found', { roleId });
      await showError('Rol no encontrado');
      return;
    }
    logger.debug('Labor role loaded successfully', { roleId, name: role.name });

    const list = document.getElementById('labor-roles-list');
    const header = document.querySelector('#labor-roles-view .flex.flex-col');
    const form = document.getElementById('labor-role-form');
    const detail = document.getElementById('labor-role-detail');
    
    if (list) list.style.display = 'none';
    if (header) header.style.display = 'none';
    if (form) form.classList.add('hidden');
    if (detail) detail.classList.remove('hidden');

    const detailContent = document.getElementById('labor-role-detail-content');
    if (detailContent) {
      detailContent.innerHTML = `
        <div class="space-y-3 sm:space-y-4">
          <div class="flex justify-between py-2 sm:py-3 border-b border-gray-200">
            <span class="text-gray-600 font-light text-sm sm:text-base">Nombre:</span>
            <span class="font-light text-sm sm:text-base">${escapeHtml(role.name)}</span>
          </div>
          <div class="flex justify-between py-2 sm:py-3 border-b border-gray-200">
            <span class="text-gray-600 font-light text-sm sm:text-base">Costo Hora:</span>
            <span class="font-light text-sm sm:text-base text-red-600 font-medium">$${parseFloat(role.hourlyCost || 0).toFixed(2)}</span>
          </div>
        </div>
      `;
    }

    const editBtn = document.getElementById('edit-labor-role-detail-btn');
    const deleteBtn = document.getElementById('delete-labor-role-detail-btn');
    
    if (editBtn) {
      editBtn.onclick = () => {
        if (detail) detail.classList.add('hidden');
        showLaborRoleForm(roleId);
      };
    }
    
    if (deleteBtn) {
      deleteBtn.onclick = () => deleteLaborRoleHandler(roleId);
    }
  } catch (error) {
    logger.error('Failed to load labor role', error);
    await showError('Error al cargar rol: ' + error.message);
  }
}

// Back to labor roles list
function backToLaborRoles() {
  const list = document.getElementById('labor-roles-list');
  const header = document.querySelector('#labor-roles-view .flex.flex-col');
  const detail = document.getElementById('labor-role-detail');
  
  if (list) list.style.display = 'block';
  if (header) header.style.display = 'flex';
  if (detail) detail.classList.add('hidden');
}

// Delete labor role handler
async function deleteLaborRoleHandler(roleId) {
  logger.debug('Delete labor role requested', { roleId });
  const confirmed = await showConfirm('Eliminar Rol', '¿Está seguro de eliminar este rol?');
  if (!confirmed) {
    logger.debug('Labor role deletion cancelled', { roleId });
    return;
  }

  const user = getCurrentUser();
  logger.info('Deleting labor role', { roleId });
  try {
    const nrd = window.nrd;
    if (!nrd) {
      await (window.showError || alert)('Servicio no disponible');
      return;
    }
    await nrd.laborRoles.delete(roleId);
    logger.audit('ENTITY_DELETE', { entity: 'laborRole', id: roleId, uid: user?.uid, email: user?.email, timestamp: Date.now() });
    logger.info('Labor role deleted successfully', { roleId });
    backToLaborRoles();
  } catch (error) {
    logger.error('Failed to delete labor role', error);
    await showError('Error al eliminar rol: ' + error.message);
  }
}

// Labor role form submit handler
let laborRoleFormHandlerSetup = false;
function setupLaborRoleFormHandler() {
  if (laborRoleFormHandlerSetup) return;
  const formElement = document.getElementById('labor-role-form-element');
  if (!formElement) return;
  
  laborRoleFormHandlerSetup = true;
  formElement.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const roleId = document.getElementById('labor-role-id')?.value;
    const name = document.getElementById('labor-role-name')?.value.trim();
    const hourlyCost = parseFloat(document.getElementById('labor-role-hourly-cost')?.value);

    if (!name || isNaN(hourlyCost) || hourlyCost <= 0) {
      logger.warn('Labor role form validation failed', { hasName: !!name, hourlyCost });
      await showError('Por favor complete todos los campos requeridos correctamente (nombre y costo hora > 0)');
      return;
    }

    logger.debug('Labor role form submitted', { roleId, name, hourlyCost });
    try {
      const roleData = { name, hourlyCost };
      await saveLaborRole(roleId || null, roleData);
      hideLaborRoleForm();
    } catch (error) {
      logger.error('Failed to save labor role', error);
      await showError('Error al guardar rol: ' + error.message);
    }
  });
}

/**
 * Initialize labor roles view
 */
export function initializeLaborRoles() {
  setupLaborRoleFormHandler();
  
  const searchInput = document.getElementById('labor-roles-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      laborRolesSearchTerm = e.target.value;
      loadLaborRoles();
    });
  }

  const newBtn = document.getElementById('new-labor-role-btn');
  if (newBtn) {
    newBtn.addEventListener('click', () => {
      showLaborRoleForm();
    });
  }

  const cancelBtn = document.getElementById('cancel-labor-role-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      hideLaborRoleForm();
    });
  }

  const closeBtn = document.getElementById('close-labor-role-form');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      hideLaborRoleForm();
    });
  }

  const backBtn = document.getElementById('back-to-labor-roles');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      backToLaborRoles();
    });
  }

  const closeDetailBtn = document.getElementById('close-labor-role-detail-btn');
  if (closeDetailBtn) {
    closeDetailBtn.addEventListener('click', () => {
      backToLaborRoles();
    });
  }

  loadLaborRoles();
}
