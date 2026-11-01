#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const DEFAULT_SOURCES = ['js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'mts', 'cts', 'py', 'go', 'rs', 'java', 'kt', 'scala', 'cs', 'swift', 'rb', 'php',
  'c', 'cc', 'cpp', 'cxx', 'h', 'hh', 'hpp', 'hxx', 'ipp', 'inl'].map(ext => `**/*.${ext}`);
const TOOLS = ['scan', 'go', 'cargo', 'cmake', 'jsonl', 'declared'];
const KINDS = ['import', 'include', 'link', 'generates', 'declared'];
const JS = /\.(m|c)?(j|t)sx?$/, PY = /\.py$/, C = /\.(c|cc|cpp|cxx|h|hh|hpp|hxx|ipp|inl)$/;
const JS_EXT = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.d.ts'];
export class UsageError extends Error {}

const cache = new Map();
export function glob(pattern) {
  if (cache.has(pattern)) return cache.get(pattern);
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (pattern.startsWith('**/', i)) { re += '(?:.*/)?'; i += 2; }
    else if (pattern.startsWith('/**', i) && i + 3 === pattern.length) { re += '(?:/.*)?'; i += 2; }
    else if (pattern.startsWith('**', i)) { re += '.*'; i += 1; }
    else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  const compiled = new RegExp(`^${re}$`);
  cache.set(pattern, compiled);
  return compiled;
}
const matches = (patterns, value) => (patterns ?? []).some(p => glob(p).test(value));
const posix = p => p.split(path.sep).join('/');

function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`git ${args[0]}: ${(result.stderr || result.error?.message || '').trim()}`);
  return result.stdout;
}

export function loadMap(file) {
  let map;
  try { map = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { throw new UsageError(`cannot read ${file}: ${error.message}`); }
  const problems = [];
  if (map.version !== 1) problems.push('version must be 1');
  if (!map.features || typeof map.features !== 'object') problems.push('features must be an object');
  if (!Array.isArray(map.owners)) problems.push('owners must be a list');
  const features = map.features ?? {};
  for (const [id, f] of Object.entries(features)) {
    if (!/^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)*$/i.test(id)) problems.push(`feature id ${id}: use letters, digits, . _ - and / between levels`);
    for (const key of ['mayUse', 'mustNotReach']) if (f[key] !== undefined && !(Array.isArray(f[key]) && f[key].every(p => typeof p === 'string'))) problems.push(`${id}.${key} must be a list of feature patterns`);
  }
  for (const [i, o] of (map.owners ?? []).entries()) {
    if (typeof o?.path !== 'string' || typeof o?.feature !== 'string') problems.push(`owners[${i}] needs path and feature`);
    else if (!features[o.feature]) problems.push(`owners[${i}] names the unknown feature ${o.feature}`);
  }
  for (const [i, e] of (map.extract ?? []).entries()) {
    if (!TOOLS.includes(e?.tool)) problems.push(`extract[${i}].tool must be one of ${TOOLS.join(', ')}`);
    else if (['scan', 'jsonl', 'declared'].includes(e.tool) && !Array.isArray(e.files)) problems.push(`extract[${i}] (${e.tool}) needs files`);
    else if (e.tool === 'jsonl' && typeof e.path !== 'string') problems.push(`extract[${i}] (jsonl) needs path`);
    else if (e.tool === 'cmake' && typeof e.build !== 'string') problems.push(`extract[${i}] (cmake) needs build`);
  }
  for (const [i, d] of (map.declared ?? []).entries()) {
    if (typeof d?.from !== 'string' || typeof d?.to !== 'string') problems.push(`declared[${i}] needs from and to`);
    else if (d.kind && !KINDS.includes(d.kind)) problems.push(`declared[${i}].kind must be one of ${KINDS.join(', ')}`);
  }
  if (problems.length) throw new UsageError(`${file}:\n  ${problems.join('\n  ')}`);
  return { sources: DEFAULT_SOURCES, ignore: [], extract: [], declared: [], ...map };
}

export function sourceFiles(root, map) {
  const all = git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']).split('\0').filter(Boolean);
  const self = posix(path.relative(fs.realpathSync(root), fs.realpathSync(fileURLToPath(import.meta.url))));
  return [...new Set(all)].filter(f => f !== self && matches(map.sources, f) && !matches(map.ignore, f) && fs.existsSync(path.join(root, f))).sort();
}

