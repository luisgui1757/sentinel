import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { run as checkImports } from '../tools/upstream.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, 'skills');
const catalog = JSON.parse(await fs.readFile(path.join(source, 'catalog.json')));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function fixture(run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sentinel-skills-'));
  try { await run(await fs.realpath(dir)); } finally { await fs.rm(dir, { recursive: true, force: true }); }
}
function cli(args, env = {}, script = path.join(root, 'tools/skills.mjs'), options = {}) {
  return spawnSync(process.execPath, [...(options.nodeArgs || []), script, ...args], {
    encoding: 'utf8', env: { ...process.env, ...env }, cwd: root,
  });
}
function ok(result) { assert.equal(result.status, 0, result.stdout + result.stderr); }
async function exists(file) { return fs.access(file).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; }); }
async function tree(dir) {
  const result = {};
  for (const item of (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(dir, item.name);
    if (item.isDirectory()) for (const [sub, hash] of Object.entries(await tree(file))) result[`${item.name}/${sub}`] = hash;
    else result[item.name] = digest(await fs.readFile(file));
  }
  return result;
}
function dependencies(names) {
  const result = new Set();
  const visit = name => { if (result.has(name)) return; result.add(name); catalog.skills[name].requires.forEach(visit); };
  names.forEach(visit); return [...result].sort();
}

test('catalog exposes only complete public skills and records every cross-skill reference', async () => {
  const names = (await fs.readdir(source, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  assert.deepEqual(Object.keys(catalog.skills).sort(), names);
  assert.equal(names.length, 12);
  assert.ok(!names.includes('file-upload') && !names.includes('leaving-pr-comments'));
  for (const name of names) {
    const text = await fs.readFile(path.join(source, name, 'SKILL.md'), 'utf8');
    assert.match(text, new RegExp(`^---\\nname: ${name}\\ndescription: .+\\n`));
    if (!['frontend-design', 'impeccable'].includes(name)) assert.ok(text.split('\n').length <= 150, name);
    assert.equal(catalog.skills[name].visibility, 'public');
    for (const rel of Object.keys(await tree(path.join(source, name))).filter(file => file.endsWith('.md'))) {
      if (name === 'impeccable') continue; // Upstream integrity is checked separately.
      const file = path.join(source, name, rel);
      const body = await fs.readFile(file, 'utf8');
      for (const [, link] of body.matchAll(/\[[^\]\n]+\]\(([^\s)]+)\)/g)) {
        if (link.includes(':') || link.startsWith('#')) continue;
        const target = path.resolve(path.dirname(file), link.split('#')[0]);
        assert.ok(await exists(target), `${file}: missing ${link}`);
        const first = path.relative(source, target).split(path.sep)[0];
        if (first !== name) assert.ok(catalog.skills[name].requires.includes(first), `${name} must package ${first}`);
      }
    }
  }
});

test('third-party sources retain their original bytes and licenses', async () => {
  await checkImports({ root, mode: 'check' });
  const engine = JSON.parse(await fs.readFile(path.join(source, 'impeccable/scripts/sentinel-engine.json')));
  assert.equal(engine.version, (await fs.readFile(path.join(source, 'impeccable/scripts/VERSION'), 'utf8')).trim());
  for (const file of ['unslop/LICENSE', 'impeccable/LICENSE', 'impeccable/NOTICE.md', 'impeccable/PLATFORM-LICENSE', 'impeccable/SCREENSHOT-LICENSE']) {
    assert.ok((await fs.readFile(path.join(source, file))).length > 100, file);
  }
});

for (const host of ['codex', 'claude', 'copilot', 'kiro']) {
  for (const global of [false, true]) {
    test(`${host}: ${global ? 'global' : 'project'} copy, repeat, check and remove`, async () => fixture(async dir => {
      const env = { HOME: dir, USERPROFILE: dir, CLAUDE_CONFIG_DIR: path.join(dir, 'claude-custom') };
      const args = ['--host', host, ...(global ? ['--global'] : ['--target', dir])];
      const destination = path.join(dir, host === 'claude' ? (global ? 'claude-custom/skills' : '.claude/skills') : host === 'kiro' ? '.kiro/skills' : '.agents/skills');
      ok(cli([...args, '--skills', 'documents', '--dry-run'], env));
      assert.equal(await exists(destination), false);
      ok(cli([...args, '--skills', 'documents'], env));
      const before = await tree(destination);
      ok(cli([...args, '--skills', 'documents'], env));
      assert.deepEqual(await tree(destination), before);
      ok(cli([...args, '--check'], env));
      const names = dependencies(['doc-view']);
      for (const name of names) assert.deepEqual(await tree(path.join(destination, name)), await tree(path.join(source, name)));
      const metadata = JSON.parse(await fs.readFile(path.join(destination, '.sentinel-skills.json')));
      assert.deepEqual(Object.keys(metadata.skills).sort(), names);
      await fs.mkdir(path.join(destination, 'unrelated'));
      await fs.writeFile(path.join(destination, 'unrelated/keep'), 'user data');
      ok(cli([...args, '--remove'], env));
      for (const name of names) assert.equal(await exists(path.join(destination, name)), false);
      assert.equal(await fs.readFile(path.join(destination, 'unrelated/keep'), 'utf8'), 'user data');
    }));
  }
}

test('delivery copy retains its internal procedures and cross-skill links without the checkout', async () => fixture(async dir => {
  ok(cli(['--host', 'codex', '--target', dir, '--skills', 'delivery']));
  const installed = path.join(dir, '.agents/skills');
  for (const name of dependencies(catalog.groups.delivery)) {
    for (const rel of Object.keys(await tree(path.join(installed, name))).filter(file => file.endsWith('.md'))) {
      const file = path.join(installed, name, rel);
      for (const [, link] of (await fs.readFile(file, 'utf8')).matchAll(/\[[^\]\n]+\]\(([^\s)]+)\)/g)) {
        if (!link.includes(':') && !link.startsWith('#')) assert.ok(await exists(path.resolve(path.dirname(file), link.split('#')[0])), `${name}/${rel}: ${link}`);
      }
    }
  }
  assert.equal(await exists(path.join(installed, 'file-upload')), false);
}));

