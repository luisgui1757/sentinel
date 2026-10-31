import fs from 'node:fs';
import path from 'node:path';

const script = `#!/usr/bin/env node
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const tmp = process.env.FAKE_GH_DIR;
const statePath = tmp + '/gh-state.json';
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const args = process.argv.slice(2);
fs.appendFileSync(tmp + '/gh.log', JSON.stringify(args) + '\\n');
const save = () => fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
const flag = (...names) => { for (const name of names) { const i = args.indexOf(name); if (i >= 0) return args[i + 1]; const eq = args.find(a => a.startsWith(name + '=')); if (eq) return eq.slice(name.length + 1); } return null; };
const has = (...names) => names.some(name => args.includes(name));
const booleans = new Set(['--web', '-w', '--draft', '-d', '--fill', '-f', '--fill-first', '--squash', '-s', '--merge', '-m', '--rebase', '-r', '--auto', '--disable-auto', '--delete-branch', '--admin', '--undo', '--name-only', '--watch', '--required', '--fail-fast', '--yes', '-y', '--force', '--detach', '--patch', '--paginate', '--silent', '-i', '--include']);
const positional = () => { const out = []; for (let i = 2; i < args.length; i++) { const x = args[i]; if (x.startsWith('-')) { if (!booleans.has(x) && !x.includes('=')) i++; continue; } out.push(x); } return out; };
const body = () => { const file = flag('--body-file', '-F'); return [flag('--body', '-b', '--comment', '-c'), file ? fs.readFileSync(file === '-' ? 0 : file, 'utf8') : null].filter(Boolean).join('\\n'); };
const record = (pr, command, text) => fs.appendFileSync(tmp + '/bodies.jsonl', JSON.stringify({ pr, command, text }) + '\\n');
const git = (...a) => spawnSync('git', ['--git-dir', state.remote, ...a], { encoding: 'utf8' });
const sha = ref => git('rev-parse', '--verify', '-q', ref).stdout.trim() || null;
const current = () => spawnSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).stdout.trim();
const find = key => { const k = String(key ?? current()).replace(/^#/, ''); return state.prs.find(p => String(p.number) === k || p.url === k || p.headRefName === k); };
const target = () => find(positional()[0] ?? null);
const live = p => {
  const head = sha('refs/heads/' + p.headRefName), main = sha('refs/heads/main');
  const onMain = head && main && git('merge-base', '--is-ancestor', main, head).status === 0;
  const conflict = head && main && !onMain && git('merge-tree', '--write-tree', main, head).status === 1;
  const commits = head && main ? git('log', '--format=%H%x1f%s%x1f%b%x1e', main + '..' + head).stdout.split('\\x1e').map(x => x.trim()).filter(Boolean).map(x => { const [oid, messageHeadline, messageBody] = x.split('\\x1f'); return { oid, messageHeadline, messageBody }; }) : [];
  return { ...p, headRefOid: head, mergeStateStatus: p.state !== 'OPEN' ? 'UNKNOWN' : onMain ? 'CLEAN' : conflict ? 'DIRTY' : 'BEHIND', mergeable: conflict ? 'CONFLICTING' : 'MERGEABLE',
    statusCheckRollup: [{ name: 'test', status: 'COMPLETED', conclusion: 'SUCCESS' }], reviewDecision: '', autoMergeRequest: p.autoMerge ? {} : null, commits,
    headRepository: { name: 'app' }, headRepositoryOwner: { login: 'acme' }, isCrossRepository: false, reviews: [], latestReviews: [], comments: [], reviewRequests: [], labels: [], assignees: [],
    closingIssuesReferences: [], files: [], additions: 0, deletions: 0, createdAt: '2026-09-01T10:00:00Z', updatedAt: '2026-09-01T10:00:00Z', mergedAt: p.state === 'MERGED' ? '2026-10-31T10:00:00Z' : null };
};
const out = value => {
  const text = JSON.stringify(value);
  const jq = flag('--jq', '-q');
  if (jq) { const r = spawnSync('jq', ['-r', jq], { input: text, encoding: 'utf8' }); process.stdout.write(r.stdout); process.exit(r.status ?? 0); }
  process.stdout.write(text + '\\n');
};
const fail = (message, code = 1) => { process.stderr.write(message + '\\n'); process.exit(code); };
const merge = (p, mode) => {
  if (!p) fail('no pull request found');
  if (mode === 'disable') p.autoMerge = false; else if (mode === 'auto') p.autoMerge = true; else { p.merged = true; p.state = 'MERGED'; }
  save(); console.log((mode === 'disable' ? 'disabled auto-merge for ' : mode === 'auto' ? 'enabled auto-merge for ' : 'merged ') + p.url); process.exit(0);
};
const create = (title, text, head, base, draft) => {
  if (!sha('refs/heads/' + head)) fail('aborted: you must first push the current branch to a remote, or use the --head flag');
  const open = state.prs.find(p => p.headRefName === head && p.state === 'OPEN');
  if (open) fail('a pull request for branch "' + head + '" into branch "' + base + '" already exists:\\n' + open.url);
  const number = Math.max(0, ...state.prs.map(p => p.number)) + 1;
  const p = { number, state: 'OPEN', title, body: text, headRefName: head, baseRefName: base, isDraft: draft, author: { login: 'eval' }, url: 'https://github.com/acme/app/pull/' + number };
  state.prs.push(p); save(); record(number, 'create', title + '\\n' + text); return p;
};
const [a, b] = args;
if (a === 'auth') { console.log('Logged in to github.com account eval'); process.exit(0); }
if (a === 'repo' && b === 'view') { const repo = { nameWithOwner: 'acme/app', name: 'app', owner: { login: 'acme' }, defaultBranchRef: { name: 'main' }, url: 'https://github.com/acme/app', mergeCommitAllowed: false, squashMergeAllowed: true, rebaseMergeAllowed: false }; if (has('--json')) out(repo); else console.log('acme/app\\n\\nname:\\tacme/app\\ndefault branch:\\tmain'); }
else if (a === 'pr' && b === 'list') { const head = flag('--head', '-H'); const st = (flag('--state', '-s') ?? 'open').toUpperCase(); out(state.prs.filter(p => (!head || p.headRefName === head) && (st === 'ALL' || p.state === st)).map(live)); }
else if (a === 'pr' && b === 'view') { const p = target(); if (!p) fail('no pull requests found for branch "' + current() + '"'); if (has('--json')) out(live(p)); else console.log('title:\\t' + p.title + '\\nstate:\\t' + p.state + '\\nnumber:\\t' + p.number + '\\nurl:\\t' + p.url + '\\n--\\n' + (p.body || '')); }
else if (a === 'pr' && b === 'create') {
  const head = (flag('--head', '-H') ?? current()).replace(/^[^:]*:/, ''), base = flag('--base', '-B') ?? 'main';
  let title = flag('--title', '-t'), text = body();
  if (has('--fill', '-f', '--fill-first')) {
    const log = spawnSync('git', ['log', '--format=%s%x1f%b%x1e', 'origin/' + base + '..HEAD'], { encoding: 'utf8' }).stdout.split('\\x1e').map(x => x.trim()).filter(Boolean).map(x => x.split('\\x1f'));
    title = title ?? log.at(-1)?.[0] ?? head; text = text || log.map(([s, bodyText]) => s + (bodyText ? '\\n\\n' + bodyText : '')).join('\\n\\n');
  }
  console.log(create(title ?? '', text, head, base, has('--draft', '-d')).url);
}
else if (a === 'pr' && b === 'edit') { const p = target(); if (!p) fail('no pull request found'); const t = flag('--title', '-t'); if (t) p.title = t; const text = body(); if (text) p.body = text; save(); record(p.number, 'edit', (t ?? '') + '\\n' + text); console.log(p.url); }
else if (a === 'pr' && b === 'ready') { const p = target(); if (!p) fail('no pull request found'); p.isDraft = has('--undo'); save(); console.log(p.url); }
else if (a === 'pr' && b === 'merge') merge(target(), has('--disable-auto') ? 'disable' : has('--auto') ? 'auto' : 'merge');
else if (a === 'pr' && b === 'close') { const p = target(); if (!p) fail('no pull request found'); p.state = 'CLOSED'; save(); record(p.number, 'close', body()); console.log('closed ' + p.url); }
else if (a === 'pr' && (b === 'comment' || b === 'review')) { const p = target(); if (!p) fail('no pull request found'); record(p.number, b, body()); console.log(p.url + '#issuecomment-1'); }
else if (a === 'pr' && b === 'checkout') {
  const p = target(); if (!p) fail('no pull request found');
  const run = (...x) => spawnSync('git', x, { encoding: 'utf8', stdio: 'inherit' });
  run('fetch', '-q', 'origin', '+refs/heads/' + p.headRefName + ':refs/remotes/origin/' + p.headRefName);
  run('checkout', '-q', '-B', p.headRefName, 'origin/' + p.headRefName);
  run('branch', '-q', '--set-upstream-to=origin/' + p.headRefName);
}
else if (a === 'pr' && b === 'checks') { const rows = [{ name: 'test', bucket: 'pass', state: 'SUCCESS', link: 'https://ci.example/1', description: 'tests passed', workflow: 'ci' }]; if (has('--json')) out(rows); else console.log('test\\tpass\\t12s\\thttps://ci.example/1'); }
else if (a === 'pr' && b === 'diff') { const p = target(); if (!p) fail('no pull request found'); process.stdout.write(git('diff', ...(has('--name-only') ? ['--name-only'] : []), 'refs/heads/main...refs/heads/' + p.headRefName).stdout); }
else if (a === 'run') out([]);
else if (a === 'api') {
  const valued = new Set(['-f', '-F', '--field', '--raw-field', '-X', '--method', '--jq', '-q', '-H', '--header', '--input', '-t', '--template']);
  const route = args.find((x, i) => i > 0 && !x.startsWith('-') && !valued.has(args[i - 1])) ?? '';
  const fields = {}; for (let i = 0; i < args.length; i++) if (['-f', '-F', '--field', '--raw-field'].includes(args[i])) { const [k, ...v] = args[i + 1].split('='); fields[k] = v.join('='); }
  const method = (flag('-X', '--method') ?? (Object.keys(fields).length || has('--input') ? 'POST' : 'GET')).toUpperCase();
  if (route === 'graphql') {
    const query = fields.query ?? '';
    const number = Number(fields.number);
    if (/mutation/.test(query)) {
      const p = state.prs.find(x => x.number === number) ?? state.prs.find(x => x.state === 'OPEN');
      if (/disablePullRequestAutoMerge/.test(query)) merge(p, 'disable');
      if (/enablePullRequestAutoMerge/.test(query)) merge(p, 'auto');
      if (/mergePullRequest/.test(query)) merge(p, 'merge');
      if (/closePullRequest/.test(query) && p) { p.state = 'CLOSED'; save(); }
      out({ data: {} }); process.exit(0);
    }
    const p = state.prs.find(x => x.number === number);
    if (!p) fail('Could not resolve to a PullRequest');
    const l = live(p);
    out({ data: { viewer: { login: 'eval' }, repository: { pullRequest: { url: p.url, state: p.state, headRefOid: l.headRefOid, baseRefName: p.baseRefName, mergeStateStatus: l.mergeStateStatus,
      author: p.author, baseRef: { target: { oid: sha('refs/heads/main') } }, comments: { nodes: [] }, reviewRequests: { totalCount: 0 }, reviews: { nodes: [] }, reviewThreads: { nodes: [] } } } } });
  }
  else if (/\\/pulls\\/\\d+\\/merge$/.test(route)) { const p = state.prs.find(x => String(x.number) === route.match(/pulls\\/(\\d+)/)[1]); if (method === 'PUT') merge(p, 'merge'); if (p?.state === 'MERGED') process.exit(0); fail('gh: Not Found (HTTP 404)'); }
  else if (/\\/pulls\\/\\d+$/.test(route)) {
    const p = state.prs.find(x => String(x.number) === route.split('/').pop()); if (!p) fail('gh: Not Found (HTTP 404)');
    if (method === 'PATCH') { if (fields.state === 'closed') p.state = 'CLOSED'; if (fields.title) p.title = fields.title; if (fields.body) p.body = fields.body; save(); record(p.number, 'api', (fields.title ?? '') + '\\n' + (fields.body ?? '')); }
    const l = live(p); out({ number: p.number, state: p.state === 'OPEN' ? 'open' : 'closed', title: p.title, body: p.body, draft: p.isDraft, merged: !!p.merged, html_url: p.url, head: { ref: p.headRefName, sha: l.headRefOid }, base: { ref: p.baseRefName, sha: sha('refs/heads/main') }, mergeable: l.mergeable !== 'CONFLICTING', mergeable_state: l.mergeStateStatus.toLowerCase() });
  }
  else if (/\\/pulls$/.test(route) && method === 'POST') { const p = create(fields.title ?? '', fields.body ?? '', (fields.head ?? '').replace(/^[^:]*:/, ''), fields.base ?? 'main', fields.draft === 'true'); out({ number: p.number, html_url: p.url, state: 'open' }); }
  else if (/\\/rules\\/branches\\//.test(route)) out([{ type: 'required_status_checks', parameters: { required_status_checks: [{ context: 'test' }] } }]);
  else if (/\\/protection/.test(route)) fail('gh: Not Found (HTTP 404)');
  else if (/\\/compare\\//.test(route)) { const [, from, to] = route.match(/compare\\/(.+)\\.\\.\\.(.+)$/) ?? []; const behind = from && to ? Number(git('rev-list', '--count', to + '..' + from).stdout.trim() || 0) : 0; out({ files: [], behind_by: behind, ahead_by: 1 }); }
  else if (/\\/check-runs$/.test(route)) out({ check_runs: [{ name: 'test', status: 'completed', conclusion: 'success' }] });
  else if (/\\/(issues|pulls)\\/\\d+\\/comments$/.test(route) && method === 'POST') { record(Number(route.match(/\\/(\\d+)\\//)[1]), 'api-comment', fields.body ?? ''); out({ html_url: 'https://github.com/acme/app/pull/1#issuecomment-1' }); }
  else if (/\\/(issues|pulls)\\/\\d+\\/comments$/.test(route) || /\\/reviews$/.test(route)) out([]);
  else out({});
}
else fail('gh: this command is not supported in this test: ' + args.join(' '));
`;

export function writeFakeGh(bin, tmp, state) {
  fs.writeFileSync(path.join(tmp, 'gh-state.json'), JSON.stringify(state, null, 2));
  fs.writeFileSync(path.join(bin, 'gh'), script.replace("process.env.FAKE_GH_DIR", JSON.stringify(tmp)), { mode: 0o755 });
}

export function watchRemote(remote, tmp) {
  const hook = path.join(remote, 'hooks', 'update');
  fs.writeFileSync(hook, `#!/bin/sh\necho "$1 $2 $3" >> ${JSON.stringify(path.join(tmp, 'remote-updates.log'))}\n`, { mode: 0o755 });
}

export function mainUpdates(tmp) {
  const file = path.join(tmp, 'remote-updates.log');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(line => line.startsWith('refs/heads/main ')) : [];
}

export function ghCalls(tmp) {
  const file = path.join(tmp, 'gh.log');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
}

export function ghBodies(tmp) {
  const file = path.join(tmp, 'bodies.jsonl');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
}

export function ghState(tmp) {
  return JSON.parse(fs.readFileSync(path.join(tmp, 'gh-state.json'), 'utf8'));
}
