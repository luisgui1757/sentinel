export async function uploadOrders(orders, send) {
  for (const order of orders) await send(order);
  return orders.length;
}
