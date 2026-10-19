import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const ps = process.platform === 'win32' || process.env.SENTINEL_TEST_POWERSHELL === '1';
function invoke(args, env) {
  return spawnSync(ps ? 'pwsh' : 'bash', ps ? ['-NoProfile', '-File', path.join(root, 'tools/install.ps1'), ...args] : [path.join(root, 'tools/install'), ...args], {
    env: { ...process.env, ...env }, encoding: 'utf8', cwd: root,
  });
}
const flag = name => ps ? `-${{ global: 'Global', target: 'Target', hosts: 'Hosts', check: 'Check', remove: 'Remove', 'dry-run': 'DryRun', legacy: 'Legacy' }[name]}` : `--${name}`;
const ok = result => assert.equal(result.status, 0, result.stdout + result.stderr);
async function fixture(run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sentinel-policy-'));
  const profile = path.join(dir, 'profile');
  await fs.mkdir(profile);
  const runtimeProfile = path.join(dir, 'runtime-profile');
  await fs.mkdir(runtimeProfile);
  // The installer prefers HOME. PowerShell's Windows runtime uses USERPROFILE.
  const env = { HOME: profile, USERPROFILE: runtimeProfile, CODEX_HOME: path.join(profile, 'codex-custom'),
    CLAUDE_CONFIG_DIR: path.join(profile, 'claude-custom'), XDG_CONFIG_HOME: path.join(profile, 'xdg'),
    XDG_CACHE_HOME: path.join(dir, 'runtime-cache'), XDG_DATA_HOME: path.join(dir, 'runtime-data'),
    PSModuleAnalysisCachePath: path.join(dir, 'runtime-cache', 'ModuleAnalysisCache'),
    PI_CODING_AGENT_DIR: path.join(profile, 'pi-legacy') };
  try { await run(profile, env); }
  finally { await fs.rm(dir, { recursive: true, force: true }); }
}
const absent = async file => assert.equal(await fs.access(file).then(() => true, () => false), false);

test('global policy lifecycle preserves user content and uses supported host paths', async () => fixture(async (dir, env) => {
  const targets = ['codex-custom/AGENTS.md', 'claude-custom/CLAUDE.md', '.copilot/copilot-instructions.md', '.kiro/steering/AGENTS.md'];
  for (const rel of targets) { const file = path.join(dir, rel); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, '# User instructions\nKeep this.\n'); }
  const before = await Promise.all(targets.map(rel => fs.readFile(path.join(dir, rel))));
  ok(invoke([flag('global'), flag('dry-run')], env));
  for (const [i, rel] of targets.entries()) assert.deepEqual(await fs.readFile(path.join(dir, rel)), before[i]);
  ok(invoke([flag('global')], env));
  ok(invoke([flag('global'), flag('check')], env));
  const installed = await Promise.all(targets.map(rel => fs.readFile(path.join(dir, rel))));
  ok(invoke([flag('global')], env));
  for (const [i, rel] of targets.entries()) {
    assert.deepEqual(await fs.readFile(path.join(dir, rel)), installed[i]);
    assert.match(installed[i].toString(), /Keep this\./);
    assert.match(installed[i].toString(), /AGENT-RULES:BEGIN/);
  }
  await absent(path.join(dir, 'xdg/opencode/AGENTS.md'));
  await absent(path.join(dir, 'pi-legacy/AGENTS.md'));
  ok(invoke([flag('global'), flag('remove')], env));
  for (const rel of targets) {
    const remaining = await fs.readFile(path.join(dir, rel), 'utf8');
    assert.match(remaining, /Keep this\./); assert.doesNotMatch(remaining, /AGENT-RULES/);
  }
}));

