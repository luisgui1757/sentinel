export const subtotal = items => items.reduce((sum, item) => sum + item.price * item.qty, 0);