test('removing one root retains dependencies still needed by another root', async () => fixture(async dir => {
  const args = ['--host', 'codex', '--target', dir];
  ok(cli([...args, '--skills', 'documents,unslop']));
  ok(cli([...args, '--remove', '--skills', 'doc-view']));
  const installed = path.join(dir, '.agents/skills');
  assert.ok(await exists(path.join(installed, 'unslop/SKILL.md')));
  assert.equal(await exists(path.join(installed, 'doc-view')), false);
  ok(cli([...args, '--check']));
}));

test('unowned collision fails before installing any member of the selection', async () => fixture(async dir => {
  const installed = path.join(dir, '.agents/skills');
  await fs.mkdir(path.join(installed, 'unslop'), { recursive: true });
  await fs.writeFile(path.join(installed, 'unslop/SKILL.md'), 'mine');
  const before = await tree(dir);
  const result = cli(['--host', 'codex', '--target', dir, '--skills', 'writing']);
  assert.notEqual(result.status, 0); assert.match(result.stderr, /unowned/);
  assert.deepEqual(await tree(dir), before);
}));

for (const mutation of ['edit', 'extra', 'missing']) test(`${mutation}: update and removal preserve modified managed skills`, async () => fixture(async dir => {
  const args = ['--host', 'codex', '--target', dir];
  ok(cli([...args, '--skills', 'tldr']));
  const skill = path.join(dir, '.agents/skills/tldr');
  if (mutation === 'edit') await fs.appendFile(path.join(skill, 'SKILL.md'), '\nUser edit\n');
  if (mutation === 'extra') await fs.writeFile(path.join(skill, 'mine.txt'), 'keep');
  if (mutation === 'missing') await fs.unlink(path.join(skill, 'SKILL.md'));
  const before = await tree(dir);
  for (const action of [['--skills', 'tldr'], ['--remove'], ['--check']]) {
    assert.notEqual(cli([...args, ...action]).status, 0);
    assert.deepEqual(await tree(dir), before);
  }
}));

test('invalid selections and conflicting scopes write nothing', async () => fixture(async dir => {
  for (const args of [ ['--host', 'codex', '--target', dir, '--skills', '../escape'],
    ['--host', 't3', '--target', dir, '--skills', 'all'],
    ['--host', 'codex', '--global', '--target', dir, '--skills', 'all'],
    ['--host', 'codex', '--target', dir, '--check', '--remove'] ]) {
    assert.notEqual(cli(args).status, 0);
    assert.deepEqual(await fs.readdir(dir), []);
  }
}));

test('ownership paths and interrupted-install locks cannot authorize outside writes', async () => fixture(async dir => {
  const args = ['--host', 'codex', '--target', dir];
  ok(cli([...args, '--skills', 'tldr']));
  const dest = path.join(dir, '.agents/skills');
  const registry = path.join(dest, '.sentinel-skills.json');
  const original = await fs.readFile(registry);
  const bad = JSON.parse(original); bad.skills.tldr['../../outside'] = '0'.repeat(64);
  await fs.writeFile(registry, JSON.stringify(bad));
  assert.notEqual(cli([...args, '--remove']).status, 0);
  await fs.writeFile(registry, original);
  await fs.writeFile(path.join(dest, '.sentinel-skills.lock'), '999999\n');
  const before = await tree(dir);
  const result = cli([...args, '--skills', 'writing']);
  assert.notEqual(result.status, 0); assert.match(result.stderr, /interrupted transaction/);
  assert.deepEqual(await tree(dir), before);
}));

