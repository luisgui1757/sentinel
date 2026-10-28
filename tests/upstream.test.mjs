import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { run } from '../tools/upstream.mjs';
import { propose } from '../tools/propose-upstream.mjs';

const pin = '1'.repeat(40), next = '2'.repeat(40);
const encode = value => `${JSON.stringify(value, null, 2)}\n`;
async function fixture(fn) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sentinel-import-'));
  try {
    await fs.mkdir(path.join(root, 'upstream'));
    const manifest = { version: 2, sources: [{ id: 'sample', repository: 'example/skills', ref: 'main', revision: pin,
      paths: { 'bundle/': 'skills/sample/' }, required: ['sample/SKILL.md', 'sample/LICENSE'] }] };
    const write = (name, text) => fs.writeFile(path.join(root, name), text);
    await write('upstream/imports.json', encode(manifest));
    const versions = {
      [pin]: { 'bundle/SKILL.md': 'Upstream intro\nWork steps.\nKeep original rules.\n', 'bundle/LICENSE': 'Original license\n', 'bundle/reference/obsolete.md': 'Old reference\n' },
      [next]: { 'bundle/SKILL.md': 'Upstream intro\nWork steps.\nKeep new rules.\n', 'bundle/LICENSE': 'New license\n', 'bundle/reference/new.md': 'New reference\n' },
    };
    const requests = [];
    const fetchImpl = async url => {
      requests.push(url);
      if (url.endsWith('/commits/main')) return Response.json({ sha: next });
      const revision = url.match(/[12]{40}/)?.[0];
      if (!revision) throw new Error(`Unexpected request ${url}`);
      if (url.includes('/git/trees/')) return Response.json({ truncated: false,
        tree: Object.keys(versions[revision]).map(file => ({ path: file, type: 'blob', mode: '100644' })) });
      const name = url.split(`${revision}/`)[1];
      return new Response(versions[revision][name] ?? '', { status: name in versions[revision] ? 200 : 404 });
    };
    const invoke = (mode, transport = fetchImpl) => run({ root, mode, fetchImpl: transport });
    await fn({ root, manifest, versions, requests, write, invoke, fetchImpl });
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}
async function snapshot(root) {
  const files = {};
  for (const entry of await fs.readdir(root, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) {
      const file = path.join(entry.parentPath, entry.name);
      files[path.relative(root, file)] = (await fs.readFile(file)).toString('base64');
    }
  }
  return files;
}

test('imports reproduce pinned bytes and keep the files that Sentinel owns', async () => fixture(async f => {
  await fs.mkdir(path.join(f.root, 'skills'), { recursive: true });
  await f.write('skills/profiles.txt', 'core sample\n');
  await f.invoke('sync');
  const before = await snapshot(f.root);
  await f.invoke('sync');
  await f.invoke('verify');
  await f.invoke('check', () => { throw new Error('Offline check attempted network'); });
  assert.deepEqual(await snapshot(f.root), before);
  assert.equal(await fs.readFile(path.join(f.root, 'skills/profiles.txt'), 'utf8'), 'core sample\n');
  assert.equal(await fs.readFile(path.join(f.root, 'skills/sample/SKILL.md'), 'utf8'), 'Upstream intro\nWork steps.\nKeep original rules.\n');
  assert.equal(await fs.readFile(path.join(f.root, 'skills/sample/LICENSE'), 'utf8'), 'Original license\n');
}));

test('one upstream file can go to several skills, and only into skills/', async () => fixture(async f => {
  f.manifest.sources[0].paths['bundle/LICENSE'] = ['skills/one/LICENSE', 'skills/two/LICENSE'];
  await f.write('upstream/imports.json', encode(f.manifest));
  await f.invoke('sync');
  for (const dest of ['sample', 'one', 'two']) {
    assert.equal(await fs.readFile(path.join(f.root, `skills/${dest}/LICENSE`), 'utf8'), 'Original license\n');
  }
  await f.invoke('check'); await f.invoke('verify');
  f.manifest.sources[0].paths['bundle/LICENSE'] = 'tools/LICENSE';
  await f.write('upstream/imports.json', encode(f.manifest));
  const before = await snapshot(f.root);
  await assert.rejects(f.invoke('sync'), /Invalid mapping/);
  assert.deepEqual(await snapshot(f.root), before);
}));

test('updates lock revisions, additions and removals together, then stop changing', async () => fixture(async f => {
  await f.invoke('sync');
  await f.invoke('update');
  await assert.rejects(fs.access(path.join(f.root, 'skills/sample/reference/obsolete.md')));
  assert.equal(await fs.readFile(path.join(f.root, 'skills/sample/reference/new.md'), 'utf8'), 'New reference\n');
  const manifest = JSON.parse(await fs.readFile(path.join(f.root, 'upstream/imports.json')));
  assert.equal(manifest.sources[0].revision, next);
  await f.invoke('check'); await f.invoke('verify');
  const before = await snapshot(f.root);
  await f.invoke('update');
  assert.deepEqual(await snapshot(f.root), before);
}));

