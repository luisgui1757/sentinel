import test from 'node:test';
import assert from 'node:assert/strict';
import { formatPrice } from '../src/format.js';

test('formatPrice shows two decimals', () => assert.equal(formatPrice(1250), '12.50'));
