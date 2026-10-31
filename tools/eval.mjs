#!/usr/bin/env node
import fs from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { executions } from '../evals/lib.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const evalsDir = path.join(root, 'evals');
const hostVars = ['CODEX_HOME', 'CLAUDE_CONFIG_DIR', 'COPILOT_HOME', 'KIRO_HOME', 'XDG_CONFIG_HOME', 'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY', 'CODEX_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN'];
const verdictSchema = { type: 'object', additionalProperties: false, required: ['pass', 'reason'],
  properties: { pass: { type: 'boolean' }, reason: { type: 'string' } } };

function options(argv) {
  const opts = { runs: 3, jobs: 4, base: 'origin/main', earlyStop: true, keep: false, targets: null, cases: null, judges: null };
  for (let i = 0; i < argv.length; i++) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (flag === '--targets') { opts.targets = value.split(','); i++; }
    else if (flag === '--case') { opts.cases = value.split(','); i++; }
    else if (flag === '--judges') { opts.judges = value.split(','); i++; }
    else if (flag === '--runs') { opts.runs = Number(value); i++; }
    else if (flag === '--jobs') { opts.jobs = Number(value); i++; }
    else if (flag === '--base') { opts.base = value; i++; }
    else if (flag === '--no-early-stop') opts.earlyStop = false;
    else if (flag === '--keep') opts.keep = true;
    else throw new Error(`Unknown option: ${flag}`);
  }
  return opts;
}

function frontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?/);
  return { head: match ? match[1] : '', body: match ? text.slice(match[0].length) : text };
}

async function loadCases(filter) {
  const cases = [];
  for (const name of (await fs.readdir(evalsDir)).sort()) {
    const dir = path.join(evalsDir, name);
    if (!existsSync(path.join(dir, 'prompt.md')) || (filter && !filter.some(f => name.includes(f)))) continue;
    const config = JSON.parse(await fs.readFile(path.join(dir, 'eval.json'), 'utf8'));
    const graders = [];
    if (existsSync(path.join(dir, 'graders'))) {
      for (const file of (await fs.readdir(path.join(dir, 'graders'))).sort()) {
        const { head, body } = frontmatter(await fs.readFile(path.join(dir, 'graders', file), 'utf8'));
        if (/^type:\s*llm\s*$/m.test(head)) graders.push({ file, statement: body.trim() });
      }
    }
    const prompt = frontmatter(await fs.readFile(path.join(dir, 'prompt.md'), 'utf8')).body.trim();
    cases.push({ name, dir, prompt, graders, ...config });
  }
  return cases;
}

function run(cmd, args, { cwd, env, input, timeout = 900, stdout }) {
  return new Promise(resolve => {
    const child = spawn(cmd, args, { cwd, env, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, timeout * 1000);
    child.stdout.on('data', chunk => { out += chunk; });
    child.stderr.on('data', chunk => { err += chunk; });
    child.on('error', error => { err += String(error); });
    child.on('close', async code => {
      clearTimeout(timer);
      try { process.kill(-child.pid, 'SIGKILL'); } catch {}
      if (stdout) await fs.writeFile(stdout, out);
      resolve({ code, out, err, timedOut });
    });
    child.stdin.end(input ?? '');
  });
}

function claudeToken() {
  const config = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  const read = () => JSON.parse(readFileSync(path.join(config, '.credentials.json'), 'utf8')).claudeAiOauth;
  let auth = read();
  if (auth.expiresAt < Date.now() + 30 * 60 * 1000) {
    spawnSync('claude', ['-p', 'Reply with OK.', '--model', 'claude-haiku-5-5', '--effort', 'low'], { cwd: os.tmpdir(), stdio: 'ignore' });
    auth = read();
    if (auth.expiresAt < Date.now() + 30 * 60 * 1000) throw new Error('The Claude login expires soon. Start a Claude session to refresh it.');
  }
  return auth.accessToken;
}

function codexAuth() {
  const file = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'auth.json');
  const bytes = readFileSync(file);
  const token = JSON.parse(bytes).tokens?.access_token;
  const exp = token && JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).exp * 1000;
  if (!exp || exp < Date.now() + 2 * 60 * 60 * 1000) throw new Error('The Codex login expires soon. Run codex once to refresh it.');
  return bytes;
}

