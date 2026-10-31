// Stripe rejects statement descriptors longer than 22 characters: https://docs.stripe.com/get-started/account/statement-descriptors
export const descriptor = shop => shop.slice(0, 22);

export async function checkout(order, { audit, save }) {
  // do not change the order of these two calls: audit must record the order before save changes its status
  await audit(order);
  await save(order);
  // eslint-disable-next-line no-unused-vars
  const debugCopy = { ...order };
  return order.id;
}
