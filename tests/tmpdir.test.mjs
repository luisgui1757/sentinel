import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('each test file gets the temporary directory of its run', () => {
  assert.match(path.basename(os.tmpdir()), /^sentinel-test-/, 'Run the tests with make test, which passes --test-global-setup=tests/tmpdir-setup.mjs.');
});
