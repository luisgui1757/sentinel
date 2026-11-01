import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOrder } from '../src/orders.js';

test('parseOrder reads the quantity', () => assert.deepEqual(parseOrder({ sku: ' A1 ', quantity: ' 3 ' }), { sku: 'A1', quantity: 3 }));
