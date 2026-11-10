#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const PHASES = ['working', 'pr-open', 'needs-owner', 'stuck'];
export const LABELS = {
  log: 'patrol:log', triage: 'patrol:triage', confirmed: 'patrol:confirmed', disproved: 'patrol:disproved', ready: 'patrol:ready', hold: 'patrol:hold',
  ...Object.fromEntries(PHASES.map(phase => [phase, `patrol:${phase}`])),
};
export const BANDS = [['critical', 9], ['high', 7], ['medium', 4], ['low', 0]];
const BAND_LABELS = BANDS.map(([name]) => `patrol:sev-${name}`);
export const MODES = ['paused', 'demo', 'full-stop', 'full-send'];
export const OUTCOMES = ['Merged', 'Ready for owner', 'Needs owner', 'Stuck', 'Plans ready', 'Idle', 'Incomplete', 'Busy', 'Budget', 'Paused', 'Aborted'];
const ROWS = ['Start', 'Scan', 'Triage', 'Plan'];
const ISSUE_ROWS = ['Fix', 'Review', 'Checks', 'Owner', 'Merge'];
const OFF = { paused: [...ROWS, ...ISSUE_ROWS], demo: ['Fix', 'Review', 'Checks', 'Merge'], 'full-stop': ['Merge'], 'full-send': [] };
const MARKS = { done: 'x', now: '>', owner: '!', fail: '!' };
export const FORGE_TOKENS = ['GH_TOKEN', 'GITHUB_TOKEN', 'GH_ENTERPRISE_TOKEN', 'GITHUB_ENTERPRISE_TOKEN', 'PATROL_GH_TOKEN', 'SYSTEM_ACCESSTOKEN',
  'AZURE_DEVOPS_EXT_PAT', 'ACTIONS_RUNTIME_TOKEN', 'ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'ACTIONS_ID_TOKEN_REQUEST_URL', 'PATROL_GITLAB_TOKEN',
  'GITLAB_TOKEN', 'CI_JOB_TOKEN', 'CI_REPOSITORY_URL', 'CI_REGISTRY_PASSWORD', 'CI_DEPENDENCY_PROXY_PASSWORD'];
const BLOCKED = [/^\.github\//, /^\.azure-pipelines\//, /(^|\/)azure-pipelines[^/]*\.ya?ml$/i, /^\.gitlab-ci\.yml$/, /^\.gitlab\//, /(^|\/)CODEOWNERS$/,
  /(^|\/)\.git(\/|$)/, /(^|\/)(AGENTS|CLAUDE)\.md$/, /^\.(claude|codex|agents|kiro)\//, /^tools\/patrol\//];
const CONFIG = 'tools/patrol/patrol.json';
const STATE = /\n<!-- patrol-state (\{[^\r\n]*\}) -->\s*$/;
const RUN = /\n<!-- patrol-run (\{[^\r\n]*\}) -->\s*$/;
const OPTIONS = ['forge', 'out', 'in', 'prompt', 'mode', 'pr', 'minutes', 'run', 'id', 'step', 'data', 'outcome', 'reason', 'stage', 'add', 'remove', 'phase',
  'noteFile', 'state', 'model', 'override', 'calls'];

export class Ended extends Error {
  constructor(result) { super(`the run ended as ${result.outcome}`); this.result = result; }
}

function options(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = /^--[a-z-]+$/.test(argv[i]) ? argv[i].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase()) : null;
    if (!OPTIONS.includes(key) || argv[i + 1] === undefined) throw new Error(`unknown option or missing value: ${argv[i]}`);
    opts[key] = ['minutes', 'calls'].includes(key) ? Number(argv[i + 1]) : argv[i + 1];
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
const fingerprint = key => createHash('sha256').update(String(key).trim().toLowerCase()).digest('hex').slice(0, 12);
const flat = value => String(value ?? '').replace(/\s*[\r\n]+\s*/g, ' ');
const hide = (tag, value) => `<!-- ${tag} ${JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')} -->`;
const html = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
const text = markup => String(markup ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
export const band = score => (Number.isFinite(score) && score >= 0 ? BANDS.find(([, low]) => score >= low)[0] : undefined);
const rank = mode => MODES.indexOf(mode);

export function github(run = exec) {
  const api = (method, route, body) => json(run('gh', ['api', '--method', method, route, ...(body ? ['--input', '-'] : [])], { input: body && JSON.stringify(body) }));
  const all = route => json(run('gh', ['api', '--paginate', '--slurp', route])).flat();
  const repo = 'repos/{owner}/{repo}';
  const item = i => ({ id: String(i.number), title: i.title, body: i.body ?? '', labels: i.labels.map(l => l.name), created: i.created_at });
  const pr = p => ({ number: String(p.number), url: p.html_url, state: p.merged_at ? 'merged' : p.state === 'open' ? 'open' : 'closed', head: p.head.sha, updated: p.updated_at });
  const note = (id, body) => String(api('POST', `${repo}/issues/${id}/comments`, { body }).id);
  let login;
  return {
    name: 'github',
    me: () => (login ??= api('GET', 'user').login),
    issues: (label, state = 'open') => all(`${repo}/issues?state=${state}&labels=${encodeURIComponent(label)}&per_page=100`).filter(i => !i.pull_request).map(item),
    issue: id => item(api('GET', `${repo}/issues/${id}`)),
    notes: id => all(`${repo}/issues/${id}/comments?per_page=100`).map(c => ({ id: String(c.id), body: c.body ?? '', author: c.user?.login })),
    addNote: note,
    editNote: (_, noteId, body) => api('PATCH', `${repo}/issues/comments/${noteId}`, { body }),
    labels(id, add, remove) {
      if (add.length) api('POST', `${repo}/issues/${id}/labels`, { labels: add });
      for (const label of remove) api('DELETE', `${repo}/issues/${id}/labels/${encodeURIComponent(label)}`);
    },
    close(id, body) {
      note(id, body);
      api('PATCH', `${repo}/issues/${id}`, { state: 'closed', state_reason: 'completed' });
    },
    createIssue: ({ title, body, labels }) => String(api('POST', `${repo}/issues`, { title, body, labels }).number),
    ensureLabels(names) {
      const have = new Set(all(`${repo}/labels?per_page=100`).map(l => l.name));
      for (const name of names.filter(n => !have.has(n))) api('POST', `${repo}/labels`, { name, color: 'ededed' });
    },
    pin: id => run('gh', ['issue', 'pin', id]),
    findPr: branch => all(`${repo}/pulls?state=open&head={owner}:${encodeURIComponent(branch)}&per_page=100`).map(pr)[0] ?? null,
    pr: number => pr(api('GET', `${repo}/pulls/${number}`)),
    commentPr: (number, body) => note(number, body),
    checks(head) {
      const result = {};
      const runs = all(`${repo}/actions/runs?head_sha=${head}&per_page=100`).flatMap(p => p.workflow_runs).sort((a, b) => b.id - a.id);
      for (const r of runs) for (const job of all(`${repo}/actions/runs/${r.id}/jobs?per_page=100`).flatMap(p => p.jobs)) {
        result[job.name] ??= job.status !== 'completed' ? 'pending' : job.conclusion === 'success' ? 'success' : 'failure';
      }
      return result;
    },
    closes: id => `Closes #${id}`,
  };
}

export function gitlab(run = exec, env = process.env, cfg = {}) {
  const api = cfg.api_url ?? env.CI_API_V4_URL, project = cfg.project_id ?? env.CI_PROJECT_ID, token = env.PATROL_GITLAB_TOKEN;
  if (!api || !project || !token) throw new Error('gitlab needs forge.api_url, forge.project_id and PATROL_GITLAB_TOKEN');
  const root = api.replace(/\/$/, ''), base = `${root}/projects/${encodeURIComponent(project)}`;
  const call = (method, route, body, url = `${base}${route}`) => {
    const file = body && path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'patrol-gitlab-')), 'body.json');
    if (file) fs.writeFileSync(file, JSON.stringify(body));
    try {
      return json(run('curl', ['--silent', '--show-error', '--fail-with-body', '--request', method, '--header', '@-',
        ...(file ? ['--header', 'Content-Type: application/json', '--data-binary', `@${file}`] : []), url], { input: `PRIVATE-TOKEN: ${token}\n` }));
    } finally { if (file) fs.rmSync(path.dirname(file), { recursive: true, force: true }); }
  };
  const all = route => {
    const items = [];
    for (let page = 1; ; page++) {
      const batch = call('GET', `${route}&per_page=100&page=${page}`);
      items.push(...batch);
      if (batch.length < 100) break;
    }
    return items;
  };
  const item = i => ({ id: String(i.iid), title: i.title, body: i.description ?? '', labels: i.labels, created: i.created_at });
  const pr = mr => ({ number: String(mr.iid), url: mr.web_url, state: mr.state === 'merged' ? 'merged' : mr.state === 'opened' ? 'open' : 'closed', head: mr.sha, updated: mr.updated_at });
  const note = (id, body) => String(call('POST', `/issues/${id}/notes`, { body }).id);
  let user;
  return {
    name: 'gitlab',
    me: () => (user ??= call('GET', '', null, `${root}/user`).username),
    issues: (label, state = 'open') => all(`/issues?state=${state === 'open' ? 'opened' : 'all'}&labels=${encodeURIComponent(label)}`).map(item),
    issue: id => item(call('GET', `/issues/${id}`)),
    notes: id => all(`/issues/${id}/notes?sort=asc&order_by=created_at`).filter(n => !n.system).map(n => ({ id: String(n.id), body: n.body ?? '', author: n.author?.username })),
    addNote: note,
    editNote: (id, noteId, body) => call('PUT', `/issues/${id}/notes/${noteId}`, { body }),
    labels: (id, add, remove) => call('PUT', `/issues/${id}`, { ...(add.length && { add_labels: add.join(',') }), ...(remove.length && { remove_labels: remove.join(',') }) }),
    close(id, body) {
      note(id, body);
      call('PUT', `/issues/${id}`, { state_event: 'close' });
    },
    createIssue: ({ title, body, labels }) => String(call('POST', '/issues', { title, description: body, labels: labels.join(',') }).iid),
    ensureLabels(names) {
      const have = new Set(all('/labels?include_ancestor_groups=true').map(l => l.name));
      for (const name of names.filter(n => !have.has(n))) call('POST', '/labels', { name, color: '#ededed' });
    },
    pin: () => {},
    findPr: branch => call('GET', `/merge_requests?state=opened&source_branch=${encodeURIComponent(branch)}`).map(pr)[0] ?? null,
    pr: number => pr(call('GET', `/merge_requests/${number}`)),
    commentPr: (number, body) => call('POST', `/merge_requests/${number}/notes`, { body }),
    checks(head) {
      const result = {};
      for (const pipeline of call('GET', `/pipelines?sha=${head}&order_by=id&sort=desc`)) {
        for (const job of all(`/pipelines/${pipeline.id}/jobs?scope[]=created&scope[]=pending&scope[]=running&scope[]=failed&scope[]=success&scope[]=canceled&scope[]=skipped&scope[]=manual`)) {
          result[job.name] ??= job.status === 'success' ? 'success' : ['failed', 'canceled', 'skipped'].includes(job.status) ? 'failure' : 'pending';
        }
      }
      return result;
    },
    closes: id => `Closes #${id}`,
  };
}

