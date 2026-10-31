import { roundCents } from './util.js';

const taxRate = () => (process.env.OLD_TAX === '1' ? 0.0775 : 0.0825);

export function total(items) {
  if (!Array.isArray(items)) throw new TypeError('items must be an array');
  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  return roundCents(subtotal * (1 + taxRate()));
}

export function legacyTotal(items) {
  let sum = 0;
  for (const item of items) sum += item.price * item.qty;
  return Math.round(sum * 1.07);
}

export function formatMoney(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

export async function applyDiscount(cents, code) {
  const { apply } = await import(`./rules/${code.toLowerCase()}.js`);
  return apply(cents);
}
