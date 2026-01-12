// Product management

let productsListener = null;
let productsSearchTerm = '';

// Helper function to escape HTML
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Load products
function loadProducts() {
  const productsList = document.getElementById('products-list');
  if (!productsList) return;
  
  productsList.innerHTML = '';

  // Remove previous listener
  if (productsListener) {
    productsListener();
    productsListener = null;
  }

  // Listen for products using NRD Data Access
  productsListener = nrd.products.onValue((products) => {
    if (!productsList) return;
    productsList.innerHTML = '';
    
    const productsDict = Array.isArray(products) 
      ? products.reduce((acc, product) => {
          if (product && product.id) {
            acc[product.id] = product;
          }
          return acc;
        }, {})
      : products || {};

    if (Object.keys(productsDict).length === 0) {
      productsList.innerHTML = `
        <div class="text-center py-8 sm:py-12 border border-gray-200 p-4 sm:p-8">
          <p class="text-gray-600 mb-3 sm:mb-4 text-sm sm:text-base">No hay productos registrados</p>
        </div>
      `;
      return;
    }

    // Filter by search term if active
    let productsToShow = Object.entries(productsDict);
    if (productsSearchTerm.trim()) {
      const searchLower = productsSearchTerm.toLowerCase().trim();
      productsToShow = productsToShow.filter(([id, product]) => {
        const name = product.name ? product.name.toLowerCase() : '';
        const sku = product.sku ? product.sku.toLowerCase() : '';
        const price = product.price ? parseFloat(product.price).toString() : '';
        return name.includes(searchLower) || sku.includes(searchLower) || price.includes(searchLower);
      });
    }
    
    if (productsToShow.length === 0) {
      productsList.innerHTML = '<p class="text-center text-gray-600 py-6 sm:py-8 text-sm sm:text-base">No hay productos que coincidan con la búsqueda</p>';
      return;
    }

    productsToShow.forEach(([id, product]) => {
      const item = document.createElement('div');
      item.className = 'border border-gray-200 p-3 sm:p-4 md:p-6 hover:border-red-600 transition-colors cursor-pointer';
      item.dataset.productId = id;
      item.innerHTML = `
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0 mb-2 sm:mb-3">
          <div class="text-base sm:text-lg font-light flex-1">${escapeHtml(product.name)}</div>
          <span class="px-2 sm:px-3 py-0.5 sm:py-1 text-xs uppercase tracking-wider border ${product.active ? 'border-red-600 text-red-600' : 'border-gray-300 text-gray-600'}">
            ${product.active ? 'Activo' : 'Inactivo'}
          </span>
        </div>
        <div class="text-xs sm:text-sm text-gray-600">
          ${product.sku ? `<div class="mb-1">SKU: <span class="font-mono">${escapeHtml(product.sku)}</span></div>` : ''}
          <div class="mb-1">Precio: <span class="text-red-600 font-medium">$${parseFloat(product.price || 0).toFixed(2)}</span></div>
          ${product.cost !== undefined ? `<div class="mb-1">Costo: <span class="text-gray-700 font-medium">$${parseFloat(product.cost || 0).toFixed(2)}</span></div>` : ''}
          ${product.targetMargin !== undefined ? `<div class="mb-1">Margen Objetivo: <span class="text-blue-600 font-medium">${parseFloat(product.targetMargin || 0).toFixed(1)}%</span></div>` : ''}
        </div>
      `;
      item.addEventListener('click', () => viewProduct(id));
      productsList.appendChild(item);
    });
  });
}

// Show product form
function showProductForm(productId = null) {
  const form = document.getElementById('product-form');
  const list = document.getElementById('products-list');
  const header = document.querySelector('#products-view .flex.flex-col');
  const title = document.getElementById('product-form-title');
  const formHeader = document.getElementById('product-form-header');
  const saveBtn = document.getElementById('save-product-btn');
  
  if (!form || !list || !header) return;
  
  form.classList.remove('hidden');
  list.style.display = 'none';
  header.style.display = 'none';
  
  const formElement = document.getElementById('product-form-element');
  if (formElement) formElement.reset();
  
  const idInput = document.getElementById('product-id');
  if (idInput) idInput.value = productId || '';

  const subtitle = document.getElementById('product-form-subtitle');
  
  if (productId) {
    if (title) title.textContent = 'Editar Producto';
    if (subtitle) subtitle.textContent = 'Modifique la información del producto';
    if (formHeader) {
      formHeader.classList.remove('bg-green-600', 'bg-gray-600');
      formHeader.classList.add('bg-blue-600');
    }
    if (saveBtn) {
      saveBtn.classList.remove('bg-green-600', 'border-green-600', 'hover:bg-green-700');
      saveBtn.classList.add('bg-blue-600', 'border-blue-600', 'hover:bg-blue-700');
    }
    (async () => {
      const product = await nrd.products.getById(productId);
      if (product) {
        const nameInput = document.getElementById('product-name');
        const skuInput = document.getElementById('product-sku');
        const priceInput = document.getElementById('product-price');
        const costInput = document.getElementById('product-cost');
        const targetMarginInput = document.getElementById('product-target-margin');
        const activeInput = document.getElementById('product-active');
        
        if (nameInput) nameInput.value = product.name || '';
        if (skuInput) skuInput.value = product.sku || '';
        if (priceInput) priceInput.value = product.price || '';
        if (costInput) costInput.value = product.cost || '';
        if (targetMarginInput) targetMarginInput.value = product.targetMargin || '';
        if (activeInput) activeInput.checked = product.active !== false;
      }
    })();
  } else {
    if (title) title.textContent = 'Nuevo Producto';
    if (subtitle) subtitle.textContent = 'Agregue un nuevo producto al catálogo';
    if (formHeader) {
      formHeader.classList.remove('bg-blue-600', 'bg-gray-600');
      formHeader.classList.add('bg-green-600');
    }
    if (saveBtn) {
      saveBtn.classList.remove('bg-blue-600', 'border-blue-600', 'hover:bg-blue-700');
      saveBtn.classList.add('bg-green-600', 'border-green-600', 'hover:bg-green-700');
    }
    const activeInput = document.getElementById('product-active');
    if (activeInput) activeInput.checked = true;
  }
}

