// Calculation module for cost analysis (ES Module)

// Calculate direct cost of a batch using current real-time prices
// productionHourlyCost: costo por hora de mano de obra (desde config BD)
// fixedCostPerHour: gasto fijo por hora (desde config BD), misma estrategia que mano de obra por tiempo
export async function calculateDirectCost(recipe, productsData, productionHourlyCost, fixedCostPerHour = 0) {
  let cost = 0;
  
  // Sum of inputs (products with esInsumo: true) - quantity × current cost
  if (recipe.inputs && recipe.inputs.length > 0) {
    for (const recipeInput of recipe.inputs) {
      // Support both old format (inputId/inputType) and new format (productId)
      const productId = recipeInput.productId || recipeInput.inputId;
      const product = productsData[productId];
      
      if (product && product.cost !== undefined) {
        // Use calculated cost of the product
        cost += recipeInput.quantity * product.cost;
      }
    }
  }
  
  // Labor cost: minutes / 60 × production hourly cost (from config)
  const hourlyCost = parseFloat(productionHourlyCost) || 352;
  const laborMinutes = parseFloat(recipe.laborMinutes);
  if (!isNaN(laborMinutes) && laborMinutes > 0) {
    cost += (laborMinutes / 60) * hourlyCost;
    // Gastos fijos por tiempo: misma estrategia que mano de obra (minutos/60 × gasto fijo/h)
    const fixedHourly = parseFloat(fixedCostPerHour) || 0;
    if (fixedHourly > 0) cost += (laborMinutes / 60) * fixedHourly;
  }
  // Backward compatibility: old format with labor array (hours)
  else if (recipe.labor && recipe.labor.length > 0) {
    let totalHours = 0;
    for (const recipeLabor of recipe.labor) {
      totalHours += recipeLabor.hours || 0;
    }
    cost += totalHours * hourlyCost;
    const fixedHourly = parseFloat(fixedCostPerHour) || 0;
    if (fixedHourly > 0) cost += totalHours * fixedHourly;
  }
  
  return cost;
}

// Calculate direct unit cost
export function calculateDirectUnitCost(directCost, batchYield) {
  if (batchYield <= 0) return 0;
  return directCost / batchYield;
}

// Calculate total unit cost (direct only; gastos fijos van en direct cost por tiempo)
export function calculateTotalUnitCost(directUnitCost) {
  return directUnitCost;
}

// Calculate suggested price
export function calculateSuggestedPrice(totalUnitCost, targetMargin) {
  if (!targetMargin || targetMargin <= 0 || targetMargin >= 100) {
    return totalUnitCost; // Without target margin, return cost
  }
  return totalUnitCost / (1 - targetMargin / 100);
}

// Calculate real margin
export function calculateRealMargin(sellingPrice, totalUnitCost) {
  if (sellingPrice <= 0) return 0;
  return ((sellingPrice - totalUnitCost) / sellingPrice) * 100;
}

// Determine profitability status
export function getProfitabilityStatus(realMargin, targetMargin) {
  if (realMargin < 0) return 'loss'; // Loss
  if (!targetMargin || realMargin < targetMargin) return 'low-margin'; // Low margin
  return 'profitable'; // Profitable
}

// Calculate impact of a product (with esInsumo: true) in all recipes
export function calculateInputImpact(productId, recipes, productsData) {
  let totalImpact = 0;
  let recipeCount = 0;
  
  recipes.forEach(recipe => {
    if (recipe.inputs && recipe.active) {
      recipe.inputs.forEach(recipeInput => {
        // Support both old format (inputId/inputType) and new format (productId)
        const inputProductId = recipeInput.productId || recipeInput.inputId;
        if (inputProductId === productId) {
          const product = productsData[productId];
          if (product && product.cost !== undefined) {
            totalImpact += recipeInput.quantity * product.cost;
            recipeCount++;
          }
        }
      });
    }
  });
  
  return { totalImpact, recipeCount };
}