function freePort() {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => resolve(port)); });
  });
}

async function sandbox(auth) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sentinel-eval-'));
  const home = path.join(tmp, 'home'), bin = path.join(tmp, 'bin'), work = path.join(tmp, 'work');
  for (const dir of [home, bin, work, path.join(home, '.codex'), path.join(home, '.claude'), path.join(home, '.config')]) await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(home, '.gitconfig'), '[user]\n\tname = Eval\n\temail = eval@example.com\n[init]\n\tdefaultBranch = main\n');
  await fs.writeFile(path.join(home, '.codex', 'auth.json'), auth.codex, { mode: 0o600 });
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !hostVars.includes(key)));
  Object.assign(env, { HOME: home, PATH: `${bin}${path.delimiter}${process.env.PATH}`, CODEX_HOME: path.join(home, '.codex'),
    CLAUDE_CONFIG_DIR: path.join(home, '.claude'), XDG_CONFIG_HOME: path.join(home, '.config'), CLAUDE_CODE_OAUTH_TOKEN: auth.claude,
    MISE_DATA_DIR: process.env.MISE_DATA_DIR ?? path.join(os.homedir(), '.local/share/mise'),
    MISE_CACHE_DIR: process.env.MISE_CACHE_DIR ?? path.join(os.homedir(), '.cache/mise'), PORT: String(await freePort()) });
  return { tmp, home, bin, work, env };
}

async function prepare(testCase, target, arm, box, baseRules) {
  if (existsSync(path.join(testCase.dir, 'files'))) await fs.cp(path.join(testCase.dir, 'files'), box.work, { recursive: true });
  const git = (...args) => spawnSync('git', args, { cwd: box.work, env: box.env });
  if (existsSync(path.join(testCase.dir, 'setup.mjs'))) {
    const setup = spawnSync('node', [path.join(testCase.dir, 'setup.mjs'), box.work, box.bin, box.tmp], { env: box.env, encoding: 'utf8' });
    if (setup.status !== 0) throw new Error(`setup failed: ${setup.stderr}`);
  } else {
    git('init', '-q'); git('add', '-A'); git('commit', '-qm', 'Initial commit');
  }
  const install = spawnSync(path.join(root, 'tools/install'), ['--global', '--hosts', target.host, '--skills', 'core,formal,ui'], { env: box.env, encoding: 'utf8' });
  if (install.status !== 0) throw new Error(`install failed: ${install.stderr}`);
  const skills = target.host === 'claude' ? path.join(box.home, '.claude/skills') : path.join(box.home, '.agents/skills');
  const rulesFile = target.host === 'claude' ? path.join(box.home, '.claude/CLAUDE.md') : path.join(box.home, '.codex/AGENTS.md');
  if (arm === 'without' && testCase.skill) await fs.rm(path.join(skills, testCase.skill), { recursive: true, force: true });
  if (arm === 'without' && testCase.rule) {
    const current = await fs.readFile(path.join(root, 'rules/AGENTS.md'), 'utf8');
    const text = await fs.readFile(rulesFile, 'utf8');
    if (!text.includes(current)) throw new Error('installed rules differ from rules/AGENTS.md');
    await fs.writeFile(rulesFile, text.replace(current, () => baseRules));
  }
}

function agentCommand(target, prompt, work) {
  if (target.host === 'claude') {
    return { cmd: 'claude', input: '', args: ['-p', prompt, '--model', target.model, '--effort', target.effort,
      '--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions'] };
  }
  return { cmd: 'codex', input: prompt, args: ['exec', '--json', '--skip-git-repo-check', '-m', target.model,
    '-c', `model_reasoning_effort=${target.effort}`, '--dangerously-bypass-approvals-and-sandbox', '-C', work, '-'] };
}