// Hide product form
function hideProductForm() {
  const form = document.getElementById('product-form');
  const list = document.getElementById('products-list');
  const header = document.querySelector('#products-view .flex.flex-col');
  
  if (form) form.classList.add('hidden');
  if (list) list.style.display = 'block';
  if (header) header.style.display = 'flex';
}

// Save product
async function saveProduct(productId, productData) {
  const user = getCurrentUser();
  if (productId) {
    logger.info('Updating product', { productId, name: productData.name });
    await nrd.products.update(productId, productData);
    logger.audit('ENTITY_UPDATE', { entity: 'product', id: productId, data: productData, uid: user?.uid, email: user?.email, timestamp: Date.now() });
    logger.info('Product updated successfully', { productId });
    return { key: productId };
  } else {
    logger.info('Creating new product', { name: productData.name });
    const id = await nrd.products.create(productData);
    logger.audit('ENTITY_CREATE', { entity: 'product', id, data: productData, uid: user?.uid, email: user?.email, timestamp: Date.now() });
    logger.info('Product created successfully', { id, name: productData.name });
    return { key: id, getKey: () => id };
  }
}

// View product detail
async function viewProduct(productId) {
  logger.debug('Viewing product', { productId });
  try {
    const product = await nrd.products.getById(productId);
    if (!product) {
      logger.warn('Product not found', { productId });
      await showError('Producto no encontrado');
      return;
    }
    logger.debug('Product loaded successfully', { productId, name: product.name });

    const list = document.getElementById('products-list');
    const header = document.querySelector('#products-view .flex.flex-col');
    const form = document.getElementById('product-form');
    const detail = document.getElementById('product-detail');
    
    if (list) list.style.display = 'none';
    if (header) header.style.display = 'none';
    if (form) form.classList.add('hidden');
    if (detail) detail.classList.remove('hidden');

    const detailContent = document.getElementById('product-detail-content');
    if (detailContent) {
      detailContent.innerHTML = `
        <div class="space-y-3 sm:space-y-4">
          <div class="flex justify-between py-2 sm:py-3 border-b border-gray-200">
            <span class="text-gray-600 font-light text-sm sm:text-base">Nombre:</span>
            <span class="font-light text-sm sm:text-base">${escapeHtml(product.name)}</span>
          </div>
          ${product.sku ? `
          <div class="flex justify-between py-2 sm:py-3 border-b border-gray-200">
            <span class="text-gray-600 font-light text-sm sm:text-base">Código SKU:</span>
            <span class="font-light text-sm sm:text-base font-mono">${escapeHtml(product.sku)}</span>
          </div>
          ` : ''}
          <div class="flex justify-between py-2 sm:py-3 border-b border-gray-200">
            <span class="text-gray-600 font-light text-sm sm:text-base">Precio:</span>
            <span class="font-light text-sm sm:text-base text-red-600 font-medium">$${parseFloat(product.price || 0).toFixed(2)}</span>
          </div>
          ${product.cost !== undefined ? `
          <div class="flex justify-between py-2 sm:py-3 border-b border-gray-200">
            <span class="text-gray-600 font-light text-sm sm:text-base">Costo:</span>
            <span class="font-light text-sm sm:text-base text-gray-700 font-medium">$${parseFloat(product.cost || 0).toFixed(2)}</span>
          </div>
          ` : ''}
          ${product.targetMargin !== undefined ? `
          <div class="flex justify-between py-2 sm:py-3 border-b border-gray-200">
            <span class="text-gray-600 font-light text-sm sm:text-base">Margen Objetivo:</span>
            <span class="font-light text-sm sm:text-base text-blue-600 font-medium">${parseFloat(product.targetMargin || 0).toFixed(1)}%</span>
          </div>
          ` : ''}
          ${product.cost !== undefined && product.price ? (() => {
            const realMargin = ((product.price - product.cost) / product.price) * 100;
            return `
          <div class="flex justify-between py-2 sm:py-3 border-b border-gray-200">
            <span class="text-gray-600 font-light text-sm sm:text-base">Margen Real:</span>
            <span class="font-light text-sm sm:text-base ${realMargin < 0 ? 'text-red-600' : realMargin < (product.targetMargin || 0) ? 'text-orange-600' : 'text-green-600'} font-medium">${realMargin.toFixed(1)}%</span>
          </div>
          `;
          })() : ''}
          <div class="flex justify-between py-2 sm:py-3 border-b border-gray-200">
            <span class="text-gray-600 font-light text-sm sm:text-base">Estado:</span>
            <span class="px-2 sm:px-3 py-0.5 sm:py-1 text-xs uppercase tracking-wider border ${product.active ? 'border-red-600 text-red-600' : 'border-gray-300 text-gray-600'}">
              ${product.active ? 'Activo' : 'Inactivo'}
            </span>
          </div>
        </div>
      `;
    }

    const editBtn = document.getElementById('edit-product-detail-btn');
    const deleteBtn = document.getElementById('delete-product-detail-btn');
    
    if (editBtn) {
      editBtn.onclick = () => {
        if (detail) detail.classList.add('hidden');
        showProductForm(productId);
      };
    }
    
    if (deleteBtn) {
      deleteBtn.onclick = () => deleteProductHandler(productId);
    }
  } catch (error) {
    logger.error('Failed to load product', error);
    await showError('Error al cargar producto: ' + error.message);
  }
}