export function ownerOf(map, file) {
  for (let i = map.owners.length - 1; i >= 0; i--) if (glob(map.owners[i].path).test(file)) return { feature: map.owners[i].feature, rule: i };
  return null;
}

const stripJsComments = text => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`\\])\/\/.*$/gm, '$1');

function workspacePackages(root, files) {
  const packages = new Map();
  for (const file of git(root, ['ls-files', '-z', '--', 'package.json', '**/package.json']).split('\0').filter(Boolean)) {
    try {
      const name = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')).name;
      if (name) packages.set(name, path.posix.dirname(file) === '.' ? '' : path.posix.dirname(file));
    } catch {}
  }
  return packages;
}

function resolveJs(exists, from, spec, packages) {
  let base;
  if (spec.startsWith('.')) base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
  else {
    const name = [...packages.keys()].filter(n => spec === n || spec.startsWith(`${n}/`)).sort((a, b) => b.length - a.length)[0];
    if (name === undefined) return null;
    const dir = packages.get(name), rest = spec.slice(name.length).replace(/^\//, '');
    if (!rest) return dir ? `${dir}/` : null;
    base = path.posix.join(dir, rest);
  }
  if (base.startsWith('..')) return null;
  const swap = { '.js': ['.ts', '.tsx'], '.jsx': ['.tsx'], '.mjs': ['.mts'], '.cjs': ['.cts'] }[path.posix.extname(base)];
  if (!exists(base) && swap) for (const ext of swap) if (exists(base.slice(0, -path.posix.extname(base).length) + ext)) return base.slice(0, -path.posix.extname(base).length) + ext;
  for (const ext of JS_EXT) if (exists(base + ext)) return base + ext;
  for (const ext of JS_EXT.slice(1)) if (exists(`${base}/index${ext}`)) return `${base}/index${ext}`;
  return spec.startsWith('.') ? null : `${base}/`;
}

function resolvePy(exists, isDir, from, mod, dots, roots) {
  const parts = mod ? mod.split('.') : [];
  const bases = dots ? [path.posix.join(path.posix.dirname(from), ...Array(dots - 1).fill('..'))] : roots;
  for (const base of bases) {
    const stem = path.posix.join(base, ...parts);
    if (stem.startsWith('..')) continue;
    for (const candidate of [`${stem}.py`, `${stem}/__init__.py`]) if (exists(candidate)) return candidate;
    if (parts.length && isDir(stem)) return `${stem}/`;
  }
  return null;
}

export function scan(root, entry, files) {
  const set = new Set(files), dirs = new Set();
  for (const f of files) for (let d = path.posix.dirname(f); d !== '.'; d = path.posix.dirname(d)) dirs.add(d);
  const exists = f => set.has(f), isDir = d => dirs.has(d);
  const packages = files.some(f => JS.test(f)) ? workspacePackages(root, files) : new Map();
  const roots = entry.roots ?? ['', 'src'];
  const includeDirs = entry.includeDirs ?? [];
  const edges = [], covered = files.filter(f => matches(entry.files, f));
  for (const from of covered) {
    const text = fs.readFileSync(path.join(root, from), 'utf8');
    const add = (to, kind) => { if (to && to !== from) edges.push({ from, to, kind, tool: 'scan', config: '' }); };
    if (JS.test(from)) {
      const code = stripJsComments(text);
      for (const m of code.matchAll(/(?:\bimport\s+(?:type\s+)?(?:[\w*{}\s,$]+\s+from\s+)?|\bexport\s+(?:type\s+)?(?:\*(?:\s+as\s+\w+)?|\{[^}]*\})\s+from\s+|\brequire\s*\(\s*|\bimport\s*\(\s*)['"]([^'"\n]+)['"]/g)) {
        add(resolveJs(exists, from, m[1], packages), 'import');
      }
    } else if (PY.test(from)) {
      const joined = text.replace(/\r\n/g, '\n').replace(/#[^\n]*/g, '').replace(/\(([^()]*)\)/g, (m, inner) => (inner.includes('\n') ? `(${inner.replace(/\n/g, ' ')})` : m)).replace(/\\\n/g, ' ');
      for (const line of joined.split('\n')) {
        const fromImport = line.match(/^\s*from\s+(\.*)([\w.]*)\s+import\s+(.+)/);
        if (fromImport) {
          const [, dots, mod, names] = fromImport;
          let hit = false;
          for (const name of names.replace(/[()\\]/g, '').split(',').map(n => n.trim().split(/\s+/)[0]).filter(n => /^\w+$/.test(n))) {
            const sub = resolvePy(exists, isDir, from, mod ? `${mod}.${name}` : name, dots.length, roots);
            if (sub && !sub.endsWith('/')) { add(sub, 'import'); hit = true; }
          }
          if (!hit) add(resolvePy(exists, isDir, from, mod, dots.length, roots), 'import');
          continue;
        }
        const plain = line.match(/^\s*import\s+([\w.]+(?:\s+as\s+\w+)?(?:\s*,\s*[\w.]+(?:\s+as\s+\w+)?)*)/);
        if (plain) for (const mod of plain[1].split(',').map(m => m.trim().split(/\s+/)[0])) add(resolvePy(exists, isDir, from, mod, 0, roots), 'import');
      }
    } else if (C.test(from)) {
      for (const m of text.matchAll(/^\s*#\s*include\s*([<"])([^>"]+)[>"]/gm)) {
        const local = m[1] === '"' ? [path.posix.dirname(from)] : [];
        const hit = [...local, ...includeDirs].map(d => path.posix.normalize(path.posix.join(d, m[2]))).find(exists);
        add(hit, 'include');
      }
    }
  }
  return { edges, covered };
}

function relativeTo(base, absolute, prefix) {
  const rel = posix(path.relative(base, absolute));
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  const joined = path.posix.join(prefix || '.', rel);
  return joined === '.' ? '' : joined;
}
const folder = dir => (dir ? `${dir}/` : '');

function runTool(root, entry, cmd, args) {
  if (entry.input) return fs.readFileSync(path.join(root, entry.input), 'utf8');
  const result = spawnSync(cmd, args, { cwd: path.join(root, entry.dir ?? '.'), encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`${cmd} failed in ${entry.dir ?? '.'}: ${(result.error?.message || result.stderr).trim().slice(0, 300)}`);
  return result.stdout;
}

export function jsonObjects(text) {
  const out = [];
  let depth = 0, start = -1, inString = false, escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') inString = false; continue; }
    if (c === '"') inString = true;
    else if (c === '{') { if (depth++ === 0) start = i; }
    else if (c === '}' && --depth === 0) out.push(JSON.parse(text.slice(start, i + 1)));
  }
  return out;
}

export function goList(root, entry, files) {
  const prefix = entry.dir ?? '';
  const pkgs = jsonObjects(runTool(root, entry, 'go', ['list', '-e', '-json', './...']));
  const broken = pkgs.find(p => p.Module?.Main && p.Error);
  if (broken) throw new Error(`go list could not load ${broken.ImportPath}: ${broken.Error.Err}`);
  const main = pkgs.find(p => p.Module?.Main)?.Module?.Dir;
  if (!main) throw new Error(`go list in ${prefix || '.'} gave no main module`);
  const local = new Map();
  for (const p of pkgs.filter(p => p.Module?.Main && p.Dir)) {
    const dir = relativeTo(main, p.Dir, prefix);
    if (dir === null) continue;
    const own = [...(p.GoFiles ?? []), ...(p.CgoFiles ?? [])].map(f => path.posix.join(dir, f));
    local.set(p.ImportPath, { files: own, to: dir ? `${dir}/` : own[0], imports: p.Imports ?? [] });
  }
  const edges = [];
  for (const pkg of local.values()) {
    for (const imp of pkg.imports) {
      const target = local.get(imp);
      if (target?.to) for (const from of pkg.files) edges.push({ from, to: target.to, kind: 'import', tool: 'go', config: '' });
    }
  }
  const scope = prefix ? `${prefix}/**/*.go` : '**/*.go';
  return { edges, covered: files.filter(f => glob(scope).test(f)) };
}

const LIB_KINDS = ['lib', 'rlib', 'dylib', 'cdylib', 'staticlib', 'proc-macro'];

export function cargo(root, entry, files) {
  const prefix = entry.dir ?? '';
  const meta = JSON.parse(runTool(root, entry, 'cargo', ['metadata', '--format-version', '1', '--no-deps']));
  const endpointOf = new Map();
  for (const p of meta.packages) {
    const manifest = path.dirname(p.manifest_path);
    const target = p.targets?.find(t => t.kind.some(k => LIB_KINDS.includes(k))) ?? p.targets?.find(t => t.kind.includes('bin'));
    const dir = relativeTo(meta.workspace_root, target ? path.dirname(target.src_path) : manifest, prefix);
    if (dir !== null) endpointOf.set(posix(manifest), dir ? `${dir}/` : relativeTo(meta.workspace_root, target.src_path, prefix));
  }
  const edges = [];
  for (const p of meta.packages) {
    const from = endpointOf.get(posix(path.dirname(p.manifest_path)));
    if (!from) continue;
    for (const dep of p.dependencies ?? []) {
      if (!dep.path || dep.kind === 'dev') continue;
      const to = endpointOf.get(posix(dep.path)) ?? folder(relativeTo(meta.workspace_root, dep.path, prefix) ?? '');
      if (to && to !== from) edges.push({ from, to, kind: 'link', tool: 'cargo', config: '' });
    }
  }
  const scope = prefix ? `${prefix}/**/*.rs` : '**/*.rs';
  return { edges, covered: files.filter(f => glob(scope).test(f)) };
}

export function cmake(root, entry, files) {
  const reply = path.join(root, entry.build, '.cmake/api/v1/reply');
  if (!fs.existsSync(reply)) {
    throw new Error(`no CMake File API reply in ${entry.build}. Create ${entry.build}/.cmake/api/v1/query/codemodel-v2 as an empty file, then run the CMake configure step again.`);
  }
  const index = fs.readdirSync(reply).filter(f => /^index-.*\.json$/.test(f)).sort().at(-1);
  if (!index) throw new Error(`no index file in ${reply}`);
  const read = name => JSON.parse(fs.readFileSync(path.join(reply, name), 'utf8'));
  const object = read(index).objects?.find(o => o.kind === 'codemodel');
  if (!object) throw new Error(`the CMake reply in ${entry.build} has no codemodel. Add the query file codemodel-v2.`);
  const model = read(object.jsonFile);
  const sourceRoot = model.paths.source;
  const edges = [], covered = new Set();
  const rel = p => (path.isAbsolute(p) ? relativeTo(sourceRoot, p, entry.dir ?? '') : posix(path.posix.join(entry.dir ?? '', p)));
  for (const config of model.configurations) {
    const targets = new Map(config.targets.map(t => [t.id, read(t.jsonFile)]));
    const dirOf = t => { const d = rel(t.paths.source); return d && d !== '.' ? folder(d) : rel(t.sources?.[0]?.path ?? '') ?? ''; };
    for (const t of targets.values()) {
      for (const s of t.sources ?? []) { const f = rel(s.path); if (f) covered.add(f); }
      for (const dep of t.dependencies ?? []) {
        const target = targets.get(dep.id);
        if (target && dirOf(target) && dirOf(t) && dirOf(target) !== dirOf(t)) edges.push({ from: dirOf(t), to: dirOf(target), kind: 'link', tool: 'cmake', config: config.name || 'default' });
      }
    }
  }
  return { edges, covered: files.filter(f => covered.has(f)) };
}

function jsonl(root, entry, files) {
  const file = path.join(root, entry.path);
  if (!fs.existsSync(file)) throw new Error(`the edge file ${entry.path} does not exist. Run the tool that writes it first.`);
  const edges = fs.readFileSync(file, 'utf8').split('\n').filter(l => l.trim()).map((line, i) => {
    const e = JSON.parse(line);
    if (typeof e.from !== 'string' || typeof e.to !== 'string') throw new Error(`${entry.path}:${i + 1}: an edge needs from and to`);
    return { from: e.from, to: e.to, kind: KINDS.includes(e.kind) ? e.kind : 'import', tool: e.tool ?? 'jsonl', config: e.config ?? '' };
  });
  return { edges, covered: files.filter(f => matches(entry.files, f)) };
}

export function extract(root, map, files) {
  const edges = [], coverage = new Map(files.map(f => [f, new Set()]));
  for (const entry of map.extract) {
    const run = { scan, go: goList, cargo, cmake, jsonl, declared: (r, e, fs2) => ({ edges: [], covered: fs2.filter(f => matches(e.files, f)) }) }[entry.tool];
    const result = run(root, entry, files);
    edges.push(...result.edges);
    for (const f of result.covered) coverage.get(f)?.add(entry.tool);
  }
  for (const d of map.declared) edges.push({ from: d.from, to: d.to, kind: d.kind ?? 'declared', tool: 'declared', config: '' });
  const lines = [...new Set(edges.map(e => JSON.stringify({ from: e.from, to: e.to, kind: e.kind, tool: e.tool, config: e.config })))].sort();
  return { edges: lines.map(line => JSON.parse(line)), coverage };
}

export function analyze(root, map) {
  const files = sourceFiles(root, map);
  const { edges, coverage } = extract(root, map, files);
  const owner = new Map();
  const featureOf = p => {
    if (!owner.has(p)) owner.set(p, ownerOf(map, p)?.feature ?? null);
    return owner.get(p);
  };
  const unowned = files.filter(f => !featureOf(f));
  const uncovered = files.filter(f => coverage.get(f).size === 0);
  const declaredOnly = files.filter(f => coverage.get(f).size === 1 && coverage.get(f).has('declared'));
  const graph = new Map(), examples = new Map(), violations = new Map();
  for (const e of edges) {
    const a = featureOf(e.from), b = featureOf(e.to);
    if (!a || !b || a === b) continue;
    if (!graph.has(a)) graph.set(a, new Map());
    graph.get(a).set(b, (graph.get(a).get(b) ?? 0) + 1);
    if (!examples.has(`${a} ${b}`)) examples.set(`${a} ${b}`, e);
    const allowed = map.features[a].mayUse;
    if (allowed && !matches(allowed, b)) {
      violations.set(`may-use|${e.from}|${e.to}`, { rule: 'may-use', from: a, to: b, detail: `${e.from} -> ${e.to} (${e.kind}, ${e.tool})` });
    }
  }
  for (const [id, f] of Object.entries(map.features)) {
    if (!f.mustNotReach?.length) continue;
    const prev = new Map([[id, null]]), queue = [id];
    while (queue.length) {
      const cur = queue.shift();
      for (const next of graph.get(cur)?.keys() ?? []) if (!prev.has(next)) { prev.set(next, cur); queue.push(next); }
    }
    for (const target of prev.keys()) {
      if (target === id || !matches(f.mustNotReach, target)) continue;
      const route = [];
      for (let n = target; n; n = prev.get(n)) route.unshift(n);
      violations.set(`must-not-reach|${id}|${target}`, { rule: 'must-not-reach', from: id, to: target, detail: route.join(' -> ') });
    }
  }
  return { files, edges, coverage, unowned, uncovered, declaredOnly, graph, examples, violations, featureOf };
}

export function currentBaseline(result) {
  return { version: 1, violations: [...result.violations.keys()].sort(), unowned: [...result.unowned].sort(), uncovered: [...result.uncovered].sort() };
}

function readBaseline(text) {
  const b = JSON.parse(text);
  return { violations: b.violations ?? [], unowned: b.unowned ?? [], uncovered: b.uncovered ?? [] };
}

export function check(root, map, { baselineFile, base } = {}) {
  const result = analyze(root, map);
  const current = currentBaseline(result);
  const baseline = baselineFile && fs.existsSync(baselineFile) ? readBaseline(fs.readFileSync(baselineFile, 'utf8')) : { violations: [], unowned: [], uncovered: [] };
  const diff = key => ({ added: current[key].filter(x => !baseline[key].includes(x)), fixed: baseline[key].filter(x => !current[key].includes(x)) });
  const report = { result, current, violations: diff('violations'), unowned: diff('unowned'), uncovered: diff('uncovered'), grown: [] };
  if (base && baselineFile) {
    if (spawnSync('git', ['rev-parse', '--verify', '--quiet', `${base}^{commit}`], { cwd: root }).status !== 0) throw new UsageError(`--base ${base} is not a commit`);
    const rel = posix(path.relative(root, baselineFile));
    const old = spawnSync('git', ['show', `${base}:${rel}`], { cwd: root, encoding: 'utf8' });
    if (old.status === 0) {
      const before = readBaseline(old.stdout);
      for (const key of ['violations', 'unowned', 'uncovered']) for (const x of baseline[key]) if (!before[key].includes(x)) report.grown.push(`${key}: ${x}`);
    }
  }
  report.failed = report.violations.added.length + report.unowned.added.length + report.uncovered.added.length + report.grown.length > 0;
  return report;
}

function collapse(id, level) {
  return level ? id.split('/').slice(0, level).join('/') : id;
}

export function view(result, map, { format = 'dot', level = 0, limit = 500 } = {}) {
  const nodes = new Map(), links = new Map();
  for (const f of result.files) {
    const id = result.featureOf(f);
    if (!id) continue;
    const n = collapse(id, level);
    nodes.set(n, (nodes.get(n) ?? 0) + 1);
  }
  for (const id of Object.keys(map.features)) if (!nodes.has(collapse(id, level))) nodes.set(collapse(id, level), 0);
  const bad = new Set([...result.violations.values()].filter(v => v.rule === 'may-use').map(v => `${collapse(v.from, level)} ${collapse(v.to, level)}`));
  for (const [a, targets] of result.graph) for (const [b, count] of targets) {
    const x = collapse(a, level), y = collapse(b, level);
    if (x !== y) links.set(`${x} ${y}`, (links.get(`${x} ${y}`) ?? 0) + count);
  }
  const sorted = [...links.entries()].sort((p, q) => q[1] - p[1] || p[0].localeCompare(q[0]));
  const shown = sorted.slice(0, limit), cut = sorted.length - shown.length;
  const names = [...nodes.keys()].sort();
  const uncovered = new Map();
  for (const f of result.uncovered) { const id = result.featureOf(f); if (id) uncovered.set(collapse(id, level), (uncovered.get(collapse(id, level)) ?? 0) + 1); }
  const label = n => `${n} (${nodes.get(n)} files${uncovered.get(n) ? `, ${uncovered.get(n)} with no extractor` : ''})`;
  if (format === 'mermaid') {
    const idx = new Map(names.map((n, i) => [n, `n${i}`]));
    const lines = ['flowchart LR', ...names.map(n => `  ${idx.get(n)}["${label(n).replace(/"/g, "'")}"]`)];
    const red = [];
    shown.forEach(([key, count], i) => { const [a, b] = key.split(' '); lines.push(`  ${idx.get(a)} -->|${count}| ${idx.get(b)}`); if (bad.has(key)) red.push(i); });
    if (red.length) lines.push(`  linkStyle ${red.join(',')} stroke:#d00,stroke-width:2px`);
    if (cut) lines.push(`  %% ${cut} more edges are not shown. Use a lower --level.`);
    return `${lines.join('\n')}\n`;
  }
  if (format !== 'dot') throw new UsageError('--format must be dot or mermaid');
  const q = s => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  const lines = ['digraph featuremap {', '  rankdir=LR;', '  node [shape=box];', ...names.map(n => `  ${q(n)} [label=${q(label(n))}];`)];
  for (const [key, count] of shown) { const [a, b] = key.split(' '); lines.push(`  ${q(a)} -> ${q(b)} [label="${count}"${bad.has(key) ? ', color=red' : ''}];`); }
  if (cut) lines.push(`  // ${cut} more edges are not shown. Use a lower --level.`);
  return `${lines.join('\n')}\n}\n`;
}