function parse(text) {
  return text.split('\n').filter(line => line.startsWith('{')).map(line => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
}

function readTrace(host, text, code) {
  const events = parse(text);
  const exit = code === 0 ? null : `exit code ${code}`;
  if (host === 'claude') {
    const init = events.find(e => e.type === 'system' && e.subtype === 'init');
    const result = events.findLast(e => e.type === 'result');
    const message = [result?.result, ...(result?.errors ?? [])].filter(Boolean).map(String).join('; ') || result?.subtype;
    return { final: result?.result ?? '', model: init?.model ?? null, error: result?.is_error ? String(message).slice(0, 300) : (result ? exit : 'no result'),
      usage: result ? { cost_usd: result.total_cost_usd, ...result.usage } : null };
  }
  const message = events.findLast(e => e.type === 'item.completed' && e.item?.type === 'agent_message');
  const failed = events.find(e => e.type === 'turn.failed' || e.type === 'error');
  const completed = events.findLast(e => e.type === 'turn.completed');
  const error = failed ? JSON.stringify(failed).slice(0, 300) : !completed ? 'no turn.completed' : !message ? 'no reply' : exit;
  return { final: message?.item?.text ?? '', model: null, error, usage: completed?.usage ?? null };
}

function loaded(skill, text) {
  const file = new RegExp(`skills/${skill}/SKILL\\.md`);
  const reader = new RegExp(`(^|[\\s;&|('"])(cat|sed|head|tail|nl|less|more|bat|awk|Get-Content)\\s[^|;&]*skills/${skill}/SKILL\\.md`);
  for (const event of parse(text)) {
    if (event.type === 'item.completed' && event.item?.type === 'command_execution' && reader.test(event.item.command ?? '')) return true;
    for (const part of event.message?.content ?? []) {
      if (part.type !== 'tool_use') continue;
      const input = part.input ?? {};
      if (part.name === 'Skill' && [input.skill, input.command, input.name].some(v => typeof v === 'string' && v.replace(/^\//, '').split(':').pop() === skill)) return true;
      if (part.name === 'Read' && file.test(input.file_path ?? '')) return true;
      if (typeof input.command === 'string' && reader.test(input.command)) return true;
    }
  }
  return false;
}

async function judge(name, judgeTarget, testCase, finalText, diff, runs, auth) {
  const box = await sandbox(auth);
  try {
    const inputs = await Promise.all((testCase.judge_files ?? []).map(async file =>
      `File ${file} that the agent got:\n${await fs.readFile(path.join(testCase.dir, 'files', file), 'utf8')}\n`));
    const prompt = `You grade one result of an AI coding agent. Decide if the statement is true for this result. Use only the evidence below. Do not run tools.

Statement: ${name.statement}

Task that the agent got:
${testCase.prompt}
${inputs.join('\n')}
Final reply of the agent:
${finalText.slice(0, 30000)}

Changes that the agent made in the repository (git diff, cut at 30000 characters):
${diff.slice(0, 30000)}
${runs ? `\nCommands that the agent ran, with the start of each output (the last 20000 characters):\n${runs}\n` : ''}
Answer with JSON: {"pass": true or false, "reason": "one sentence"}.`;
    let result;
    if (judgeTarget.host === 'claude') {
      result = await run('claude', ['-p', prompt, '--model', judgeTarget.model, '--effort', judgeTarget.effort, '--output-format', 'json',
        '--json-schema', JSON.stringify(verdictSchema), '--tools', ''], { cwd: box.work, env: box.env, timeout: 600 });
      const outer = JSON.parse(result.out);
      if (outer.is_error) throw new Error([outer.result, ...(outer.errors ?? [])].filter(Boolean).join('; ') || 'judge error');
    return outer.structured_output ?? JSON.parse(outer.result.match(/\{[\s\S]*\}/)[0]);
    }
    const schema = path.join(box.tmp, 'schema.json'), answer = path.join(box.tmp, 'answer.json');
    await fs.writeFile(schema, JSON.stringify(verdictSchema));
    result = await run('codex', ['exec', '--skip-git-repo-check', '--sandbox', 'read-only', '-m', judgeTarget.model, '-c',
      `model_reasoning_effort=${judgeTarget.effort}`, '--output-schema', schema, '-o', answer, '-'], { cwd: box.work, env: box.env, input: prompt, timeout: 600 });
    return JSON.parse(await fs.readFile(answer, 'utf8'));
  } catch (error) {
    return { pass: false, reason: `judge error: ${String(error.message).slice(0, 200)}`, error: true };
  } finally { await fs.rm(box.tmp, { recursive: true, force: true }); }
}

async function trial(ctx, testCase, target, arm, index) {
  if (ctx.stopped) return { case: testCase.name, target: target.id, arm, index, status: 'skipped', pass: false, error: ctx.stopped, seconds: 0 };
  const box = await sandbox(ctx.auth());
  const outDir = path.join(ctx.results, testCase.name, target.id, `${arm}-${index}`);
  await fs.mkdir(outDir, { recursive: true });
  const started = Date.now();
  try {
    await prepare(testCase, target, arm, box, ctx.baseRules);
    const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: box.work, encoding: 'utf8' }).stdout.trim();
    const command = agentCommand(target, testCase.prompt, box.work);
    const traceFile = path.join(outDir, 'trace.jsonl');
    const agent = await run(command.cmd, command.args, { cwd: box.work, env: box.env, input: command.input, timeout: testCase.timeout ?? 900, stdout: traceFile });
    const trace = readTrace(target.host, agent.out, agent.code);
    const finalFile = path.join(outDir, 'final.md');
    await fs.writeFile(finalFile, trace.final);
    spawnSync('git', ['add', '-A', '-N'], { cwd: box.work });
    let checks = [];
    if (existsSync(path.join(testCase.dir, 'check.mjs'))) {
      const check = spawnSync('node', [path.join(testCase.dir, 'check.mjs')], { cwd: testCase.dir, encoding: 'utf8', timeout: 300000,
        env: { ...box.env, EVAL_WORK: box.work, EVAL_FINAL: finalFile, EVAL_TRACE: traceFile, EVAL_HOME: box.home, EVAL_TMP: box.tmp, EVAL_HOST: target.host, EVAL_HEAD: head } });
      try { checks = JSON.parse(check.stdout).checks; } catch { checks = [{ name: 'check.mjs', pass: false, detail: (check.stderr || check.stdout).slice(0, 500) }]; }
    }
    const diff = head ? spawnSync('git', ['diff', head], { cwd: box.work, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).stdout : '';
    const runs = testCase.judge_trace
      ? executions(agent.out).map(r => `$ ${r.command.slice(0, 600)}\n${r.output.slice(0, 3000)}`).join("\n\n").slice(-20000) : '';
    const judged = [];
    if (!trace.error && checks.every(c => c.pass || c.info)) {
      for (const grader of testCase.graders) {
        const verdicts = await Promise.all(ctx.judges.map(j => judge(grader, j, testCase, trace.final, diff, runs, ctx.auth())));
        judged.push({ grader: grader.file, verdicts: verdicts.map((v, i) => ({ judge: ctx.judges[i].model, ...v })) });
      }
    }
    const skillLoaded = testCase.skill ? loaded(testCase.skill, agent.out) : null;
    const expectLoad = testCase.load !== false;
    const judgeError = judged.flatMap(g => g.verdicts).find(v => v.error)?.reason;
    const error = trace.error ?? judgeError ?? null;
    if (error && /limit|429|quota|rate.?limit/i.test(error)) ctx.stopped = `usage limit: ${error}`;
    const pass = !error && !agent.timedOut && checks.every(c => c.pass || c.info)
      && judged.every(g => g.verdicts.every(v => v.pass)) && (expectLoad || skillLoaded === false);
    const status = error ? 'error' : pass ? 'pass' : 'fail';
    const record = { case: testCase.name, target: target.id, host: target.host, model: target.model, model_seen: trace.model, effort: target.effort,
      arm, index, status, pass, skill_loaded: skillLoaded, timed_out: agent.timedOut, error, checks, judged,
      usage: trace.usage, seconds: Math.round((Date.now() - started) / 1000) };
    await fs.writeFile(path.join(outDir, 'result.json'), `${JSON.stringify(record, null, 2)}\n`);
    return record;
  } catch (error) {
    return { case: testCase.name, target: target.id, arm, index, status: 'error', pass: false, error: String(error.message).slice(0, 500), seconds: Math.round((Date.now() - started) / 1000) };
  } finally {
    if (!ctx.keep) await fs.rm(box.tmp, { recursive: true, force: true });
    else console.log(`kept ${box.tmp}`);
  }
}

function semaphore(limit) {
  let active = 0; const queue = [];
  const next = () => { if (active < limit && queue.length) { active++; queue.shift()(); } };
  return async task => {
    await new Promise(resolve => { queue.push(resolve); next(); });
    try { return await task(); } finally { active--; next(); }
  };
}

async function main() {
  const opts = options(process.argv.slice(2));
  const config = JSON.parse(await fs.readFile(path.join(evalsDir, 'targets.json'), 'utf8'));
  const targets = config.targets.filter(t => opts.targets ? opts.targets.includes(t.id) : t.default);
  const targetsFor = testCase => testCase.targets
    ? config.targets.filter(t => testCase.targets.includes(t.id) && (!opts.targets || opts.targets.includes(t.id))) : targets;
  const judges = config.judges.filter(j => !opts.judges || opts.judges.includes(j.host));
  const cases = await loadCases(opts.cases);
  if (!cases.some(testCase => targetsFor(testCase).length)) throw new Error('No targets selected');
  const baseRules = spawnSync('git', ['show', `${opts.base}:rules/AGENTS.md`], { cwd: root, encoding: 'utf8' });
  if (baseRules.status !== 0) throw new Error(`Cannot read rules/AGENTS.md at ${opts.base}`);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const results = path.join(evalsDir, 'results', stamp);
  await fs.mkdir(results, { recursive: true });
  const ctx = { results, baseRules: baseRules.stdout, judges, keep: opts.keep, auth: () => ({ claude: claudeToken(), codex: codexAuth() }) };
  ctx.auth();
  const limit = semaphore(opts.jobs);
  const records = [];
  const log = async record => {
    records.push(record);
    await fs.appendFile(path.join(results, 'runs.jsonl'), `${JSON.stringify(record)}\n`);
    const flag = record.skill_loaded === null || record.skill_loaded === undefined ? '' : record.skill_loaded ? ' loaded' : ' not-loaded';
    console.log(`${record.status.toUpperCase()} ${record.case} ${record.target} ${record.arm}#${record.index}${flag} ${record.seconds}s${record.error ? ` (${record.error})` : ''}`);
  };
  const job = async (testCase, target) => {
    const missing = (testCase.requires || []).filter(cmd => spawnSync('sh', ['-c', `command -v ${cmd}`]).status !== 0);
    if (missing.length) { console.log(`SKIP ${testCase.name} ${target.id}: needs ${missing.join(', ')}`); return; }
    const arms = testCase.arms ?? (testCase.load === false ? ['with'] : ['with', 'without']);
    const first = await Promise.all(arms.map(arm => limit(() => trial(ctx, testCase, target, arm, 1))));
    for (const record of first) await log(record);
    const repeat = testCase.load !== false && opts.runs > 1 && !ctx.stopped
      && (!opts.earlyStop || arms.length === 1 || first.some(r => r.status === 'error') || first[0].pass !== first[1].pass);
    if (!repeat) return;
    const more = [];
    for (let i = 2; i <= opts.runs; i++) for (const arm of arms) more.push(limit(() => trial(ctx, testCase, target, arm, i).then(log)));
    await Promise.all(more);
  };
  await Promise.all(cases.flatMap(testCase => targetsFor(testCase).map(target => job(testCase, target))));
  console.log(`\nResults: ${path.relative(root, results)}\n`);
  if (ctx.stopped) console.log(`Stopped early. ${ctx.stopped}`);
  console.log('Pass counts leave out runs that ended with an error.\n');
  console.log('| Case | Target | With | Without | Skill loaded | Errors |\n|---|---|---|---|---|---|');
  for (const testCase of cases) for (const target of targetsFor(testCase)) {
    const rows = records.filter(r => r.case === testCase.name && r.target === target.id);
    if (!rows.length) continue;
    const valid = rows.filter(r => r.status === 'pass' || r.status === 'fail');
    const rate = arm => { const r = valid.filter(x => x.arm === arm); return r.length ? `${r.filter(x => x.pass).length}/${r.length}` : '-'; };
    const withRows = valid.filter(r => r.arm === 'with' && r.skill_loaded !== null && r.skill_loaded !== undefined);
    const errors = rows.length - valid.length;
    console.log(`| ${testCase.name} | ${target.id} | ${rate('with')} | ${rate('without')} | ${withRows.length ? `${withRows.filter(r => r.skill_loaded).length}/${withRows.length}` : '-'} | ${errors || ''} |`);
  }
}

main().catch(error => { console.error(`eval: ${error.message}`); process.exitCode = 1; });
