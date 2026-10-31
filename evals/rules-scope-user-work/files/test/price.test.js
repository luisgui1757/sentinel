import test from 'node:test';
import assert from 'node:assert/strict';
import { formatPrice, parsePrice, addTax } from '../src/price.js';

test('formatPrice shows dollars and cents', () => assert.equal(formatPrice(1999), '$19.99'));
test('parsePrice reads a dollar amount', () => assert.equal(parsePrice('$4.50'), 450));
test('addTax rounds to a cent', () => assert.equal(addTax(1000, 0.0825), 1083));
