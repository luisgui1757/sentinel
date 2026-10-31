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
const body = () => { const file = flag('--body-file', '-F'); return [flag('--body', '-b', '--comment', '-c'), file ? fs.readFileSync(file === '-' ? 0 : file, 'utf8') : null].filter(Boolean).join('\\n'); };
const record = (pr, command, text) => fs.appendFileSync(tmp + '/bodies.jsonl', JSON.stringify({ pr, command, text }) + '\\n');
const sha = ref => spawnSync('git', ['--git-dir', state.remote, 'rev-parse', '--verify', '-q', ref], { encoding: 'utf8' }).stdout.trim() || null;
const current = () => spawnSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).stdout.trim();
const find = key => { const k = String(key ?? current()).replace(/^#/, ''); return state.prs.find(p => String(p.number) === k || p.url === k || p.headRefName === k); };
const live = p => ({ ...p, headRefOid: sha('refs/heads/' + p.headRefName), mergeStateStatus: p.state === 'OPEN' ? 'CLEAN' : 'UNKNOWN', mergeable: 'MERGEABLE',
  statusCheckRollup: [{ name: 'test', status: 'COMPLETED', conclusion: 'SUCCESS' }], reviewDecision: '', autoMergeRequest: p.autoMerge ? {} : null });
const out = value => {
  const text = JSON.stringify(value);
  const jq = flag('--jq', '-q');
  if (jq) { const r = spawnSync('jq', ['-r', jq], { input: text, encoding: 'utf8' }); process.stdout.write(r.stdout); process.exit(r.status ?? 0); }
  process.stdout.write(text + '\\n');
};
const fail = (message, code = 1) => { process.stderr.write(message + '\\n'); process.exit(code); };
const merge = p => { if (!p) fail('no pull request found'); p.merged = true; if (has('--auto')) p.autoMerge = true; else p.state = 'MERGED'; save(); console.log('merged ' + p.url); process.exit(0); };
const [a, b, c] = args;
if (a === 'auth') { console.log('Logged in to github.com account eval'); process.exit(0); }
if (a === 'repo' && b === 'view') out({ nameWithOwner: 'acme/app', name: 'app', owner: { login: 'acme' }, defaultBranchRef: { name: 'main' }, url: 'https://github.com/acme/app', mergeCommitAllowed: false, squashMergeAllowed: true, rebaseMergeAllowed: false });
else if (a === 'pr' && b === 'list') { const head = flag('--head', '-H'); const st = (flag('--state', '-s') ?? 'open').toUpperCase(); out(state.prs.filter(p => (!head || p.headRefName === head) && (st === 'ALL' || p.state === st)).map(live)); }
else if (a === 'pr' && b === 'view') { const p = find(c && !c.startsWith('-') ? c : null); if (!p) fail('no pull requests found for branch'); if (has('--json')) out(live(p)); else console.log('title:\\t' + p.title + '\\nstate:\\t' + p.state + '\\nnumber:\\t' + p.number + '\\nurl:\\t' + p.url + '\\n--\\n' + (p.body || '')); }
else if (a === 'pr' && b === 'create') {
  const head = (flag('--head', '-H') ?? current()).replace(/^[^:]*:/, '');
  if (!sha('refs/heads/' + head)) fail('aborted: you must first push the current branch to a remote, or use the --head flag');
  if (state.prs.some(p => p.headRefName === head && p.state === 'OPEN')) fail('a pull request for branch "' + head + '" into branch "main" already exists:\\n' + state.prs.find(p => p.headRefName === head && p.state === 'OPEN').url);
  const number = Math.max(0, ...state.prs.map(p => p.number)) + 1;
  const p = { number, state: 'OPEN', title: flag('--title', '-t') ?? '', body: body(), headRefName: head, baseRefName: flag('--base', '-B') ?? 'main', isDraft: has('--draft', '-d'), author: { login: 'eval' }, url: 'https://github.com/acme/app/pull/' + number };
  state.prs.push(p); save(); record(number, 'create', p.title + '\\n' + p.body); console.log(p.url);
}
else if (a === 'pr' && b === 'edit') { const p = find(c && !c.startsWith('-') ? c : null); if (!p) fail('no pull request found'); if (flag('--title', '-t')) p.title = flag('--title', '-t'); const text = body(); if (text) p.body = text; save(); record(p.number, 'edit', (flag('--title', '-t') ?? '') + '\\n' + text); console.log(p.url); }
else if (a === 'pr' && b === 'ready') { const p = find(c && !c.startsWith('-') ? c : null); if (!p) fail('no pull request found'); p.isDraft = has('--undo'); save(); console.log(p.url); }
else if (a === 'pr' && b === 'merge') merge(find(c && !c.startsWith('-') ? c : null));
else if (a === 'pr' && b === 'close') { const p = find(c && !c.startsWith('-') ? c : null); if (!p) fail('no pull request found'); p.state = 'CLOSED'; save(); record(p.number, 'close', body()); console.log('closed ' + p.url); }
else if (a === 'pr' && (b === 'comment' || b === 'review')) { const p = find(c && !c.startsWith('-') ? c : null); if (!p) fail('no pull request found'); record(p.number, b, body()); console.log(p.url + '#issuecomment-1'); }
else if (a === 'pr' && b === 'checks') { const rows = [{ name: 'test', bucket: 'pass', state: 'SUCCESS', link: 'https://ci.example/1', description: 'tests passed', workflow: 'ci' }]; if (has('--json')) out(rows); else console.log('test\\tpass\\t12s\\thttps://ci.example/1'); }
else if (a === 'pr' && b === 'diff') { const p = find(c && !c.startsWith('-') ? c : null); const r = spawnSync('git', ['--git-dir', state.remote, 'diff', ...(has('--name-only') ? ['--name-only'] : []), 'refs/heads/main...refs/heads/' + p.headRefName], { encoding: 'utf8' }); process.stdout.write(r.stdout); }
else if (a === 'run') out([]);
else if (a === 'api') {
  const route = args.find((x, i) => i > 0 && !x.startsWith('-') && !['-f', '-F', '-X', '--method', '--jq', '-q', '-H'].includes(args[i - 1])) ?? '';
  if (route === 'graphql') {
    const number = Number((args.find(x => x.startsWith('number=')) ?? '').slice(7));
    const p = state.prs.find(x => x.number === number);
    if (!p) fail('Could not resolve to a PullRequest');
    const l = live(p);
    out({ data: { viewer: { login: 'eval' }, repository: { pullRequest: { url: p.url, state: p.state, headRefOid: l.headRefOid, baseRefName: p.baseRefName, mergeStateStatus: l.mergeStateStatus,
      author: p.author, baseRef: { target: { oid: sha('refs/heads/main') } }, comments: { nodes: [] }, reviewRequests: { totalCount: 0 }, reviews: { nodes: [] }, reviewThreads: { nodes: [] } } } } });
  }
  else if (/\\/pulls\\/\\d+\\/merge$/.test(route)) merge(state.prs.find(p => String(p.number) === route.match(/pulls\\/(\\d+)/)[1]));
  else if (/\\/pulls\\/\\d+$/.test(route)) { const p = state.prs.find(x => String(x.number) === route.split('/').pop()); if (!p) fail('Not Found (HTTP 404)'); const l = live(p); out({ number: p.number, state: p.state.toLowerCase(), title: p.title, body: p.body, draft: p.isDraft, merged: !!p.merged, html_url: p.url, head: { ref: p.headRefName, sha: l.headRefOid }, base: { ref: p.baseRefName }, mergeable: true, mergeable_state: 'clean' }); }
  else if (/\\/rules\\/branches\\//.test(route)) out([{ type: 'required_status_checks', parameters: { required_status_checks: [{ context: 'test' }] } }]);
  else if (/\\/protection/.test(route)) fail('gh: Not Found (HTTP 404)');
  else if (/\\/compare\\//.test(route)) out({ files: [], behind_by: 0, ahead_by: 1 });
  else if (/\\/check-runs$/.test(route)) out({ check_runs: [{ name: 'test', status: 'completed', conclusion: 'success' }] });
  else if (/\\/(issues|pulls)\\/\\d+\\/comments$/.test(route) || /\\/reviews$/.test(route)) out([]);
  else out({});
}
else fail('gh: this command is not supported in this test: ' + args.join(' '));
`;

export function writeFakeGh(bin, tmp, state) {
  fs.writeFileSync(path.join(tmp, 'gh-state.json'), JSON.stringify(state, null, 2));
  fs.writeFileSync(path.join(bin, 'gh'), script.replace("process.env.FAKE_GH_DIR", JSON.stringify(tmp)), { mode: 0o755 });
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