export function why(result, from, to) {
  const prev = new Map([[from, null]]), queue = [from];
  while (queue.length && !prev.has(to)) {
    const cur = queue.shift();
    for (const next of [...(result.graph.get(cur)?.keys() ?? [])].sort()) if (!prev.has(next)) { prev.set(next, cur); queue.push(next); }
  }
  if (!prev.has(to) || from === to) return null;
  const route = [];
  for (let n = to; prev.get(n) !== null; n = prev.get(n)) route.unshift({ from: prev.get(n), to: n, example: result.examples.get(`${prev.get(n)} ${n}`) });
  return route;
}

export function closure(result, feature, reverse = false) {
  const next = new Map();
  for (const [a, targets] of result.graph) for (const b of targets.keys()) {
    const [x, y] = reverse ? [b, a] : [a, b];
    if (!next.has(x)) next.set(x, new Set());
    next.get(x).add(y);
  }
  const seen = new Set([feature]), queue = [feature];
  while (queue.length) for (const n of next.get(queue.shift()) ?? []) if (!seen.has(n)) { seen.add(n); queue.push(n); }
  seen.delete(feature);
  return [...seen].sort();
}

function show(result, map, id) {
  const f = map.features[id];
  if (!f) throw new UsageError(`unknown feature: ${id}`);
  const files = result.files.filter(x => result.featureOf(x) === id);
  const gaps = new Set(result.uncovered);
  const usedBy = [...result.graph].filter(([, t]) => t.has(id)).map(([a, t]) => ({ feature: a, edges: t.get(id) })).sort((a, b) => a.feature.localeCompare(b.feature));
  return {
    feature: id, description: f.description ?? '', owners: map.owners.filter(o => o.feature === id).map(o => o.path), files: files.length,
    uncovered: files.filter(x => gaps.has(x)), mayUse: f.mayUse ?? null, mustNotReach: f.mustNotReach ?? [],
    uses: [...(result.graph.get(id) ?? [])].map(([b, edges]) => ({ feature: b, edges })).sort((a, b) => a.feature.localeCompare(b.feature)), usedBy,
    violations: [...result.violations.values()].filter(v => v.from === id),
  };
}

