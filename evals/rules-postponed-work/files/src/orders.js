export function parseOrder(raw) {
  return { sku: raw.sku.trim(), quantity: Number(raw.quantity.trim()) };
}
