# Implementación: Variantes de Productos

## Resumen de Requisitos Confirmados

✅ **Las variantes SÍ pueden tener recetas diferentes** (sabores, texturas, tamaños diferentes)
✅ **Los SKUs siguen el patrón**: `<SKU Padre>_<SKUVariante>`

## Modelo de Datos Final

### Product Interface
```typescript
export interface Product extends BaseEntity {
  name: string;
  sku?: string; // SKU base del producto
  price: number; // Precio base (usado si no hay variantes)
  cost?: number;
  targetMargin?: number;
  active?: boolean;
  variants?: ProductVariant[]; // NUEVO
}

export interface ProductVariant {
  id: string; // Generado automáticamente (Date.now().toString() o UUID)
  name: string; // Nombre de la variante (ej: "Pequeña", "Chocolate", "Rojo")
  skuSuffix?: string; // Sufijo del SKU (ej: "PEQ", "CHOC", "RED")
  price: number; // Precio de la variante
  cost?: number; // Costo calculado de la receta (opcional)
  targetMargin?: number; // Margen objetivo (opcional, hereda del padre)
  active?: boolean;
  attributes?: { [key: string]: string }; // Atributos flexibles
}
```

### Recipe Interface (Actualizado)
```typescript
export interface Recipe extends BaseEntity {
  productId: string;
  variantId?: string; // NUEVO: ID de la variante (si existe, la receta es específica para esa variante)
  batchYield: number;
  inputs: RecipeInput[];
  labor: RecipeLabor[];
  createdAt?: number;
  active?: boolean;
}
```

### OrderItem Interface (Para nrd-pedidos)
```typescript
export interface OrderItem {
  productId: string;
  variantId?: string; // NUEVO: ID de la variante seleccionada
  productName?: string;
  variantName?: string; // NUEVO: Nombre de la variante (para mostrar)
  quantity: number;
  price: number;
}
```

## Funciones Helper

### Generar SKU Completo de Variante
```javascript
/**
 * Genera el SKU completo de una variante
 * @param {string} parentSku - SKU del producto padre
 * @param {string} variantSuffix - Sufijo de la variante
 * @returns {string} SKU completo en formato <SKU Padre>_<SKUVariante>
 */
function getVariantSku(parentSku, variantSuffix) {
  if (!parentSku || !variantSuffix) return '';
  return `${parentSku}_${variantSuffix}`;
}

/**
 * Obtiene el SKU completo de una variante desde un producto
 * @param {Product} product - Producto con variantes
 * @param {string} variantId - ID de la variante
 * @returns {string} SKU completo o string vacío
 */
function getVariantSkuFromProduct(product, variantId) {
  if (!product || !product.variants || !variantId) return '';
  const variant = product.variants.find(v => v.id === variantId);
  if (!variant || !variant.skuSuffix || !product.sku) return '';
  return getVariantSku(product.sku, variant.skuSuffix);
}
```

### Obtener Variante por ID
```javascript
/**
 * Obtiene una variante específica de un producto
 * @param {Product} product - Producto
 * @param {string} variantId - ID de la variante
 * @returns {ProductVariant|null}
 */
function getVariantById(product, variantId) {
  if (!product || !product.variants || !variantId) return null;
  return product.variants.find(v => v.id === variantId) || null;
}
```

## Ejemplo de Uso

### 1. Crear Producto con Variantes
```javascript
const product = {
  name: "Pizza Margarita",
  sku: "PIZZA-001",
  price: 10.00,
  targetMargin: 30,
  active: true,
  variants: [
    {
      id: Date.now().toString(),
      name: "Pequeña",
      skuSuffix: "PEQ",
      price: 8.00,
      active: true,
      attributes: { tamaño: "pequeña" }
    },
    {
      id: (Date.now() + 1).toString(),
      name: "Mediana",
      skuSuffix: "MED",
      price: 10.00,
      active: true,
      attributes: { tamaño: "mediana" }
    },
    {
      id: (Date.now() + 2).toString(),
      name: "Grande",
      skuSuffix: "GRD",
      price: 12.00,
      active: true,
      attributes: { tamaño: "grande" }
    }
  ]
};

// Guardar producto
const productId = await nrd.products.create(product);
```