// Calculate impact of a role in all recipes
export function calculateLaborRoleImpact(roleId, recipes, laborRolesData) {
  let totalImpact = 0;
  let recipeCount = 0;
  let totalHours = 0;
  
  recipes.forEach(recipe => {
    if (recipe.labor && recipe.active) {
      recipe.labor.forEach(recipeLabor => {
        if (recipeLabor.roleId === roleId) {
          const role = laborRolesData[roleId];
          if (role) {
            totalImpact += recipeLabor.hours * role.hourlyCost;
            totalHours += recipeLabor.hours;
            recipeCount++;
          }
        }
      });
    }
  });
  
  return { totalImpact, recipeCount, totalHours };
}

// Get products with margin issues
export async function getProductsWithIssues(products, recipes, calculationsData) {
  const issues = [];
  
  // Process products sequentially to handle async calculateDirectCost
  for (const product of products) {
    const activeRecipe = recipes.find(r => r.productId === product.id && r.active);
    
    if (!activeRecipe) {
      issues.push({
        product,
        issue: 'no-recipe',
        severity: 'low',
        message: 'Sin receta definida'
      });
      continue;
    }
    
    // Calculate costs and margins using calculation module functions
    const directCost = await calculateDirectCost(activeRecipe, calculationsData.products, calculationsData.productionHourlyCost, calculationsData.fixedCostPerHour);
    const directUnitCost = calculateDirectUnitCost(directCost, activeRecipe.batchYield);
    const totalUnitCost = calculateTotalUnitCost(directUnitCost);
    const realMargin = calculateRealMargin(product.price, totalUnitCost);
    const defaultTargetMargin = parseFloat(calculationsData.defaultTargetMargin) || 0;
    const targetMargin = (product.targetMargin != null && product.targetMargin !== '')
      ? parseFloat(product.targetMargin)
      : defaultTargetMargin;

    if (realMargin < 0) {
      issues.push({
        product,
        activeRecipe,
        issue: 'loss',
        severity: 'high',
        realMargin,
        targetMargin,
        totalUnitCost,
        price: product.price,
        suggestedPrice: calculateSuggestedPrice(totalUnitCost, targetMargin)
      });
    } else if (targetMargin > 0 && realMargin < targetMargin) {
      issues.push({
        product,
        activeRecipe,
        issue: 'low-margin',
        severity: 'medium',
        realMargin,
        targetMargin,
        marginDiff: targetMargin - realMargin,
        totalUnitCost,
        price: product.price,
        suggestedPrice: calculateSuggestedPrice(totalUnitCost, targetMargin)
      });
    }
  }
  
  // Sort by severity: high (loss) first, then medium (low margin), then low (no recipe)
  const severityOrder = { high: 0, medium: 1, low: 2 };
  issues.sort((a, b) => {
    if (severityOrder[a.severity] !== severityOrder[b.severity]) {
      return severityOrder[a.severity] - severityOrder[b.severity];
    }
    // If same severity, sort by margin (worst first)
    if (a.realMargin !== undefined && b.realMargin !== undefined) {
      return a.realMargin - b.realMargin;
    }
    return 0;
  });
  
  return issues;
}

// Get top N products (with esInsumo: true) by impact
export function getTopInputs(products, recipes, productsData, n = 10) {
  const impacts = [];
  
  // Filter only products with esInsumo: true
  const inputProducts = products.filter(p => p.esInsumo === true);
  
  inputProducts.forEach(product => {
    const impact = calculateInputImpact(product.id, recipes, productsData);
    impacts.push({
      product,
      ...impact
    });
  });
  
  // Sort by total impact (highest first)
  impacts.sort((a, b) => b.totalImpact - a.totalImpact);
  
  return impacts.slice(0, n);
}

// Get top N roles by impact (deprecated - labor roles tab removed, using production hourly cost)
export function getTopLaborRoles(laborRoles, recipes, laborRolesData, n = 10) {
  return [];
}

