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
      model: lines.find(l => l.type === 'turn_context')?.payload?.model ?? '',
      replied: lines.some(l => l.type === 'response_item' && l.payload?.type === 'message' && l.payload?.role === 'assistant'),
    };
  });
}

const YAML_TO_JSON = 'require "yaml"; require "json"; print JSON.generate(YAML.safe_load(STDIN.read, aliases: true) || {})';

// The run steps of the GitHub Actions workflows in dir, or at a commit of dir.
export function workflowSteps(dir, rev = null) {
  const gitIn = args => sh('git', args, dir).stdout;
  const files = rev ? gitIn(['ls-tree', '--name-only', `${rev}:.github/workflows`]).split('\n').filter(Boolean)
    : fs.existsSync(path.join(dir, '.github/workflows')) ? fs.readdirSync(path.join(dir, '.github/workflows')) : [];
  const steps = [], errors = [];
  for (const file of files.filter(f => /\.ya?ml$/.test(f)).sort()) {
    const text = rev ? gitIn(['show', `${rev}:.github/workflows/${file}`]) : fs.readFileSync(path.join(dir, '.github/workflows', file), 'utf8');
    const parsed = spawnSync('ruby', ['-e', YAML_TO_JSON], { input: text, encoding: 'utf8' });
    if (parsed.status !== 0) { errors.push(`${file}: ${parsed.stderr.trim().split('\n')[0]}`); continue; }
    const doc = JSON.parse(parsed.stdout);
    for (const [job, def] of Object.entries(doc.jobs ?? {})) {
      const defaults = { ...doc.defaults?.run, ...def?.defaults?.run };
      for (const step of def?.steps ?? []) {
        if (typeof step?.run !== 'string') continue;
        steps.push({ file, job, run: step.run, env: { ...doc.env, ...def.env, ...step.env },
          cwd: step['working-directory'] ?? defaults['working-directory'] ?? '.', shell: step.shell ?? defaults.shell ?? 'bash' });
      }
    }
  }
  return { steps, errors };
}