// Back to products list
function backToProducts() {
  const list = document.getElementById('products-list');
  const header = document.querySelector('#products-view .flex.flex-col');
  const detail = document.getElementById('product-detail');
  
  if (list) list.style.display = 'block';
  if (header) header.style.display = 'flex';
  if (detail) detail.classList.add('hidden');
}

// Delete product handler
async function deleteProductHandler(productId) {
  logger.debug('Delete product requested', { productId });
  const confirmed = await showConfirm('Eliminar Producto', '¿Está seguro de eliminar este producto?');
  if (!confirmed) {
    logger.debug('Product deletion cancelled', { productId });
    return;
  }

  const user = getCurrentUser();
  logger.info('Deleting product', { productId });
  try {
    await nrd.products.delete(productId);
    logger.audit('ENTITY_DELETE', { entity: 'product', id: productId, uid: user?.uid, email: user?.email, timestamp: Date.now() });
    logger.info('Product deleted successfully', { productId });
    backToProducts();
  } catch (error) {
    logger.error('Failed to delete product', error);
    await showError('Error al eliminar producto: ' + error.message);
  }
}

// Product form submit handler
let productFormHandlerSetup = false;
function setupProductFormHandler() {
  if (productFormHandlerSetup) return;
  const formElement = document.getElementById('product-form-element');
  if (!formElement) return;
  
  productFormHandlerSetup = true;
  formElement.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const productId = document.getElementById('product-id')?.value;
    const name = document.getElementById('product-name')?.value.trim();
    const sku = document.getElementById('product-sku')?.value.trim();
    const price = parseFloat(document.getElementById('product-price')?.value);
    const costValue = document.getElementById('product-cost')?.value.trim();
    const cost = costValue ? parseFloat(costValue) : undefined;
    const targetMarginValue = document.getElementById('product-target-margin')?.value.trim();
    const targetMargin = targetMarginValue ? parseFloat(targetMarginValue) : undefined;
    const active = document.getElementById('product-active')?.checked;

    if (!name || isNaN(price) || price < 0) {
      await showError('Por favor complete todos los campos requeridos correctamente (nombre y precio > 0)');
      return;
    }

    if (cost !== undefined && (isNaN(cost) || cost < 0)) {
      await showError('El costo debe ser un número válido mayor o igual a 0');
      return;
    }

    if (targetMargin !== undefined && (isNaN(targetMargin) || targetMargin < 0 || targetMargin >= 100)) {
      await showError('El margen objetivo debe ser un número entre 0 y 100');
      return;
    }

    try {
      const productData = { name, price, active };
      if (sku) {
        productData.sku = sku;
      }
      if (cost !== undefined) {
        productData.cost = cost;
      }
      if (targetMargin !== undefined) {
        productData.targetMargin = targetMargin;
      }
      await saveProduct(productId || null, productData);
      hideProductForm();
    } catch (error) {
      await showError('Error al guardar producto: ' + error.message);
    }
  });
}

// Initialize products tab
function initializeProducts() {
  setupProductFormHandler();
  
  const searchInput = document.getElementById('products-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      productsSearchTerm = e.target.value;
      loadProducts();
    });
  }

  const newBtn = document.getElementById('new-product-btn');
  if (newBtn) {
    newBtn.addEventListener('click', () => {
      showProductForm();
    });
  }

  const cancelBtn = document.getElementById('cancel-product-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      hideProductForm();
    });
  }

  const closeBtn = document.getElementById('close-product-form');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      hideProductForm();
    });
  }

  const backBtn = document.getElementById('back-to-products');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      backToProducts();
    });
  }

  const closeDetailBtn = document.getElementById('close-product-detail-btn');
  if (closeDetailBtn) {
    closeDetailBtn.addEventListener('click', () => {
      backToProducts();
    });
  }

  loadProducts();
}
