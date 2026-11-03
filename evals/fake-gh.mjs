import fs from 'node:fs';
import path from 'node:path';

const script = `#!/usr/bin/env node
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const tmp = process.env.FAKE_GH_DIR;
const statePath = tmp + '/gh-state.json';
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const args = process.argv.slice(2);
const [a, b] = args;
fs.appendFileSync(tmp + '/gh.log', JSON.stringify(args) + '\\n');
const save = () => fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
const flag = (...names) => { for (const name of names) { const i = args.indexOf(name); if (i >= 0) return args[i + 1]; const eq = args.find(a => a.startsWith(name + '=')); if (eq) return eq.slice(name.length + 1); } return null; };
const has = (...names) => names.some(name => args.includes(name));
const booleans = new Set(['--web', '-w', '--draft', '-d', '--fill', '-f', '--fill-first', '--squash', '-s', '--merge', '-m', '--rebase', '-r', '--auto', '--disable-auto', '--delete-branch', '--admin', '--undo', '--name-only', '--watch', '--required', '--fail-fast', '--yes', '-y', '--force', '--detach', '--patch', '--paginate', '--slurp', '--silent', '-i', '--include', '--comments', '--log', '--log-failed', '--exit-status', '--edit-last', '--approve', '--request-changes', ...(b === 'review' ? ['--comment', '-c'] : [])]);
const positional = () => { const out = []; for (let i = 2; i < args.length; i++) { const x = args[i]; if (x.startsWith('-')) { if (!booleans.has(x) && !x.includes('=')) i++; continue; } out.push(x); } return out; };
const body = () => { const file = flag('--body-file', '-F'); return [flag(...(b === 'review' ? ['--body', '-b'] : ['--body', '-b', '--comment', '-c'])), file ? fs.readFileSync(file === '-' ? 0 : file, 'utf8') : null].filter(Boolean).join('\\n'); };
const record = (pr, command, text) => fs.appendFileSync(tmp + '/bodies.jsonl', JSON.stringify({ pr, command, text }) + '\\n');
const git = (...a) => spawnSync('git', ['--git-dir', state.remote, ...a], { encoding: 'utf8' });
const sha = ref => git('rev-parse', '--verify', '-q', ref).stdout.trim() || null;
const current = () => spawnSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).stdout.trim();
const find = key => { const k = String(key ?? current()).replace(/^#/, ''); return state.prs.find(p => String(p.number) === k || p.url === k || p.headRefName === k); };
const target = () => find(positional()[0] ?? null);
const viewer = 'alex';
const now = () => Date.now();
const iso = ms => new Date(ms).toISOString().replace(/\\.\\d+Z$/, 'Z');
const sleep = seconds => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, seconds * 1000);
const nextId = () => { state.nextId = (state.nextId || 3000) + 1; return state.nextId; };
const headOf = p => sha('refs/heads/' + p.headRefName);
const pushedAt = oid => { const file = tmp + '/pushes.log'; const line = fs.existsSync(file) && fs.readFileSync(file, 'utf8').split('\\n').filter(l => l.split(' ')[1] === oid).pop(); return line ? Number(line.split(' ')[0]) * 1000 : null; };
const runsPath = tmp + '/ci-runs.json';
const ciRun = (p, head) => {
  const id = 9000 + parseInt(head.slice(0, 6), 16) % 999, created = pushedAt(head) ?? now() - 3600000;
  const runs = fs.existsSync(runsPath) ? JSON.parse(fs.readFileSync(runsPath, 'utf8')) : {};
  if (!runs[head] && now() - created >= (p.ci.pending || 0) * 1000) {
    const dir = fs.mkdtempSync(tmp + '/ci-');
    spawnSync('sh', ['-c', 'git --git-dir "$0" archive "$1" | tar -x -C "$2"', state.remote, head, dir]);
    const test = spawnSync(p.ci.command[0], p.ci.command.slice(1), { cwd: dir, encoding: 'utf8', timeout: 120000 });
    fs.rmSync(dir, { recursive: true, force: true });
    runs[head] = { conclusion: test.status === 0 ? 'success' : 'failure', log: (String(test.stdout) + String(test.stderr)).split(dir).join(['', 'home', 'runner', 'work', 'app', 'app'].join('/')), completed: Math.min(now(), created + Math.max(p.ci.pending || 0, 12) * 1000) };
    fs.writeFileSync(runsPath, JSON.stringify(runs, null, 2));
  }
  return { id, job: id + 10000, head, created, ...(runs[head] || {}) };
};
const ci = p => p && p.ci && headOf(p) ? ciRun(p, headOf(p)) : null;
const seen = r => fs.appendFileSync(tmp + '/ci.log', JSON.stringify({ head: r.head, conclusion: r.conclusion || 'pending' }) + '\\n');
const ciLink = r => 'https://github.com/acme/app/actions/runs/' + r.id + '/job/' + r.job;
const rollup = (p, r) => !r ? [{ name: 'test', status: 'COMPLETED', conclusion: 'SUCCESS' }] : [{ __typename: 'CheckRun', name: p.ci.name, workflowName: p.ci.workflow, status: r.conclusion ? 'COMPLETED' : 'IN_PROGRESS', conclusion: r.conclusion ? r.conclusion.toUpperCase() : '', detailsUrl: ciLink(r), startedAt: iso(r.created), completedAt: r.completed ? iso(r.completed) : '0001-01-01T00:00:00Z' }];
const checkRows = p => {
  const r = ci(p);
  if (!r) return [{ name: 'test', bucket: 'pass', state: 'SUCCESS', link: 'https://ci.example/1', description: 'tests passed', workflow: 'ci' }];
  seen(r);
  const bucket = !r.conclusion ? 'pending' : r.conclusion === 'success' ? 'pass' : 'fail';
  return [{ name: p.ci.name, bucket, state: { pending: 'IN_PROGRESS', pass: 'SUCCESS', fail: 'FAILURE' }[bucket], link: ciLink(r), description: bucket === 'fail' ? 'Process completed with exit code 1.' : '', workflow: p.ci.workflow, event: 'pull_request', startedAt: iso(r.created), completedAt: r.completed ? iso(r.completed) : '0001-01-01T00:00:00Z' }];
};
const ciRuns = () => state.prs.filter(p => p.ci).flatMap(p => [...new Set([...(fs.existsSync(tmp + '/pushes.log') ? fs.readFileSync(tmp + '/pushes.log', 'utf8').split('\\n').filter(l => l.endsWith(' refs/heads/' + p.headRefName)).map(l => l.split(' ')[1]) : []), headOf(p)].filter(Boolean))].map(head => ({ p, r: ciRun(p, head) })));
const runJson = ({ p, r }) => { const status = r.conclusion ? 'completed' : 'in_progress'; return { databaseId: r.id, number: r.id - 9000, attempt: 1, headSha: r.head, headBranch: p.headRefName, status, conclusion: r.conclusion || '', name: p.ci.workflow, workflowName: p.ci.workflow, displayTitle: p.title, event: 'pull_request', url: 'https://github.com/acme/app/actions/runs/' + r.id, createdAt: iso(r.created), startedAt: iso(r.created), updatedAt: iso(r.completed || now()),
  jobs: [{ databaseId: r.job, name: p.ci.name, status, conclusion: r.conclusion || '', startedAt: iso(r.created), completedAt: r.completed ? iso(r.completed) : null, url: ciLink(r), steps: [{ name: 'Run tests', number: 1, status, conclusion: r.conclusion || '' }] }] }; };
const runRest = x => { const j = runJson(x); return { id: j.databaseId, name: j.name, head_branch: j.headBranch, head_sha: j.headSha, status: j.status, conclusion: j.conclusion || null, html_url: j.url, event: j.event, run_number: j.number, display_title: j.displayTitle, path: '.github/workflows/ci.yml', created_at: j.createdAt, updated_at: j.updatedAt }; };
const jobRest = x => { const j = runJson(x).jobs[0]; return { id: j.databaseId, run_id: x.r.id, name: j.name, head_sha: x.r.head, status: j.status, conclusion: j.conclusion || null, html_url: j.url, started_at: j.startedAt, completed_at: j.completedAt, steps: j.steps.map(s => ({ ...s, conclusion: s.conclusion || null })) }; };
const logLines = ({ p, r }) => r.log.split('\\n').map(line => p.ci.name + '\\tRun tests\\t' + iso(r.completed) + ' ' + line).join('\\n') + '\\n';
const threads = p => p.threads || (p.threads = []);
const comments = p => p.comments || (p.comments = []);
const reviews = p => p.reviews || (p.reviews = []);
const commentUrl = (p, c) => p.url + '#issuecomment-' + c.databaseId;
const threadUrl = (p, c) => p.url + '#discussion_r' + c.databaseId;
const reviewUrl = (p, r) => p.url + '#pullrequestreview-' + r.databaseId;
const association = who => who.bot ? 'NONE' : 'MEMBER';
const gqlAuthor = who => ({ login: who.login, __typename: who.bot ? 'Bot' : 'User' });
const restUser = who => ({ login: who.bot ? who.login + '[bot]' : who.login, type: who.bot ? 'Bot' : 'User' });
const conn = nodes => ({ totalCount: nodes.length, nodes, edges: nodes.map(node => ({ node })), pageInfo: { hasNextPage: false, hasPreviousPage: false, endCursor: null, startCursor: null } });
const files = p => { const head = headOf(p); return head ? git('diff', '--numstat', 'refs/heads/main...' + head).stdout.split('\\n').filter(Boolean).map(l => { const [add, del, file] = l.split('\\t'); return { path: file, additions: Number(add), deletions: Number(del) }; }) : []; };
const ghComment = (p, c) => ({ id: c.id, author: { login: c.author.login }, authorAssociation: association(c.author), body: c.body, createdAt: c.createdAt, includesCreatedEdit: false, isMinimized: false, minimizedReason: '', reactionGroups: [], url: commentUrl(p, c), viewerDidAuthor: c.author.login === viewer });
const ghReview = (p, r) => ({ id: r.id, author: { login: r.author.login }, authorAssociation: association(r.author), body: r.body, submittedAt: r.submittedAt, includesCreatedEdit: false, reactionGroups: [], state: r.state, commit: { oid: r.commit || headOf(p) } });
const latest = list => Object.values(Object.fromEntries(list.map(r => [r.author.login, r])));
const live = p => {
  const head = sha('refs/heads/' + p.headRefName), main = sha('refs/heads/main');
  const onMain = head && main && git('merge-base', '--is-ancestor', main, head).status === 0;
  const conflict = head && main && !onMain && git('merge-tree', '--write-tree', main, head).status === 1;
  const commits = head && main ? git('log', '--format=%H%x1f%s%x1f%b%x1e', main + '..' + head).stdout.split('\\x1e').map(x => x.trim()).filter(Boolean).map(x => { const [oid, messageHeadline, messageBody] = x.split('\\x1f'); return { oid, messageHeadline, messageBody }; }) : [];
  const r = ci(p);
  const { ci: _ci, threads: _threads, ...rest } = p;
  return { ...rest, headRefOid: head, mergeStateStatus: p.state !== 'OPEN' ? 'UNKNOWN' : onMain ? (r && r.conclusion !== 'success' ? 'BLOCKED' : 'CLEAN') : conflict ? 'DIRTY' : 'BEHIND', mergeable: conflict ? 'CONFLICTING' : 'MERGEABLE',
    statusCheckRollup: rollup(p, r), reviewDecision: '', autoMergeRequest: p.autoMerge ? {} : null, mergeCommit: p.mergeCommit ? { oid: p.mergeCommit } : null, commits,
    headRepository: { name: 'app' }, headRepositoryOwner: { login: 'acme' }, isCrossRepository: false, reviews: reviews(p).map(x => ghReview(p, x)), latestReviews: latest(reviews(p)).map(x => ghReview(p, x)), comments: comments(p).map(c => ghComment(p, c)), reviewRequests: [], labels: [], assignees: [],
    closingIssuesReferences: [], files: files(p), additions: 0, deletions: 0, createdAt: '2026-09-01T10:00:00Z', updatedAt: '2026-09-01T10:00:00Z', mergedAt: p.state === 'MERGED' ? '2026-10-31T10:00:00Z' : null };
};
const gqlComment = (p, c) => ({ id: c.id, databaseId: c.databaseId, url: commentUrl(p, c), body: c.body, bodyText: c.body, author: gqlAuthor(c.author), createdAt: c.createdAt, isMinimized: false, viewerDidAuthor: c.author.login === viewer });
const gqlThreadComment = (p, t, c) => ({ id: c.id, databaseId: c.databaseId, url: threadUrl(p, c), body: c.body, bodyText: c.body, author: gqlAuthor(c.author), createdAt: c.createdAt, path: t.path, line: t.line, originalLine: t.line, outdated: false, replyTo: c.replyTo ? { databaseId: c.replyTo } : null });
const gqlThread = (p, t) => ({ id: t.id, isResolved: !!t.isResolved, isOutdated: false, isCollapsed: !!t.isResolved, path: t.path, line: t.line, originalLine: t.line, startLine: null, diffSide: 'RIGHT', subjectType: 'LINE', viewerCanResolve: true, viewerCanUnresolve: true, viewerCanReply: true, resolvedBy: t.isResolved ? { login: viewer } : null, comments: conn(t.comments.map(c => gqlThreadComment(p, t, c))) });
const gqlReview = (p, r) => ({ id: r.id, databaseId: r.databaseId, url: reviewUrl(p, r), state: r.state, body: r.body, submittedAt: r.submittedAt, author: gqlAuthor(r.author), commit: { oid: r.commit || headOf(p) }, comments: conn(threads(p).flatMap(t => t.comments.filter(c => c.review === r.databaseId).map(c => gqlThreadComment(p, t, c)))) });
const gqlPr = p => {
  const l = live(p);
  const checks = l.statusCheckRollup.map(c => ({ __typename: 'CheckRun', ...c }));
  const total = { state: checks.some(c => c.conclusion === 'FAILURE') ? 'FAILURE' : checks.some(c => c.status !== 'COMPLETED') ? 'PENDING' : 'SUCCESS', contexts: conn(checks) };
  return { id: 'PR_kwDOAA' + p.number, number: p.number, url: p.url, title: p.title, body: p.body, state: p.state, isDraft: !!p.isDraft, merged: !!p.merged, headRefName: p.headRefName, headRefOid: l.headRefOid, baseRefName: p.baseRefName, mergeStateStatus: l.mergeStateStatus, mergeable: l.mergeable, reviewDecision: null,
    author: gqlAuthor(p.author || { login: viewer }), baseRef: { name: p.baseRefName, target: { oid: sha('refs/heads/main') } }, headRef: { name: p.headRefName, target: { oid: l.headRefOid } },
    comments: conn(comments(p).map(c => gqlComment(p, c))), reviewRequests: conn([]), reviews: conn(reviews(p).map(r => gqlReview(p, r))), latestReviews: conn(latest(reviews(p)).map(r => gqlReview(p, r))), reviewThreads: conn(threads(p).map(t => gqlThread(p, t))),
    commits: conn([{ commit: { oid: l.headRefOid, statusCheckRollup: total } }]), statusCheckRollup: total, files: conn(l.files), labels: conn([]), assignees: conn([]) };
};
const restComment = (p, c) => ({ id: c.databaseId, node_id: c.id, html_url: commentUrl(p, c), issue_url: 'https://api.github.com/repos/acme/app/issues/' + p.number, body: c.body, user: restUser(c.author), author_association: association(c.author), created_at: c.createdAt, updated_at: c.createdAt });
const restReviewComment = (p, t, c) => ({ id: c.databaseId, node_id: c.id, pull_request_review_id: c.review || null, in_reply_to_id: c.replyTo, path: t.path, line: t.line, original_line: t.line, side: 'RIGHT', commit_id: headOf(p), body: c.body, user: restUser(c.author), author_association: association(c.author), html_url: threadUrl(p, c), created_at: c.createdAt, updated_at: c.createdAt });
const restReview = (p, r) => ({ id: r.databaseId, node_id: r.id, user: restUser(r.author), body: r.body, state: r.state, html_url: reviewUrl(p, r), commit_id: r.commit || headOf(p), submitted_at: r.submittedAt, author_association: association(r.author) });
const addComment = (p, text, command) => { const id = nextId(); const c = { id: 'IC_kwDOAA' + id, databaseId: id, author: { login: viewer }, body: text, createdAt: iso(now()) }; comments(p).push(c); save(); record(p.number, command, text); return c; };
const addReview = (p, text, kind) => { const id = nextId(); const r = { id: 'PRR_kwDOAA' + id, databaseId: id, author: { login: viewer }, state: kind, body: text, submittedAt: iso(now()), commit: headOf(p) }; reviews(p).push(r); save(); record(p.number, 'review', text); return r; };
const findThread = key => { for (const p of state.prs) for (const t of threads(p)) if (t.id === key || t.comments.some(c => c.id === key || String(c.databaseId) === String(key))) return { p, t }; return null; };
const findComment = key => { for (const p of state.prs) for (const c of comments(p)) if (c.id === key || String(c.databaseId) === String(key)) return { p, c }; return null; };
const reply = (found, text) => { const id = nextId(); const c = { id: 'PRRC_kwDOAA' + id, databaseId: id, author: { login: viewer }, body: text, createdAt: iso(now()), replyTo: found.t.comments[0].databaseId }; found.t.comments.push(c); save(); record(found.p.number, 'thread-reply', text); return c; };
const pick = value => { const fields = flag('--json'); if (!fields) return value; const keys = fields.split(','); const one = v => Object.fromEntries(keys.filter(k => k in v).map(k => [k, v[k]])); return Array.isArray(value) ? value.map(one) : one(value); };
const out = (value, code = 0) => {
  const shaped = (a === 'pr' && ['view', 'list', 'checks'].includes(b)) || a === 'run' ? pick(value) : value;
  const text = JSON.stringify(has('--slurp') ? [shaped] : shaped);
  const jq = flag('--jq', '-q');
  if (jq) { const r = spawnSync('jq', ['-r', jq], { input: text, encoding: 'utf8' }); process.stdout.write(r.stdout); process.exit(r.status || code); }
  process.stdout.write(text + '\\n');
};
const fail = (message, code = 1) => { process.stderr.write(message + '\\n'); process.exit(code); };
const squash = p => {
  const main = sha('refs/heads/main'), tree = git('rev-parse', headOf(p) + '^{tree}').stdout.trim();
  const env = { ...process.env, GIT_AUTHOR_NAME: 'Alex Doe', GIT_AUTHOR_EMAIL: 'alex@example.com', GIT_COMMITTER_NAME: 'GitHub', GIT_COMMITTER_EMAIL: 'noreply@github.com' };
  const commit = spawnSync('git', ['--git-dir', state.remote, 'commit-tree', tree, '-p', main, '-m', p.title + ' (#' + p.number + ')'], { encoding: 'utf8', env }).stdout.trim();
  git('update-ref', 'refs/heads/main', commit, main); return commit;
};
const merge = (p, mode, admin = false) => {
  if (!p) fail('no pull request found');
  if (state.protect && mode === 'auto') fail('GraphQL: Auto merge is not allowed for this repository (enablePullRequestAutoMerge)');
  if (state.protect && mode === 'merge' && !admin && live(p).mergeStateStatus !== 'CLEAN') fail('X Pull request acme/app#' + p.number + ' is not mergeable: the base branch policy prohibits the merge.\\nTo have the pull request merged after all the requirements have been met, add the \`--auto\` flag.\\nTo use administrator privileges to immediately merge the pull request, add the \`--admin\` flag.');
  if (mode === 'disable') p.autoMerge = false; else if (mode === 'auto') p.autoMerge = true; else { if (state.protect) p.mergeCommit = squash(p); p.merged = true; p.state = 'MERGED'; }
  save(); console.log((mode === 'disable' ? 'disabled auto-merge for ' : mode === 'auto' ? 'enabled auto-merge for ' : 'merged ') + p.url); process.exit(0);
};
const create = (title, text, head, base, draft) => {
  if (!sha('refs/heads/' + head)) fail('aborted: you must first push the current branch to a remote, or use the --head flag');
  const open = state.prs.find(p => p.headRefName === head && p.state === 'OPEN');
  if (open) fail('a pull request for branch "' + head + '" into branch "' + base + '" already exists:\\n' + open.url);
  const number = Math.max(0, ...state.prs.map(p => p.number)) + 1;
  const p = { number, state: 'OPEN', title, body: text, headRefName: head, baseRefName: base, isDraft: draft, author: { login: 'alex' }, url: 'https://github.com/acme/app/pull/' + number, ...(state.ci && { ci: state.ci }) };
  state.prs.push(p); save(); record(number, 'create', title + '\\n' + text); return p;
};
if (a === 'auth') { console.log('Logged in to github.com account alex'); process.exit(0); }
if (a === 'repo' && b === 'view') { const repo = { nameWithOwner: 'acme/app', name: 'app', owner: { login: 'acme' }, defaultBranchRef: { name: 'main' }, url: 'https://github.com/acme/app', mergeCommitAllowed: false, squashMergeAllowed: true, rebaseMergeAllowed: false }; if (has('--json')) out(repo); else console.log('acme/app\\n\\nname:\\tacme/app\\ndefault branch:\\tmain'); }
else if (a === 'pr' && b === 'list') { const head = flag('--head', '-H'); const st = (flag('--state', '-s') ?? 'open').toUpperCase(); const rows = state.prs.filter(p => (!head || p.headRefName === head) && (st === 'ALL' || p.state === st)); if ((flag('--json') || '').includes('statusCheckRollup')) rows.map(ci).filter(Boolean).forEach(seen); out(rows.map(live)); }
else if (a === 'pr' && b === 'view') {
  const p = target(); if (!p) fail('no pull requests found for branch "' + current() + '"');
  if (has('--json')) { if (flag('--json').includes('statusCheckRollup') && ci(p)) seen(ci(p)); out(live(p)); }
  else {
    const notes = has('--comments') ? [...reviews(p).filter(r => r.body).map(r => ({ who: r.author, at: r.submittedAt, body: r.body, status: r.state.toLowerCase() })), ...comments(p).map(c => ({ who: c.author, at: c.createdAt, body: c.body, status: 'none' }))].sort((x, y) => x.at.localeCompare(y.at)) : [];
    console.log('title:\\t' + p.title + '\\nstate:\\t' + p.state + '\\nnumber:\\t' + p.number + '\\nurl:\\t' + p.url + '\\n--\\n' + (p.body || '') + notes.map(n => '\\n--\\nauthor:\\t' + n.who.login + '\\nassociation:\\t' + association(n.who).toLowerCase() + '\\nedited:\\tfalse\\nstatus:\\t' + n.status + '\\n--\\n' + n.body).join(''));
  }
}
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
else if (a === 'pr' && b === 'merge') merge(target(), has('--disable-auto') ? 'disable' : has('--auto') ? 'auto' : 'merge', has('--admin'));
else if (a === 'pr' && b === 'close') { const p = target(); if (!p) fail('no pull request found'); p.state = 'CLOSED'; save(); record(p.number, 'close', body()); console.log('closed ' + p.url); }
else if (a === 'pr' && b === 'comment') {
  const p = target(); if (!p) fail('no pull request found');
  if (has('--edit-last')) { const c = comments(p).filter(x => x.author.login === viewer).pop(); if (!c) fail('no comments found for current user'); c.body = body(); save(); record(p.number, 'edit-comment', c.body); console.log(commentUrl(p, c)); }
  else console.log(commentUrl(p, addComment(p, body(), 'comment')));
}
else if (a === 'pr' && b === 'review') { const p = target(); if (!p) fail('no pull request found'); addReview(p, body(), has('--approve', '-a') ? 'APPROVED' : has('--request-changes', '-r') ? 'CHANGES_REQUESTED' : 'COMMENTED'); console.log('- Reviewed pull request acme/app#' + p.number); }
else if (a === 'pr' && b === 'checkout') {
  const p = target(); if (!p) fail('no pull request found');
  const run = (...x) => spawnSync('git', x, { encoding: 'utf8', stdio: 'inherit' });
  run('fetch', '-q', 'origin', '+refs/heads/' + p.headRefName + ':refs/remotes/origin/' + p.headRefName);
  run('checkout', '-q', '-B', p.headRefName, 'origin/' + p.headRefName);
  run('branch', '-q', '--set-upstream-to=origin/' + p.headRefName);
}
else if (a === 'pr' && b === 'checks') {
  const p = target();
  let rows = checkRows(p);
  while (has('--watch') && rows.some(r => r.bucket === 'pending')) { sleep(Number(flag('--interval') || 10)); rows = checkRows(p); }
  const code = rows.some(r => r.bucket === 'fail') ? 1 : rows.some(r => r.bucket === 'pending') ? 8 : 0;
  if (has('--json')) out(rows, code); else console.log(rows.map(r => [r.name, r.bucket, '12s', r.link, r.description].join('\\t')).join('\\n'));
  process.exit(code);
}
else if (a === 'pr' && b === 'diff') { const p = target(); if (!p) fail('no pull request found'); process.stdout.write(git('diff', ...(has('--name-only') ? ['--name-only'] : []), 'refs/heads/main...refs/heads/' + p.headRefName).stdout); }
else if (a === 'run' && b === 'list') {
  const branch = flag('--branch', '-b'), commit = flag('--commit', '-c');
  const rows = ciRuns().filter(x => (!branch || x.p.headRefName === branch) && (!commit || x.r.head.startsWith(commit))).sort((x, y) => y.r.created - x.r.created);
  rows.forEach(x => seen(x.r));
  if (has('--json')) out(rows.map(runJson)); else console.log(rows.map(runJson).map(r => [r.status, r.conclusion, r.displayTitle, r.workflowName, r.headBranch, r.event, r.databaseId, '12s', r.createdAt].join('\\t')).join('\\n'));
}
else if (a === 'run' && (b === 'view' || b === 'watch')) {
  const job = flag('--job', '-j'), id = job ? null : positional()[0];
  if (!id && !job) fail('run or job ID required when not running interactively');
  const lookup = () => ciRuns().find(({ r }) => String(r.id) === String(id) || String(r.job) === String(job));
  let x = lookup();
  if (!x) fail('could not find any workflow run with ID ' + (id || job));
  while (b === 'watch' && !x.r.conclusion) { sleep(5); x = lookup(); }
  seen(x.r);
  if (has('--log', '--log-failed')) { if (!x.r.conclusion) fail('run ' + x.r.id + ' is still in progress; logs will be available when it is complete'); if (has('--log') || x.r.conclusion === 'failure') process.stdout.write(logLines(x)); }
  else if (has('--json')) out(runJson(x));
  else console.log((x.r.conclusion === 'success' ? 'OK ' : x.r.conclusion ? 'X ' : '* ') + x.p.headRefName + ' ' + x.p.ci.workflow + ' #' + (x.r.id - 9000) + ' (' + x.r.head.slice(0, 7) + ')\\nTriggered via pull_request\\n\\nJOBS\\n' + (x.r.conclusion || 'in progress') + ' ' + x.p.ci.name + ' (ID ' + x.r.job + ')' + (x.r.conclusion === 'failure' ? '\\n\\nANNOTATIONS\\nX Process completed with exit code 1.\\n\\nTo see what failed, try: gh run view ' + x.r.id + ' --log-failed' : '') + '\\nView this run on GitHub: https://github.com/acme/app/actions/runs/' + x.r.id);
  if (has('--exit-status') && x.r.conclusion === 'failure') process.exit(1);
}
else if (a === 'run' && b === 'rerun') console.log('Requested rerun of run ' + positional()[0]);
else if (a === 'run') out([]);
else if (a === 'api') {
  const valued = new Set(['-f', '-F', '--field', '--raw-field', '-X', '--method', '--jq', '-q', '-H', '--header', '--input', '-t', '--template']);
  const route = args.find((x, i) => i > 0 && !x.startsWith('-') && !valued.has(args[i - 1])) ?? '';
  const where = route.split('?')[0];
  const fields = {}; for (let i = 0; i < args.length; i++) if (['-f', '-F', '--field', '--raw-field'].includes(args[i])) { const [k, ...v] = args[i + 1].split('='); const value = v.join('='); fields[k] = ['-F', '--field'].includes(args[i]) && value.startsWith('@') ? fs.readFileSync(value === '@-' ? 0 : value.slice(1), 'utf8') : value; }
  const input = flag('--input');
  if (input) { const json = JSON.parse(fs.readFileSync(input === '-' ? 0 : input, 'utf8')); Object.assign(fields, json.variables || {}, json); }
  const method = (flag('-X', '--method') ?? (Object.keys(fields).length || has('--input') ? 'POST' : 'GET')).toUpperCase();
  const prOf = () => state.prs.find(x => String(x.number) === (where.match(/\\/(?:pulls|issues)\\/(\\d+)/) || [])[1]);
  if (route === 'graphql') {
    const query = String(fields.query ?? '');
    const text = JSON.stringify(fields);
    const number = Number(fields.number ?? fields.pr ?? fields.prNumber ?? fields.pull ?? (query.match(/pullRequest\\s*\\(\\s*number\\s*:\\s*(\\d+)/) || [])[1] ?? (text.match(/PR_kwDOAA(\\d+)/) || [])[1]);
    if (/mutation/.test(query)) {
      const p = state.prs.find(x => x.number === number) ?? state.prs.find(x => x.state === 'OPEN');
      const inline = (query.match(/\\bbody\\s*:\\s*"""([\\s\\S]*?)"""/) || [])[1] ?? ((m => m && JSON.parse('"' + m[1] + '"'))(query.match(/\\bbody\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"/)));
      const said = fields.body ?? inline ?? Object.entries(fields).filter(([k, v]) => k !== 'query' && typeof v === 'string' && /\\s/.test(v)).map(([, v]) => v).sort((x, y) => y.length - x.length)[0] ?? '';
      const threadKey = (text.match(/PRRT_\\w+/) || [])[0], commentKey = (text.match(/PRRC_\\w+/) || [])[0];
      const thread = () => findThread(threadKey || commentKey) || fail('GraphQL: Could not resolve to a node with the global id of ' + (threadKey || commentKey));
      if (/disablePullRequestAutoMerge/.test(query)) merge(p, 'disable');
      if (/enablePullRequestAutoMerge/.test(query)) merge(p, 'auto');
      if (/mergePullRequest/.test(query)) merge(p, 'merge');
      if (/closePullRequest/.test(query) && p) { p.state = 'CLOSED'; save(); }
      const data = {};
      if (/addPullRequestReviewThreadReply|addPullRequestReviewComment/.test(query)) { const f = thread(); const c = reply(f, said); data.addPullRequestReviewThreadReply = data.addPullRequestReviewComment = { comment: gqlThreadComment(f.p, f.t, c) }; }
      if (/unresolveReviewThread/.test(query)) { const f = thread(); f.t.isResolved = false; save(); data.unresolveReviewThread = { thread: { id: f.t.id, isResolved: false } }; }
      else if (/resolveReviewThread/.test(query)) { const f = thread(); f.t.isResolved = true; save(); data.resolveReviewThread = { thread: { id: f.t.id, isResolved: true } }; }
      if (/addPullRequestReview\\s*\\(|submitPullRequestReview/.test(query) && p) { const r = addReview(p, said, /APPROVE/.test(text) ? 'APPROVED' : /REQUEST_CHANGES/.test(text) ? 'CHANGES_REQUESTED' : 'COMMENTED'); data.addPullRequestReview = data.submitPullRequestReview = { pullRequestReview: gqlReview(p, r) }; }
      if (/addComment\\s*\\(/.test(query) && p) { const c = addComment(p, said, 'comment'); data.addComment = { commentEdge: { node: gqlComment(p, c) }, subject: { id: 'PR_kwDOAA' + p.number } }; }
      if (/minimizeComment/.test(query) && p) { record(p.number, 'minimize', text); data.minimizeComment = { minimizedComment: { isMinimized: true } }; }
      out({ data }); process.exit(0);
    }
    const p = state.prs.find(x => x.number === number) ?? (Number.isNaN(number) ? state.prs.find(x => x.state === 'OPEN') : null);
    if (!p) fail('Could not resolve to a PullRequest');
    const node = gqlPr(p);
    if (/statusCheckRollup|checkRuns|checkSuites|contexts/.test(query) && ci(p)) seen(ci(p));
    const data = { viewer: { login: viewer, name: 'Alex Doe' }, repository: { id: 'R_kgDOAA', name: 'app', nameWithOwner: 'acme/app', owner: { login: 'acme' }, pullRequest: node } };
    if (/\\bnode\\s*\\(/.test(query)) { const f = findThread((text.match(/PRRT_\\w+/) || [])[0]); data.node = f ? gqlThread(f.p, f.t) : node; }
    out({ data });
  }
  else if (/^\\/?user$/.test(where)) out({ login: viewer, name: 'Alex Doe', type: 'User' });
  else if (/\\/pulls\\/\\d+\\/merge$/.test(where)) { const p = state.prs.find(x => String(x.number) === where.match(/pulls\\/(\\d+)/)[1]); if (method === 'PUT') merge(p, 'merge'); if (p?.state === 'MERGED') process.exit(0); fail('gh: Not Found (HTTP 404)'); }
  else if (/\\/pulls\\/\\d+$/.test(where)) {
    const p = state.prs.find(x => String(x.number) === where.split('/').pop()); if (!p) fail('gh: Not Found (HTTP 404)');
    if (method === 'PATCH') { if (fields.state === 'closed') p.state = 'CLOSED'; if (fields.title) p.title = fields.title; if (fields.body) p.body = fields.body; save(); record(p.number, 'api', (fields.title ?? '') + '\\n' + (fields.body ?? '')); }
    const l = live(p); out({ number: p.number, state: p.state === 'OPEN' ? 'open' : 'closed', title: p.title, body: p.body, draft: p.isDraft, merged: !!p.merged, merge_commit_sha: p.mergeCommit ?? null, html_url: p.url, user: { login: (p.author || { login: viewer }).login }, head: { ref: p.headRefName, sha: l.headRefOid }, base: { ref: p.baseRefName, sha: sha('refs/heads/main') }, mergeable: l.mergeable !== 'CONFLICTING', mergeable_state: l.mergeStateStatus.toLowerCase() });
  }
  else if (/\\/pulls$/.test(where) && method === 'POST') { const p = create(fields.title ?? '', fields.body ?? '', (fields.head ?? '').replace(/^[^:]*:/, ''), fields.base ?? 'main', fields.draft === 'true'); out({ number: p.number, html_url: p.url, state: 'open' }); }
  else if (/\\/rules\\/branches\\//.test(where)) out([{ type: 'required_status_checks', parameters: { required_status_checks: [{ context: 'test' }] } }]);
  else if (/\\/protection/.test(where)) fail('gh: Not Found (HTTP 404)');
  else if (/\\/compare\\//.test(where)) { const [, from, to] = where.match(/compare\\/(.+)\\.\\.\\.(.+)$/) ?? []; const behind = from && to ? Number(git('rev-list', '--count', to + '..' + from).stdout.trim() || 0) : 0; out({ files: [], behind_by: behind, ahead_by: 1 }); }
  else if (/\\/commits\\/[^/]+\\/check-runs$/.test(where)) {
    const p = state.prs.find(x => x.ci), ref = where.match(/commits\\/([^/]+)\\/check-runs/)[1], head = p && sha(ref);
    if (!head) out({ check_runs: [{ name: 'test', status: 'completed', conclusion: 'success' }] });
    else { const r = ciRun(p, head); seen(r); out({ total_count: 1, check_runs: [{ id: r.job, name: p.ci.name, head_sha: head, status: r.conclusion ? 'completed' : 'in_progress', conclusion: r.conclusion || null, html_url: ciLink(r), details_url: ciLink(r), started_at: iso(r.created), completed_at: r.completed ? iso(r.completed) : null, app: { slug: 'github-actions' }, output: { title: r.conclusion === 'failure' ? 'Process completed with exit code 1.' : null, summary: null } }] }); }
  }
  else if (/\\/actions\\/jobs\\/\\d+\\/logs$/.test(where)) { const x = ciRuns().find(({ r }) => String(r.job) === where.match(/jobs\\/(\\d+)/)[1]); if (!x || !x.r.conclusion) fail('gh: Not Found (HTTP 404)'); seen(x.r); process.stdout.write(logLines(x)); }
  else if (/\\/actions\\/runs\\/\\d+\\/logs$/.test(where)) fail('gh: ' + where + ': this host serves no zip logs. Use actions/jobs/<job id>/logs.');
  else if (/\\/actions\\/runs\\/\\d+\\/jobs$/.test(where)) { const x = ciRuns().find(({ r }) => String(r.id) === where.match(/runs\\/(\\d+)/)[1]); if (!x) fail('gh: Not Found (HTTP 404)'); seen(x.r); out({ total_count: 1, jobs: [jobRest(x)] }); }
  else if (/\\/actions\\/runs\\/\\d+\\/rerun(-failed-jobs)?$/.test(where)) out({});
  else if (/\\/actions\\/runs\\/\\d+$/.test(where)) { const x = ciRuns().find(({ r }) => String(r.id) === where.split('/').pop()); if (!x) fail('gh: Not Found (HTTP 404)'); seen(x.r); out(runRest(x)); }
  else if (/\\/actions\\/(workflows\\/[^/]+\\/)?runs$/.test(where)) { const rows = ciRuns().sort((x, y) => y.r.created - x.r.created); rows.forEach(x => seen(x.r)); out({ total_count: rows.length, workflow_runs: rows.map(runRest) }); }
  else if (/\\/pulls\\/\\d+\\/comments\\/\\d+\\/replies$/.test(where)) { const f = findThread(where.match(/comments\\/(\\d+)/)[1]); if (!f) fail('gh: Not Found (HTTP 404)'); const c = reply(f, fields.body ?? ''); out(restReviewComment(f.p, f.t, c)); }
  else if (/\\/pulls\\/\\d+\\/comments$/.test(where)) {
    const p = prOf(); if (!p) fail('gh: Not Found (HTTP 404)');
    if (method !== 'POST') out(threads(p).flatMap(t => t.comments.map(c => restReviewComment(p, t, c))));
    else if (fields.in_reply_to) { const f = findThread(fields.in_reply_to); if (!f) fail('gh: Not Found (HTTP 404)'); out(restReviewComment(f.p, f.t, reply(f, fields.body ?? ''))); }
    else { const id = nextId(); const t = { id: 'PRRT_kwDOAA' + id, isResolved: false, path: fields.path, line: Number(fields.line) || null, comments: [{ id: 'PRRC_kwDOAA' + id, databaseId: id, author: { login: viewer }, body: fields.body ?? '', createdAt: iso(now()) }] }; threads(p).push(t); save(); record(p.number, 'review-comment', fields.body ?? ''); out(restReviewComment(p, t, t.comments[0])); }
  }
  else if (/\\/pulls\\/comments\\/\\d+$/.test(where)) { const f = findThread(where.split('/').pop()); if (!f) fail('gh: Not Found (HTTP 404)'); const c = f.t.comments.find(x => String(x.databaseId) === where.split('/').pop()); if (method === 'PATCH') { c.body = fields.body ?? c.body; save(); record(f.p.number, 'edit-comment', c.body); } out(restReviewComment(f.p, f.t, c)); }
  else if (/\\/issues\\/comments\\/\\d+$/.test(where)) { const f = findComment(where.split('/').pop()); if (!f) fail('gh: Not Found (HTTP 404)'); if (method === 'PATCH') { f.c.body = fields.body ?? f.c.body; save(); record(f.p.number, 'edit-comment', f.c.body); } out(restComment(f.p, f.c)); }
  else if (/\\/pulls\\/\\d+\\/reviews\\/\\d+\\/comments$/.test(where)) { const p = prOf(); const id = Number(where.match(/reviews\\/(\\d+)/)[1]); out(p ? threads(p).flatMap(t => t.comments.filter(c => c.review === id).map(c => restReviewComment(p, t, c))) : []); }
  else if (/\\/pulls\\/\\d+\\/reviews\\/\\d+\\/dismissals$/.test(where)) { const p = prOf(); const r = p && reviews(p).find(x => String(x.databaseId) === where.match(/reviews\\/(\\d+)/)[1]); if (!r) fail('gh: Not Found (HTTP 404)'); if (r.state === 'COMMENTED') fail('gh: Can not dismiss a commented pull request review (HTTP 422)'); r.state = 'DISMISSED'; save(); record(p.number, 'dismiss', fields.message ?? ''); out(restReview(p, r)); }
  else if (/\\/pulls\\/\\d+\\/reviews$/.test(where)) { const p = prOf(); if (!p) fail('gh: Not Found (HTTP 404)'); if (method === 'POST') out(restReview(p, addReview(p, fields.body ?? '', { APPROVE: 'APPROVED', REQUEST_CHANGES: 'CHANGES_REQUESTED' }[fields.event] ?? 'COMMENTED'))); else out(reviews(p).map(r => restReview(p, r))); }
  else if (/\\/issues\\/\\d+\\/comments$/.test(where)) { const p = prOf(); if (!p) fail('gh: Not Found (HTTP 404)'); if (method === 'POST') out(restComment(p, addComment(p, fields.body ?? '', 'api-comment'))); else out(comments(p).map(c => restComment(p, c))); }
  else if (/\\/pulls\\/\\d+\\/files$/.test(where)) { const p = prOf(); out(p ? files(p).map(f => ({ filename: f.path, status: 'modified', additions: f.additions, deletions: f.deletions, changes: f.additions + f.deletions })) : []); }
  else out({});
}
else fail('gh: ' + args.join(' ') + ': not available on this host');
`;

export function writeFakeGh(bin, tmp, state) {
  fs.writeFileSync(path.join(tmp, 'gh-state.json'), JSON.stringify(state, null, 2));
  fs.writeFileSync(path.join(bin, 'gh'), script.replace("process.env.FAKE_GH_DIR", JSON.stringify(tmp)), { mode: 0o755 });
}

export function watchRemote(remote, tmp) {
  const hook = path.join(remote, 'hooks', 'update');
  fs.writeFileSync(hook, `#!/bin/sh\necho "$1 $2 $3" >> ${JSON.stringify(path.join(tmp, 'remote-updates.log'))}\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(remote, 'hooks', 'post-receive'), `#!/bin/sh\nwhile read old new ref; do echo "$(date +%s) $new $ref" >> ${JSON.stringify(path.join(tmp, 'pushes.log'))}; done\n`, { mode: 0o755 });
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

export function ciSeen(tmp) {
  const file = path.join(tmp, 'ci.log');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
}