### 2. Crear Receta para Variante Específica
```javascript
// Receta para variante "Grande"
const recipe = {
  productId: productId,
  variantId: product.variants[2].id, // ID de la variante "Grande"
  batchYield: 10,
  inputs: [
    { inputId: "input-1", inputType: "input", quantity: 2.5 },
    { inputId: "input-2", inputType: "input", quantity: 1.0 }
  ],
  labor: [
    { roleId: "role-1", hours: 2.0 }
  ],
  active: true,
  createdAt: Date.now()
};

await nrd.recipes.create(recipe);
```

### 3. Buscar Receta por Producto y Variante
```javascript
// Obtener todas las recetas de un producto
const allRecipes = await nrd.recipes.getAll();
const productRecipes = allRecipes.filter(r => r.productId === productId);

// Receta específica para una variante
const variantRecipe = productRecipes.find(r => r.variantId === variantId);

// Receta genérica (sin variante) - solo si el producto no tiene variantes
const genericRecipe = productRecipes.find(r => !r.variantId);
```

### 4. Mostrar SKU en UI
```javascript
// En el listado de productos
function displayProductSku(product, variantId = null) {
  if (variantId && product.variants) {
    const variant = getVariantById(product, variantId);
    if (variant && variant.skuSuffix && product.sku) {
      return getVariantSku(product.sku, variant.skuSuffix);
    }
  }
  return product.sku || 'Sin SKU';
}

// Ejemplo de uso
const product = { sku: "PIZZA-001", variants: [...] };
const variantId = "var-1"; // ID de variante "Pequeña"
const fullSku = displayProductSku(product, variantId); // "PIZZA-001_PEQ"
```

## Cambios Necesarios en el Código

### 1. nrd-data-access/src/models/index.ts
- ✅ Agregar `variants?: ProductVariant[]` a `Product`
- ✅ Crear interface `ProductVariant`
- ✅ Agregar `variantId?: string` a `Recipe`

### 2. nrd-costos/tabs/products.js
- ✅ Agregar sección de variantes en formulario
- ✅ Mostrar variantes en vista de detalle
- ✅ Mostrar indicador de variantes en listado
- ✅ Validar que si hay variantes, no se puede usar precio base directamente

### 3. nrd-costos/tabs/recipes.js
- ✅ Agregar selector de variante en formulario de receta
- ✅ Filtrar recetas por variante en listado
- ✅ Validar que si el producto tiene variantes, se debe seleccionar una

### 4. nrd-costos/tabs/analysis.js
- ✅ Calcular análisis por variante
- ✅ Mostrar análisis separado para cada variante
- ✅ Incluir SKU completo en análisis

### 5. nrd-pedidos/tabs/orders.js (futuro)
- ✅ Permitir seleccionar variante al agregar producto
- ✅ Mostrar variante en listado de productos del pedido
- ✅ Guardar `variantId` en `OrderItem`

## Validaciones Importantes

### Al Crear/Actualizar Producto
```javascript
function validateProduct(product) {
  // Si tiene variantes, validar que todas tengan nombre único
  if (product.variants && product.variants.length > 0) {
    const names = product.variants.map(v => v.name.toLowerCase());
    if (new Set(names).size !== names.length) {
      throw new Error('Las variantes deben tener nombres únicos');
    }
    
    // Validar que los skuSuffix sean únicos
    const suffixes = product.variants
      .filter(v => v.skuSuffix)
      .map(v => v.skuSuffix.toUpperCase());
    if (new Set(suffixes).size !== suffixes.length) {
      throw new Error('Los sufijos de SKU deben ser únicos');
    }
    
    // Si tiene SKU padre, validar que los SKUs completos sean únicos
    if (product.sku) {
      const fullSkus = product.variants
        .filter(v => v.skuSuffix)
        .map(v => getVariantSku(product.sku, v.skuSuffix));
      if (new Set(fullSkus).size !== fullSkus.length) {
        throw new Error('Los SKUs completos de las variantes deben ser únicos');
      }
    }
  }
}
```

