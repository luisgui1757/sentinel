#!/usr/bin/env node
// Import data only. Never run upstream scripts or install into a user profile.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const manifestPath = 'upstream/imports.json';
const lockPath = 'upstream/lock.json';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const fail = message => { throw new Error(message); };
const safe = name => typeof name === 'string' && /^[A-Za-z0-9_.\/-]+$/.test(name)
  && !name.startsWith('/') && !name.split('/').some(p => p === '..' || p === '.' || p === '.git');

async function read(root, name) {
  if (!safe(name)) fail(`Unsafe path: ${name}`);
  let current = root;
  for (const part of name.split('/')) {
    current = path.join(current, part);
    try { if ((await fs.lstat(current)).isSymbolicLink()) fail(`Symlink: ${name}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; return null; }
  }
  return fs.readFile(current);
}

// A mapping copies one upstream file to one or more destinations, or one
// upstream directory to one destination directory. Destinations are under skills/.
async function inputs(root) {
  const bytes = await read(root, manifestPath);
  const manifest = JSON.parse(bytes);
  if (manifest.version !== 2 || !Array.isArray(manifest.sources) || !manifest.sources.length) fail('Invalid import manifest');
  const ids = new Set();
  for (const source of manifest.sources) {
    if (!/^[a-z][a-z0-9-]*$/.test(source.id) || ids.has(source.id)
      || !/^[\w-]+\/[\w.-]+$/.test(source.repository) || !/^[0-9a-f]{40}$/.test(source.revision)
      || !/^[\w./-]+$/.test(source.ref) || !source.paths || !Object.keys(source.paths).length
      || !Array.isArray(source.required) || !source.required.length) fail('Invalid source');
    ids.add(source.id);
    for (const [from, to] of Object.entries(source.paths)) {
      const targets = [to].flat();
      if (!safe(from) || !targets.length || (from.endsWith('/') && targets.length !== 1)
        || targets.some(dest => !safe(dest) || !dest.startsWith('skills/') || from.endsWith('/') !== dest.endsWith('/'))) {
        fail(`Invalid mapping: ${from}`);
      }
    }
  }
  return { manifest, hashes: { [manifestPath]: sha(bytes) } };
}

// A locked file has the sha256 of the upstream bytes. A file that Sentinel
// edited also has `local`, the sha256 of the edited bytes.
async function checkedFiles(root, lock) {
  if (lock.version !== 1 || !lock.files || !Object.keys(lock.files).length) fail('Invalid import lock');
  for (const [file, entry] of Object.entries(lock.files)) {
    if (!safe(file) || !file.startsWith('skills/') || ![entry.sha256, entry.local ?? entry.sha256].every(h => /^[0-9a-f]{64}$/.test(h))) fail('Invalid locked file');
    const bytes = await read(root, file);
    if (!bytes || sha(bytes) !== (entry.local ?? entry.sha256)) fail(`Imported file changed or missing; run --sync to keep an edit: ${file}`);
    if (entry.local && /^<{7} /m.test(bytes)) fail(`Merge conflict not resolved: ${file}`);
    if (process.platform !== 'win32'
      && !!((await fs.stat(path.join(root, file))).mode & 0o111) !== entry.executable) fail(`Imported file mode changed: ${file}`);
  }
}

// Merge the upstream change from base to theirs into ours. A conflict stays in
// the result as conflict markers.
async function merge(ours, base, theirs) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sentinel-merge-'));
  try {
    const files = ['local', 'base', 'upstream'].map(name => path.join(dir, name));
    await Promise.all([ours, base, theirs].map((bytes, i) => fs.writeFile(files[i], bytes)));
    const result = spawnSync('git', ['merge-file', '-p', '-L', 'local', '-L', 'base', '-L', 'upstream', ...files], { maxBuffer: 64 * 1024 * 1024 });
    if (result.error || result.status === null || result.status > 127) fail(`git merge-file failed: ${result.error?.message || result.stderr}`);
    return { bytes: result.stdout, conflict: result.status > 0 };
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

export async function run({ root, mode, fetchImpl = fetch }) {
  if (!['check', 'verify', 'sync', 'update'].includes(mode)) fail('Use --check, --verify, --sync or --update');
  root = await fs.realpath(root);
  const writing = mode === 'sync' || mode === 'update';
  const guard = path.join(root, '.upstream-sync.local');
  if (writing) await fs.mkdir(guard); // Never steal another import's lock.
  try {
    const config = await inputs(root);
    const oldBytes = await read(root, lockPath);
    const old = oldBytes ? JSON.parse(oldBytes) : null;
    if (!old && mode !== 'sync') fail('Import lock missing; run --sync');
    if (old && mode !== 'sync') await checkedFiles(root, old);
    if (mode === 'check') {
      if (JSON.stringify(old.inputs) !== JSON.stringify(config.hashes)) fail('Import inputs changed; run --sync');
      return 'Import hashes and inputs match';
    }
    let total = 0;
    async function download(url, limit = 8 * 1024 * 1024) {
      const headers = { 'User-Agent': 'sentinel-upstream' };
      if (url.startsWith('https://api.github.com/') && process.env.GH_TOKEN) headers.Authorization = `Bearer ${process.env.GH_TOKEN}`;
      const response = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(60000), headers });
      if (!response.ok) fail(`Upstream request failed (${response.status}): ${url}`);
      const chunks = []; let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length; total += chunk.length;
        if (size > limit || total > 64 * 1024 * 1024) fail('Upstream response too large');
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    }
    const api = async suffix => JSON.parse(await download(`https://api.github.com/repos/${suffix}`));
    const files = {}, output = new Map(), conflicts = [];
    for (const source of config.manifest.sources) {
      const priorRevision = source.revision;
      if (mode === 'update') {
        const commit = await api(`${source.repository}/commits/${encodeURIComponent(source.ref)}`);
        if (!/^[0-9a-f]{40}$/.test(commit.sha)) fail('Invalid upstream revision');
        source.revision = commit.sha;
      }
      const tree = await api(`${source.repository}/git/trees/${source.revision}?recursive=1`);
      if (tree.truncated || !Array.isArray(tree.tree)) fail('Incomplete upstream tree');
      const selected = new Map();
      for (const [from, to] of Object.entries(source.paths)) {
        const entries = tree.tree.filter(item => from.endsWith('/') ? item.path.startsWith(from) && item.type !== 'tree' : item.path === from);
        if (!entries.length) fail(`Missing upstream path: ${from}`);
        for (const entry of entries) {
          if (!safe(entry.path) || entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode)) fail(`Unsupported upstream entry: ${entry.path}`);
          for (const target of [to].flat()) {
            const dest = from.endsWith('/') ? target + entry.path.slice(from.length) : target;
            if (!safe(dest) || selected.has(dest) || output.has(dest)) fail(`Duplicate or unsafe destination: ${dest}`);
            selected.set(dest, entry);
          }
        }
      }
      for (const name of source.required) if (!selected.has(`skills/${name}`)) fail(`Missing required import: ${name}`);
      const downloads = new Map(), originals = new Map();
      for (const [dest, entry] of selected) {
        const from = entry.path;
        if (!downloads.has(from)) downloads.set(from, await download(`https://raw.githubusercontent.com/${source.repository}/${source.revision}/${from}`));
        const original = downloads.get(from);
        if (old?.sources[source.id] === source.revision && old.files[dest]?.path === from
          && (old.files[dest].sha256 !== sha(original) || old.files[dest].executable !== (entry.mode === '100755'))) {
          fail(`Pinned upstream bytes differ from the lock: ${dest}`);
        }
        originals.set(dest, original);
      }
      // Keep the old pin when no imported file changed, so unrelated upstream commits make no update.
      const previous = Object.entries(old?.files || {}).filter(([, entry]) => entry.source === source.id);
      if (mode === 'update' && previous.length === selected.size && previous.every(([dest, entry]) =>
        originals.has(dest) && sha(originals.get(dest)) === entry.sha256
        && entry.path === selected.get(dest).path && entry.executable === (selected.get(dest).mode === '100755'))) source.revision = priorRevision;
      for (const [dest, entry] of selected) {
        const theirs = originals.get(dest), prior = old?.files[dest];
        const ours = prior && await read(root, dest);
        let bytes = theirs;
        // Keep a Sentinel edit, and merge an upstream change into it.
        if (ours && sha(ours) !== prior.sha256) {
          if (sha(theirs) === prior.sha256) bytes = ours;
          else {
            const base = await download(`https://raw.githubusercontent.com/${source.repository}/${old.sources[source.id]}/${prior.path}`);
            if (sha(base) !== prior.sha256) fail(`Pinned upstream bytes differ from the lock: ${dest}`);
            const merged = await merge(ours, base, theirs);
            bytes = merged.bytes;
            if (merged.conflict) conflicts.push(dest);
          }
        }
        files[dest] = { source: source.id, path: entry.path, sha256: sha(theirs),
          ...(sha(bytes) !== sha(theirs) && { local: sha(bytes) }), executable: entry.mode === '100755' };
        output.set(dest, bytes);
      }
    }
    if (mode === 'update') {
      output.set(manifestPath, json(config.manifest));
      config.hashes[manifestPath] = sha(output.get(manifestPath));
    }
    const next = { version: 1, inputs: config.hashes, sources: Object.fromEntries(config.manifest.sources.map(source => [source.id, source.revision])), files };
    output.set(lockPath, json(next));
    if (mode === 'verify') {
      if (!oldBytes.equals(output.get(lockPath))) fail('Upstream bytes differ from the lock');
      return 'Pinned upstream sources reproduce the bundle';
    }
    // Prepare everything before touching the bundle. Restore all files if any write fails.
    const originals = new Map(), modes = new Map();
    for (const file of new Set([...Object.keys(old?.files || {}), ...output.keys()])) {
      const before = await read(root, file);
      if (before && !old?.files[file] && file.startsWith('skills/') && !before.equals(output.get(file))) fail(`Unowned destination: ${file}`);
      originals.set(file, before);
      if (before) modes.set(file, (await fs.stat(path.join(root, file))).mode);
    }
    const changed = [...originals.keys()].filter(file => {
      const before = originals.get(file), after = output.get(file);
      return before ? !after || !before.equals(after)
        || (process.platform !== 'win32' && files[file] && !!(modes.get(file) & 0o111) !== files[file].executable) : !!after;
    });
    try {
      for (const file of changed) {
        const target = path.join(root, file), bytes = output.get(file);
        if (bytes) {
          await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, bytes);
          if (files[file]) await fs.chmod(target, files[file].executable ? 0o755 : 0o644);
        }
        else await fs.unlink(target);
      }
      for (const [file, bytes] of output) if (!(await read(root, file)).equals(bytes)) fail(`Import readback failed: ${file}`);
    } catch (error) {
      for (const file of changed) {
        const before = originals.get(file);
        if (before) { await fs.writeFile(path.join(root, file), before); await fs.chmod(path.join(root, file), modes.get(file)); }
        else await fs.rm(path.join(root, file), { force: true });
      }
      throw error;
    }
    if (conflicts.length) {
      const error = new Error(`Merge conflicts in ${conflicts.join(', ')}. Resolve them, then run --sync`);
      error.conflicts = conflicts;
      throw error;
    }
    return `Imported ${Object.keys(files).length} files; ${changed.length} changed`;
  } finally { if (writing) await fs.rmdir(guard); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) fail('Usage: node tools/upstream.mjs --check|--verify|--sync|--update');
    console.log(await run({ root: fileURLToPath(new URL('../', import.meta.url)), mode: process.argv[2].replace(/^--/, '') }));
  } catch (error) { console.error(`upstream: ${error.message}`); process.exitCode = 1; }
}
