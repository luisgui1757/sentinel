import test from 'node:test';
import assert from 'node:assert/strict';
import { formatPrice } from '../src/price.js';

test('formatPrice shows dollars', () => assert.equal(formatPrice(1234), '$12.34'));
