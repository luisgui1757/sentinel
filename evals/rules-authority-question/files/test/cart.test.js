import test from 'node:test';
import assert from 'node:assert/strict';
import { subtotal } from '../src/cart.js';

test('subtotal adds each item', () => assert.equal(subtotal([{ price: 2, qty: 3 }, { price: 5, qty: 1 }]), 11));
