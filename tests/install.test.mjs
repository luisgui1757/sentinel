// Run each scenario against tools/install (bash) and tools/install.ps1 (pwsh),
// on each platform where the shell exists. Both must give the same files.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const rules = await fs.readFile(path.join(root, 'rules/AGENTS.md'), 'utf8');
const BEGIN = '<!-- AGENT-RULES:BEGIN do-not-edit-inside-this-block -->';
const END = '<!-- AGENT-RULES:END -->';
const block = `${BEGIN}\n${rules}${END}\n`;
const importBlock = `${BEGIN}\n@AGENTS.md\n${END}\n`;

const has = (cmd, args = ['--version']) => spawnSync(cmd, args, { stdio: 'ignore' }).status === 0;
const impls = [
  process.platform !== 'win32' && has('bash') && 'bash',
  has('pwsh') && 'pwsh',
  // Windows PowerShell 5.1, the shell that each Windows machine has.
  process.platform === 'win32' && has('powershell', ['-NoProfile', '-Command', 'exit 0']) && 'powershell',
].filter(Boolean);

// opts: { global, project, hosts, skills, noRules, check, remove }
function install(impl, home, opts) {
  const skills = opts.skills ?? 'none';
  const args = impl === 'bash'
    ? [path.join(root, 'tools/install'),
      ...(opts.global ? ['--global'] : ['--project', opts.project]), '--hosts', opts.hosts, '--skills', skills,
      ...(opts.noRules ? ['--no-rules'] : []), ...(opts.check ? ['--check'] : []), ...(opts.remove ? ['--remove'] : [])]
    : ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'tools/install.ps1'),
      ...(opts.global ? ['-Global'] : ['-Project', opts.project]), '-Hosts', opts.hosts, '-Skills', skills,
      ...(opts.noRules ? ['-NoRules'] : []), ...(opts.check ? ['-Check'] : []), ...(opts.remove ? ['-Remove'] : [])];
  const env = { ...process.env, HOME: home, USERPROFILE: home, POWERSHELL_TELEMETRY_OPTOUT: '1',
    XDG_CACHE_HOME: path.join(home, '..', 'cache') };
  for (const name of ['CODEX_HOME', 'CLAUDE_CONFIG_DIR', 'COPILOT_HOME', 'XDG_CONFIG_HOME']) delete env[name];
  return spawnSync(impl, args, { env, encoding: 'utf8' });
}

// Assert a zero exit, and show the installer output when it fails.
function ok(result) {
  assert.equal(result.status, 0, `exit ${result.status}\n${result.stdout}${result.stderr}`);
  return result;
}

