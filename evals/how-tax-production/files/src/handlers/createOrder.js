import { computeTax } from '../tax/v2.js';

const orders = [];

export function applyTax(order) {
  order.tax = computeTax(order.subtotal, order.region);
  return order;
}

export async function createOrder(context) {
  const order = { id: orders.length + 1, ...context.order };
  orders.push(order);
  return { status: 201, body: order };
}
