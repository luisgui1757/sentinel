#!/usr/bin/env node
// Import data only. Never run upstream scripts or install into a user profile.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const manifestPath = 'upstream/imports.json';
const lockPath = 'upstream/lock.json';
const enginePath = 'skills/impeccable/scripts/sentinel-engine.json';
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

async function inputs(root) {
  const bytes = await read(root, manifestPath);
  const manifest = JSON.parse(bytes);
  if (manifest.version !== 1 || !Array.isArray(manifest.sources) || !manifest.sources.length) fail('Invalid import manifest');
  const hashes = { [manifestPath]: sha(bytes) }, patches = {}, ids = new Set();
  const engine = await read(root, enginePath);
  if (engine) hashes[enginePath] = sha(engine);
  for (const source of manifest.sources) {
    if (!/^[a-z][a-z0-9-]*$/.test(source.id) || ids.has(source.id)
      || !/^[\w-]+\/[\w.-]+$/.test(source.repository) || !/^[0-9a-f]{40}$/.test(source.revision)
      || !/^[\w./-]+$/.test(source.ref) || !source.paths || !Object.keys(source.paths).length
      || !Array.isArray(source.required) || !source.required.length) fail('Invalid source');
    ids.add(source.id);
    for (const [from, to] of Object.entries(source.paths)) {
      if (!safe(from) || !safe(to) || !to.startsWith(`skills/${source.id}/`)
        || from.endsWith('/') !== to.endsWith('/')) fail(`Invalid mapping: ${from}`);
    }
    for (const [from, to] of Object.entries(source.rename || {})) {
      if (!safe(from) || !safe(to) || !from.startsWith(`skills/${source.id}/`)
        || !to.startsWith(`skills/${source.id}/`)) fail('Invalid rename');
    }
    for (const [target, patch] of Object.entries(source.patches || {})) {
      if (!safe(target) || !target.startsWith(`skills/${source.id}/`) || !safe(patch) || !patch.startsWith('upstream/')) fail('Invalid patch path');
      const data = await read(root, patch);
      if (!data) fail(`Missing patch: ${patch}`);
      hashes[patch] = sha(data);
      const parsed = JSON.parse(data);
      if (!Array.isArray(parsed.replace) || parsed.replace.some(item => ![item.before].flat().length
        || [item.before].flat().some(before => typeof before !== 'string' || !before) || typeof item.after !== 'string')
        || (parsed.append !== undefined && typeof parsed.append !== 'string')) fail(`Invalid patch: ${patch}`);
      patches[target] = parsed;
    }
  }
  return { manifest, hashes, patches };
}