test('edited imports and stale inputs fail offline checks without writing', async () => fixture(async f => {
  await f.invoke('sync');
  await f.write('skills/sample/LICENSE', 'User edit\n');
  const before = await snapshot(f.root);
  await assert.rejects(f.invoke('check'), /changed or missing/);
  await assert.rejects(f.invoke('update'), /changed or missing/);
  assert.deepEqual(await snapshot(f.root), before);
  await f.write('skills/sample/LICENSE', 'Original license\n');
  f.manifest.sources[0].revision = next;
  await f.write('upstream/imports.json', encode(f.manifest));
  await assert.rejects(f.invoke('check'), /inputs changed/);
}));

test('sync keeps a Sentinel edit, and update merges the upstream change into it', async () => fixture(async f => {
  await f.invoke('sync');
  const skill = path.join(f.root, 'skills/sample/SKILL.md');
  await f.write('skills/sample/SKILL.md', 'Sentinel intro\nWork steps.\nKeep original rules.\n');
  await f.invoke('sync');
  await f.invoke('check'); await f.invoke('verify');
  assert.equal(await fs.readFile(skill, 'utf8'), 'Sentinel intro\nWork steps.\nKeep original rules.\n');
  await f.invoke('update');
  assert.equal(await fs.readFile(skill, 'utf8'), 'Sentinel intro\nWork steps.\nKeep new rules.\n');
  await f.invoke('check'); await f.invoke('verify');
}));

test('a conflict with a Sentinel edit fails checks until somebody resolves it', async () => fixture(async f => {
  await f.invoke('sync');
  await f.write('skills/sample/SKILL.md', 'Upstream intro\nWork steps.\nKeep Sentinel rules.\n');
  await f.invoke('sync');
  await assert.rejects(f.invoke('update'), error => error.conflicts?.join() === 'skills/sample/SKILL.md');
  assert.match(await fs.readFile(path.join(f.root, 'skills/sample/SKILL.md'), 'utf8'), /^<{7} local\n/m);
  await assert.rejects(f.invoke('check'), /conflict not resolved/);
  await f.write('skills/sample/SKILL.md', 'Upstream intro\nWork steps.\nKeep new Sentinel rules.\n');
  await f.invoke('sync');
  await f.invoke('check'); await f.invoke('verify');
  assert.equal(JSON.parse(await fs.readFile(path.join(f.root, 'upstream/lock.json'))).sources.sample, next);
}));

const faults = {
  symlink: /Unsupported upstream entry/,
  truncated: /Incomplete upstream tree/, missing: /Missing upstream path/, license: /Missing required import/,
  collision: /Unowned destination/, network: /Upstream request failed \(503\)/, traversal: /Unsupported upstream entry/,
};
for (const [fault, expected] of Object.entries(faults)) {
  test(`${fault}: invalid updates leave the entire bundle unchanged`, async () => fixture(async f => {
    await f.invoke('sync');
    let transport = f.fetchImpl;
    if (fault === 'symlink' || fault === 'truncated') transport = async url => {
      const response = await f.fetchImpl(url);
      if (!url.includes('/git/trees/')) return response;
      const body = await response.json();
      if (fault === 'symlink') body.tree[0].mode = '120000'; else body.truncated = true;
      return Response.json(body);
    };
    if (fault === 'missing') f.versions[next] = {};
    if (fault === 'license') delete f.versions[next]['bundle/LICENSE'];
    if (fault === 'network') transport = async () => new Response('unavailable', { status: 503 });
    if (fault === 'collision') {
      await fs.mkdir(path.join(f.root, 'skills/sample/reference'), { recursive: true });
      await f.write('skills/sample/reference/new.md', 'User file\n');
    }
    if (fault === 'traversal') f.versions[next]['bundle/../../outside'] = 'escape';
    const before = await snapshot(f.root);
    await assert.rejects(f.invoke('update', transport), expected);
    assert.deepEqual(await snapshot(f.root), before);
  }));
}

test('caught filesystem failures restore modified files and remove newly written files', async t => fixture(async f => {
  await f.invoke('sync');
  const before = await snapshot(f.root);
  const original = fs.writeFile;
  let writes = 0;
  const mocked = t.mock.method(fs, 'writeFile', async (...args) => {
    if (++writes === 3) throw new Error('disk failure');
    return original(...args);
  });
  await assert.rejects(f.invoke('update'), /disk failure/);
  mocked.mock.restore();
  assert.deepEqual(await snapshot(f.root), before);
}));