### Al Crear Receta
```javascript
async function validateRecipe(recipe) {
  const product = await nrd.products.getById(recipe.productId);
  if (!product) {
    throw new Error('Producto no encontrado');
  }
  
  // Si el producto tiene variantes, la receta DEBE especificar variantId
  if (product.variants && product.variants.length > 0) {
    if (!recipe.variantId) {
      throw new Error('Debe seleccionar una variante para este producto');
    }
    
    // Validar que la variante existe
    const variant = getVariantById(product, recipe.variantId);
    if (!variant) {
      throw new Error('Variante no encontrada');
    }
  } else {
    // Si el producto NO tiene variantes, la receta NO debe tener variantId
    if (recipe.variantId) {
      throw new Error('Este producto no tiene variantes');
    }
  }
}
```

## Flujo de Trabajo

### Escenario 1: Producto sin Variantes (Comportamiento Actual)
1. Crear producto con precio base
2. Crear receta sin `variantId`
3. Análisis calcula costos del producto base
4. En pedidos, seleccionar producto directamente

### Escenario 2: Producto con Variantes
1. Crear producto con variantes
2. Para cada variante, crear receta con `variantId` específico
3. Análisis calcula costos por variante
4. En pedidos, seleccionar producto y luego variante

## Ejemplo Completo: Pizza con Variantes de Tamaño

```javascript
// 1. Crear producto
const pizza = {
  name: "Pizza Margarita",
  sku: "PIZZA-001",
  price: 10.00, // Precio base (no se usa si hay variantes)
  targetMargin: 30,
  active: true,
  variants: [
    {
      id: "var-peq",
      name: "Pequeña",
      skuSuffix: "PEQ", // SKU: "PIZZA-001_PEQ"
      price: 8.00,
      active: true
    },
    {
      id: "var-med",
      name: "Mediana",
      skuSuffix: "MED", // SKU: "PIZZA-001_MED"
      price: 10.00,
      active: true
    },
    {
      id: "var-grd",
      name: "Grande",
      skuSuffix: "GRD", // SKU: "PIZZA-001_GRD"
      price: 12.00,
      active: true
    }
  ]
};

const pizzaId = await nrd.products.create(pizza);

// 2. Crear recetas para cada variante
const recipePeq = {
  productId: pizzaId,
  variantId: "var-peq",
  batchYield: 5, // 5 pizzas pequeñas por lote
  inputs: [
    { inputId: "masa-id", inputType: "input", quantity: 0.5 },
    { inputId: "queso-id", inputType: "input", quantity: 0.2 }
  ],
  labor: [
    { roleId: "cocinero-id", hours: 0.5 }
  ],
  active: true
};

const recipeGrd = {
  productId: pizzaId,
  variantId: "var-grd",
  batchYield: 3, // 3 pizzas grandes por lote
  inputs: [
    { inputId: "masa-id", inputType: "input", quantity: 1.0 },
    { inputId: "queso-id", inputType: "input", quantity: 0.5 }
  ],
  labor: [
    { roleId: "cocinero-id", hours: 1.0 }
  ],
  active: true
};

await nrd.recipes.create(recipePeq);
await nrd.recipes.create(recipeGrd);

// 3. En análisis, se calculará:
// - Costo unitario de pizza pequeña (basado en recipePeq)
// - Costo unitario de pizza grande (basado en recipeGrd)
// - Márgenes por variante

// 4. En pedidos:
const orderItem = {
  productId: pizzaId,
  variantId: "var-grd", // Pizza Grande
  productName: "Pizza Margarita",
  variantName: "Grande",
  quantity: 2,
  price: 12.00 // Precio de la variante
};
```

## Próximos Pasos

1. ✅ Actualizar modelos en `nrd-data-access`
2. ✅ Implementar funciones helper para SKUs
3. ✅ Actualizar UI de productos para gestionar variantes
4. ✅ Actualizar UI de recetas para seleccionar variante
5. ✅ Actualizar análisis para mostrar por variante
6. ⏳ Actualizar pedidos (nrd-pedidos) para seleccionar variantes
