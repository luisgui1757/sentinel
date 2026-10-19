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
    const manifest = { version: 1, sources: [{ id: 'sample', repository: 'example/skills', ref: 'main', revision: pin,
      paths: { 'bundle/': 'skills/sample/' }, required: ['UPSTREAM.md', 'LICENSE'], rename: { 'skills/sample/SKILL.md': 'skills/sample/UPSTREAM.md' },
      patches: { 'skills/sample/UPSTREAM.md': 'upstream/sample.patch.json' } }] };
    const write = (name, text) => fs.writeFile(path.join(root, name), text);
    await write('upstream/imports.json', encode(manifest));
    await write('upstream/sample.patch.json', encode({ replace: [{ before: 'Upstream intro\n', after: 'Scoped intro\n' }], append: 'Credit {{revision}}\n' }));
    const versions = {
      [pin]: { 'bundle/SKILL.md': 'Upstream intro\nKeep original rules.\n', 'bundle/LICENSE': 'Original license\n', 'bundle/reference/obsolete.md': 'Old reference\n' },
      [next]: { 'bundle/SKILL.md': 'Upstream intro\nKeep new rules.\n', 'bundle/LICENSE': 'New license\n', 'bundle/reference/new.md': 'New reference\n' },
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

test('imports reproduce pinned bytes, adapt one file and preserve local wrappers', async () => fixture(async f => {
  await fs.mkdir(path.join(f.root, 'skills/sample'), { recursive: true });
  await f.write('skills/sample/SKILL.md', 'Local wrapper\n');
  await f.invoke('sync');
  const before = await snapshot(f.root);
  await f.invoke('sync');
  await f.invoke('verify');
  await f.invoke('check', () => { throw new Error('Offline check attempted network'); });
  assert.deepEqual(await snapshot(f.root), before);
  assert.equal(await fs.readFile(path.join(f.root, 'skills/sample/SKILL.md'), 'utf8'), 'Local wrapper\n');
  assert.equal(await fs.readFile(path.join(f.root, 'skills/sample/UPSTREAM.md'), 'utf8'), `Scoped intro\nKeep original rules.\nCredit ${pin}\n`);
  assert.equal(await fs.readFile(path.join(f.root, 'skills/sample/LICENSE'), 'utf8'), 'Original license\n');
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

const faults = {
  patch: /Patch conflict/, repeated: /Patch conflict/, symlink: /Unsupported upstream entry/,
  truncated: /Incomplete upstream tree/, missing: /Missing upstream path/, license: /Missing required import/,
  collision: /Unowned destination/, network: /Upstream request failed \(503\)/, traversal: /Unsupported upstream entry/,
};
for (const [fault, expected] of Object.entries(faults)) {
  test(`${fault}: invalid updates leave the entire bundle unchanged`, async () => fixture(async f => {
    await f.invoke('sync');
    let transport = f.fetchImpl;
    if (fault === 'patch') f.versions[next]['bundle/SKILL.md'] = 'Changed intro\n';
    if (fault === 'repeated') f.versions[next]['bundle/SKILL.md'] = 'Upstream intro\nUpstream intro\n';
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

test('only one explicitly reviewed patch variant may match', async () => fixture(async f => {
  const patch = { replace: [{ before: ['Old supported intro\n', 'Upstream intro\n'], after: 'Scoped intro\n' }] };
  await f.write('upstream/sample.patch.json', encode(patch));
  await f.invoke('sync'); await f.invoke('update'); await f.invoke('verify');
  patch.replace[0].before.push('Upstream intro\n');
  await f.write('upstream/sample.patch.json', encode(patch));
  const before = await snapshot(f.root);
  await assert.rejects(f.invoke('sync'), /Patch conflict/);
  assert.deepEqual(await snapshot(f.root), before);
}));

for (const valid of [true, false]) test(`engine update: ${valid ? 'locks all matching assets' : 'missing digest blocks every change'}`, async () => fixture(async f => {
  const platforms = ['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64', 'win32-x64'];
  const engine = { version: '1.0.0', assets: {} };
  const assets = version => platforms.map(platform => {
    const name = `impeccable-${platform === 'win32-x64' ? 'windows-x64.exe' : platform}`;
    return { name, browser_download_url: `https://github.com/pbakaus/impeccable/releases/download/engine-v${version}/${name}`, digest: `sha256:${'a'.repeat(64)}`, size: 100 };
  });
  for (const [i, asset] of assets('1.0.0').entries()) engine.assets[platforms[i]] = { url: asset.browser_download_url, sha256: asset.digest.slice(7), bytes: asset.size };
  await fs.mkdir(path.join(f.root, 'skills/impeccable/scripts'), { recursive: true });
  await f.write('skills/impeccable/scripts/sentinel-engine.json', encode(engine));
  f.manifest.sources.push({ id: 'impeccable', repository: 'pbakaus/impeccable', ref: 'main', revision: pin,
    paths: { 'engine/': 'skills/impeccable/scripts/' }, required: ['scripts/VERSION'] });
  f.versions[pin]['engine/VERSION'] = '1.0.0\n';
  f.versions[next]['engine/VERSION'] = '2.0.0\n';
  await f.write('upstream/imports.json', encode(f.manifest));
  const transport = async url => {
    if (!url.includes('/releases/')) return f.fetchImpl(url);
    const version = url.split('engine-v')[1];
    const release = { tag_name: `engine-v${version}`, draft: false, prerelease: false, assets: assets(version) };
    if (!valid && version === '2.0.0') delete release.assets[0].digest;
    return Response.json(release);
  };
  await f.invoke('sync', transport);
  const before = await snapshot(f.root);
  if (!valid) {
    await assert.rejects(f.invoke('update', transport), /Missing verified engine asset/);
    assert.deepEqual(await snapshot(f.root), before);
  } else {
    await f.invoke('update', transport);
    await f.invoke('check'); await f.invoke('verify', transport);
    const result = JSON.parse(await fs.readFile(path.join(f.root, 'skills/impeccable/scripts/sentinel-engine.json')));
    assert.equal(result.version, '2.0.0');
    assert.equal(Object.keys(result.assets).length, 5);
    assert.match(result.assets['linux-x64'].url, /engine-v2\.0\.0/);
    const current = await snapshot(f.root);
    await assert.rejects(f.invoke('verify', async url => {
      const response = await transport(url);
      if (!url.includes('/releases/')) return response;
      const release = await response.json();
      release.assets[0].digest = `sha256:${'b'.repeat(64)}`;
      return Response.json(release);
    }), /engine pin differ from the lock/);
    assert.deepEqual(await snapshot(f.root), current);
    result.assets['linux-x64'].sha256 = 'b'.repeat(64);
    await f.write('skills/impeccable/scripts/sentinel-engine.json', encode(result));
    await assert.rejects(f.invoke('check'), /Engine pins changed locally/);
  }
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
  assert.match(git(['show', '--format=%B', '--no-patch']), /chore\(deps\): update pinned upstream skills/);
  assert.ok(calls.some(call => call[0] === 'gh' && call.includes('--draft')));
  assert.ok(!calls.flat().some(arg => ['--force', '--force-with-lease', 'merge', 'review'].includes(arg)));
  await assert.rejects(propose({ command, update: () => assert.fail('must not update') }), /branch already exists/);
}));

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
