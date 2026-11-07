import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../tools/eval.mjs', import.meta.url));
const evalTool = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });

test('--resume needs --no-early-stop', () => {
  const r = evalTool('--ab', '--targets', 'none', '--resume', 'old');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /--resume needs --no-early-stop/);
});

test('--resume refuses a folder with two finished rows of one run', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'resume-'));
  const row = JSON.stringify({ case: 'c', target: 't', arm: 'with', index: 1, status: 'pass' });
  await fs.writeFile(path.join(dir, 'runs.jsonl'), `${row}\n${row.replace('pass', 'fail')}\n`);
  const r = evalTool('--ab', '--targets', 'none', '--no-early-stop', '--resume', dir);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /--resume: c t with 1 has two rows/);
  await fs.rm(dir, { recursive: true, force: true });
});
