// Calculation module for cost analysis

// Calculate direct cost of a batch using current real-time prices
async function calculateDirectCost(recipe, inputsData, productsData, laborRolesData) {
  let cost = 0;
  
  // Sum of inputs (quantity × current price)
  if (recipe.inputs && recipe.inputs.length > 0) {
    for (const recipeInput of recipe.inputs) {
      let unitPrice = 0;
      
      if (recipeInput.inputType === 'product') {
        // It's a subproduct - use calculated cost of the product
        const product = productsData[recipeInput.inputId];
        if (product && product.cost) {
          unitPrice = product.cost; // Use calculated cost of the product
        }
      } else {
        // It's a direct input - use current unit price
        const input = inputsData[recipeInput.inputId];
        if (input) {
          unitPrice = input.unitPrice;
        }
      }
      
      cost += recipeInput.quantity * unitPrice;
    }
  }
  
  // Sum of labor (hours × current hourly cost)
  if (recipe.labor && recipe.labor.length > 0) {
    for (const recipeLabor of recipe.labor) {
      const laborRole = laborRolesData[recipeLabor.roleId];
      if (laborRole) {
        cost += recipeLabor.hours * laborRole.hourlyCost;
      }
    }
  }
  
  return cost;
}

// Calculate direct unit cost
function calculateDirectUnitCost(directCost, batchYield) {
  if (batchYield <= 0) return 0;
  return directCost / batchYield;
}

// Calculate indirect cost proration (equal distribution among products with recipes)
function calculateIndirectCostPerProduct(indirectCosts, productsWithRecipesCount) {
  if (productsWithRecipesCount <= 0) return 0;
  
  // Sum all monthly indirect costs
  const totalIndirectCosts = indirectCosts.reduce((sum, cost) => {
    return sum + (cost.monthlyAmount || 0);
  }, 0);
  
  // Distribute equally among all products with recipes
  return totalIndirectCosts / productsWithRecipesCount;
}

// Calculate indirect unit cost for a product
function calculateIndirectUnitCost(indirectCostPerProduct, batchYield) {
  if (batchYield <= 0) return 0;
  return indirectCostPerProduct / batchYield;
}

// Calculate total unit cost
function calculateTotalUnitCost(directUnitCost, indirectUnitCost) {
  return directUnitCost + indirectUnitCost;
}

// Calculate suggested price
function calculateSuggestedPrice(totalUnitCost, targetMargin) {
  if (!targetMargin || targetMargin <= 0 || targetMargin >= 100) {
    return totalUnitCost; // Without target margin, return cost
  }
  return totalUnitCost / (1 - targetMargin / 100);
}

// Calculate real margin
function calculateRealMargin(sellingPrice, totalUnitCost) {
  if (sellingPrice <= 0) return 0;
  return ((sellingPrice - totalUnitCost) / sellingPrice) * 100;
}

// Determine profitability status
function getProfitabilityStatus(realMargin, targetMargin) {
  if (realMargin < 0) return 'loss'; // Loss
  if (!targetMargin || realMargin < targetMargin) return 'low-margin'; // Low margin
  return 'profitable'; // Profitable
}

// Calculate impact of an input in all recipes
function calculateInputImpact(inputId, recipes, inputsData) {
  let totalImpact = 0;
  let recipeCount = 0;
  
  recipes.forEach(recipe => {
    if (recipe.inputs && recipe.active) {
      recipe.inputs.forEach(recipeInput => {
        if (recipeInput.inputId === inputId && recipeInput.inputType === 'input') {
          const input = inputsData[inputId];
          if (input) {
            totalImpact += recipeInput.quantity * input.unitPrice;
            recipeCount++;
          }
        }
      });
    }
  });
  
  return { totalImpact, recipeCount };
}

// Calculate impact of a role in all recipes
function calculateLaborRoleImpact(roleId, recipes, laborRolesData) {
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
function getProductsWithIssues(products, recipes, calculationsData) {
  const issues = [];
  
  products.forEach(product => {
    const activeRecipe = recipes.find(r => r.productId === product.id && r.active);
    
    if (!activeRecipe) {
      issues.push({
        product,
        issue: 'no-recipe',
        severity: 'low',
        message: 'Sin receta definida'
      });
      return;
    }
    
    // Calculate costs and margins using calculation module functions
    const directCost = calculateDirectCost(activeRecipe, calculationsData.inputs, calculationsData.products, calculationsData.laborRoles);
    const directUnitCost = calculateDirectUnitCost(directCost, activeRecipe.batchYield);
    const indirectUnitCost = calculateIndirectUnitCost(calculationsData.indirectCostPerProduct, activeRecipe.batchYield);
    const totalUnitCost = calculateTotalUnitCost(directUnitCost, indirectUnitCost);
    const realMargin = calculateRealMargin(product.price, totalUnitCost);
    
    if (realMargin < 0) {
      issues.push({
        product,
        activeRecipe,
        issue: 'loss',
        severity: 'high',
        realMargin,
        targetMargin: product.targetMargin,
        totalUnitCost,
        price: product.price,
        suggestedPrice: calculateSuggestedPrice(totalUnitCost, product.targetMargin)
      });
    } else if (product.targetMargin && realMargin < product.targetMargin) {
      issues.push({
        product,
        activeRecipe,
        issue: 'low-margin',
        severity: 'medium',
        realMargin,
        targetMargin: product.targetMargin,
        marginDiff: product.targetMargin - realMargin,
        totalUnitCost,
        price: product.price,
        suggestedPrice: calculateSuggestedPrice(totalUnitCost, product.targetMargin)
      });
    }
  });
  
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

// Get top N inputs by impact
function getTopInputs(inputs, recipes, inputsData, n = 10) {
  const impacts = [];
  
  inputs.forEach(input => {
    const impact = calculateInputImpact(input.id, recipes, inputsData);
    impacts.push({
      input,
      ...impact
    });
  });
  
  // Sort by total impact (highest first)
  impacts.sort((a, b) => b.totalImpact - a.totalImpact);
  
  return impacts.slice(0, n);
}

// Get top N roles by impact
function getTopLaborRoles(laborRoles, recipes, laborRolesData, n = 10) {
  const impacts = [];
  
  laborRoles.forEach(role => {
    const impact = calculateLaborRoleImpact(role.id, recipes, laborRolesData);
    impacts.push({
      role,
      ...impact
    });
  });
  
  // Sort by total impact (highest first)
  impacts.sort((a, b) => b.totalImpact - a.totalImpact);
  
  return impacts.slice(0, n);
}

// Get top N indirect costs
function getTopIndirectCosts(indirectCosts, n = 10) {
  // Sort by monthly amount (highest first)
  const sorted = [...indirectCosts].sort((a, b) => (b.monthlyAmount || 0) - (a.monthlyAmount || 0));
  
  const total = indirectCosts.reduce((sum, cost) => sum + (cost.monthlyAmount || 0), 0);
  
  return sorted.slice(0, n).map(cost => ({
    cost,
    percentage: total > 0 ? (cost.monthlyAmount / total) * 100 : 0
  }));
}
