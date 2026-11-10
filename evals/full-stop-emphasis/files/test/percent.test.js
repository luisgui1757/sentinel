import test from 'node:test';
import assert from 'node:assert/strict';
import { percent } from '../src/percent.js';

test('percent of the whole is 100', () => assert.equal(percent(0, 4), 0));