function options(argv) {
  const opts = { args: [], json: false, level: 0, format: 'dot', reverse: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') opts.json = true;
    else if (a === '--reverse') opts.reverse = true;
    else if (['--map', '--baseline', '--base', '--out', '--format', '--level', '--limit'].includes(a)) {
      if (argv[i + 1] === undefined) throw new UsageError(`${a} needs a value`);
      opts[a.slice(2)] = ['--level', '--limit'].includes(a) ? Number(argv[++i]) : argv[++i];
    } else if (a.startsWith('--')) throw new UsageError(`unknown option: ${a}`);
    else opts.args.push(a);
  }
  return opts;
}

const USAGE = `usage: featuremap.mjs <command> [--map featuremap.json]
  check [--base REV] [--baseline FILE]   exit 0 pass, 1 new violation or gap, 2 error
  baseline [--baseline FILE]             write the current violations and gaps
  extract [--out FILE]                   write the edges as sorted JSON lines
  where PATH [--json]                    the feature that owns PATH
  show FEATURE [--json]                  files, rules, and the features that it uses and that use it
  why FROM TO [--json]                   the shortest path from feature FROM to feature TO
  closure FEATURE [--reverse] [--json]   each feature that FEATURE reaches, or that reaches it
  graph [--format dot|mermaid] [--level N] [--limit 500]`;

