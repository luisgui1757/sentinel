export async function validate(context) {
  if (!Array.isArray(context.order.items)) throw new Error('items are required');
}
