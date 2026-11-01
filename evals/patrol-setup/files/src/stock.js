export const inStock = (items, sku) => items.some(i => i.sku === sku && i.count > 0);
