export function subtotal(items) {
  let sum = 0;
  for (let i = 1; i < items.length; i++) sum += items[i].price * items[i].qty;
  return sum;
}
