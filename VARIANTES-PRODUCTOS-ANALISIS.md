# Análisis: Manejo de Variantes de Productos

## Situación Actual

### Modelo de Producto Actual
```typescript
interface Product {
  id?: string;
  name: string;
  sku?: string;
  price: number;
  cost?: number;
  targetMargin?: number;
  active?: boolean;
}
```

### Relaciones Actuales
- **Recetas**: Una receta está vinculada a un producto mediante `productId`
- **Pedidos**: Los productos se seleccionan por `productId`
- **Análisis**: Se calculan costos y márgenes por producto

### Problema
No existe un mecanismo para manejar variantes de productos (ej: tamaños, colores, sabores) que puedan tener:
- Precios diferentes
- Costos diferentes
- Recetas diferentes
- SKUs diferentes

## Opciones de Implementación

### Opción 1: Variantes como Productos Separados (NO RECOMENDADA)
**Enfoque**: Cada variante es un producto independiente con nombre descriptivo.

**Ejemplo**:
- Producto: "Pizza Margarita - Pequeña"
- Producto: "Pizza Margarita - Mediana"
- Producto: "Pizza Margarita - Grande"

**Pros**:
- ✅ No requiere cambios en el modelo de datos
- ✅ Implementación inmediata
- ✅ Compatible con código existente

**Contras**:
- ❌ Duplicación de información
- ❌ Difícil mantener consistencia
- ❌ No hay relación explícita entre variantes
- ❌ Búsqueda y agrupación complicadas
- ❌ No permite compartir recetas base

---

### Opción 2: Campo `variants` en Product (RECOMENDADA)
**Enfoque**: Agregar campo `variants` al modelo Product para almacenar variantes como array.

**Modelo Propuesto**:
```typescript
interface Product {
  id?: string;
  name: string; // Nombre base del producto
  sku?: string; // SKU base (opcional)
  price: number; // Precio base (usado si no hay variantes o como default)
  cost?: number;
  targetMargin?: number;
  active?: boolean;
  variants?: ProductVariant[]; // NUEVO: Array de variantes
  isVariant?: boolean; // NUEVO: Indica si este producto es una variante
  parentProductId?: string; // NUEVO: ID del producto padre (si es variante)
}

interface ProductVariant {
  id: string; // ID único de la variante (generado automáticamente)
  name: string; // Nombre de la variante (ej: "Pequeña", "Rojo", "Chocolate")
  sku?: string; // SKU específico de la variante
  price: number; // Precio de la variante
  cost?: number; // Costo específico (opcional, hereda del padre si no se especifica)
  targetMargin?: number; // Margen objetivo específico (opcional)
  active?: boolean; // Si la variante está activa
  attributes?: { [key: string]: string }; // Atributos flexibles (ej: { "tamaño": "grande", "color": "rojo" })
}
```

**Estructura de Datos**:
```javascript
// Producto con variantes
{
  id: "prod-1",
  name: "Pizza Margarita",
  sku: "PIZZA-001", // SKU base del producto
  price: 10.00, // Precio base (usado si no hay variantes seleccionadas)
  variants: [
    {
      id: "var-1",
      name: "Pequeña",
      skuSuffix: "PEQ", // SKU completo: "PIZZA-001_PEQ"
      price: 8.00,
      attributes: { tamaño: "pequeña" }
    },
    {
      id: "var-2",
      name: "Mediana",
      skuSuffix: "MED", // SKU completo: "PIZZA-001_MED"
      price: 10.00,
      attributes: { tamaño: "mediana" }
    },
    {
      id: "var-3",
      name: "Grande",
      skuSuffix: "GRD", // SKU completo: "PIZZA-001_GRD"
      price: 12.00,
      attributes: { tamaño: "grande" }
    }
  ]
}
```

**Pros**:
- ✅ Mantiene todo junto (producto y variantes)
- ✅ Fácil de consultar y mantener
- ✅ Permite precios y costos diferentes por variante
- ✅ Compatible con código existente (productos sin variantes siguen funcionando)
- ✅ Permite búsqueda y filtrado por atributos
- ✅ Permite SKUs específicos por variante

**Contras**:
- ⚠️ Requiere actualizar el modelo en `nrd-data-access`
- ⚠️ Requiere actualizar la UI para mostrar/seleccionar variantes
- ⚠️ Requiere decidir cómo manejar recetas (una por variante o compartida)

**Impacto en Recetas**:
- **Opción A**: Una receta por variante (más flexible, permite costos diferentes)
- **Opción B**: Receta compartida con ajustes por variante (más simple, menos flexible)

