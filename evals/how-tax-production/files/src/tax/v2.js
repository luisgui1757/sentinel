const rates = { US: 0.0725, EU: 0.2 };

export function computeTax(subtotal, region) {
  return Math.round(subtotal * (rates[region] ?? 0) * 100) / 100;
}
