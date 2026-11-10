import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const work = process.env.EVAL_WORK;
export const tmp = process.env.EVAL_TMP;
export const final = () => fs.readFileSync(process.env.EVAL_FINAL, 'utf8');
export const trace = () => fs.readFileSync(process.env.EVAL_TRACE, 'utf8');
export const read = file => fs.existsSync(path.join(work, file)) ? fs.readFileSync(path.join(work, file), 'utf8') : null;
export const sh = (cmd, args, cwd = work) => spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout: 240000 });
export const git = (...args) => sh('git', args);
export const words = text => (text.match(/\S+/g) || []).length;
const checks = [];
export const check = (name, pass, detail = '') => checks.push({ name, pass: !!pass, detail: String(detail).slice(0, 300) });
export const note = (name, pass, detail = '') => checks.push({ name, pass: !!pass, detail: String(detail).slice(0, 300), info: true });
export const report = () => console.log(JSON.stringify({ checks }));

export function events(text = trace()) {
  return text.split('\n').filter(line => line.startsWith('{')).map(line => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
}

export function toolUses() {
  return events().flatMap(event => (event.message?.content ?? []).filter(part => part.type === 'tool_use'));
}

export function commands() {
  const found = [];
  for (const event of events()) {
    if (event.type === 'item.completed' && event.item?.type === 'command_execution') found.push(event.item.command);
    for (const part of event.message?.content ?? []) if (part.type === 'tool_use' && typeof part.input?.command === 'string') found.push(part.input.command);
  }
  return found;
}

export function executions(text) {
  const runs = [], pending = new Map();
  for (const event of events(text)) {
    if (event.type === 'item.completed' && event.item?.type === 'command_execution') runs.push({ command: event.item.command ?? '', output: String(event.item.aggregated_output ?? '') });
    for (const part of event.message?.content ?? []) {
      if (part.type === 'tool_use' && typeof part.input?.command === 'string') pending.set(part.id, part.input.command);
      if (part.type === 'tool_result' && pending.has(part.tool_use_id)) {
        const output = typeof part.content === 'string' ? part.content : (part.content ?? []).map(c => c.text ?? '').join('\n');
        runs.push({ command: pending.get(part.tool_use_id), output });
      }
    }
  }
  return runs;
}

export function gitLog() {
  const file = path.join(tmp, 'git.log');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => {
    const [cwd, ...args] = line.split('\t');
    return { cwd, args };
  }) : [];
}

export function gitCreatedDirs() {
  const valued = new Set(['-b', '-B', '--branch', '--depth', '-o', '--origin', '-c', '--config', '--reference', '--separate-git-dir', '-u', '--upload-pack', '--template', '-j', '--jobs', '--filter', '--reason']);
  const dirs = [];
  for (const { cwd, args } of gitLog()) {
    let base = cwd, rest = [...args];
    while (rest[0] === '-C') { base = path.resolve(base, rest[1]); rest = rest.slice(2); }
    const sub = rest[0] === 'clone' ? 'clone' : rest[0] === 'worktree' && rest[1] === 'add' ? 'worktree' : null;
    if (!sub) continue;
    const positional = [];
    const tokens = rest.slice(sub === 'clone' ? 1 : 2);
    for (let i = 0; i < tokens.length; i++) {
      if (valued.has(tokens[i])) { i++; continue; }
      if (!tokens[i].startsWith('-')) positional.push(tokens[i]);
    }
    const target = sub === 'clone' ? positional[1] ?? path.basename(positional[0] ?? '').replace(/\.git$/, '') : positional[0];
    if (target) dirs.push(path.resolve(base, target));
  }
  return [...new Set(dirs)];
}

export function toolOutputs() {
  const found = [];
  for (const event of events()) {
    if (event.type === 'item.completed' && event.item?.type === 'command_execution') found.push(String(event.item.aggregated_output ?? ''));
    for (const part of event.message?.content ?? []) {
      if (part.type !== 'tool_result') continue;
      found.push(typeof part.content === 'string' ? part.content : (part.content ?? []).map(c => c.text ?? '').join('\n'));
    }
  }
  return found;
}

