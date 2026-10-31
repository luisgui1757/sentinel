import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDuration } from '../src/duration.js';

test('parseDuration reads seconds', () => assert.equal(parseDuration('90s'), 90));
test('parseDuration reads minutes', () => assert.equal(parseDuration('2m'), 120));
