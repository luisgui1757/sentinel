import test from 'node:test';
import assert from 'node:assert/strict';
import { inStock } from '../src/stock.js';

test('inStock finds a SKU with a count', () => assert.equal(inStock([{ sku: 'a', count: 1 }], 'a'), true));
