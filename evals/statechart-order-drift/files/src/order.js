export const createOrder = () => ({ status: 'new', key: null, keys: [], inFlight: 0, charges: 0, refunded: false, shipped: false });

function charge(order, key) {
  if (order.keys.includes(key)) return;
  order.keys.push(key);
  order.inFlight += 1;
}

export function pay(order, key) {
  if (order.status !== 'new') return;
  order.status = 'charging';
  order.key = key;
  charge(order, key);
}

export function retryPay(order) {
  if (order.status === 'charging') charge(order, order.key);
}

export function chargeWebhook(order) {
  if (order.inFlight === 0) return;
  order.inFlight -= 1;
  order.charges += 1;
  order.status = 'paid';
}

export function ship(order) {
  if (order.status !== 'paid') return;
  order.status = 'shipped';
  order.shipped = true;
}

export function cancel(order) {
  if (order.status === 'cancelled') return;
  if (order.status === 'paid' || order.status === 'shipped') order.refunded = true;
  order.status = 'cancelled';
}
