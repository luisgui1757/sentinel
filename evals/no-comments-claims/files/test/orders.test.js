import test from 'node:test';
import assert from 'node:assert/strict';
import { importRows } from '../src/importer.js';
import { checkout, descriptor } from '../src/checkout.js';
import { sum } from '../src/report.js';

test('import trims names', async () => {
  const saved = [];
  await importRows([{ name: '  Ana ', email: 'A@X.io' }], { put: async (key, value) => saved.push([key, value]) });
  assert.deepEqual(saved, [['a@x.io', { name: 'Ana', email: 'a@x.io' }]]);
});
test('checkout', async () => assert.equal(await checkout({ id: 7 }, { audit: async () => {}, save: async () => {} }), 7));
test('descriptor', () => assert.equal(descriptor('a'.repeat(30)).length, 22));
test('sum', () => assert.equal(sum([1, 2]), 3));