test('concurrent imports stop without removing the first lock', async () => fixture(async f => {
  await fs.mkdir(path.join(f.root, '.upstream-sync.local'));
  await assert.rejects(f.invoke('sync'), /EEXIST/);
  assert.ok((await fs.stat(path.join(f.root, '.upstream-sync.local'))).isDirectory());
}));

test('online verification rejects changed bytes even if local hashes still match', async () => fixture(async f => {
  await f.invoke('sync');
  f.versions[pin]['bundle/LICENSE'] = 'Different upstream bytes\n';
  const before = await snapshot(f.root);
  await assert.rejects(f.invoke('verify'), /differ from the lock/);
  assert.deepEqual(await snapshot(f.root), before);
}));

test('unrelated upstream commits do not create pin-only update noise', async () => fixture(async f => {
  await f.invoke('sync');
  f.versions[next] = { ...f.versions[pin], 'outside-bundle.md': 'Unrelated change\n' };
  const before = await snapshot(f.root);
  await f.invoke('update');
  assert.deepEqual(await snapshot(f.root), before);
}));

test('bot publishes one real Git commit and proposes a draft without merging', async () => fixture(async f => {
  const git = args => execFileSync('git', args, { cwd: f.root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git(['init', '-b', 'main']); git(['config', 'user.name', 'Fixture']); git(['config', 'user.email', 'fixture@example.test']);
  await f.invoke('sync');
  git(['add', '.']); git(['commit', '-m', 'fixture']);
  const remote = path.join(f.root, '.git', 'remote.git');
  git(['init', '--bare', remote]); git(['remote', 'add', 'origin', remote]); git(['push', 'origin', 'main']);
  const calls = [];
  const command = (name, args) => {
    calls.push([name, ...args]);
    if (name === 'git') return git(args);
    if (args[0] === 'pr' && args[1] === 'list') return '[]';
    if (args[0] === 'pr' && args[1] === 'create') return 'https://example.test/pull/1\n';
    if (args[0] === 'auth') return '';
    throw new Error('Unexpected external command');
  };
  assert.match(await propose({ command, update: () => f.invoke('update') }), /Created draft/);
  assert.equal(git(['rev-list', '--count', 'main..HEAD']).trim(), '1');
  assert.match(git(['ls-remote', '--heads', 'origin']), /refs\/heads\/codex\/upstream-skills/);
  assert.ok(calls.some(call => call[0] === 'gh' && call.includes('--draft')));
  assert.ok(!calls.flat().some(arg => ['--force', '--force-with-lease', 'merge', 'review'].includes(arg)));
  await assert.rejects(propose({ command, update: () => assert.fail('must not update') }), /branch already exists/);
}));

test('the bot opens a draft that names each merge conflict', async () => {
  let status = 0, body = '';
  const command = (name, args) => {
    if (name === 'git' && args[0] === 'status') return status++ ? ' M skills/a/SKILL.md\n' : '';
    if (name === 'gh' && args[1] === 'list') return '[]';
    if (name === 'gh' && args[1] === 'create') { body = args[args.indexOf('--body') + 1]; return 'https://example.test/pull/2\n'; }
    return '';
  };
  const update = async () => { throw Object.assign(new Error('conflict'), { conflicts: ['skills/a/SKILL.md'] }); };
  assert.match(await propose({ command, update }), /Created draft/);
  assert.match(body, /conflict with Sentinel edits in `skills\/a\/SKILL.md`/);
});

test('an existing update PR is left untouched', async () => {
  const command = (name, args) => name === 'git' && args[0] === 'status' ? '' : '[{"number":1,"isCrossRepository":false}]';
  assert.match(await propose({ command, update: () => assert.fail('must not update') }), /already open/);
});

test('a fork PR with the same branch name does not stop the bot', async () => {
  let updated = false;
  const command = name => name === 'gh' ? '[{"number":1,"isCrossRepository":true}]' : '';
  assert.match(await propose({ command, update: async () => { updated = true; } }), /pins are current/);
  assert.equal(updated, true);
});

test('the bot CLI rejects non-main refs and unapproved events before any external call', () => {
  for (const [ref, event] of [['refs/heads/feature', 'workflow_dispatch'], ['refs/heads/main', 'pull_request']]) {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('../tools/propose-upstream.mjs', import.meta.url))], {
      encoding: 'utf8', env: { PATH: '', SystemRoot: process.env.SystemRoot || '', GITHUB_REF: ref, GITHUB_EVENT_NAME: event },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /runs only on main, by schedule or manual dispatch/);
  }
});
