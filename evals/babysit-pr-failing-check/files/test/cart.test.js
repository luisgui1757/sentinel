import test from 'node:test';
import assert from 'node:assert/strict';
import { subtotal } from '../src/cart.js';

test('subtotal adds price times quantity', () => assert.equal(subtotal([{ price: 250, qty: 2 }, { price: 100, qty: 1 }]), 600));