export function createdDirs() {
  const valued = new Set(['-b', '-B', '--branch', '--depth', '-o', '--origin', '-c', '--config', '--reference', '--separate-git-dir', '-u', '--upload-pack', '--template', '-j', '--jobs', '--filter', '--reason']);
  const dirs = [];
  for (const command of commands()) {
    for (const match of command.matchAll(/git\s+(?:-C\s+\S+\s+)?(clone|worktree\s+add)\b([^;&|\n]*)/g)) {
      const tokens = match[2].trim().split(/\s+/).filter(Boolean).map(t => t.replace(/^["']|["']$/g, ''));
      const positional = [];
      for (let i = 0; i < tokens.length; i++) {
        if (valued.has(tokens[i])) { i++; continue; }
        if (!tokens[i].startsWith('-')) positional.push(tokens[i]);
      }
      const target = match[1] === 'clone' ? positional[1] ?? path.basename(positional[0] ?? '').replace(/\.git$/, '') : positional[0];
      if (target) dirs.push(path.resolve(work, target));
    }
  }
  return [...new Set(dirs)];
}

export function mermaidBlocks(text) {
  return [...text.matchAll(/```mermaid\s*\n([\s\S]*?)```/g)].map(match => match[1]);
}

export function mermaidRenders(source) {
  const dir = fs.mkdtempSync(path.join(tmp, 'mermaid-'));
  fs.writeFileSync(path.join(dir, 'chart.mmd'), source);
  fs.writeFileSync(path.join(dir, 'browser.json'), '{"args":["--no-sandbox"]}');
  const result = sh('npx', ['-y', '-p', '@mermaid-js/mermaid-cli@12.0.0', 'mmdc', '-q', '-p', 'browser.json', '-i', 'chart.mmd', '-o', 'chart.svg'], dir);
  const ok = result.status === 0 && fs.existsSync(path.join(dir, 'chart.svg'));
  fs.rmSync(dir, { recursive: true, force: true });
  return { ok, error: ok ? '' : `${result.stderr}`.split('\n').find(l => /error/i.test(l)) ?? 'render failed' };
}

export function steHardFaults(file) {
  const result = sh('npx', ['--yes', '--package', 'agent-ste@0.5.2', 'ste-lint', file], path.dirname(file));
  const match = `${result.stdout}${result.stderr}`.match(/(\d+) hard/);
  return match ? Number(match[1]) : -1;
}

export function addedLines() {
  return git('diff', process.env.EVAL_HEAD, '--unified=0').stdout.split('\n')
    .filter(line => line.startsWith('+') && !line.startsWith('+++')).map(line => line.slice(1));
}

export function skillFiles(name = 'SKILL.md') {
  const found = [];
  for (const base of ['.agents/skills', '.claude/skills', '.kiro/skills']) {
    const dir = path.join(work, base);
    if (!fs.existsSync(dir)) continue;
    for (const skill of fs.readdirSync(dir)) if (fs.existsSync(path.join(dir, skill, name))) found.push(path.join(base, skill, name));
  }
  return found;
}

export function processesIn(dir) {
  const hits = [];
  for (const pid of fs.readdirSync('/proc').filter(p => /^\d+$/.test(p))) {
    try { if (fs.readlinkSync(`/proc/${pid}/cwd`).startsWith(dir)) hits.push(pid); } catch {}
  }
  return hits;
}

function shellWord(text) {
  let out = '', i = 0;
  while (i < text.length && !/\s/.test(text[i])) {
    if (text[i] === "'") {
      const end = text.indexOf("'", i + 1);
      out += text.slice(i + 1, end < 0 ? text.length : end);
      i = end < 0 ? text.length : end + 1;
    } else if (text[i] === '"') {
      i++;
      while (i < text.length && text[i] !== '"') {
        if (text[i] === '\\' && /["\\$`\n]/.test(text[i + 1])) { out += text[i + 1]; i += 2; } else out += text[i++];
      }
      i++;
    } else if (text[i] === '\\') { out += text[i + 1] ?? ''; i += 2; } else out += text[i++];
  }
  return out;
}

export function shellParts(command) {
  let text = command;
  const wrapper = text.match(/^\/\S+\s+-l?c\s+/);
  if (wrapper) text = shellWord(text.slice(wrapper[0].length));
  text = text.replace(/(<<-?\s*(['"]?)(\w+)\2)([^\n]*)\n[\s\S]*?\n\s*\3(?=\s|$)/g, '$1$4');
  text = text.replace(/'[^']*'|"(?:\\.|[^"\\])*"/g, quoted => {
    const inner = quoted.slice(1, -1);
    return /\s/.test(inner) ? `''` : inner.replace(/[;|&()]/g, ' ');
  });
  return text.split(/&&|\|\||[;|&\n()]/).map(part => part.trim()).filter(Boolean);
}

export function codexSessions() {
  const dir = path.join(process.env.EVAL_HOME, '.codex', 'sessions');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { recursive: true }).filter(file => file.endsWith('.jsonl')).map(file => {
    const lines = fs.readFileSync(path.join(dir, file), 'utf8').split('\n').filter(Boolean).map(line => { try { return JSON.parse(line); } catch { return {}; } });
    return {
      id: lines.find(l => l.type === 'session_meta')?.payload?.id,
      subagent: Boolean(lines.find(l => l.type === 'session_meta')?.payload?.source?.subagent),
      model: lines.find(l => l.type === 'turn_context')?.payload?.model ?? '',
      replied: lines.some(l => l.type === 'response_item' && l.payload?.type === 'message' && l.payload?.role === 'assistant'),
    };
  });
}

const YAML_TO_JSON = 'require "yaml"; require "json"; print JSON.generate(YAML.safe_load(STDIN.read, aliases: true) || {})';

export function workflows(dir) {
  const files = fs.existsSync(path.join(dir, '.github/workflows')) ? fs.readdirSync(path.join(dir, '.github/workflows')) : [];
  const docs = [], errors = [];
  for (const file of files.filter(f => /\.ya?ml$/.test(f)).sort()) {
    const text = fs.readFileSync(path.join(dir, '.github/workflows', file), 'utf8');
    const parsed = spawnSync('ruby', ['-e', YAML_TO_JSON], { input: text, encoding: 'utf8' });
    if (parsed.status !== 0) errors.push(`${file}: ${parsed.stderr.trim().split('\n')[0]}`);
    else docs.push({ file, doc: JSON.parse(parsed.stdout) });
  }
  return { docs, errors };
}

function globRe(pattern) {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    if (pattern.startsWith('**/', i)) { re += '(?:.*/)?'; i += 2; } else if (pattern.startsWith('**', i)) { re += '.*'; i += 1; }
    else if (pattern[i] === '*') re += '[^/]*'; else if (pattern[i] === '?') re += '[^/]';
    else re += pattern[i].replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}
const filtered = (patterns, value) => patterns.reduce((hit, p) => (p.startsWith('!') ? hit && !globRe(p.slice(1)).test(value) : hit || globRe(p).test(value)), false);
const list = v => (v === undefined || v === null ? null : Array.isArray(v) ? v.map(String) : [String(v)]);

export function expression(text, context, status = {}) {
  const tokens = [];
  const re = /\s*(?:('(?:''|[^'])*')|(\d+(?:\.\d+)?)|(==|!=|<=|>=|&&|\|\||[!<>(),\[\]])|([A-Za-z_][\w-]*(?:\.(?:[A-Za-z_*][\w-]*))*))/y;
  let m, at = 0;
  const src = String(text).trim();
  while (at < src.length && (re.lastIndex = at, m = re.exec(src))) { tokens.push(m[1] ? { s: m[1].slice(1, -1).replace(/''/g, "'") } : m[2] ? { n: Number(m[2]) } : m[3] ? { op: m[3] } : { id: m[4] }); at = re.lastIndex; }
  if (at < src.length) throw new Error(`cannot read the expression ${src}`);
  let i = 0;
  const peek = op => tokens[i]?.op === op;
  const truthy = v => !(v === false || v === null || v === undefined || v === 0 || v === '');
  const lookup = name => name.split('.').reduce((o, k) => (o === null || o === undefined ? null : o[k] ?? null), context);
  const eq = (a, b) => (typeof a === 'string' && typeof b === 'string' ? a.toLowerCase() === b.toLowerCase() : a == b);
  const fns = {
    success: () => !status.failed, failure: () => !!status.failed, always: () => true, cancelled: () => false,
    contains: (a, b) => (Array.isArray(a) ? a.some(x => eq(x, b)) : String(a ?? '').toLowerCase().includes(String(b ?? '').toLowerCase())),
    startswith: (a, b) => String(a ?? '').toLowerCase().startsWith(String(b ?? '').toLowerCase()),
    endswith: (a, b) => String(a ?? '').toLowerCase().endsWith(String(b ?? '').toLowerCase()),
    format: (f, ...args) => String(f).replace(/\{(\d+)\}/g, (_, n) => args[n] ?? ''), tojson: v => JSON.stringify(v), fromjson: v => JSON.parse(v), hashfiles: () => '',
  };
  const primary = () => {
    const t = tokens[i++];
    if (!t) throw new Error(`the expression ${src} ends too early`);
    if (t.s !== undefined) return t.s;
    if (t.n !== undefined) return t.n;
    if (t.op === '(') { const v = or(); i++; return v; }
    if (t.op === '!') return !truthy(primary());
    if (t.id === 'true' || t.id === 'false') return t.id === 'true';
    if (t.id === 'null') return null;
    if (peek('(')) {
      i++;
      const args = [];
      while (!peek(')')) { args.push(or()); if (peek(',')) i++; }
      i++;
      const fn = fns[t.id.toLowerCase()];
      if (!fn) throw new Error(`the function ${t.id} is not supported`);
      return fn(...args);
    }
    let v = lookup(t.id);
    while (peek('[')) { i++; const key = or(); i++; v = v?.[key] ?? null; }
    return v;
  };
  const compare = () => {
    let a = primary();
    while (['==', '!=', '<', '>', '<=', '>='].includes(tokens[i]?.op)) {
      const op = tokens[i++].op, b = primary();
      a = op === '==' ? eq(a, b) : op === '!=' ? !eq(a, b) : op === '<' ? a < b : op === '>' ? a > b : op === '<=' ? a <= b : a >= b;
    }
    return a;
  };
  const and = () => { let a = compare(); while (peek('&&')) { i++; const b = compare(); a = truthy(a) ? b : a; } return a; };
  const or = () => { let a = and(); while (peek('||')) { i++; const b = and(); a = truthy(a) ? a : b; } return a; };
  const value = or();
  return { value, truthy: truthy(value) };
}

const show = v => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
const substitute = (text, context) => String(text).replace(/\$\{\{([\s\S]*?)\}\}/g, (_, e) => show(expression(e, context).value));
const condition = (raw, context, status) => {
  if (raw === undefined || raw === null) return !status.failed;
  if (typeof raw === 'boolean') return raw;
  const text = String(raw).trim().replace(/^\$\{\{([\s\S]*)\}\}$/, '$1');
  const hasStatus = /\b(success|failure|always|cancelled)\s*\(/i.test(text);
  return expression(text, context, status).truthy && (hasStatus || !status.failed);
};

export function pullRequests() {
  const dir = path.join(tmp, 'ci-repo'), remote = path.join(tmp, 'ci-remote.git'), scratch = path.join(tmp, 'ci-scratch');
  for (const d of [dir, remote, scratch]) fs.rmSync(d, { recursive: true, force: true });
  fs.mkdirSync(path.join(scratch, 'shims'), { recursive: true });
  fs.cpSync(path.join(work, '.git'), path.join(dir, '.git'), { recursive: true });
  for (const file of git('ls-files', '-z', '--cached', '--others', '--exclude-standard').stdout.split('\0').filter(Boolean)) {
    const from = path.join(work, file);
    if (!fs.lstatSync(from, { throwIfNoEntry: false })) continue;
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.cpSync(from, path.join(dir, file), { verbatimSymlinks: true });
  }
  const kept = ['node_modules', '.venv', 'venv'];
  for (const entry of git('ls-files', '-z', '--others', '--ignored', '--exclude-standard', '--directory').stdout.split('\0').filter(Boolean)) {
    if (entry.endsWith('/') && kept.includes(path.basename(entry))) fs.cpSync(path.join(work, entry), path.join(dir, entry), { recursive: true, verbatimSymlinks: true });
  }
  const clean = () => g('clean', '-ffdxq', ...kept.flatMap(k => ['-e', k]));
  const g = (...args) => sh('git', ['-c', 'user.name=CI', '-c', 'user.email=ci@example.com', '-c', 'commit.gpgsign=false', ...args], dir);
  g('add', '-A');
  g('commit', '-q', '--allow-empty', '--no-verify', '-m', 'the change of the agent');
  const main = g('rev-parse', 'HEAD').stdout.trim();
  sh('git', ['init', '-q', '--bare', remote], tmp);
  g('remote', 'remove', 'origin');
  g('remote', 'add', 'origin', remote);
  g('push', '-q', 'origin', `${main}:refs/heads/main`);
  g('fetch', '-q', 'origin');
  const real = name => sh('sh', ['-c', `command -v ${name}`]).stdout.trim();
  const shim = (name, body) => { fs.writeFileSync(path.join(scratch, 'shims', name), `#!/bin/sh\n${body}\n`, { mode: 0o755 }); };
  for (const name of ['apt-get', 'apt', 'brew']) shim(name, 'exit 0');
  shim('sudo', 'while [ "${1#-}" != "$1" ]; do shift; done\nexec "$@"');
  if (real('cargo')) shim('cargo', `[ "$1" = install ] && exit 0\nexec "${real('cargo')}" "$@"`);
  sh(real('python3') || 'python3', ['-m', 'venv', path.join(scratch, 'python')], tmp);
  const PATH = [path.join(scratch, 'shims'), path.join(scratch, 'python/bin'), path.join(scratch, 'npm/bin'), process.env.PATH].join(path.delimiter);
  const files = [];
  const pr = {
    main,
    branch(name, from = main) { g('checkout', '-q', '-f', '-B', name, from); clean(); files.length = 0; return pr; },
    write(file, text) { fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); fs.writeFileSync(path.join(dir, file), text); files.push(file); return pr; },
    edit(file, change) {
      const old = fs.readFileSync(path.join(dir, file), 'utf8'), text = change(old);
      if (text === old) throw new Error(`the edit of ${file} changed nothing`);
      return pr.write(file, text);
    },
    commit(message) { g('add', '-u'); if (files.length) g('add', '--', ...files); g('commit', '-q', '--allow-empty', '--no-verify', '-m', message); files.length = 0; clean(); return g('rev-parse', 'HEAD').stdout.trim(); },
    make(target) {
      const r = spawnSync('make', [target], { cwd: dir, encoding: 'utf8', timeout: 240000, env: { ...process.env, PATH, NPM_CONFIG_PREFIX: path.join(scratch, 'npm') } });
      return { code: r.status ?? 1, output: `${r.stdout}${r.stderr}`.slice(-1500) };
    },
    ci({ event = 'pull_request', base = main } = {}) {
      const head = g('rev-parse', 'HEAD').stdout.trim(), branch = event === 'push' ? 'main' : g('rev-parse', '--abbrev-ref', 'HEAD').stdout.trim();
      const changed = g('diff', '--name-only', `${base}...${head}`).stdout.split('\n').filter(Boolean);
      const payload = event === 'push' ? { ref: 'refs/heads/main', before: base, after: head, repository: { default_branch: 'main' } }
        : { number: 1, pull_request: { number: 1, base: { sha: base, ref: 'main' }, head: { sha: head, ref: branch } }, repository: { default_branch: 'main' } };
      const eventFile = path.join(scratch, 'event.json');
      fs.writeFileSync(eventFile, JSON.stringify(payload));
      const githubContext = { event_name: event, event: payload, sha: head, ref: event === 'push' ? 'refs/heads/main' : 'refs/pull/1/merge', ref_name: event === 'push' ? 'main' : '1/merge',
        head_ref: event === 'push' ? '' : branch, base_ref: event === 'push' ? '' : 'main', repository: 'acme/repo', repository_owner: 'acme', workspace: dir, actor: 'alex', run_id: '1', run_number: '1' };
      g('push', '-q', '-f', 'origin', `HEAD:refs/heads/${branch}`);
      const { docs, errors } = workflows(dir);
      const results = [];
      let ran = 0;
      for (const { file, doc } of docs) {
        const on = doc.on ?? doc.true;
        const triggers = typeof on === 'string' ? { [on]: {} } : Array.isArray(on) ? Object.fromEntries(on.map(e => [e, {}])) : on ?? {};
        const key = event in triggers ? event : event === 'pull_request' && 'pull_request_target' in triggers ? 'pull_request_target' : null;
        if (!key) continue;
        const trigger = triggers[key];
        const t = trigger ?? {};
        if (list(t.branches) && !filtered(list(t.branches), 'main')) continue;
        if (list(t['branches-ignore']) && filtered(list(t['branches-ignore']), 'main')) continue;
        if (list(t.paths) && !changed.some(f => filtered(list(t.paths), f))) continue;
        if (list(t['paths-ignore']) && changed.length && changed.every(f => filtered(list(t['paths-ignore']), f))) continue;
        const jobs = Object.entries(doc.jobs ?? {}), done = new Map();
        while (done.size < jobs.length) {
          const ready = jobs.filter(([id, job]) => !done.has(id) && (list(job?.needs) ?? []).every(n => done.has(n)));
          if (!ready.length) { errors.push(`${file}: the needs of the jobs form a loop`); break; }
          for (const [id, job] of ready) {
            const needs = Object.fromEntries((list(job?.needs) ?? []).map(n => [n, { result: done.get(n) }]));
            const vars = { ...process.env, ...doc.env };
            const context = { github: githubContext, env: vars, needs, steps: {}, runner: { os: 'Linux', temp: scratch }, matrix: {}, secrets: {}, vars: {}, inputs: {} };
            let result;
            try {
              const status = { failed: Object.values(needs).some(n => n.result !== 'success') };
              result = !job?.steps ? 'skipped' : condition(job.if, context, status) ? 'success' : 'skipped';
            } catch (error) { errors.push(`${file} ${id}: ${error.message}`); result = 'failure'; }
            if (result === 'skipped') { done.set(id, 'skipped'); continue; }
            ran++;
            const workspace = path.join(scratch, `job-${ran}`);
            fs.rmSync(workspace, { recursive: true, force: true });
            const checkout = (job.steps ?? []).find(st => /^actions\/checkout@/.test(String(st?.uses ?? '')));
            if (checkout) {
              const depth = Number(substitute(checkout.with?.['fetch-depth'] ?? 1, context));
              const cloned = sh('git', ['clone', '-q', '--no-tags', ...(depth > 0 ? ['--depth', String(depth)] : []), '--branch', branch, `file://${remote}`, workspace], tmp);
              if (cloned.status !== 0) errors.push(`${file} ${id}: checkout failed: ${cloned.stderr.trim()}`);
            } else fs.mkdirSync(workspace, { recursive: true });
            context.github = { ...githubContext, workspace };
            for (const [key, raw] of Object.entries(job.env ?? {})) vars[key] = substitute(raw, context);
            const defaults = { ...doc.defaults?.run, ...job.defaults?.run };
            const extraPath = [];
            const status = { failed: false };
            for (const [n, step] of (job.steps ?? []).entries()) {
              try {
                if (!condition(step?.if, context, status) || typeof step?.run !== 'string') continue;
                const stepEnv = { ...vars };
                for (const [key, raw] of Object.entries(step.env ?? {})) stepEnv[key] = substitute(raw, { ...context, env: stepEnv });
                const script = substitute(step.run, { ...context, env: stepEnv });
                const outFile = path.join(scratch, `out-${n}`), envFile = path.join(scratch, `env-${n}`), pathFile = path.join(scratch, `path-${n}`);
                for (const f of [outFile, envFile, pathFile]) fs.writeFileSync(f, '');
                Object.assign(stepEnv, { PATH: [...extraPath, PATH].join(path.delimiter), CI: 'true', GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: event, GITHUB_EVENT_PATH: eventFile,
                  GITHUB_SHA: head, GITHUB_REF: githubContext.ref, GITHUB_REF_NAME: githubContext.ref_name, GITHUB_BASE_REF: githubContext.base_ref, GITHUB_HEAD_REF: githubContext.head_ref,
                  GITHUB_REPOSITORY: 'acme/repo', GITHUB_WORKSPACE: workspace, RUNNER_TEMP: scratch, RUNNER_OS: 'Linux', GITHUB_OUTPUT: outFile, GITHUB_ENV: envFile, GITHUB_PATH: pathFile,
                  GITHUB_STEP_SUMMARY: path.join(scratch, 'summary'), NPM_CONFIG_PREFIX: path.join(scratch, 'npm'), PIP_DISABLE_PIP_VERSION_CHECK: '1' });
                const shell = step.shell ?? defaults.shell ?? 'bash';
                const argv = { bash: ['bash', '--noprofile', '--norc', '-eo', 'pipefail', '-c'], sh: ['sh', '-e', '-c'], python: ['python3', '-c'] }[shell];
                const cwd = path.resolve(workspace, substitute(step['working-directory'] ?? defaults['working-directory'] ?? '.', context));
                const r = argv ? spawnSync(argv[0], [...argv.slice(1), script], { cwd, env: stepEnv, encoding: 'utf8', timeout: 240000 }) : { status: 1, stdout: '', stderr: `the shell ${shell} is not supported` };
                const read = f => fs.readFileSync(f, 'utf8').split('\n');
                const pairs = lines => {
                  const out = {};
                  for (let k = 0; k < lines.length; k++) {
                    const heredoc = lines[k].match(/^([^=<]+)<<(.+)$/), pair = lines[k].match(/^([^=]+)=(.*)$/);
                    if (heredoc) { const end = lines.indexOf(heredoc[2], k + 1); out[heredoc[1]] = lines.slice(k + 1, end).join('\n'); k = end < 0 ? lines.length : end; } else if (pair) out[pair[1]] = pair[2];
                  }
                  return out;
                };
                Object.assign(vars, pairs(read(envFile)));
                extraPath.unshift(...read(pathFile).filter(Boolean).reverse());
                const code = r.status ?? 1, soft = code !== 0 && step['continue-on-error'] !== undefined && condition(step['continue-on-error'], context, { failed: false });
                if (step.id) context.steps[step.id] = { outputs: pairs(read(outFile)), outcome: code ? 'failure' : 'success', conclusion: code && !soft ? 'failure' : 'success' };
                if (code && !soft) status.failed = true;
                results.push({ file, job: id, step: script.trim().split('\n')[0].slice(0, 120), code: soft ? 0 : code, output: `${r.stdout}${r.stderr}`.slice(-600) });
              } catch (error) { errors.push(`${file} ${id}: ${error.message}`); status.failed = true; }
            }
            done.set(id, status.failed ? 'failure' : 'success');
          }
        }
      }
      const failed = results.filter(r => r.code !== 0);
      return { pass: !errors.length && !failed.length, caught: failed.length > 0, ran, errors, results,
        detail: [`${event}: ${ran} jobs ran`, ...errors, ...failed.map(r => `step "${r.step}" exit ${r.code}: ${r.output.trim().split('\n').slice(-3).join(' / ')}`)].join(' | ') };
    },
    cleanup() { for (const d of [dir, remote, scratch]) fs.rmSync(d, { recursive: true, force: true }); },
  };
  return pr;
}

const PRODUCT = /\.(js|mjs|cjs|jsx|ts|tsx|mts|cts|py|go|rs|java|kt|scala|cs|swift|rb|php|c|cc|cpp|cxx|h|hh|hpp|hxx|ipp|inl)$|(^|\/)(package\.json|Cargo\.toml|CMakeLists\.txt|pyproject\.toml|setup\.py|go\.mod|tsconfig\.json)$/;

export function productChanges(folders, { allow = [] } = {}) {
  const lines = git('diff', '--name-status', '--no-renames', process.env.EVAL_HEAD).stdout.split('\n').filter(Boolean);
  return lines.map(line => line.split('\t')).filter(([status, file]) => !allow.some(a => (a.startsWith('**/') ? file === a.slice(3) || file.endsWith(`/${a.slice(3)}`) : a.endsWith('/') ? file.startsWith(a) : file === a))
    && (status === 'A' ? folders.some(f => file.startsWith(f)) && PRODUCT.test(file) : true)).map(([status, file]) => `${status} ${file}`);
}