async function checkedFiles(root, lock) {
  if (lock.version !== 1 || !lock.files || !Object.keys(lock.files).length) fail('Invalid import lock');
  for (const [file, entry] of Object.entries(lock.files)) {
    if (!safe(file) || !file.startsWith('skills/') || !/^[0-9a-f]{64}$/.test(entry.sha256)) fail('Invalid locked file');
    const bytes = await read(root, file);
    if (!bytes || sha(bytes) !== entry.sha256) fail(`Imported file changed or missing: ${file}`);
    if (process.platform !== 'win32' && entry.executable !== undefined
      && !!((await fs.stat(path.join(root, file))).mode & 0o111) !== entry.executable) fail(`Imported file mode changed: ${file}`);
  }
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
    if (old) await checkedFiles(root, old);
    else if (mode !== 'sync') fail('Import lock missing; run --sync');
    if (old?.inputs[enginePath] && old.inputs[enginePath] !== config.hashes[enginePath]) fail('Engine pins changed locally');
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
    const files = {}, output = new Map();
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
          let dest = from.endsWith('/') ? to + entry.path.slice(from.length) : to;
          dest = source.rename?.[dest] || dest;
          if (!safe(dest) || selected.has(dest) || output.has(dest)) fail(`Duplicate or unsafe destination: ${dest}`);
          selected.set(dest, entry);
        }
      }
      for (const name of source.required) if (!selected.has(`skills/${source.id}/${name}`)) fail(`Missing required import: ${name}`);
      const originals = new Map();
      for (const [dest, entry] of selected) {
        const from = entry.path;
        const original = await download(`https://raw.githubusercontent.com/${source.repository}/${source.revision}/${from}`);
        if (old?.sources?.[source.id] === source.revision && old.files[dest]?.path === from
          && (old.files[dest].upstreamSha256 !== sha(original) || old.files[dest].executable !== (entry.mode === '100755'))) {
          fail(`Pinned upstream bytes differ from the lock: ${dest}`);
        }
        originals.set(dest, original);
      }
      const previous = Object.entries(old?.files || {}).filter(([, entry]) => entry.source === source.id);
      if (mode === 'update' && previous.length === selected.size && previous.every(([dest, entry]) =>
        originals.has(dest) && sha(originals.get(dest)) === entry.upstreamSha256
        && entry.path === selected.get(dest).path && entry.executable === (selected.get(dest).mode === '100755'))) source.revision = priorRevision;
      for (const [dest, entry] of selected) {
        const original = originals.get(dest);
        let bytes = original;
        if (config.patches[dest]) {
          const patch = config.patches[dest];
          let text = bytes.toString('utf8');
          for (const replacement of patch.replace) {
            const matches = [replacement.before].flat().filter(before => text.split(before).length === 2);
            if (matches.length !== 1) fail(`Patch conflict: ${dest}`);
            text = text.replace(matches[0], () => replacement.after);
          }
          text += (patch.append || '').replaceAll('{{revision}}', source.revision);
          bytes = Buffer.from(text);
        }
        files[dest] = { source: source.id, path: entry.path, upstreamSha256: sha(original), sha256: sha(bytes), executable: entry.mode === '100755' };
        output.set(dest, bytes);
      }
      for (const target of Object.keys(source.patches || {})) if (!selected.has(target)) fail(`Unused patch: ${target}`);
    }
    if (mode === 'update') {
      output.set(manifestPath, json(config.manifest));
      config.hashes[manifestPath] = sha(output.get(manifestPath));
    }
    // Engine releases travel with their matching skill VERSION, never a floating launcher.
    const versionFile = output.get('skills/impeccable/scripts/VERSION');
    if (versionFile) {
      const engineBytes = await read(root, enginePath);
      const engine = JSON.parse(engineBytes);
      const version = versionFile.toString().trim();
      if (!/^\d+\.\d+\.\d+$/.test(version)) fail('Invalid engine version');
      const release = await api(`pbakaus/impeccable/releases/tags/engine-v${version}`);
      if (release.tag_name !== `engine-v${version}` || release.draft || release.prerelease) fail('Engine release is not stable');
      const platforms = ['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64', 'win32-x64'];
      if (JSON.stringify(Object.keys(engine.assets).sort()) !== JSON.stringify(platforms)) fail('Unexpected engine platforms');
      for (const platform of platforms) {
        const name = `impeccable-${platform === 'win32-x64' ? 'windows-x64.exe' : platform}`;
        const asset = release.assets?.find(item => item.name === name);
        const url = `https://github.com/pbakaus/impeccable/releases/download/engine-v${version}/${name}`;
        if (!asset || asset.browser_download_url !== url || !/^sha256:[0-9a-f]{64}$/.test(asset.digest) || !Number.isSafeInteger(asset.size) || asset.size < 1) fail(`Missing verified engine asset: ${name}`);
        engine.assets[platform] = { url, sha256: asset.digest.slice(7), bytes: asset.size };
      }
      engine.version = version;
      output.set(enginePath, json(engine));
      config.hashes[enginePath] = sha(output.get(enginePath));
    }
    const next = { version: 1, inputs: config.hashes, sources: Object.fromEntries(config.manifest.sources.map(source => [source.id, source.revision])), files };
    output.set(lockPath, json(next));
    if (mode === 'verify') {
      if (!oldBytes.equals(output.get(lockPath))) fail('Upstream bytes or engine pin differ from the lock');
      return 'Pinned upstream sources reproduce the bundle';
    }
    // Prepare everything before touching the bundle. Restore all files if any write fails.
    const originals = new Map(), modes = new Map();
    for (const file of new Set([...Object.keys(old?.files || {}), ...output.keys()])) {
      const before = await read(root, file);
      if (before && !old?.files[file] && file.startsWith('skills/') && file !== enginePath && !before.equals(output.get(file))) fail(`Unowned destination: ${file}`);
      originals.set(file, before);
      if (before) modes.set(file, (await fs.stat(path.join(root, file))).mode);
    }
    if (old) await checkedFiles(root, old);
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
    return `Imported ${Object.keys(files).length} files; ${changed.length} changed`;
  } finally { if (writing) await fs.rmdir(guard); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) fail('Usage: node tools/upstream.mjs --check|--verify|--sync|--update');
    console.log(await run({ root: fileURLToPath(new URL('../', import.meta.url)), mode: process.argv[2].replace(/^--/, '') }));
  } catch (error) { console.error(`upstream: ${error.message}`); process.exitCode = 1; }
}
