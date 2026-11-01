#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const LABELS = { ready: 'patrol:ready', working: 'patrol:working', done: 'patrol:done', stuck: 'patrol:stuck', triage: 'patrol:triage' };
export const FORGE_TOKENS = ['GH_TOKEN', 'GITHUB_TOKEN', 'GH_ENTERPRISE_TOKEN', 'GITHUB_ENTERPRISE_TOKEN', 'PATROL_GH_TOKEN', 'SYSTEM_ACCESSTOKEN',
  'AZURE_DEVOPS_EXT_PAT', 'ACTIONS_RUNTIME_TOKEN', 'ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'ACTIONS_ID_TOKEN_REQUEST_URL'];
const BLOCKED = [/^\.github\//, /^\.azure-pipelines\//, /(^|\/)azure-pipelines[^/]*\.ya?ml$/i, /^\.gitlab-ci\.yml$/, /(^|\/)CODEOWNERS$/,
  /(^|\/)\.git(\/|$)/, /(^|\/)(AGENTS|CLAUDE)\.md$/, /^\.(claude|codex|agents|kiro)\//, /^tools\/patrol\//];
const STATE = /<!-- patrol-state (\{.*?\}) -->/;
const LIMITS = { files: 40, lines: 2000, findings: 3 };

function options(argv) {
  const opts = { lease: 120, maxAttempts: 3, minutes: 45, base: 'main', type: 'Bug' };
  const names = { '--forge': 'forge', '--out': 'out', '--in': 'in', '--item': 'item', '--prompt': 'prompt', '--mode': 'mode', '--pr': 'pr',
    '--base': 'base', '--type': 'type', '--lease': 'lease', '--max-attempts': 'maxAttempts', '--minutes': 'minutes', '--label': 'label' };
  for (let i = 0; i < argv.length; i += 2) {
    const key = names[argv[i]];
    if (!key || argv[i + 1] === undefined) throw new Error(`unknown option or missing value: ${argv[i]}`);
    opts[key] = ['lease', 'maxAttempts', 'minutes'].includes(key) ? Number(argv[i + 1]) : argv[i + 1];
  }
  return opts;
}

export function exec(cmd, args, { input, cwd } = {}) {
  const result = spawnSync(cmd, args, { input, cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw new Error(`${cmd}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${cmd} ${args.slice(0, 3).join(' ')}: ${(result.stderr || result.stdout).trim().slice(0, 500)}`);
  return result.stdout;
}

const json = text => JSON.parse(text || 'null');
export function unquote(name) {
  if (!name.startsWith('"')) return name;
  const bytes = [], escapes = { a: 7, b: 8, f: 12, n: 10, r: 13, t: 9, v: 11, '"': 34, '\\': 92 };
  for (const [part, escape] of name.slice(1, -1).matchAll(/\\([0-7]{3}|.)|[^\\]+/gs)) {
    if (escape === undefined) bytes.push(...Buffer.from(part));
    else bytes.push(/^[0-7]{3}$/.test(escape) ? parseInt(escape, 8) : escapes[escape] ?? escape.charCodeAt(0));
  }
  return Buffer.from(bytes).toString('utf8');
}

const fingerprint = key => createHash('sha256').update(String(key).trim().toLowerCase()).digest('hex').slice(0, 12);

export function github(run = exec) {
  const gh = (args, input) => run('gh', args, { input });
  const phases = Object.values(LABELS).filter(l => l !== LABELS.triage);
  const fields = 'number,title,body,labels,comments';
  const item = i => ({ id: String(i.number), title: i.title, body: i.body ?? '', labels: i.labels.map(l => l.name), notes: i.comments.map(c => c.body) });
  return {
    name: 'github',
    list: label => json(gh(['issue', 'list', '--label', label, '--state', 'open', '--limit', '100', '--json', fields])).map(item),
    get: id => item(json(gh(['issue', 'view', id, '--json', fields]))),
    state: it => {
      const marks = it.notes.map(n => n.match(STATE)).filter(Boolean);
      return marks.length ? json(marks.at(-1)[1]) : {};
    },
    mark(it, state, note) {
      const phase = LABELS[state.phase];
      gh(['issue', 'edit', it.id, '--add-label', phase, ...phases.filter(l => l !== phase && it.labels.includes(l)).flatMap(l => ['--remove-label', l])]);
      gh(['issue', 'comment', it.id, '--body-file', '-'], `${note}\n\n<!-- patrol-state ${JSON.stringify(state)} -->\n`);
    },
    findPr: branch => json(gh(['pr', 'list', '--head', branch, '--state', 'open', '--json', 'number,url']))[0] ?? null,
    createPr: ({ branch, base, title, body }) => {
      const url = gh(['pr', 'create', '--draft', '--base', base, '--head', branch, '--title', title, '--body-file', '-'], body).trim().split('\n').at(-1);
      return { number: url.split('/').at(-1), url };
    },
    commentPr: (pr, body) => gh(['pr', 'comment', String(pr), '--body-file', '-'], body),
    findingExists: fp => json(gh(['issue', 'list', '--label', LABELS.triage, '--state', 'all', '--limit', '1000', '--json', 'body']))
      .some(i => (i.body ?? '').includes(`patrol-finding-${fp}`)),
    createIssue: ({ title, body, fp }) => gh(['issue', 'create', '--title', title, '--label', LABELS.triage, '--body-file', '-'], `${body}\n\n<!-- patrol-finding-${fp} -->\n`).trim(),
    closes: it => `Closes #${it.id}`,
  };
}

const html = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');

export function azure(run = exec, env = process.env) {
  const org = env.SYSTEM_COLLECTIONURI, project = env.SYSTEM_TEAMPROJECT, repo = env.BUILD_REPOSITORY_NAME;
  if (!org || !project) throw new Error('azure needs SYSTEM_COLLECTIONURI and SYSTEM_TEAMPROJECT');
  const az = args => json(run('az', [...args, '--org', org, '-o', 'json'], {}));
  const item = w => ({ id: String(w.id), title: w.fields['System.Title'] ?? '', body: w.fields['System.Description'] ?? '',
    labels: String(w.fields['System.Tags'] ?? '').split(';').map(t => t.trim()).filter(Boolean) });
  const wiql = where => az(['boards', 'query', '--project', project, '--wiql',
    `SELECT [System.Id], [System.Title], [System.Description], [System.Tags] FROM workitems WHERE [System.TeamProject] = @project AND ${where} ORDER BY [System.Id]`]);
  const prUrl = id => `${org.replace(/\/?$/, '/')}${encodeURIComponent(project)}/_git/${encodeURIComponent(repo)}/pullrequest/${id}`;
  return {
    name: 'azure',
    list: tag => wiql(`[System.Tags] CONTAINS '${tag}' AND [System.State] NOT IN ('Closed', 'Done', 'Removed', 'Resolved')`).map(item),
    get: id => item(az(['boards', 'work-item', 'show', '--id', id])),
    state: it => {
      const attempt = it.labels.find(t => /^patrol:try-\d+$/.test(t)), until = it.labels.find(t => /^patrol:until-\d+$/.test(t));
      const phase = it.labels.includes(LABELS.stuck) ? 'stuck' : it.labels.includes(LABELS.done) ? 'done' : undefined;
      return { ...(phase && { phase }), ...(attempt && { attempt: Number(attempt.split('-').at(-1)) }), ...(until && { until: Number(until.split('-').at(-1)) }) };
    },
    mark(it, state, note) {
      const tags = [...it.labels.filter(t => !t.startsWith('patrol:') && t !== LABELS.ready), LABELS[state.phase],
        ...(state.attempt ? [`patrol:try-${state.attempt}`] : []), ...(state.until ? [`patrol:until-${state.until}`] : [])];
      az(['boards', 'work-item', 'update', '--id', it.id, '--fields', `System.Tags=${tags.join('; ')}`, '--discussion', html(note)]);
    },
    findPr: branch => {
      const prs = az(['repos', 'pr', 'list', '--project', project, '--repository', repo, '--source-branch', branch, '--status', 'active']);
      return prs[0] ? { number: String(prs[0].pullRequestId), url: prUrl(prs[0].pullRequestId) } : null;
    },
    createPr: ({ branch, base, title, body, item: it }) => {
      const pr = az(['repos', 'pr', 'create', '--project', project, '--repository', repo, '--source-branch', branch, '--target-branch', base,
        '--title', title, '--description', body.slice(0, 3900), '--draft', 'true', ...(it ? ['--work-items', it.id] : [])]);
      return { number: String(pr.pullRequestId), url: prUrl(pr.pullRequestId) };
    },
    commentPr: (pr, body) => {
      const file = path.join(env.AGENT_TEMPDIRECTORY ?? process.cwd(), `patrol-thread-${pr}.json`);
      fs.writeFileSync(file, JSON.stringify({ comments: [{ parentCommentId: 0, content: body.slice(0, 150000), commentType: 1 }], status: 1 }));
      az(['devops', 'invoke', '--area', 'git', '--resource', 'pullRequestThreads', '--route-parameters', `project=${project}`, `repositoryId=${repo}`,
        `pullRequestId=${pr}`, '--http-method', 'POST', '--in-file', file, '--api-version', '7.1']);
    },
    findingExists: fp => wiql(`[System.Tags] CONTAINS 'patrol-fp-${fp}'`).length > 0,
    createIssue: ({ title, body, fp, type }) => String(az(['boards', 'work-item', 'create', '--project', project, '--type', type, '--title', title,
      '--description', html(body), '--fields', `System.Tags=${LABELS.triage}; patrol-fp-${fp}`]).id),
    closes: it => `Work item #${it.id}`,
  };
}

const forges = { github, azure };
function forgeFor(name, run, env) {
  if (!forges[name]) throw new Error('--forge must be github or azure');
  return forges[name](run, env);
}

function output(name, value, env = process.env) {
  if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, `${name}=${value}\n`);
  if (env.TF_BUILD) console.log(`##vso[task.setvariable variable=${name};isOutput=true]${value}`);
}

export function claim({ forge, out, lease = 120, maxAttempts = 3, now = Date.now(), env = process.env }) {
  const seen = new Map();
  for (const label of [LABELS.ready, LABELS.working]) for (const item of forge.list(label)) seen.set(item.id, item);
  for (const item of [...seen.values()].sort((a, b) => Number(a.id) - Number(b.id))) {
    const state = forge.state(item);
    if (item.labels.includes(LABELS.working) && (state.until ?? 0) > now) continue;
    const again = ['done', 'stuck'].includes(state.phase) && item.labels.includes(LABELS.ready);
    const attempt = (again ? 0 : state.attempt ?? 0) + 1;
    if (attempt > maxAttempts) {
      forge.mark(item, { phase: 'stuck', attempt: attempt - 1 }, `patrol: ${attempt - 1} attempts failed. A person must look at this item.`);
      continue;
    }
    const until = now + lease * 60000;
    forge.mark(item, { phase: 'working', attempt, until }, `patrol: attempt ${attempt} of ${maxAttempts} started.`);
    const claimed = { forge: forge.name, id: item.id, title: item.title, body: item.body, attempt, maxAttempts, branch: `patrol/${item.id}` };
    fs.writeFileSync(out, `${JSON.stringify(claimed, null, 2)}\n`);
    output('found', 'true', env);
    return claimed;
  }
  output('found', 'false', env);
  return null;
}

export function agentEnv(env, outDir) {
  const clean = Object.fromEntries(Object.entries(env).filter(([key]) => !FORGE_TOKENS.includes(key.toUpperCase())));
  return { ...clean, PATROL_OUT: outDir };
}

export function buildPrompt(template, item) {
  if (!item) return template;
  const text = `${item.title}\n\n${item.body}`.replaceAll('</item>', '<\\/item>');
  return template.replaceAll('{{item}}', text);
}

function killTree(child) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else try { process.kill(-child.pid, 'SIGKILL'); } catch {}
}

const inside = (dir, root) => {
  const rel = path.relative(root, dir);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

export function redact(outDir, env) {
  const secrets = Object.entries(env).filter(([key, value]) => /KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i.test(key) && String(value).length >= 12).map(([, value]) => String(value));
  for (const name of ['report.md', 'findings.json', 'patch.diff', 'agent.log']) {
    const file = path.join(outDir, name);
    if (!fs.existsSync(file) || !secrets.length) continue;
    const text = fs.readFileSync(file, 'latin1');
    const clean = secrets.reduce((acc, secret) => acc.split(Buffer.from(secret).toString('latin1')).join('[redacted]'), text);
    if (clean !== text) fs.writeFileSync(file, clean, 'latin1');
  }
}

export async function agent({ prompt, out, item, minutes = 45, cwd = process.cwd(), env = process.env }) {
  const command = env.PATROL_AGENT;
  if (!command) throw new Error('set PATROL_AGENT to the agent command, for example: codex exec --full-auto -');
  const repo = fs.realpathSync.native(exec('git', ['rev-parse', '--show-toplevel'], { cwd }).trim());
  fs.mkdirSync(out, { recursive: true });
  const outDir = fs.realpathSync.native(out);
  if (inside(outDir, repo)) throw new Error('--out must be outside the repository');
  const base = exec('git', ['rev-parse', 'HEAD'], { cwd: repo }).trim();
  const text = buildPrompt(fs.readFileSync(prompt, 'utf8'), item && JSON.parse(fs.readFileSync(item, 'utf8')));
  const log = fs.openSync(path.join(outDir, 'agent.log'), 'w');
  const started = Date.now();
  const childEnv = agentEnv(env, outDir);
  const { code, timedOut } = await new Promise(resolve => {
    const child = spawn(command, { cwd: repo, env: childEnv, shell: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; killTree(child); }, minutes * 60000);
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => fs.writeSync(log, chunk));
    child.on('error', error => fs.writeSync(log, `\n${error.message}\n`));
    child.on('close', code => { clearTimeout(timer); resolve({ code, timedOut }); });
    child.stdin.on('error', () => {});
    child.stdin.end(text);
  });
  fs.closeSync(log);
  exec('git', ['add', '-A', '-N'], { cwd: repo });
  fs.writeFileSync(path.join(outDir, 'patch.diff'), exec('git', ['diff', '--binary', base], { cwd: repo }));
  redact(outDir, childEnv);
  const result = { exitCode: code, timedOut, seconds: Math.round((Date.now() - started) / 1000), base, report: fs.existsSync(path.join(outDir, 'report.md')) };
  fs.writeFileSync(path.join(outDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

export function checkPatch(patchFile, cwd) {
  if (!fs.statSync(patchFile).size) return { files: [], lines: 0, problems: ['the patch is empty'] };
  const stats = exec('git', ['apply', '--numstat', '-z', patchFile], { cwd }).split('\0').filter(Boolean);
  const files = [], problems = [];
  let lines = 0;
  for (let i = 0; i < stats.length; i++) {
    const [added, removed, name] = stats[i].split('\t');
    if (name === '') { files.push(stats[i + 1], stats[i + 2]); i += 2; } else files.push(name);
    lines += (Number(added) || 0) + (Number(removed) || 0);
  }
  for (const m of fs.readFileSync(patchFile, 'utf8').matchAll(/^(?:rename|copy) from (.+)$/gm)) {
    const name = unquote(m[1]);
    if (!files.includes(name)) files.unshift(name);
  }
  for (const file of files) if (BLOCKED.some(re => re.test(file))) problems.push(`the patch changes a protected path: ${file}`);
  if (files.length > LIMITS.files) problems.push(`the patch changes ${files.length} files, more than ${LIMITS.files}`);
  if (lines > LIMITS.lines) problems.push(`the patch changes ${lines} lines, more than ${LIMITS.lines}`);
  return { files, lines, problems };
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function readText(file, limit = 60000) {
  try { return fs.readFileSync(file, 'utf8').slice(0, limit); } catch { return ''; }
}

export function publish({ forge, input, mode, item: itemFile, pr, base = 'main', type = 'Bug', cwd = process.cwd() }) {
  const result = readJson(path.join(input, 'result.json'));
  const report = readText(path.join(input, 'report.md'));
  if (mode === 'comment') {
    if (!pr) throw new Error('--mode comment needs --pr');
    const failed = !result || result.exitCode !== 0 || result.timedOut || !report;
    const changed = fs.existsSync(path.join(input, 'patch.diff')) && fs.statSync(path.join(input, 'patch.diff')).size > 0;
    const head = failed ? `patrol: the tester did not finish (${result?.timedOut ? 'deadline' : `exit ${result?.exitCode ?? 'unknown'}`}). The result is incomplete.\n\n` : '';
    const note = changed ? '\n\npatrol: the tester changed files in its checkout. Those changes are ignored.\n' : '';
    forge.commentPr(pr, `${head}${report || 'No report.'}${note}`);
    return { posted: true };
  }
  if (mode === 'issues') {
    const findings = readJson(path.join(input, 'findings.json'));
    if (!Array.isArray(findings)) return { created: [], problems: ['findings.json is missing or is not a list'] };
    const created = [], skipped = [];
    for (const finding of findings.slice(0, LIMITS.findings)) {
      if (typeof finding?.title !== 'string' || typeof finding?.body !== 'string' || !finding.title.trim()) { skipped.push('a finding without a title or body'); continue; }
      const fp = fingerprint(finding.key ?? finding.title);
      if (forge.findingExists(fp)) { skipped.push(`${finding.title} (already filed)`); continue; }
      created.push(forge.createIssue({ title: finding.title.slice(0, 200), body: finding.body.slice(0, 30000), fp, type }));
    }
    return { created, skipped };
  }
  if (mode !== 'pr') throw new Error('--mode must be pr, comment or issues');
  const item = readJson(itemFile);
  if (!item) throw new Error('--mode pr needs --item');
  const tracked = forge.get(item.id);
  const release = reason => {
    const phase = item.attempt >= item.maxAttempts ? 'stuck' : 'ready';
    forge.mark(tracked, { phase, attempt: item.attempt }, `patrol: attempt ${item.attempt} gave no change: ${reason}`);
    return { published: false, reason, phase };
  };
  if (!result) return release('the agent job left no result');
  if (result.timedOut) return release('the agent reached its deadline');
  if (result.exitCode !== 0) return release(`the agent exited with code ${result.exitCode}`);
  if (!report) return release('the agent wrote no report');
  if (!/^[0-9a-f]{40}$/.test(String(result.base))) return release('the result has no valid base commit');
  exec('git', ['fetch', '--quiet', 'origin', base], { cwd });
  if (spawnSync('git', ['merge-base', '--is-ancestor', result.base, `origin/${base}`], { cwd }).status !== 0) return release(`the base commit is not on origin/${base}`);
  exec('git', ['checkout', '--quiet', '--detach', result.base], { cwd });
  const patch = path.resolve(input, 'patch.diff');
  const check = checkPatch(patch, cwd);
  if (check.problems.length) return release(check.problems.join('; '));
  exec('git', ['apply', '--index', '--binary', patch], { cwd });
  exec('git', ['commit', '--quiet', '--no-verify', '-m', `fix: ${item.title.slice(0, 120)}`, '-m', forge.closes(item)], { cwd });
  exec('git', ['push', '--quiet', '--force', 'origin', `HEAD:refs/heads/${item.branch}`], { cwd });
  const body = `${report}\n\n${forge.closes(item)}\n\nA patrol agent wrote this draft. A person reviews and merges it.\n`;
  const existing = forge.findPr(item.branch);
  const target = existing ?? forge.createPr({ branch: item.branch, base, title: item.title.slice(0, 200), body, item });
  if (existing) forge.commentPr(existing.number, `patrol: attempt ${item.attempt} updated this branch.\n\n${report}`);
  forge.mark(tracked, { phase: 'done', attempt: item.attempt }, `patrol: draft PR ${target.url}`);
  return { published: true, pr: target, files: check.files };
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const opts = options(rest);
  if (opts.label) LABELS.ready = opts.label;
  if (command === 'claim') {
    const item = claim({ forge: forgeFor(opts.forge), out: opts.out ?? 'item.json', lease: opts.lease, maxAttempts: opts.maxAttempts });
    console.log(item ? `claimed ${item.id}: ${item.title}` : 'no item is ready');
  } else if (command === 'agent') {
    if (!opts.prompt || !opts.out) throw new Error('agent needs --prompt and --out');
    const result = await agent({ prompt: opts.prompt, out: opts.out, item: opts.item, minutes: opts.minutes });
    console.log(`\npatrol: agent exit ${result.exitCode}${result.timedOut ? ' (deadline)' : ''}, report ${result.report ? 'written' : 'missing'}`);
    if (result.exitCode !== 0 || result.timedOut) process.exitCode = 1;
  } else if (command === 'publish') {
    if (!opts.in || !opts.mode) throw new Error('publish needs --in and --mode');
    const result = publish({ forge: forgeFor(opts.forge), input: opts.in, mode: opts.mode, item: opts.item, pr: opts.pr, base: opts.base, type: opts.type });
    console.log(JSON.stringify(result, null, 2));
  } else {
    throw new Error('usage: patrol.mjs claim|agent|publish [options]');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(`patrol: ${error.message}`); process.exitCode = 2; });
}
