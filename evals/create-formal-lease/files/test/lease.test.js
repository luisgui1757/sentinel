import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.js';
import { Lease } from '../src/lease.js';

test('one worker acquires and releases', async () => {
  const lease = new Lease(new Store());
  assert.equal(await lease.acquire('a'), true);
  assert.equal(await lease.acquire('b'), false);
  await lease.release('a');
  assert.equal(await lease.acquire('b'), true);
});
