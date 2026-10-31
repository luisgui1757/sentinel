import test from 'node:test';
import assert from 'node:assert/strict';
import { roundCents } from '../src/money.js';

test('roundCents keeps whole cents', () => assert.equal(roundCents(2.5), 2.5));
test('roundCents rounds half up', () => {
  assert.equal(roundCents(2.675), 2.68);
  assert.equal(roundCents(1.005), 1.01);
});