async function withHome(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sentinel-install-'));
  // A space in the path catches word splitting in the installers.
  const home = path.join(dir, 'home folder');
  await fs.mkdir(home);
  try { await fn(home); } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

const read = file => fs.readFile(file, 'utf8');
const exists = file => fs.access(file).then(() => true, () => false);
const profiles = (await fs.readFile(path.join(root, 'skills/profiles.txt'), 'utf8'))
  .split('\n').filter(line => line && !line.startsWith('#')).map(line => line.split(' '));
const inProfiles = (...names) => [...new Set(profiles.filter(([p]) => names.includes(p)).map(([, s]) => s))];
const skillRoots = home => ['.agents/skills', '.claude/skills', '.kiro/skills'].map(dir => path.join(home, dir));

// Map each file in a folder to its bytes, without the ownership file.
async function tree(dir) {
  const files = {};
  for (const entry of await fs.readdir(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || entry.name === '.sentinel-owned') continue;
    const file = path.join(entry.parentPath, entry.name);
    files[path.relative(dir, file).split(path.sep).join('/')] = (await fs.readFile(file)).toString('base64');
  }
  return files;
}
// The ownership file format: "<sha256>  <path>" per file, sorted by path.
async function ownership(dir) {
  const files = await tree(dir);
  return Object.keys(files).sort().map(rel =>
    `${createHash('sha256').update(Buffer.from(files[rel], 'base64')).digest('hex')}  ${rel}\n`).join('');
}

const globalFiles = home => [
  '.codex/AGENTS.md', '.claude/CLAUDE.md', '.copilot/copilot-instructions.md',
  '.kiro/steering/AGENTS.md', '.config/opencode/AGENTS.md',
].map(file => path.join(home, file));

for (const impl of impls) {
  test(`${impl}: global install writes each host file, repeats without change and checks clean`, () => withHome(async home => {
    ok(install(impl, home, { global: true, hosts: 'all' }));
    for (const file of globalFiles(home)) assert.equal(await read(file), block, file);
    const again = ok(install(impl, home, { global: true, hosts: 'all' }));
    assert.doesNotMatch(again.stdout, /wrote/);
    ok(install(impl, home, { global: true, hosts: 'all', check: true }));
  }));

  test(`${impl}: an old block is replaced in place and user text stays`, () => withHome(async home => {
    const file = path.join(home, '.codex/AGENTS.md');
    await fs.mkdir(path.dirname(file), { recursive: true });
    const old = `<!-- AGENT-RULES:BEGIN -->\n<!-- version: 0.1.2 -->\nold rules\n${END}\n`;
    await fs.writeFile(file, `my intro\n${old}my notes\n${old}`);
    ok(install(impl, home, { global: true, hosts: 'codex' }));
    assert.equal(await read(file), `my intro\n${block}my notes\n`);
  }));

  test(`${impl}: a block without an end marker is refused and left unchanged`, () => withHome(async home => {
    const file = path.join(home, '.claude/CLAUDE.md');
    await fs.mkdir(path.dirname(file), { recursive: true });
    const broken = `${BEGIN}\nhalf a block\nmy notes\n`;
    await fs.writeFile(file, broken);
    for (const opts of [{}, { remove: true }]) {
      assert.notEqual(install(impl, home, { global: true, hosts: 'claude', ...opts }).status, 0);
      assert.equal(await read(file), broken);
    }
  }));

  test(`${impl}: check reports an edit inside the block and a missing block`, () => withHome(async home => {
    ok(install(impl, home, { global: true, hosts: 'codex,kiro' }));
    const file = path.join(home, '.codex/AGENTS.md');
    await fs.writeFile(file, (await read(file)).replace('# Working rules', '# Edited rules'));
    const result = install(impl, home, { global: true, hosts: 'codex,kiro,opencode', check: true });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /DRIFT: .*AGENTS\.md/);
    assert.match(result.stdout, /MISSING: .*opencode/);
  }));

  test(`${impl}: remove keeps user text and deletes files that held only the block`, () => withHome(async home => {
    const codex = path.join(home, '.codex/AGENTS.md');
    await fs.mkdir(path.dirname(codex), { recursive: true });
    await fs.writeFile(codex, 'my notes\n');
    ok(install(impl, home, { global: true, hosts: 'codex,kiro' }));
    ok(install(impl, home, { global: true, hosts: 'codex,kiro', remove: true }));
    assert.equal(await read(codex), 'my notes\n\n');
    assert.equal(await exists(path.join(home, '.kiro/steering/AGENTS.md')), false);
  }));

  test(`${impl}: a project gets one copy of the rules, and CLAUDE.md imports it`, () => withHome(async home => {
    const project = path.join(home, 'project');
    await fs.mkdir(project);
    await fs.writeFile(path.join(project, 'CLAUDE.md'), '# Project notes\n');
    ok(install(impl, home, { project, hosts: 'all' }));
    assert.equal(await read(path.join(project, 'AGENTS.md')), block);
    assert.equal(await read(path.join(project, 'CLAUDE.md')), `# Project notes\n\n${importBlock}`);
    assert.equal(await exists(path.join(project, '.github/copilot-instructions.md')), false);
  }));

  test(`${impl}: skills go into each host folder, repeat without change and check clean`, () => withHome(async home => {
    ok(install(impl, home, { global: true, hosts: 'all', skills: 'core,ui' }));
    for (const dir of skillRoots(home)) {
      for (const name of inProfiles('core', 'ui')) {
        assert.deepEqual(await tree(path.join(dir, name)), await tree(path.join(root, 'skills', name)), `${dir}/${name}`);
      }
    }
    const again = ok(install(impl, home, { global: true, hosts: 'all', skills: 'core,ui' }));
    assert.doesNotMatch(again.stdout, /installed|updated|wrote/);
    ok(install(impl, home, { global: true, hosts: 'all', skills: 'core,ui', check: true }));
  }));

  test(`${impl}: a skill folder that the installer did not write is refused and kept`, () => withHome(async home => {
    const mine = path.join(home, '.claude/skills/takeover');
    await fs.mkdir(mine, { recursive: true });
    await fs.writeFile(path.join(mine, 'SKILL.md'), 'my own skill\n');
    assert.equal(install(impl, home, { global: true, hosts: 'claude', skills: 'core' }).status, 1);
    assert.deepEqual(await tree(mine), { 'SKILL.md': Buffer.from('my own skill\n').toString('base64') });
    assert.ok(await exists(path.join(home, '.claude/skills/sol-loop/SKILL.md')));
    ok(install(impl, home, { global: true, hosts: 'claude', skills: 'core', remove: true }));
    assert.ok(await exists(path.join(mine, 'SKILL.md')));
  }));

  test(`${impl}: an old owned copy is updated, an edited copy is refused`, () => withHome(async home => {
    const opts = { global: true, hosts: 'codex', skills: 'core' };
    ok(install(impl, home, opts));
    const dest = path.join(home, '.agents/skills/council');
    await fs.writeFile(path.join(dest, 'SKILL.md'), 'an older release\n');
    await fs.writeFile(path.join(dest, '.sentinel-owned'), await ownership(dest));
    assert.match(install(impl, home, opts).stdout, /updated: .*council/);
    assert.deepEqual(await tree(dest), await tree(path.join(root, 'skills/council')));
    await fs.writeFile(path.join(dest, 'SKILL.md'), 'my edit\n');
    for (const extra of [{}, { check: true }, { remove: true }]) {
      assert.equal(install(impl, home, { ...opts, ...extra }).status, 1);
      assert.equal(await read(path.join(dest, 'SKILL.md')), 'my edit\n');
    }
  }));

  test(`${impl}: a retired skill leaves on the next run, and remove deletes owned skills`, () => withHome(async home => {
    const opts = { global: true, hosts: 'kiro', skills: 'core' };
    const retired = path.join(home, '.kiro/skills/old-skill');
    await fs.mkdir(retired, { recursive: true });
    await fs.writeFile(path.join(retired, 'SKILL.md'), 'retired\n');
    await fs.writeFile(path.join(retired, '.sentinel-owned'), await ownership(retired));
    assert.equal(install(impl, home, { ...opts, check: true }).status, 1);
    ok(install(impl, home, opts));
    assert.equal(await exists(retired), false);
    ok(install(impl, home, { ...opts, remove: true }));
    assert.deepEqual(await fs.readdir(path.join(home, '.kiro/skills')), []);
  }));

  test(`${impl}: the installer takes over the skill folders of Sentinel v0.2.0`, () => withHome(async home => {
    const skills = path.join(home, '.claude/skills');
    const legacy = path.join(skills, '.sentinel-skills.json');
    const v020 = { council: { 'SKILL.md': 'old council\n' }, 'sol-loop': { 'SKILL.md': 'old sol\n' },
      tldr: { 'SKILL.md': 'retired\n', 'docs/a.md': 'a\n' } };
    // v0.2.0 wrote JSON.stringify(registry, null, 2) with a SHA-256 for each file.
    const registry = { schema_version: 1, roots: Object.keys(v020), skills: {} };
    for (const [name, files] of Object.entries(v020)) {
      registry.skills[name] = {};
      for (const [file, text] of Object.entries(files)) {
        await fs.mkdir(path.dirname(path.join(skills, name, file)), { recursive: true });
        await fs.writeFile(path.join(skills, name, file), text);
        registry.skills[name][file] = createHash('sha256').update(text).digest('hex');
      }
    }
    await fs.writeFile(legacy, `${JSON.stringify(registry, null, 2)}\n`);
    await fs.writeFile(path.join(skills, 'sol-loop/SKILL.md'), 'my edit\n');
    const opts = { global: true, hosts: 'claude', skills: 'core', noRules: true };

    const check = install(impl, home, { ...opts, check: true });
    assert.equal(check.status, 1);
    assert.match(check.stdout, /LEGACY: +.*council/);
    assert.match(check.stdout, /RETIRED: +.*tldr/);
    assert.ok(await exists(path.join(skills, 'tldr/docs/a.md')));

    assert.equal(install(impl, home, opts).status, 1);
    assert.deepEqual(await tree(path.join(skills, 'council')), await tree(path.join(root, 'skills/council')));
    assert.equal(await exists(path.join(skills, 'tldr')), false);
    assert.equal(await read(path.join(skills, 'sol-loop/SKILL.md')), 'my edit\n');
    assert.ok(await exists(legacy));

    await fs.writeFile(path.join(skills, 'sol-loop/SKILL.md'), 'old sol\n');
    ok(install(impl, home, opts));
    assert.deepEqual(await tree(path.join(skills, 'sol-loop')), await tree(path.join(root, 'skills/sol-loop')));
    assert.equal(await exists(legacy), false);
    ok(install(impl, home, { ...opts, check: true }));
  }));

  test(`${impl}: a project can take the UI skills without the rules`, () => withHome(async home => {
    const project = path.join(home, 'project');
    await fs.mkdir(project);
    ok(install(impl, home, { project, hosts: 'claude', skills: 'ui', noRules: true }));
    assert.deepEqual((await fs.readdir(path.join(project, '.claude/skills'))).sort(), inProfiles('ui').sort());
    assert.deepEqual(await fs.readdir(project), ['.claude']);
  }));

  test(`${impl}: an unknown host writes nothing`, () => withHome(async home => {
    assert.equal(install(impl, home, { global: true, hosts: 'codex,pi' }).status, 2);
    for (const file of globalFiles(home)) assert.equal(await exists(file), false, file);
  }));
}

test('at least one installer runs on this platform', () => assert.ok(impls.length > 0));

test('two installers write the same ownership files', { skip: impls.length < 2 }, () => withHome(async home => {
  const [first, second] = impls;
  const opts = { global: true, hosts: 'claude', skills: 'core,ui' };
  ok(install(first, home, opts));
  ok(install(second, home, { ...opts, check: true }));
  const marker = path.join(home, '.claude/skills/impeccable/.sentinel-owned');
  const firstMarker = await read(marker);
  await fs.rm(path.join(home, '.claude/skills'), { recursive: true });
  ok(install(second, home, opts));
  assert.equal(await read(marker), firstMarker);
}));