export function azure(run = exec, env = process.env, cfg = {}) {
  const org = cfg.organization ?? env.SYSTEM_COLLECTIONURI, project = cfg.project ?? env.SYSTEM_TEAMPROJECT, repo = cfg.repository ?? env.BUILD_REPOSITORY_NAME;
  if (!org || !project) throw new Error('azure needs forge.organization and forge.project');
  const invoke = (area, resource, params, { method = 'GET', body, query, version = '7.1', media, scope = { project } } = {}) => {
    const file = body && path.join(fs.mkdtempSync(path.join(env.AGENT_TEMPDIRECTORY ?? os.tmpdir(), 'patrol-azure-')), 'body.json');
    if (file) fs.writeFileSync(file, JSON.stringify(body));
    try {
      return json(run('az', ['devops', 'invoke', '--org', org, '--area', area, '--resource', resource,
        ...(Object.keys({ ...scope, ...params }).length ? ['--route-parameters', ...Object.entries({ ...scope, ...params }).map(([k, v]) => `${k}=${v}`)] : []),
        ...(query ? ['--query-parameters', ...Object.entries(query).map(([k, v]) => `${k}=${v}`)] : []),
        '--http-method', method, '--api-version', version, ...(file ? ['--in-file', file] : []), ...(media ? ['--media-type', media] : []), '-o', 'json'], {}));
    } finally { if (file) fs.rmSync(path.dirname(file), { recursive: true, force: true }); }
  };
  const patch = (id, fields) => invoke('wit', 'workitems', { id }, { method: 'PATCH', media: 'application/json-patch+json',
    body: Object.entries(fields).map(([field, value]) => ({ op: 'add', path: `/fields/${field}`, value })) });
  const comments = { version: '7.1-preview.4' };
  const item = w => ({ id: String(w.id), title: w.fields['System.Title'] ?? '', body: text(w.fields['System.Description']),
    labels: String(w.fields['System.Tags'] ?? '').split(';').map(t => t.trim()).filter(Boolean), created: w.fields['System.CreatedDate'] });
  const prUrl = id => `${org.replace(/\/?$/, '/')}${encodeURIComponent(project)}/_git/${encodeURIComponent(repo)}/pullrequest/${id}`;
  const pr = p => ({ number: String(p.pullRequestId), url: prUrl(p.pullRequestId), state: p.status === 'completed' ? 'merged' : p.status === 'active' ? 'open' : 'closed',
    head: p.lastMergeSourceCommit?.commitId, updated: p.closedDate, project: p.repository?.project?.id });
  const note = (id, body) => String(invoke('wit', 'comments', { workItemId: id }, { ...comments, method: 'POST', body: { text: html(body) } }).id);
  const issue = id => item(invoke('wit', 'workitems', { id }));
  const tags = (id, list) => patch(id, { 'System.Tags': list.join('; ') });
  let self;
  return {
    name: 'azure',
    me: () => (self ??= invoke('Location', 'connectionData', {}, { version: '7.1-preview.1', scope: {} }).authenticatedUser.id),
    issues(tag, state = 'open') {
      const open = state === 'open' ? " AND [System.State] NOT IN ('Closed', 'Done', 'Removed', 'Resolved')" : '';
      const ids = invoke('wit', 'wiql', {}, { method: 'POST', body: { query: `SELECT [System.Id] FROM workitems WHERE [System.TeamProject] = @project AND [System.Tags] CONTAINS '${tag.replace(/'/g, "''")}'${open} ORDER BY [System.Id]` } })
        .workItems.map(w => w.id);
      const items = [];
      for (let i = 0; i < ids.length; i += 200) {
        items.push(...invoke('wit', 'workitemsbatch', {}, { method: 'POST', body: { ids: ids.slice(i, i + 200), fields: ['System.Id', 'System.Title', 'System.Description', 'System.Tags', 'System.CreatedDate'] } }).value);
      }
      return items.map(item).filter(i => i.labels.includes(tag));
    },
    issue,
    notes(id) {
      const found = [];
      let token;
      do {
        const page = invoke('wit', 'comments', { workItemId: id }, { ...comments, query: { $top: 200, order: 'asc', ...(token && { continuationToken: token }) } });
        found.push(...page.comments);
        token = page.continuationToken;
      } while (token);
      return found.map(c => ({ id: String(c.id), body: text(c.text), author: c.createdBy?.id }));
    },
    addNote: note,
    editNote: (id, noteId, body) => invoke('wit', 'comments', { workItemId: id, commentId: noteId }, { ...comments, method: 'PATCH', body: { text: html(body) } }),
    labels(id, add, remove) {
      const current = issue(id).labels;
      tags(id, [...current.filter(t => !remove.includes(t)), ...add.filter(t => !current.includes(t))]);
    },
    close(id, body) {
      if (!cfg.closed_state) throw new Error('azure needs forge.closed_state to close a work item');
      note(id, body);
      patch(id, { 'System.State': cfg.closed_state });
    },
    createIssue: ({ title, body, labels }) => String(invoke('wit', 'workitems', { type: `$${cfg.work_item_type ?? 'Bug'}` }, { method: 'POST', media: 'application/json-patch+json',
      body: [['System.Title', title], ['System.Description', html(body)], ['System.Tags', labels.join('; ')]].map(([field, value]) => ({ op: 'add', path: `/fields/${field}`, value })) }).id),
    ensureLabels: () => {},
    pin: () => {},
    findPr(branch) {
      const found = invoke('git', 'pullRequests', { repositoryId: repo }, { query: { 'searchCriteria.sourceRefName': `refs/heads/${branch}`, 'searchCriteria.status': 'active' } }).value;
      return found[0] ? pr(found[0]) : null;
    },
    pr: number => pr(invoke('git', 'pullRequests', { repositoryId: repo, pullRequestId: number })),
    commentPr: (number, body) => invoke('git', 'pullRequestThreads', { repositoryId: repo, pullRequestId: number },
      { method: 'POST', body: { comments: [{ parentCommentId: 0, content: body.slice(0, 150000), commentType: 1 }], status: 1 } }),
    checks(head, number) {
      const p = pr(invoke('git', 'pullRequests', { repositoryId: repo, pullRequestId: number }));
      if (p.head !== head) return {};
      const result = {};
      for (const e of invoke('policy', 'evaluations', {}, { version: '7.1-preview.1', query: { artifactId: `vstfs:///CodeReview/CodeReviewId/${p.project}/${number}` } }).value) {
        if (e.configuration?.type?.displayName !== 'Build') continue;
        const name = e.configuration.settings?.displayName || e.context?.buildDefinitionName;
        result[name] ??= e.status === 'approved' ? 'success' : ['rejected', 'broken'].includes(e.status) ? 'failure' : 'pending';
      }
      return result;
    },
    closes: id => `Fixes AB#${id}`,
  };
}

