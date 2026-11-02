import test from 'node:test';
import assert from 'node:assert/strict';
import { orders } from '../src/orders.js';

test('each order has an id', () => assert.deepEqual(orders.map(order => order.id), [1, 2]));