// A copy of the work folder where the change of the agent is the main branch,
// with planted pull requests and a run of the workflow steps on each one.
export function pullRequests() {
  const dir = path.join(tmp, 'ci-repo'), remote = path.join(tmp, 'ci-remote.git'), scratch = path.join(tmp, 'ci-scratch');
  for (const d of [dir, remote, scratch]) fs.rmSync(d, { recursive: true, force: true });
  fs.cpSync(work, dir, { recursive: true });
  fs.mkdirSync(path.join(scratch, 'shims'), { recursive: true });
  const g = (...args) => sh('git', ['-c', 'user.name=CI', '-c', 'user.email=ci@example.com', '-c', 'commit.gpgsign=false', ...args], dir);
  g('add', '-A');
  g('commit', '-q', '--allow-empty', '--no-verify', '-m', 'the change of the agent');
  const main = g('rev-parse', 'HEAD').stdout.trim();
  sh('git', ['init', '-q', '--bare', remote], tmp);
  g('remote', 'remove', 'origin');
  g('remote', 'add', 'origin', remote);
  g('push', '-q', 'origin', `${main}:refs/heads/main`);
  g('fetch', '-q', 'origin');
  const before = new Set(workflowSteps(work, process.env.EVAL_HEAD).steps.map(s => s.run.trim()));
  const real = name => sh('sh', ['-c', `command -v ${name}`]).stdout.trim();
  const shim = (name, body) => { fs.writeFileSync(path.join(scratch, 'shims', name), `#!/bin/sh\n${body}\n`, { mode: 0o755 }); };
  for (const name of ['apt-get', 'apt', 'brew', 'sudo', 'pip', 'pip3', 'pipx']) shim(name, 'exit 0');
  shim('npm', `case "$1" in ci|install|i|add) exit 0;; esac\nexec "${real('npm')}" "$@"`);
  shim('cargo', `[ "$1" = install ] && exit 0\nexec "${real('cargo')}" "$@"`);
  for (const py of ['python3', 'python']) if (real(py)) shim(py, `[ "$1" = -m ] && [ "$2" = pip ] && exit 0\nexec "${real(py)}" "$@"`);
  const env = () => ({ ...process.env, PATH: `${path.join(scratch, 'shims')}${path.delimiter}${process.env.PATH}`, CI: 'true', GITHUB_ACTIONS: 'true' });
  const files = [];
  const pr = {
    main,
    dir,
    branch(name, from = main) { g('checkout', '-q', '-f', '-B', name, from); files.length = 0; return pr; },
    write(file, text) { fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); fs.writeFileSync(path.join(dir, file), text); files.push(file); return pr; },
    edit(file, change) {
      const old = fs.readFileSync(path.join(dir, file), 'utf8'), text = change(old);
      if (text === old) throw new Error(`the edit of ${file} changed nothing`);
      return pr.write(file, text);
    },
    remove(file) { g('rm', '-q', file); return pr; },
    commit(message) { g('add', '-u'); if (files.length) g('add', '--', ...files); g('commit', '-q', '--allow-empty', '--no-verify', '-m', message); files.length = 0; return g('rev-parse', 'HEAD').stdout.trim(); },
    make(target) { const r = sh('make', [target], dir); return { code: r.status, output: `${r.stdout}${r.stderr}`.slice(-1500) }; },
    // Runs each step, also after a failed step. A pull request is caught when
    // a step that the agent added or changed fails.
    ci(base = main) {
      const head = g('rev-parse', 'HEAD').stdout.trim(), branch = g('rev-parse', '--abbrev-ref', 'HEAD').stdout.trim();
      const { steps, errors } = workflowSteps(dir);
      const event = path.join(scratch, 'event.json'), outFile = path.join(scratch, 'github_env');
      fs.writeFileSync(event, JSON.stringify({ number: 1, pull_request: { number: 1, base: { sha: base, ref: 'main' }, head: { sha: head, ref: branch } }, repository: { default_branch: 'main' } }));
      const context = { 'github.event.pull_request.base.sha': base, 'github.event.pull_request.base.ref': 'main', 'github.base_ref': 'main',
        'github.event.pull_request.head.sha': head, 'github.event.pull_request.head.ref': branch, 'github.head_ref': branch, 'github.sha': head,
        'github.event_name': 'pull_request', 'github.ref': 'refs/pull/1/merge', 'github.ref_name': '1/merge', 'github.workspace': dir,
        'github.event.pull_request.number': '1', 'github.event.number': '1', 'github.repository': 'acme/repo', 'runner.temp': scratch, 'runner.os': 'Linux' };
      let extra = {};
      const value = (term, vars) => {
        term = term.trim();
        if (/^'.*'$/.test(term)) return term.slice(1, -1);
        if (term.startsWith('env.')) return vars[term.slice(4)] ?? '';
        return context[term] ?? '';
      };
      const subst = (text, vars) => String(text).replace(/\$\{\{([\s\S]*?)\}\}/g, (_, expr) => expr.split('||').map(t => value(t, vars)).find(Boolean) ?? '');
      const results = [];
      for (const step of steps) {
        const vars = { ...env(), GITHUB_BASE_REF: 'main', GITHUB_HEAD_REF: branch, GITHUB_REF: 'refs/pull/1/merge', GITHUB_SHA: head, GITHUB_EVENT_NAME: 'pull_request',
          GITHUB_EVENT_PATH: event, GITHUB_WORKSPACE: dir, GITHUB_REPOSITORY: 'acme/repo', RUNNER_TEMP: scratch, GITHUB_ENV: outFile,
          GITHUB_OUTPUT: path.join(scratch, 'github_output'), GITHUB_STEP_SUMMARY: path.join(scratch, 'summary'), GITHUB_PATH: path.join(scratch, 'github_path'), ...extra };
        for (const [key, raw] of Object.entries(step.env)) vars[key] = subst(raw, vars);
        const script = subst(step.run, vars);
        const shell = { bash: ['bash', '--noprofile', '--norc', '-eo', 'pipefail', '-c'], sh: ['sh', '-e', '-c'], python: ['python3', '-c'] }[step.shell];
        fs.writeFileSync(outFile, '');
        const r = shell ? spawnSync(shell[0], [...shell.slice(1), script], { cwd: path.resolve(dir, subst(step.cwd, vars)), env: vars, encoding: 'utf8', timeout: 240000 })
          : { status: 1, stdout: '', stderr: `unsupported shell ${step.shell}` };
        const lines = fs.readFileSync(outFile, 'utf8').split('\n');
        for (let i = 0; i < lines.length; i++) {
          const heredoc = lines[i].match(/^([^=<]+)<<(.+)$/), pair = lines[i].match(/^([^=]+)=(.*)$/);
          if (heredoc) { const end = lines.indexOf(heredoc[2], i + 1); extra[heredoc[1]] = lines.slice(i + 1, end).join('\n'); i = end; }
          else if (pair) extra[pair[1]] = pair[2];
        }
        results.push({ step: script.trim().split('\n')[0].slice(0, 120), added: !before.has(step.run.trim()), code: r.status ?? 1, output: `${r.stdout}${r.stderr}`.slice(-600) });
      }
      const failed = results.filter(r => r.code !== 0);
      return { pass: !errors.length && steps.length > 0 && !failed.length, caught: failed.some(r => r.added), errors, results,
        detail: [...errors, ...failed.map(r => `${r.added ? 'new' : 'old'} step "${r.step}" exit ${r.code}: ${r.output.trim().split('\n').slice(-3).join(' / ')}`)].join(' | ') || 'all steps passed' };
    },
    cleanup() { for (const d of [dir, remote, scratch]) fs.rmSync(d, { recursive: true, force: true }); },
  };
  return pr;
}

// Files that existed at the start and changed, and new source files in the
// product folders.
export function productChanges(folders, { allow = [], source = /\.(ts|tsx|js|py|c|cc|cpp|h|hpp|rs|go)$/ } = {}) {
  const lines = git('diff', '--name-status', '--no-renames', process.env.EVAL_HEAD).stdout.split('\n').filter(Boolean);
  return lines.map(line => line.split('\t')).filter(([status, file]) => !allow.some(a => (a.startsWith('**/') ? file === a.slice(3) || file.endsWith(`/${a.slice(3)}`) : a.endsWith('/') ? file.startsWith(a) : file === a))
    && (status === 'A' ? folders.some(f => file.startsWith(f)) && source.test(file) : true)).map(([status, file]) => `${status} ${file}`);
}
