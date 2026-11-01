import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrder, pay, chargeWebhook, ship } from '../src/order.js';

test('a paid order ships', () => {
  const order = createOrder();
  pay(order, 'k1');
  chargeWebhook(order);
  ship(order);
  assert.equal(order.status, 'shipped');
  assert.equal(order.charges, 1);
});