---

### Opción 3: Entidad Separada "ProductVariant" (COMPLEJA)
**Enfoque**: Crear una nueva entidad `ProductVariant` con relación a `Product`.

**Modelo Propuesto**:
```typescript
interface Product {
  // ... campos actuales
  hasVariants?: boolean; // Indica si tiene variantes
}

interface ProductVariant {
  id?: string;
  productId: string; // Referencia al producto padre
  name: string;
  sku?: string;
  price: number;
  cost?: number;
  targetMargin?: number;
  active?: boolean;
  attributes?: { [key: string]: string };
}
```

**Pros**:
- ✅ Separación clara de responsabilidades
- ✅ Permite consultas independientes
- ✅ Escalable para muchos productos con variantes

**Contras**:
- ❌ Más complejo de implementar
- ❌ Requiere cambios significativos en toda la aplicación
- ❌ Más queries a la base de datos
- ❌ Más difícil mantener consistencia

---

### Opción 4: Productos con `parentProductId` (HÍBRIDA)
**Enfoque**: Usar el modelo actual pero agregar `parentProductId` para crear jerarquía.

**Modelo Propuesto**:
```typescript
interface Product {
  id?: string;
  name: string;
  sku?: string;
  price: number;
  cost?: number;
  targetMargin?: number;
  active?: boolean;
  parentProductId?: string; // NUEVO: Si existe, este es una variante
  variantName?: string; // NUEVO: Nombre de la variante
  variantAttributes?: { [key: string]: string }; // NUEVO: Atributos
}
```

**Ejemplo**:
```javascript
// Producto padre
{
  id: "prod-1",
  name: "Pizza Margarita",
  price: 10.00
}

// Variantes
{
  id: "prod-2",
  name: "Pizza Margarita",
  parentProductId: "prod-1",
  variantName: "Pequeña",
  price: 8.00,
  variantAttributes: { tamaño: "pequeña" }
}
```

**Pros**:
- ✅ Compatible con modelo actual
- ✅ Permite consultas flexibles
- ✅ Cada variante puede tener su propia receta

**Contras**:
- ⚠️ Duplicación del nombre base
- ⚠️ Requiere lógica adicional para distinguir productos de variantes
- ⚠️ Puede confundir en listados

---

## Recomendación: Opción 2 (Campo `variants` en Product)

### Justificación
1. **Mantiene coherencia**: Producto y variantes están juntos
2. **Flexible**: Permite productos con y sin variantes
3. **Escalable**: Fácil agregar más atributos en el futuro
4. **UI clara**: Fácil mostrar variantes en formularios y listados

### Implementación Sugerida

#### 1. Actualizar Modelo en `nrd-data-access`
```typescript
// src/models/index.ts
export interface Product extends BaseEntity {
  name: string;
  sku?: string;
  price: number;
  cost?: number;
  targetMargin?: number;
  active?: boolean;
  variants?: ProductVariant[]; // NUEVO
}

export interface ProductVariant {
  id: string; // Generado automáticamente (UUID o timestamp)
  name: string; // Nombre de la variante (ej: "Pequeña", "Rojo", "Chocolate")
  skuSuffix?: string; // Sufijo del SKU (se combina con SKU del padre: <SKU Padre>_<skuSuffix>)
  price: number; // Precio de la variante
  cost?: number; // Costo específico (opcional, se calcula de la receta si existe)
  targetMargin?: number; // Margen objetivo específico (opcional, hereda del padre si no se especifica)
  active?: boolean; // Si la variante está activa
  attributes?: { [key: string]: string }; // Atributos flexibles (ej: { "tamaño": "grande", "sabor": "chocolate" })
}

// Función helper para generar SKU completo de variante
function getVariantSku(parentSku: string, variantSuffix: string): string {
  if (!parentSku || !variantSuffix) return '';
  return `${parentSku}_${variantSuffix}`;
}
```

#### 2. Actualizar UI en `nrd-costos/tabs/products.js`

**Formulario de Producto**:
- Agregar sección "Variantes" (colapsable)
- Permitir agregar/editar/eliminar variantes
- Mostrar variantes en vista de detalle

**Listado de Productos**:
- Mostrar indicador si tiene variantes
- Permitir expandir para ver variantes

#### 3. Actualizar Recetas

**Decisión**: ¿Una receta por variante o receta compartida?