test('a filesystem failure restores replaced skills and their ownership registry', async () => fixture(async dir => {
  const copy = path.join(dir, 'source'); await fs.mkdir(path.join(copy, 'tools'), { recursive: true });
  await fs.cp(source, path.join(copy, 'skills'), { recursive: true });
  await fs.copyFile(path.join(root, 'tools/skills.mjs'), path.join(copy, 'tools/skills.mjs'));
  const target = path.join(dir, 'project'); await fs.mkdir(target);
  const args = ['--host', 'codex', '--target', target, '--skills', 'writing'];
  ok(cli(args));
  const before = await tree(target);
  for (const name of ['tldr', 'unslop']) await fs.appendFile(path.join(copy, 'skills', name, 'SKILL.md'), '\nUpdated source\n');
  const shim = path.join(dir, 'fail-rename.mjs');
  await fs.writeFile(shim, `import fs from 'node:fs/promises';\nimport path from 'node:path';\nconst original = fs.rename;\nfs.rename = async (from, to) => {\n  if (path.basename(path.dirname(from)) === 'new' && String(to).endsWith('unslop')) throw new Error('simulated filesystem failure');\n  return original(from, to);\n};\n`);
  const result = cli(args, {}, path.join(copy, 'tools/skills.mjs'), { nodeArgs: ['--import', pathToFileURL(shim).href] });
  assert.notEqual(result.status, 0); assert.match(result.stderr, /simulated filesystem failure/);
  assert.deepEqual(await tree(target), before);
}));

test('missing or tampered engine cache never executes or downloads implicitly', async () => fixture(async dir => {
  const script = path.join(source, 'impeccable/scripts/sentinel-engine.mjs');
  const env = { IMPECCABLE_HOME: dir };
  const missing = cli(['engine-probe'], env, script);
  assert.notEqual(missing.status, 0); assert.match(missing.stderr, /not set up/);
  assert.deepEqual(await fs.readdir(dir), []);
  const lock = JSON.parse(await fs.readFile(path.join(source, 'impeccable/scripts/sentinel-engine.json')));
  const pin = lock.assets[`${process.platform}-${process.arch}`];
  assert.ok(pin, 'test platform must have a pinned engine');
  const folder = path.join(dir, 'sentinel', lock.version, pin.sha256); await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(path.join(folder, process.platform === 'win32' ? 'impeccable.exe' : 'impeccable'), 'altered bytes');
  const result = cli(['engine-probe'], env, script);
  assert.notEqual(result.status, 0); assert.match(result.stderr, /differs from its pin/);
}));

test('an update replaces unchanged owned copies and verifies the new source', async () => fixture(async dir => {
  const copy = path.join(dir, 'source'); await fs.mkdir(path.join(copy, 'tools'), { recursive: true });
  await fs.cp(source, path.join(copy, 'skills'), { recursive: true });
  await fs.copyFile(path.join(root, 'tools/skills.mjs'), path.join(copy, 'tools/skills.mjs'));
  const target = path.join(dir, 'project'); await fs.mkdir(target);
  const args = ['--host', 'codex', '--target', target, '--skills', 'tldr'];
  ok(cli(args));
  const newSource = path.join(copy, 'skills/tldr/SKILL.md');
  await fs.appendFile(newSource, '\nUpdated source.\n');
  const script = path.join(copy, 'tools/skills.mjs');
  assert.notEqual(cli([...args, '--check'], {}, script).status, 0);
  ok(cli(args, {}, script));
  ok(cli([...args, '--check'], {}, script));
  assert.deepEqual(await fs.readFile(path.join(target, '.agents/skills/tldr/SKILL.md')), await fs.readFile(newSource));
}));

test('a skill symlink or redirected destination never writes through to its target', async () => fixture(async dir => {
  const outside = path.join(dir, 'outside'); await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, 'keep'), 'user content');
  const project = path.join(dir, 'project'); await fs.mkdir(project);
  const dest = path.join(project, '.agents/skills'); await fs.mkdir(dest, { recursive: true });
  await fs.symlink(outside, path.join(dest, 'tldr'), process.platform === 'win32' ? 'junction' : 'dir');
  const args = ['--host', 'codex', '--target', project, '--skills', 'tldr'];
  assert.notEqual(cli(args).status, 0);
  assert.deepEqual(await fs.readdir(outside), ['keep']);
  await fs.unlink(path.join(dest, 'tldr'));
  await fs.rmdir(dest);
  await fs.symlink(outside, dest, process.platform === 'win32' ? 'junction' : 'dir');
  const result = cli(args);
  assert.notEqual(result.status, 0); assert.match(result.stderr, /symlink in destination/);
  assert.deepEqual(await fs.readdir(outside), ['keep']);
}));

