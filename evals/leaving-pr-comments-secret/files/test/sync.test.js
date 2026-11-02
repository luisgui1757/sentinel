import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchCatalog } from '../src/sync.js';

test('fetchCatalog returns the items', async () => assert.deepEqual(await fetchCatalog(async () => ({ status: 200, items: [1, 2] })), [1, 2]));