**Recomendación**: Permitir ambas opciones:
- Si el producto tiene variantes, permitir crear receta por variante
- Agregar campo `variantId` opcional en Recipe:
  ```typescript
  interface Recipe {
    productId: string;
    variantId?: string; // NUEVO: Si existe, la receta es para esta variante específica
    batchYield: number;
    inputs: RecipeInput[];
    labor: RecipeLabor[];
    active?: boolean;
  }
  ```

#### 4. Actualizar Análisis

- Calcular costos y márgenes por variante si existe receta específica
- Mostrar análisis por variante en la tabla de análisis

#### 5. Actualizar Pedidos (nrd-pedidos)

- Permitir seleccionar variante al agregar producto
- Guardar `variantId` en OrderItem:
  ```typescript
  interface OrderItem {
    productId: string;
    variantId?: string; // NUEVO
    productName?: string;
    quantity: number;
    price: number;
  }
  ```

---

## Plan de Implementación

### Fase 1: Modelo de Datos
1. Actualizar `Product` interface en `nrd-data-access`
2. Actualizar TypeScript definitions
3. Asegurar compatibilidad hacia atrás (productos sin variantes)

### Fase 2: UI de Productos
1. Actualizar formulario de productos para manejar variantes
2. Actualizar vista de detalle para mostrar variantes
3. Actualizar listado para indicar productos con variantes

### Fase 3: Recetas
1. Agregar campo `variantId` opcional a Recipe
2. Actualizar formulario de recetas para seleccionar variante
3. Actualizar cálculos para considerar variantes

### Fase 4: Análisis
1. Actualizar análisis para mostrar por variante
2. Incluir variantes en cálculos de costos

### Fase 5: Integración con Pedidos
1. Actualizar `OrderItem` para incluir `variantId`
2. Actualizar UI de pedidos para seleccionar variantes
3. Actualizar cálculos de totales

---

## Consideraciones Adicionales

### Migración de Datos
Si ya existen productos que deberían ser variantes:
1. Identificar productos relacionados
2. Crear script de migración
3. Consolidar en un producto padre con variantes

### Validaciones
- Las variantes deben tener nombres únicos dentro del producto
- Los `skuSuffix` de variantes deben ser únicos dentro del producto
- El SKU completo generado (`<SKU Padre>_<skuSuffix>`) debe ser único globalmente
- Si un producto tiene variantes, las recetas deben especificar `variantId` (no puede haber receta genérica)
- Si un producto NO tiene variantes, las recetas NO deben tener `variantId`

### Búsqueda
- Buscar productos debe incluir búsqueda en nombres de variantes
- Filtrar por atributos de variantes (ej: "todos los productos rojos")

---

## Decisiones Confirmadas ✅

1. **✅ Las variantes SÍ pueden tener recetas diferentes**
   - Un producto base puede prepararse con diferentes sabores, texturas o tamaños
   - Cada variante puede tener su propia receta con costos diferentes
   - **Solución**: Agregar `variantId` opcional a Recipe

2. **✅ Los SKUs de variantes heredan el patrón del padre**
   - Formato: `<SKU Padre>_<SKUVariante>`
   - Ejemplo: Si el producto padre tiene SKU "PIZZA-001" y la variante es "Grande", el SKU completo será "PIZZA-001_Grande"
   - **Solución**: Almacenar solo el sufijo de la variante (`skuSuffix`) y generar el SKU completo automáticamente

---

## Ejemplo de Uso Final

### Crear Producto con Variantes
```javascript
const product = {
  name: "Pizza Margarita",
  sku: "PIZZA-001", // SKU base
  price: 10.00, // Precio base
  variants: [
    { 
      name: "Pequeña", 
      skuSuffix: "PEQ", // SKU completo: "PIZZA-001_PEQ"
      price: 8.00, 
      attributes: { tamaño: "pequeña" } 
    },
    { 
      name: "Mediana", 
      skuSuffix: "MED", // SKU completo: "PIZZA-001_MED"
      price: 10.00, 
      attributes: { tamaño: "mediana" } 
    },
    { 
      name: "Grande", 
      skuSuffix: "GRD", // SKU completo: "PIZZA-001_GRD"
      price: 12.00, 
      attributes: { tamaño: "grande" } 
    }
  ]
};
```

### Crear Receta para Variante Específica
```javascript
const recipe = {
  productId: "prod-1",
  variantId: "var-2", // Receta para variante "Mediana"
  batchYield: 10,
  inputs: [...],
  labor: [...]
};
```

### Seleccionar Variante en Pedido
```javascript
const orderItem = {
  productId: "prod-1",
  variantId: "var-3", // Variante "Grande"
  quantity: 2,
  price: 12.00
};
```
