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

export function shellParts(command) {
  let text = command;
  const wrapped = text.match(/^\/\S+\s+-l?c\s+(['"])([\s\S]*)\1\s*$/);
  if (wrapped) text = wrapped[1] === '"' ? wrapped[2].replace(/\\(["\\$`])/g, '$1') : wrapped[2].replaceAll(`'"'"'`, `'`);
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