function print(json, value, text) {
  console.log(json ? JSON.stringify(value, null, 2) : text);
}

export function main(argv, cwd = process.cwd()) {
  const [command, ...rest] = argv;
  if (!command || command === '--help' || command === 'help') { console.log(USAGE); return 0; }
  const opts = options(rest);
  const root = git(cwd, ['rev-parse', '--show-toplevel']).trim();
  const mapFile = path.resolve(cwd, opts.map ?? path.join(root, 'featuremap.json'));
  const map = loadMap(mapFile);
  const baselineFile = path.resolve(cwd, opts.baseline ?? path.join(path.dirname(mapFile), 'featuremap.baseline.json'));
  if (command === 'check') {
    const r = check(root, map, { baselineFile, base: opts.base });
    const { result } = r;
    const extracted = result.files.length - result.uncovered.length - result.declaredOnly.length;
    console.log(`featuremap: ${result.files.length} source files, ${Object.keys(map.features).length} features, ${result.edges.length} edges`);
    console.log(`coverage: ${extracted} extracted, ${result.declaredOnly.length} declared only, ${result.uncovered.length} with no extractor`);
    if (result.uncovered.length || result.declaredOnly.length) console.log('INCOMPLETE: a file with no extractor, or with declared edges only, can hide a violation. The check is not clean for those files.');
    console.log(`unowned: ${result.unowned.length}, violations: ${result.violations.size}`);
    for (const id of r.violations.added) { const v = result.violations.get(id); console.log(`NEW ${v.rule} ${v.from} -> ${v.to}: ${v.detail}`); }
    for (const f of r.unowned.added) console.log(`NEW unowned ${f}: add an owner pattern`);
    for (const f of r.uncovered.added) console.log(`NEW uncovered ${f}: add an extract entry for it`);
    for (const g of r.grown) console.log(`GREW baseline ${g}: the baseline must not grow without review`);
    const fixed = r.violations.fixed.length + r.unowned.fixed.length + r.uncovered.fixed.length;
    if (fixed) console.log(`${fixed} entries of the baseline are fixed. Run "featuremap.mjs baseline" to shrink it.`);
    console.log(r.failed ? 'FAIL' : 'PASS');
    return r.failed ? 1 : 0;
  }
  const result = analyze(root, map);
  if (command === 'baseline') {
    fs.writeFileSync(baselineFile, `${JSON.stringify(currentBaseline(result), null, 2)}\n`);
    console.log(`wrote ${posix(path.relative(cwd, baselineFile)) || baselineFile}: ${result.violations.size} violations, ${result.unowned.length} unowned, ${result.uncovered.length} uncovered`);
  } else if (command === 'extract') {
    const text = result.edges.map(e => JSON.stringify(e)).join('\n') + (result.edges.length ? '\n' : '');
    if (opts.out) fs.writeFileSync(path.resolve(cwd, opts.out), text); else process.stdout.write(text);
  } else if (command === 'where') {
    const file = posix(path.relative(root, path.resolve(cwd, opts.args[0] ?? '.')));
    const hit = ownerOf(map, file) ?? ownerOf(map, `${file}/`);
    const cov = result.coverage.get(file);
    print(opts.json, { path: file, feature: hit?.feature ?? null, owner: hit ? map.owners[hit.rule].path : null, coverage: cov ? [...cov] : null },
      hit ? `${file}: ${hit.feature} (owner pattern ${map.owners[hit.rule].path}${cov ? `, extracted by ${[...cov].join(', ') || 'nothing'}` : ''})` : `${file}: no owner`);
  } else if (command === 'show') {
    const s = show(result, map, opts.args[0]);
    print(opts.json, s, [`${s.feature}: ${s.files} files${s.description ? ` - ${s.description}` : ''}`, `owners: ${s.owners.join(', ')}`,
      `may use: ${s.mayUse ? s.mayUse.join(', ') || '(nothing)' : '(any)'}`, `must not reach: ${s.mustNotReach.join(', ') || '(none)'}`,
      `uses: ${s.uses.map(u => `${u.feature} (${u.edges})`).join(', ') || '(none)'}`, `used by: ${s.usedBy.map(u => `${u.feature} (${u.edges})`).join(', ') || '(none)'}`,
      ...s.violations.map(v => `violation ${v.rule} -> ${v.to}: ${v.detail}`), ...(s.uncovered.length ? [`no extractor: ${s.uncovered.join(', ')}`] : [])].join('\n'));
  } else if (command === 'why') {
    const [from, to] = opts.args;
    if (!map.features[from] || !map.features[to]) throw new UsageError('why needs two known features');
    const route = why(result, from, to);
    print(opts.json, route, route ? route.map(h => `${h.from} -> ${h.to}: ${h.example.from} -> ${h.example.to} (${h.example.kind})`).join('\n') : `${from} does not reach ${to}`);
  } else if (command === 'closure') {
    if (!map.features[opts.args[0]]) throw new UsageError(`unknown feature: ${opts.args[0]}`);
    const list = closure(result, opts.args[0], opts.reverse);
    print(opts.json, list, list.join('\n') || '(none)');
  } else if (command === 'graph') {
    const text = view(result, map, { format: opts.format, level: opts.level, limit: opts.limit ?? 500 });
    if (opts.out) fs.writeFileSync(path.resolve(cwd, opts.out), text); else process.stdout.write(text);
  } else {
    throw new UsageError(`unknown command: ${command}\n${USAGE}`);
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (error) {
    console.error(`featuremap: ${error.message}`);
    process.exitCode = 2;
  }
}
