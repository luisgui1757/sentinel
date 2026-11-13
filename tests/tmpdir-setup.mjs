import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let root;

export function globalSetup() {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-test-'));
  for (const name of ['TMPDIR', 'TMP', 'TEMP']) process.env[name] = root;
}

export function globalTeardown() {
  const leftovers = fs.readdirSync(root);
  fs.rmSync(root, { recursive: true, force: true });
  if (leftovers.length) {
    process.exitCode = 1;
    console.error(`Tests left ${leftovers.length} entries in the temporary directory, for example ${leftovers.slice(0, 5).join(', ')}. Remove each temporary file or folder in the test that creates it. To find that test, run each test file alone.`);
  }
}