test('host selection does not create other adapters or duplicate Kiro project rules', async () => fixture(async (dir, env) => {
  ok(invoke([flag('target'), dir, flag('hosts'), 'kiro'], env));
  assert.match(await fs.readFile(path.join(dir, 'AGENTS.md'), 'utf8'), /AGENT-RULES/);
  await absent(path.join(dir, 'CLAUDE.md')); await absent(path.join(dir, '.github'));
  await absent(path.join(dir, '.kiro'));
  ok(invoke([flag('global'), flag('hosts'), 'claude'], env));
  assert.match(await fs.readFile(path.join(dir, 'claude-custom/CLAUDE.md'), 'utf8'), /AGENT-RULES/);
  await absent(path.join(dir, 'codex-custom'));
}));

test('explicit global check fails for missing selected entrypoints', async () => fixture(async (dir, env) => {
  const result = invoke([flag('global'), flag('hosts'), 'codex', flag('check')], env);
  assert.notEqual(result.status, 0); assert.match(result.stdout + result.stderr, /MISSING/);
  assert.deepEqual(await fs.readdir(dir), []);
}));

test('legacy removal is explicit and preserves unrelated text', async () => fixture(async (dir, env) => {
  const legacy = path.join(dir, 'xdg/opencode/AGENTS.md'); await fs.mkdir(path.dirname(legacy), { recursive: true });
  await fs.writeFile(legacy, '# Mine\n<!-- AGENT-RULES:BEGIN old -->\nold rules\n<!-- AGENT-RULES:END -->\nKeep after.\n');
  const before = await fs.readFile(legacy);
  ok(invoke([flag('global')], env)); assert.deepEqual(await fs.readFile(legacy), before);
  assert.notEqual(invoke([flag('global'), flag('legacy')], env).status, 0);
  ok(invoke([flag('global'), flag('legacy'), flag('remove')], env));
  assert.equal(await fs.readFile(legacy, 'utf8'), '# Mine\nKeep after.\n');
  assert.match(await fs.readFile(path.join(dir, 'codex-custom/AGENTS.md'), 'utf8'), /AGENT-RULES/);
}));

test('conflicting scopes or unknown hosts do not write', async () => fixture(async (dir, env) => {
  for (const args of [[flag('global'), flag('target'), dir], [flag('global'), flag('hosts'), 'other'],
    [flag('global'), flag('check'), flag('remove')]]) {
    assert.notEqual(invoke(args, env).status, 0);
    assert.deepEqual(await fs.readdir(dir), []);
  }
}));

test('PowerShell uses USERPROFILE when HOME and host overrides are empty', { skip: !ps }, async () => fixture(async (dir, env) => {
  const fallback = { ...env, HOME: '', CODEX_HOME: '', CLAUDE_CONFIG_DIR: '' };
  const targets = ['.codex/AGENTS.md', '.claude/CLAUDE.md', '.copilot/copilot-instructions.md', '.kiro/steering/AGENTS.md'];
  ok(invoke([flag('global')], fallback));
  ok(invoke([flag('global'), flag('check')], fallback));
  for (const rel of targets) assert.match(await fs.readFile(path.join(env.USERPROFILE, rel), 'utf8'), /AGENT-RULES/);
  assert.deepEqual(await fs.readdir(dir), []);
  ok(invoke([flag('global'), flag('remove')], fallback));
  for (const rel of targets) await absent(path.join(env.USERPROFILE, rel));
}));

test('PowerShell prompt syntax accepts comma-separated host arrays', { skip: !ps }, async () => fixture(async (dir, env) => {
  const quote = value => "'" + value.replaceAll("'", "''") + "'";
  const result = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command',
    `& ${quote(path.join(root, 'tools/install.ps1'))} -Global -Hosts claude,copilot`],
  { env: { ...process.env, ...env }, encoding: 'utf8', cwd: root });
  ok(result);
  assert.match(await fs.readFile(path.join(dir, 'claude-custom/CLAUDE.md'), 'utf8'), /AGENT-RULES/);
  assert.match(await fs.readFile(path.join(dir, '.copilot/copilot-instructions.md'), 'utf8'), /AGENT-RULES/);
  await absent(path.join(dir, 'codex-custom')); await absent(path.join(dir, '.kiro'));
}));