test('removing a dependency without an installed root explains why it must stay', async () => fixture(async dir => {
  const args = ['--host', 'codex', '--target', dir];
  ok(cli([...args, '--skills', 'documents']));
  const before = await tree(dir);
  const result = cli([...args, '--remove', '--skills', 'tldr']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /tldr is not an installed root; still required by doc-view/);
  assert.deepEqual(await tree(dir), before);
  ok(cli([...args, '--remove', '--skills', 'all']));
}));

const internal = ['babysit-pr', 'file-pr', 'modernize', 'takeover'];
for (const host of ['codex', 'claude', 'copilot', 'kiro']) {
  test(`${host}: twelve commands package helpers without registering them`, async () => fixture(async dir => {
    const args = ['--host', host, '--target', dir];
    ok(cli([...args, '--skills', 'all']));
    const dest = path.join(dir, host === 'claude' ? '.claude/skills' : host === 'kiro' ? '.kiro/skills' : '.agents/skills');
    const installed = await tree(dest);
    const commands = Object.keys(installed).filter(file => file.endsWith('/SKILL.md')).map(file => file.split('/')[0]);
    assert.deepEqual(commands.sort(), Object.keys(catalog.skills).sort());
    for (const name of internal) {
      assert.ok(installed[`full-stop/references/${name}.md`]);
      assert.equal(await exists(path.join(dest, name)), false);
      const before = await tree(dir);
      assert.notEqual(cli([...args, '--skills', name]).status, 0);
      assert.deepEqual(await tree(dir), before);
    }
  }));
}

for (const selection of ['all', 'file-pr']) test(`retired ${selection} roots require safe removal before installing current commands`, async () => fixture(async dir => {
  const copy = path.join(dir, 'previous');
  await fs.mkdir(path.join(copy, 'tools'), { recursive: true });
  await fs.cp(source, path.join(copy, 'skills'), { recursive: true });
  await fs.copyFile(path.join(root, 'tools/skills.mjs'), path.join(copy, 'tools/skills.mjs'));
  const previous = structuredClone(catalog);
  for (const name of internal) {
    previous.skills[name] = { visibility: 'public', requires: [] };
    previous.groups.all.push(name);
    const folder = path.join(copy, 'skills', name);
    await fs.mkdir(folder);
    await fs.writeFile(path.join(folder, 'SKILL.md'), `---\nname: ${name}\ndescription: Previous public command.\n---\n`);
  }
  previous.skills['file-pr'].requires = ['tldr', 'unslop'];
  await fs.writeFile(path.join(copy, 'skills/catalog.json'), JSON.stringify(previous));
  const project = path.join(dir, 'project'); await fs.mkdir(project);
  const args = ['--host', 'codex', '--target', project];
  ok(cli([...args, '--skills', selection], {}, path.join(copy, 'tools/skills.mjs')));
  const before = await tree(project);
  for (const action of [['--skills', 'all'], ['--check'], ['--skills', 'all', '--dry-run'],
    ['--remove', '--skills', 'all'], ['--remove', '--skills', 'file-pr'], ['--remove', '--skills', 'tldr']]) {
    const result = cli([...args, ...action]);
    assert.notEqual(result.status, 0); assert.match(result.stderr, /retired command roots: .*--remove without --skills/);
    assert.deepEqual(await tree(project), before);
  }
  const edited = path.join(project, '.agents/skills/file-pr/SKILL.md');
  const original = await fs.readFile(edited);
  await fs.appendFile(edited, '\nUser edit\n');
  const changed = await tree(project);
  const refused = cli([...args, '--remove']);
  assert.notEqual(refused.status, 0); assert.match(refused.stderr, /managed skill was edited: file-pr/);
  assert.deepEqual(await tree(project), changed);
  await fs.writeFile(edited, original);
  ok(cli([...args, '--remove']));
  ok(cli([...args, '--skills', 'all']));
  ok(cli([...args, '--check']));
  const dest = path.join(project, '.agents/skills');
  for (const name of internal) assert.equal(await exists(path.join(dest, name)), false);
  assert.equal(Object.keys(JSON.parse(await fs.readFile(path.join(dest, '.sentinel-skills.json'))).skills).length, 12);
}));
