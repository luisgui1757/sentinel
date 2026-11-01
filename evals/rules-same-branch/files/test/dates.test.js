import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDate } from '../src/dates.js';

test('formatDate starts with the year', () => assert.match(formatDate(new Date(Date.UTC(2026, 9, 5))), /^2026-/));
test('formatDate pads the day', () => assert.match(formatDate(new Date(Date.UTC(2026, 9, 5))), /-05$/));
