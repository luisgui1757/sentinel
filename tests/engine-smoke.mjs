// Live native engine proof, separate from the offline regression suite.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'sentinel-engine-'));
try {
  const project = path.join(fixture, "project with ' quote $"); await fs.mkdir(project);
  const install = spawnSync(process.execPath, [path.join(root, 'tools/skills.mjs'), '--host', 'codex', '--target', project, '--skills', 'documents'], { encoding: 'utf8' });
  assert.equal(install.status, 0, install.stderr);
  const engine = path.join(project, '.agents/skills/impeccable/scripts/sentinel-engine.mjs');
  const env = { ...process.env, IMPECCABLE_HOME: path.join(fixture, 'cache') };
  const run = args => {
    const result = spawnSync(process.execPath, [engine, ...args], { env, cwd: project, encoding: 'utf8', timeout: 180_000 });
    assert.equal(result.status, 0, `${args.join(' ')}: ${result.stdout}\n${result.stderr}`);
    return result.stdout;
  };
  run(['--setup']);
  assert.match(run(['engine-probe']), /impeccable-engine/);
  await fs.writeFile(path.join(project, 'index.html'), '<!doctype html><html lang="en"><title>Example</title><main><h1>Example</h1><p>A small document.</p></main></html>\n');
  const beforeContext = (await fs.readdir(project)).sort();
  const context = run(['context', '--target', 'index.html']); assert.ok(context.length > 0);
  const detection = run(['detect', '--json', 'index.html']); JSON.parse(detection);
  assert.deepEqual((await fs.readdir(project)).sort(), beforeContext);
  // Exercise the real engine's printed command, including shell-sensitive paths.
  await fs.writeFile(path.join(project, '.impeccable-live.json'), '{}\n');
  const advice = run(['doctor']);
  const match = advice.match(/Run `(.+) doctor --fix` to apply/); assert.ok(match, advice);
  const command = `${match[1]} engine-probe`;
  const probe = spawnSync(process.platform === 'win32' ? 'pwsh' : 'sh',
    process.platform === 'win32' ? ['-NoProfile', '-Command', command] : ['-c', command],
    { env, cwd: project, encoding: 'utf8', timeout: 30_000 });
  assert.equal(probe.status, 0, probe.stdout + probe.stderr);
  assert.match(probe.stdout, /impeccable-engine/);
  assert.equal(await fs.readFile(path.join(project, '.impeccable-live.json'), 'utf8'), '{}\n');
  for (const rel of ['.codex/hooks.json', '.claude/settings.json', '.github/hooks']) {
    assert.equal(await fs.access(path.join(project, rel)).then(() => true, () => false), false, rel);
  }
  console.log(`Pinned engine setup, probe, context, detect and printed follow-up command passed through an installed skill on ${process.platform}-${process.arch}.`);
} finally { await fs.rm(fixture, { recursive: true, force: true }); }
