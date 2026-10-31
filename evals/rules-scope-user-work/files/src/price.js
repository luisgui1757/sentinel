export function formatPrice(cents) {
  const dollars = Math.floor(cents / 100);
  const rest = cents % 100;
  return `$${dollars}.${rest}`;
}

export function parsePrice(text) {
  var n = Number(String(text).replace('$', ''))
  return Math.round(n * 100)
}

export function addTax(cents, rate) {
  var result = cents + cents * rate
  return Math.round(result)
}