const forges = { github, gitlab, azure };
export function forgeFor(cfg, run = exec, env = process.env) {
  if (!forges[cfg?.kind]) throw new Error('forge.kind must be github, gitlab or azure');
  return forges[cfg.kind](run, env, cfg);
}

export function readConfig(cwd, ref = 'origin/HEAD') {
  const result = spawnSync('git', ['show', `${ref}:${CONFIG}`], { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`cannot read ${CONFIG} from ${ref}. Run git fetch origin and git remote set-head origin --auto.`);
  return checkConfig(JSON.parse(result.stdout));
}

const NUMBERS = { scan: ['max_findings'], budget: ['plans_per_run', 'fixes_per_day', 'council_calls_per_run'], council: ['threshold', 'rounds', 'triage_quorum'],
  limits: ['attempts', 'lock_stale_minutes', 'max_files', 'max_lines'] };

export function checkConfig(config) {
  const problems = [];
  if (config.version !== 1) problems.push('version 1');
  if (rank(config.mode) < 0) problems.push(`a mode of ${MODES.join(', ')}`);
  if (!['sol-loop', 'both', 'council'].includes(config.review)) problems.push('a review of sol-loop, both or council');
  if (!Array.isArray(config.council?.seats) || !config.council.seats.length) problems.push('council.seats');
  const filled = value => typeof value === 'string' && value.trim() !== '';
  if (!forges[config.forge?.kind] || !filled(config.forge.base)) problems.push('forge.kind and forge.base');
  if (!(config.council?.triage_quorum >= 1 && config.council.triage_quorum <= config.council.seats?.length)) problems.push('a council.triage_quorum from 1 to the number of seats');
  if (!Array.isArray(config.merge?.required_checks) || !filled(config.merge.method)) problems.push('merge.method and merge.required_checks');
  const paths = gate => Array.isArray(gate?.paths) && gate.paths.length && gate.paths.every(filled);
  if (!Array.isArray(config.owner_gates) || !config.owner_gates.every(paths)) problems.push('owner_gates, each with a list of paths');
  if (!Array.isArray(config.ranking?.groups) || !config.ranking.groups.length) problems.push('ranking.groups');
  if (!['install', 'check', 'proof'].every(key => filled(config.commands?.[key]))) problems.push('commands.install, commands.check and commands.proof');
  for (const [group, keys] of Object.entries(NUMBERS)) {
    for (const key of keys) {
      const value = config[group]?.[key];
      if (!(Number.isFinite(value) && value >= 0 && (key === 'threshold' || Number.isInteger(value)))) problems.push(`a ${key === 'threshold' ? 'number' : 'whole number'} for ${group}.${key}`);
    }
  }
  if (problems.length) throw new Error(`${CONFIG} needs ${problems.join(', ')}`);
  return config;
}

export function override(config, list) {
  const next = structuredClone(config);
  for (const pair of list ? list.split(',') : []) {
    const [key, value] = pair.split('=').map(s => s.trim());
    if (key === 'mode') {
      if (rank(value) < 0 || rank(value) > rank(next.mode)) throw new Error(`an override cannot raise the mode to ${value}`);
      next.mode = value;
      continue;
    }
    const group = ['scan', 'budget', 'limits'].find(g => typeof next[g]?.[key] === 'number');
    if (!group || value === '' || !Number.isFinite(Number(value))) throw new Error(`unknown override: ${pair}`);
    next[group][key] = Number(value);
  }
  return checkConfig(next);
}

export function repoName(cwd) {
  return exec('git', ['remote', 'get-url', 'origin'], { cwd }).trim().replace(/\.git$/, '').replace(/^[a-z+]+:\/\/(?:[^@/]+@)?/i, '').replace(/^[^@/]+@([^:]+):/, '$1/');
}

function where(cwd, env) {
  const dir = path.join(env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state'), 'patrol', repoName(cwd).replace(/[^A-Za-z0-9._-]+/g, '_'));
  return { lock: path.join(dir, 'lock'), runs: path.join(dir, 'runs') };
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function writeJson(file, value) {
  fs.writeFileSync(`${file}.tmp`, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(`${file}.tmp`, file);
}

const holder = lockDir => readJson(path.join(lockDir, 'run.json')) ?? { id: null, heartbeat: fs.statSync(lockDir).mtimeMs };

export function lock({ cwd, env = process.env, now = Date.now(), config }) {
  const at = where(cwd, env);
  fs.mkdirSync(at.runs, { recursive: true });
  const id = `${new Date(now).toISOString().replace(/[-:]|\.\d+/g, '')}-${randomBytes(3).toString('hex')}`;
  const take = () => {
    try { fs.mkdirSync(at.lock); } catch (error) { if (error.code === 'EEXIST') return false; throw error; }
    writeJson(path.join(at.lock, 'run.json'), { id, heartbeat: now });
    writeJson(path.join(at.runs, `${id}.json`), { id, started: now, steps: {}, calls: 0 });
    return true;
  };
  if (take()) return { run: id };
  let held;
  try { held = holder(at.lock); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return take() ? { run: id } : { outcome: 'Busy' };
  }
  if (now - held.heartbeat <= config.limits.lock_stale_minutes * 60000) return { outcome: 'Busy', holder: held.id };
  const tomb = `${at.lock}-${id}`;
  try { fs.renameSync(at.lock, tomb); } catch { return { outcome: 'Busy', holder: held.id }; }
  if (holder(tomb).id !== held.id) {
    try { fs.renameSync(tomb, at.lock); } catch {}
    return { outcome: 'Busy' };
  }
  fs.rmSync(tomb, { recursive: true, force: true });
  return take() ? { run: id, replaced: held.id } : { outcome: 'Busy' };
}

export const readRun = (id, { cwd, env }) => readJson(path.join(where(cwd, env).runs, `${id}.json`));

function release(rec, deps) {
  const at = where(deps.cwd, deps.env);
  if (readJson(path.join(at.lock, 'run.json'))?.id === rec.id) fs.rmSync(at.lock, { recursive: true, force: true });
}

function open(id, deps, afterPr) {
  if (!id) throw new Error('this step needs --run');
  const at = where(deps.cwd, deps.env);
  const rec = readRun(id, deps);
  if (!rec) throw new Error(`no run ${id} on this host`);
  if (rec.outcome) throw new Error(`run ${id} ended as ${rec.outcome}`);
  if (readJson(path.join(at.lock, 'run.json'))?.id === id) {
    writeJson(path.join(at.lock, 'run.json'), { id, heartbeat: deps.now });
    return rec;
  }
  if (rec.pr && (afterPr === true || String(afterPr?.issue) === rec.issue.id)) return rec;
  throw new Ended(finish(rec, 'Aborted', deps, 'another run holds the lock'));
}

function logBody(rec) {
  const summary = { id: rec.id, started: rec.started, mode: rec.mode, issue: rec.issue?.id, fixed: Boolean(rec.issue), pr: rec.pr?.number,
    outcome: rec.outcome, disproved: rec.disproved };
  return `~~~text\n${card(rec).replace(/~{3,}/g, '~~')}\n~~~\n\n${hide('patrol-run', summary)}\n`;
}

function save(rec, deps) {
  writeJson(path.join(where(deps.cwd, deps.env).runs, `${rec.id}.json`), rec);
  if (rec.log) deps.forge.editNote(rec.log.issue, rec.log.note, logBody(rec));
}

function finish(rec, outcome, deps, reason) {
  if (!OUTCOMES.includes(outcome)) throw new Error(`unknown outcome: ${outcome}. Use one of: ${OUTCOMES.join(', ')}`);
  Object.assign(rec, { outcome, ended: deps.now }, reason && { reason });
  if (rec.issue && outcome !== 'Aborted') {
    const it = deps.forge.issue(rec.issue.id);
    relabel(deps.forge, it, { phase: { 'Needs owner': 'needs-owner', Stuck: 'stuck' }[outcome] ?? (rec.pr ? undefined : null) });
    writeState(deps.forge, it.id, { outcome });
  }
  save(rec, deps);
  release(rec, deps);
  return { run: rec.id, outcome, ...(reason && { reason }) };
}

export const own = (forge, id) => forge.notes(id).filter(n => n.author === forge.me());

function marked(note, header, marker) {
  const found = note.body.startsWith(header) && note.body.match(marker);
  return found ? JSON.parse(found[1]) : null;
}

const stateIn = note => marked(note, 'patrol state\n', STATE);

export function readState(notes) {
  return notes.map(stateIn).filter(Boolean).at(-1) ?? null;
}

function writeState(forge, id, patch, notes = own(forge, id)) {
  const note = notes.findLast(stateIn);
  const state = { ...(note ? stateIn(note) : {}), ...patch };
  const body = `patrol state\n\n${Object.entries(state).filter(([, v]) => v !== undefined)
    .map(([k, v]) => `- ${k}: ${flat(typeof v === 'object' ? JSON.stringify(v) : v)}`).join('\n')}\n\n${hide('patrol-state', state)}\n`;
  if (note) forge.editNote(id, note.id, body);
  else forge.addNote(id, body);
  return JSON.parse(JSON.stringify(state));
}

function relabel(forge, it, { phase, add = [], remove = [] }) {
  const want = new Set(it.labels);
  if (phase !== undefined) for (const p of PHASES) want.delete(LABELS[p]);
  if (phase) want.add(LABELS[phase]);
  if (['needs-owner', 'stuck'].includes(phase)) want.delete(LABELS.ready);
  for (const label of remove) want.delete(label);
  if (add.some(l => BAND_LABELS.includes(l))) for (const label of BAND_LABELS) want.delete(label);
  for (const label of add) want.add(label);
  const plus = [...want].filter(l => !it.labels.includes(l)), minus = it.labels.filter(l => !want.has(l));
  if (plus.length || minus.length) forge.labels(it.id, plus, minus);
  it.labels = [...want];
}

const runsOnLog = (forge, rec) => own(forge, rec.log.issue).map(n => marked(n, '~~~text\n', RUN)).filter(r => r && r.id !== rec.id);
const sameDay = (a, b) => new Date(a).toISOString().slice(0, 10) === new Date(b).toISOString().slice(0, 10);
const blocked = it => [LABELS.hold, LABELS['needs-owner'], LABELS.stuck, LABELS.working, LABELS['pr-open'], LABELS.disproved].some(l => it.labels.includes(l));
const order = (a, b) => (b.st.severity ?? -1) - (a.st.severity ?? -1) || (b.st.impact ?? 0) - (a.st.impact ?? 0) || String(a.it.created).localeCompare(String(b.it.created));
const scores = s => Object.entries(s ?? {}).map(([seat, score]) => `${seat} ${score}`).join(' · ');
const planText = plan => plan && [plan.round && `round ${plan.round}`, scores(plan.scores)].filter(Boolean).join(' · ');
const brief = ({ it, st }) => ({ id: it.id, title: it.title, severity: st.severity });

export function init({ forge }) {
  forge.ensureLabels([...Object.values(LABELS), ...BAND_LABELS]);
  const log = forge.issues(LABELS.log)[0]?.id ?? forge.createIssue({ title: 'Patrol log',
    body: 'Each patrol run edits one comment here. The comment shows the card and the run record.', labels: [LABELS.log] });
  forge.pin(log);
  return { log };
}

export function start({ id, model, config, commit, models, ...deps }) {
  const rec = open(id, deps), { forge, cwd } = deps;
  if (rec.config) throw new Error(`run ${id} already started`);
  const lead = models[config.lead];
  const problems = [];
  if (!model) problems.push('start needs --model, the model of this thread');
  if (!lead) problems.push(`the lead ${config.lead} is not in seats.json`);
  else if (model && lead.model !== model) problems.push(`this thread runs ${model}, but the lead ${config.lead} is ${lead.model}`);
  for (const seat of config.council.seats) if (!models[seat]) problems.push(`the seat ${seat} is not in seats.json`);
  const log = forge.issues(LABELS.log)[0];
  if (!log) problems.push('no open issue has the label patrol:log. Run init.');
  const tester = config.council.seats.find(s => models[s]?.family && lead?.family && models[s].family !== lead.family) ?? null;
  const mode = !tester && rank(config.mode) > rank('demo') ? 'demo' : config.mode;
  Object.assign(rec, { repo: path.basename(repoName(cwd)), commit, config, mode, review: config.review, lead: config.lead, tester,
    seats: Object.fromEntries([config.lead, ...config.council.seats].filter(s => models[s]).map(s => [s, models[s]])) });
  if (log) rec.log = { issue: log.id, note: forge.addNote(log.id, 'patrol: a run starts.') };
  rec.steps.Start = { status: 'now', text: `config ${createHash('sha256').update(JSON.stringify(config)).digest('hex').slice(0, 4)} · lock taken` };
  if (problems.length) throw new Ended(finish(rec, 'Incomplete', deps, problems.join('; ')));
  if (mode === 'paused') throw new Ended(finish(rec, 'Paused', deps));

  for (const it of forge.issues(LABELS.working)) {
    const pr = forge.findPr(`patrol/${it.id}`);
    relabel(forge, it, { phase: pr ? 'pr-open' : null });
    if (pr) writeState(forge, it.id, { pr: { number: pr.number, url: pr.url } });
  }
  const prs = [];
  for (const it of [LABELS['pr-open'], LABELS['needs-owner'], LABELS.stuck].flatMap(label => forge.issues(label))) {
    const parked = !it.labels.includes(LABELS['pr-open']);
    const st = readState(own(forge, it.id)) ?? {};
    if (parked && !st.pr) continue;
    const pr = st.pr && forge.pr(st.pr.number);
    if (pr?.state === 'merged') forge.close(it.id, `patrol: ${pr.url} merged.`);
    else if (pr?.state === 'open') prs.push({ number: pr.number, issue: it.id, text: st.outcome ?? (pr.updated ? `last change ${String(pr.updated).slice(0, 10)}` : 'open') });
    else if (!parked) relabel(forge, it, { phase: 'needs-owner' });
  }
  for (const it of forge.issues(LABELS.ready)) {
    if (it.labels.includes(LABELS.confirmed) && !it.labels.includes(LABELS['needs-owner']) && !it.labels.includes(LABELS.stuck)) continue;
    const notes = own(forge, it.id), st = readState(notes) ?? {};
    relabel(forge, it, { phase: prs.some(p => p.issue === it.id) ? 'pr-open' : null, add: [LABELS.confirmed], remove: [LABELS.disproved, ...(st.plan ? [] : [LABELS.ready])] });
    writeState(forge, it.id, { attempts: 0, outcome: undefined, ...(st.plan && { plan: { ...st.plan, approved: true } }) }, notes);
  }
  const fixes = runsOnLog(forge, rec).filter(r => r.fixed && sameDay(r.started, deps.now)).length;
  rec.prs = prs;
  rec.steps.Start = { status: 'done', text: `${rec.steps.Start.text}${mode !== config.mode ? ' · no tester, so demo' : ''}` };
  const next = waiting(rec, forge);
  save(rec, deps);
  return { run: rec.id, mode, review: rec.review, lead: rec.lead, tester, seats: rec.seats, config, log: log.id, fixes_today: fixes, ...next, prs };
}

function waiting(rec, forge) {
  const confirmed = forge.issues(LABELS.confirmed).map(it => ({ it, st: readState(own(forge, it.id)) ?? {} }));
  for (const { it, st } of confirmed) {
    const label = it.labels.find(l => BAND_LABELS.includes(l));
    if (!label || label === `patrol:sev-${band(st.severity ?? 0)}`) continue;
    st.severity = BANDS[BAND_LABELS.indexOf(label)][1];
    writeState(forge, it.id, { severity: st.severity });
  }
  const queue = confirmed.filter(x => !blocked(x.it)).sort(order);
  const approved = x => x.it.labels.includes(LABELS.ready) && x.st.plan?.approved;
  const seen = new Map();
  for (const label of ['bug', LABELS.triage]) for (const it of forge.issues(label)) seen.set(it.id, it);
  const triage = [...seen.values()].filter(it => !it.labels.some(l => l.startsWith('patrol:') && l !== LABELS.triage && !BAND_LABELS.includes(l)) && !readState(own(forge, it.id)));
  rec.queue = queue.slice(0, 3).map(brief);
  return {
    triage: triage.map(it => ({ id: it.id, title: it.title, body: it.body })),
    plan: queue.filter(x => !approved(x)).slice(0, rec.config.budget.plans_per_run).map(brief),
    ready: queue.filter(approved).map(brief),
  };
}

export function queue({ id, ...deps }) {
  const rec = open(id, deps);
  const result = waiting(rec, deps.forge);
  save(rec, deps);
  return result;
}

export function pick({ id, ...deps }) {
  const rec = open(id, deps), { forge } = deps, c = rec.config;
  if (rank(rec.mode) < rank('full-stop')) return { issue: null, reason: `the mode is ${rec.mode}` };
  const fixes = runsOnLog(forge, rec).filter(r => r.fixed && sameDay(r.started, deps.now)).length;
  if (fixes >= c.budget.fixes_per_day) return { issue: null, reason: `${fixes} fixes today, and the limit is ${c.budget.fixes_per_day}` };
  const ready = forge.issues(LABELS.ready).filter(it => it.labels.includes(LABELS.confirmed) && !blocked(it))
    .map(it => ({ it, st: readState(own(forge, it.id)) ?? {} })).filter(x => x.st.plan?.approved).sort(order);
  return ready.length ? { issue: brief(ready[0]) } : { issue: null, reason: 'no issue has patrol:ready and an approved plan' };
}

export function claim({ id, issue, ...deps }) {
  const rec = open(id, deps), { forge } = deps, c = rec.config;
  if (rank(rec.mode) < rank('full-stop')) throw new Error(`the mode is ${rec.mode}, so the run fixes no issue`);
  if (rec.issue) throw new Error(`run ${rec.id} already claimed issue #${rec.issue.id}`);
  const it = forge.issue(issue), notes = own(forge, it.id), st = readState(notes) ?? {};
  if (!it.labels.includes(LABELS.ready) || !it.labels.includes(LABELS.confirmed) || blocked(it) || !st.plan?.approved) {
    throw new Error(`issue #${it.id} is not ready: it needs patrol:ready, patrol:confirmed and an approved plan, and no hold, owner, stuck or PR label`);
  }
  const attempt = (st.attempts ?? 0) + 1;
  if (attempt > c.limits.attempts) {
    relabel(forge, it, { phase: 'stuck' });
    writeState(forge, it.id, { outcome: 'Stuck' }, notes);
    return { issue: null, stuck: it.id };
  }
  relabel(forge, it, { phase: 'working' });
  writeState(forge, it.id, { attempts: attempt }, notes);
  rec.issue = { id: it.id, title: it.title, attempt, severity: st.severity, why: st.why, plan: planText(st.plan) };
  rec.queue = (rec.queue ?? []).filter(q => q.id !== it.id);
  save(rec, deps);
  const plan = st.plan?.note && notes.find(n => n.id === st.plan.note)?.body;
  return { issue: it.id, title: it.title, body: it.body, attempt, branch: `patrol/${it.id}`, closes: forge.closes(it.id), plan: plan ?? null, tester: rec.tester };
}

export function mark({ id, issue, phase, add, remove, noteFile, state, ...deps }) {
  if (!issue) throw new Error('mark needs --id');
  const rec = open(id, deps, { issue }), { forge } = deps, c = rec.config;
  if (phase !== undefined && !PHASES.includes(phase)) throw new Error(`--phase must be one of ${PHASES.join(', ')}`);
  const list = value => (value ? value.split(',').map(s => s.trim()).filter(Boolean) : []);
  const plus = list(add), minus = list(remove);
  for (const label of plus) if (!label.startsWith('patrol:') || PHASES.some(p => LABELS[p] === label) || label === LABELS.log) throw new Error(`mark --add cannot set ${label}. Use --phase for a phase.`);
  for (const label of minus) if (!label.startsWith('patrol:') || label === LABELS.log) throw new Error(`mark --remove cannot remove ${label}`);
  const patch = state ? JSON.parse(state) : null;
  if (patch?.plan?.approved === true) {
    const low = c.council.seats.filter(s => !(patch.plan.scores?.[s] >= c.council.threshold));
    if (low.length) throw new Error(`an approved plan needs a score of at least ${c.council.threshold} from ${low.join(', ')}`);
  }
  const it = forge.issue(issue);
  relabel(forge, it, { phase, add: plus, remove: minus });
  const note = noteFile ? forge.addNote(it.id, fs.readFileSync(noteFile, 'utf8')) : undefined;
  if (patch?.plan && note) patch.plan.note = note;
  return { issue: it.id, labels: it.labels, ...(note && { note }), ...(patch && { state: writeState(forge, it.id, patch) }) };
}

export function verdict(votes, quorum, seats) {
  if (!Array.isArray(votes) || !votes.length) throw new Error('each finding needs the votes of the council');
  for (const seat of new Set([...seats, ...votes.map(v => v?.seat)])) {
    const count = votes.filter(v => v?.seat === seat).length;
    if (!seats.includes(seat)) throw new Error(`${seat} is not a seat of the council`);
    if (count !== 1) throw new Error(`each seat votes once, but ${seat} has ${count} votes`);
  }
  for (const v of votes) {
    if (!['confirm', 'disprove', 'unsure'].includes(v.vote)) throw new Error(`the vote of ${v.seat} must be confirm, disprove or unsure`);
    if (typeof v.evidence !== 'string' || !v.evidence.trim()) throw new Error(`the vote of ${v.seat} needs its evidence`);
    if (v.vote === 'confirm' && !(Number.isInteger(v.severity) && v.severity >= 0 && v.severity <= 10)) throw new Error(`the confirm vote of ${v.seat} needs a severity from 0 to 10`);
    if (v.vote === 'confirm' && !(Number.isInteger(v.impact) && v.impact >= 0 && v.impact <= 5)) throw new Error(`the confirm vote of ${v.seat} needs an impact from 0 to 5`);
  }
  const confirms = votes.filter(v => v.vote === 'confirm').sort((a, b) => a.severity - b.severity), disproves = votes.filter(v => v.vote === 'disprove');
  if (confirms.length >= quorum && !disproves.length && confirms.at(-1).severity - confirms[0].severity <= 2) {
    const chosen = confirms[Math.floor((confirms.length - 1) / 2)];
    return { verdict: 'confirmed', severity: chosen.severity, impact: chosen.impact, why: chosen.why };
  }
  if (disproves.length >= quorum && !confirms.length) return { verdict: 'disproved' };
  return { verdict: 'owner' };
}

const votesList = votes => votes.map(v => `- ${flat(v.seat)}: ${flat(v.vote)}${v.severity == null ? '' : `, severity ${flat(v.severity)}`}. ${flat(v.evidence)}`).join('\n');

export function publishIssues({ id, input, ...deps }) {
  const rec = open(id, deps), { forge } = deps, c = rec.config;
  const findings = readJson(path.join(input, 'findings.json'));
  if (!Array.isArray(findings)) throw new Error('findings.json is missing or is not a list');
  const disproved = new Set([...runsOnLog(forge, rec).flatMap(r => r.disproved ?? []), ...(rec.disproved ?? [])]);
  const filed = new Set(forge.issues(LABELS.triage, 'all').map(i => i.body.match(/<!-- patrol-finding-([0-9a-f]{12}) -->\s*$/)?.[1]).filter(Boolean));
  const result = { created: [], updated: [], disproved: [], skipped: [] };
  for (const f of findings) {
    const v = verdict(f?.votes, c.council.triage_quorum, c.council.seats);
    const labels = v.verdict === 'confirmed' ? [LABELS.confirmed, `patrol:sev-${band(v.severity)}`] : v.verdict === 'disproved' ? [LABELS.disproved] : [];
    const phase = v.verdict === 'owner' ? 'needs-owner' : undefined;
    const st = { triage: v.verdict, ...(v.verdict === 'confirmed' && { severity: v.severity, impact: v.impact, why: v.why }) };
    if (f.issue) {
      const it = forge.issue(String(f.issue));
      if (readState(own(forge, it.id))) { result.skipped.push(`#${it.id} (it went through Triage before)`); continue; }
      relabel(forge, it, { phase, add: labels.filter(l => !BAND_LABELS.includes(l) || !it.labels.some(b => BAND_LABELS.includes(b))) });
      writeState(forge, it.id, st);
      forge.addNote(it.id, `patrol: the council voted ${v.verdict}.\n\n${votesList(f.votes)}`);
      result.updated.push({ id: it.id, verdict: v.verdict });
      continue;
    }
    if (typeof f.title !== 'string' || typeof f.body !== 'string' || !f.title.trim()) { result.skipped.push('a finding without a title or body'); continue; }
    const fp = fingerprint(f.key ?? f.title);
    if (filed.has(fp)) { result.skipped.push(`${f.title} (already filed)`); continue; }
    if (disproved.has(fp)) { result.skipped.push(`${f.title} (disproved before)`); continue; }
    if ((rec.found ?? 0) >= c.scan.max_findings) { result.skipped.push(`${f.title} (more than ${c.scan.max_findings} findings)`); continue; }
    rec.found = (rec.found ?? 0) + 1;
    if (v.verdict === 'disproved') {
      rec.disproved = [...(rec.disproved ?? []), fp];
      result.disproved.push(f.title);
      continue;
    }
    const created = forge.createIssue({ title: flat(f.title).slice(0, 200), body: `${f.body.slice(0, 30000)}\n\n${votesList(f.votes)}\n\n<!-- patrol-finding-${fp} -->\n`,
      labels: [LABELS.triage, ...labels, ...(phase ? [LABELS[phase]] : [])] });
    writeState(forge, created, st, []);
    filed.add(fp);
    result.created.push({ id: created, verdict: v.verdict });
  }
  save(rec, deps);
  return result;
}

const head = cwd => exec('git', ['rev-parse', 'HEAD'], { cwd }).trim();
const mergeBase = (cwd, rec) => exec('git', ['merge-base', `origin/${rec.config.forge.base}`, 'HEAD'], { cwd }).trim();

export function patchId(cwd, base) {
  const diff = exec('git', ['diff', '--binary', base, 'HEAD'], { cwd });
  return diff ? exec('git', ['patch-id', '--verbatim'], { cwd, input: diff }).split(' ')[0] : '';
}

export function diffStat(cwd, base) {
  const files = [];
  let lines = 0;
  for (const row of exec('git', ['diff', '--no-renames', '--numstat', '-z', base, 'HEAD'], { cwd }).split('\0').filter(Boolean)) {
    const [added, removed, name] = row.split('\t');
    files.push(name);
    lines += (Number(added) || 0) + (Number(removed) || 0);
  }
  return { files, lines };
}

export function gate({ id, stage, live, ...deps }) {
  const rec = open(id, deps, true), { forge, cwd } = deps, c = rec.config;
  if (!['push', 'handoff', 'merge'].includes(stage)) throw new Error('--stage must be push, handoff or merge');
  if (!rec.issue) throw new Error('gate needs a claimed issue');
  const mode = MODES[Math.min(rank(rec.mode), rank(live.mode))];
  const problems = [];
  if (rank(mode) < rank(stage === 'merge' ? 'full-send' : 'full-stop')) problems.push(`the mode is ${mode}`);
  if (forge.issue(rec.issue.id).labels.includes(LABELS.hold)) problems.push(`issue #${rec.issue.id} has patrol:hold`);
  const base = mergeBase(cwd, rec);
  const { files, lines } = diffStat(cwd, base);
  for (const file of files) if (BLOCKED.some(re => re.test(file))) problems.push(`the diff changes a protected path: ${file}`);
  if (files.length > c.limits.max_files) problems.push(`the diff changes ${files.length} files, more than ${c.limits.max_files}`);
  if (lines > c.limits.max_lines) problems.push(`the diff changes ${lines} lines, more than ${c.limits.max_lines}`);
  const gates = (c.owner_gates ?? []).map(g => ({ reason: g.reason, files: files.filter(f => g.paths.some(p => f.startsWith(p))) })).filter(g => g.files.length);
  if (gates.length) rec.steps.Owner = { status: 'owner', text: `at the end: ${gates.map(g => `${g.reason}, the diff changes ${g.files.join(', ')}`).join('; ')}` };
  if (stage !== 'push') {
    const at = head(cwd);
    if (['both', 'council'].includes(rec.review)) {
      const review = rec.steps.Review;
      const low = c.council.seats.filter(s => !(review?.scores?.[s] >= c.council.threshold));
      if (low.length) problems.push(`the council score of ${low.join(', ')} is missing or below ${c.council.threshold}`);
      else if (review.patch_id !== patchId(cwd, base)) problems.push('the patch changed after the council review');
    }
    if (rec.steps.Checks?.verify !== 'pass' || rec.steps.Checks.verify_head !== at) problems.push(`verify-pr has no pass at ${at.slice(0, 7)}`);
    if (!rec.pr) problems.push('the run has no PR');
    else {
      const pr = forge.pr(rec.pr.number);
      if (pr.state !== 'open') problems.push(`the PR is ${pr.state}`);
      if (pr.head !== at) problems.push(`the PR head ${String(pr.head).slice(0, 7)} is not ${at.slice(0, 7)}`);
      const checks = forge.checks(at, pr.number);
      for (const name of c.merge.required_checks) if (checks[name] !== 'success') problems.push(`the check ${name} is ${checks[name] ?? 'missing'}`);
    }
  }
  if (stage === 'merge' && gates.length) problems.push(`an owner gate stops the merge: ${gates.map(g => g.reason).join(', ')}`);
  save(rec, deps);
  return { ok: !problems.length, stage, mode, owner: gates.length > 0, files: files.length, lines, problems };
}

export function record({ id, step, data, pr, outcome, reason, calls, ...deps }) {
  const rec = open(id, deps, true), { forge, cwd } = deps;
  if (rec.issue && step && forge.issue(rec.issue.id).labels.includes(LABELS.hold)) throw new Ended(finish(rec, 'Incomplete', deps, `issue #${rec.issue.id} has patrol:hold`));
  if (calls) {
    rec.calls += calls;
    const limit = rec.config.budget.council_calls_per_run;
    if (rec.calls > limit) throw new Ended(finish(rec, 'Budget', deps, `the run needs council call ${rec.calls}, and the limit is ${limit}`));
  }
  if (step) {
    if (![...ROWS, ...ISSUE_ROWS].includes(step)) throw new Error(`--step must be one of ${[...ROWS, ...ISSUE_ROWS].join(', ')}`);
    const patch = data ? JSON.parse(data) : {};
    if (patch.status !== undefined && !MARKS[patch.status]) throw new Error(`status must be one of ${Object.keys(MARKS).join(', ')}`);
    if (step === 'Review' && patch.scores) patch.patch_id = patchId(cwd, mergeBase(cwd, rec));
    if (step === 'Checks' && patch.verify) patch.verify_head = head(cwd);
    rec.steps[step] = { ...rec.steps[step], ...patch, status: patch.status ?? (patch.verify && patch.verify !== 'pass' ? 'fail' : 'done') };
    if (step === 'Checks' && patch.verify && rec.issue) writeState(forge, rec.issue.id, { verify: { verdict: patch.verify, head: patch.verify_head } });
  }
  if (pr) {
    if (!rec.issue) throw new Error('record --pr needs a claimed issue');
    const found = forge.pr(String(pr));
    rec.pr = { number: found.number, url: found.url };
    const it = forge.issue(rec.issue.id);
    relabel(forge, it, { phase: 'pr-open' });
    writeState(forge, it.id, { pr: rec.pr });
    release(rec, deps);
  }
  if (outcome) return finish(rec, outcome, deps, reason);
  save(rec, deps);
  return { run: rec.id, steps: Object.keys(rec.steps), calls: rec.calls, ...(rec.pr && { pr: rec.pr }) };
}

export function card(rec) {
  const c = rec.config;
  const off = row => (OFF[rec.mode] ?? []).includes(row) || (row === 'Review' && rec.review === 'sol-loop');
  const row = (name, step) => {
    const mark = step ? MARKS[step.status ?? 'done'] : off(name) ? '-' : ' ';
    const why = !off(name) ? '' : (OFF[rec.mode] ?? []).includes(name) ? `off in ${rec.mode} mode` : 'off, review is sol-loop';
    const words = step ? [step.text && flat(step.text), step.scores && `${step.round ? `round ${step.round} · ` : ''}${scores(step.scores)}`,
      step.verify && `verify-pr ${step.verify} at ${String(step.verify_head).slice(0, 7)}`].filter(Boolean).join(' · ') : why;
    return ` [${mark}] ${name.padEnd(9)} ${words}`.trimEnd();
  };
  const lines = [`Patrol · ${rec.repo ?? '?'} · ${rec.mode ?? '?'} · review ${rec.review ?? '?'} · origin/${c?.forge.base ?? '?'} ${String(rec.commit ?? '').slice(0, 7)} · ${new Date(rec.started).toISOString().slice(11, 16)} UTC`];
  if (rec.seats) {
    const family = seat => rec.seats[seat]?.family ?? 'unknown';
    lines.push(`Lead ${rec.lead} (${family(rec.lead)}) · seats ${c.council.seats.join(', ')} · tester ${rec.tester ? `${rec.tester} (${family(rec.tester)})` : 'none'}`);
  }
  for (const name of ROWS) lines.push(row(name, rec.steps[name]));
  if (rec.issue) {
    const i = rec.issue;
    lines.push('', `Issue #${i.id} ${flat(i.title)}`);
    lines.push(`Severity ${i.severity === undefined ? '?' : `${i.severity}/10 ${band(i.severity)}`}${i.why ? ` (${flat(i.why)})` : ''} · attempt ${i.attempt} of ${c.limits.attempts}`);
    lines.push(row('Plan', { text: i.plan || 'approved' }));
  }
  if (rec.issue || rec.mode) for (const name of ISSUE_ROWS) if (name !== 'Owner' || rec.steps.Owner) lines.push(row(name, rec.steps[name]));
  const footer = [rec.prs?.length && `Open patrol PRs: ${rec.prs.map(p => `#${p.number} (issue #${p.issue}) ${p.text}`).join(' · ')}`,
    rec.queue?.length && `Next in queue: ${rec.queue.map(q => `#${q.id} (${q.severity ?? '?'}/10)`).join(', ')}`].filter(Boolean);
  if (footer.length) lines.push('', ...footer);
  if (rec.outcome) lines.push('', `Outcome: ${rec.outcome}${rec.reason ? ` · ${flat(rec.reason)}` : ''}`);
  return lines.join('\n');
}

export function agentEnv(env, outDir) {
  const clean = Object.fromEntries(Object.entries(env).filter(([key]) => !FORGE_TOKENS.includes(key.toUpperCase())));
  return { ...clean, PATROL_OUT: outDir };
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
    const content = fs.readFileSync(file, 'latin1');
    const clean = secrets.reduce((acc, secret) => acc.split(Buffer.from(secret).toString('latin1')).join('[redacted]'), content);
    if (clean !== content) fs.writeFileSync(file, clean, 'latin1');
  }
}

export async function agent({ prompt, out, minutes = 45, cwd = process.cwd(), env = process.env }) {
  const command = env.PATROL_AGENT;
  if (!command) throw new Error('set PATROL_AGENT to the agent command, for example: codex exec --full-auto -');
  const repo = fs.realpathSync.native(exec('git', ['rev-parse', '--show-toplevel'], { cwd }).trim());
  fs.mkdirSync(out, { recursive: true });
  const outDir = fs.realpathSync.native(out);
  if (inside(outDir, repo)) throw new Error('--out must be outside the repository');
  const base = exec('git', ['rev-parse', 'HEAD'], { cwd: repo }).trim();
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
    child.stdin.end(fs.readFileSync(prompt, 'utf8'));
  });
  fs.closeSync(log);
  exec('git', ['add', '-A', '-N'], { cwd: repo });
  fs.writeFileSync(path.join(outDir, 'patch.diff'), exec('git', ['diff', '--binary', base], { cwd: repo }));
  redact(outDir, env);
  const result = { exitCode: code, timedOut, seconds: Math.round((Date.now() - started) / 1000), base, report: fs.existsSync(path.join(outDir, 'report.md')) };
  fs.writeFileSync(path.join(outDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

function readText(file, limit = 60000) {
  try { return fs.readFileSync(file, 'utf8').slice(0, limit); } catch { return ''; }
}

export function publishComment({ forge, input, pr }) {
  if (!pr) throw new Error('--mode comment needs --pr');
  const result = readJson(path.join(input, 'result.json'));
  const report = readText(path.join(input, 'report.md'));
  const failed = !result || result.exitCode !== 0 || result.timedOut || !report;
  const changed = fs.existsSync(path.join(input, 'patch.diff')) && fs.statSync(path.join(input, 'patch.diff')).size > 0;
  const head = failed ? `patrol: the tester did not finish (${result?.timedOut ? 'deadline' : `exit ${result?.exitCode ?? 'unknown'}`}). The result is incomplete.\n\n` : '';
  const note = changed ? '\n\npatrol: the tester changed files in its checkout. Those changes are ignored.\n' : '';
  forge.commentPr(pr, `${head}${report || 'No report.'}${note}`);
  return { posted: true };
}

const STEPS = { queue, pick, claim, mark, gate, record };

export async function main(argv, { env = process.env, run = exec, now = Date.now(), cwd = process.cwd() } = {}) {
  const [command, ...rest] = argv;
  const opts = options(rest);
  if (command === 'agent') {
    if (!opts.prompt || !opts.out) throw new Error('agent needs --prompt and --out');
    const result = await agent({ prompt: opts.prompt, out: opts.out, minutes: opts.minutes, cwd, env });
    return { result, code: result.exitCode !== 0 || result.timedOut ? 1 : 0 };
  }
  if (command === 'publish' && opts.mode === 'comment') {
    if (!opts.in) throw new Error('publish needs --in');
    return { result: publishComment({ forge: forgeFor({ kind: opts.forge }, run, env), input: opts.in, pr: opts.pr }), code: 0 };
  }
  const root = exec('git', ['rev-parse', '--show-toplevel'], { cwd }).trim();
  const deps = { cwd: root, env, now };
  const live = () => {
    exec('git', ['fetch', '--quiet', 'origin'], { cwd: root });
    return readConfig(root);
  };
  try {
    if (command === 'init') return { result: init({ forge: forgeFor(live().forge, run, env) }), code: 0 };
    if (command === 'lock') {
      const result = lock({ ...deps, config: live() });
      return { result, code: result.outcome ? 3 : 0 };
    }
    if (command === 'card') {
      const rec = readRun(opts.run, deps);
      if (!rec) throw new Error(`no run ${opts.run} on this host`);
      return { result: card(rec), code: 0 };
    }
    if (command === 'start') {
      const config = override(live(), opts.override);
      const models = readJson(path.join(env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'sentinel', 'seats.json'))?.models ?? {};
      const commit = exec('git', ['rev-parse', 'origin/HEAD'], { cwd: root }).trim();
      return { result: start({ id: opts.run, model: opts.model, config, commit, models, ...deps, forge: forgeFor(config.forge, run, env) }), code: 0 };
    }
    const rec = opts.run && readRun(opts.run, deps);
    if (!rec) throw new Error(opts.run ? `no run ${opts.run} on this host` : 'this step needs --run');
    if (!rec.config && !(command === 'record' && opts.outcome && Object.keys(opts).every(k => ['run', 'outcome', 'reason'].includes(k)))) {
      throw new Error(`run ${opts.run} has not started. Run start first, or record its outcome.`);
    }
    const forge = rec.config && forgeFor(rec.config.forge, run, env);
    if (command === 'publish') {
      if (opts.mode !== 'issues' || !opts.in) throw new Error('publish needs --mode issues --in DIR, or --mode comment');
      return { result: publishIssues({ id: opts.run, input: opts.in, ...deps, forge }), code: 0 };
    }
    if (!STEPS[command]) throw new Error('usage: patrol.mjs init|lock|start|queue|pick|claim|mark|publish|gate|record|card|agent [options]');
    const result = STEPS[command]({ ...opts, id: opts.run, issue: opts.id, ...deps, forge, ...(command === 'gate' && { live: live() }) });
    return { result, code: command === 'gate' && !result.ok ? 1 : 0 };
  } catch (error) {
    if (error instanceof Ended) return { result: error.result, code: 3 };
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(({ result, code }) => {
    console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
    process.exitCode = code;
  }, error => { console.error(`patrol: ${error.message}`); process.exitCode = 2; });
}
