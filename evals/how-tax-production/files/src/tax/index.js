import { config } from '../config.js';
import { legacy } from './legacy.js';
import { vat } from './vat.js';
import { flat } from './flat.js';

const providers = { legacy, vat, flat };

export function taxFor(order) {
  const name = config.taxProvider[order.region] ?? config.taxProvider.default;
  return providers[name](order.subtotal);
}
