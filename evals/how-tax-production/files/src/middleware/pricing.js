import { taxFor } from '../tax/index.js';

export async function pricing(context) {
  const order = context.order;
  order.subtotal = order.items.reduce((sum, item) => sum + item.price * item.qty, 0);
  order.tax = taxFor(order);
  order.total = order.subtotal + order.tax;
}
