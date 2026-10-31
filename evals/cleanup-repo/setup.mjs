import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const [work, bin, tmp] = process.argv.slice(2);
const run = (cwd, ...args) => { const r = spawnSync('git', args, { cwd, encoding: 'utf8' }); if (r.status) throw new Error(`${args.join(' ')}: ${r.stderr}`); return r.stdout; };
const git = (...args) => run(work, ...args);
const write = (file, text) => fs.writeFileSync(path.join(work, file), text);
run(tmp, 'init', '-q', '--bare', 'remote.git');
git('init', '-q');
write('app.js', 'export const app = 1;\n');
git('add', '-A'); git('commit', '-qm', 'Initial commit');
git('remote', 'add', 'origin', path.join(tmp, 'remote.git'));
git('push', '-q', '-u', 'origin', 'main');
const branch = (name, file, push) => {
  git('checkout', '-qb', name, 'main');
  write(file, `export const value = '${name}';\n`);
  git('add', '-A'); git('commit', '-qm', `Work on ${name}`);
  if (push) git('push', '-q', '-u', 'origin', name);
  git('checkout', '-q', 'main');
};
branch('feat/merged', 'merged.js', true);
branch('feat/closed', 'closed.js', true);
branch('feat/open', 'open.js', true);
branch('feat/local-only', 'local.js', false);
write('merged.js', "export const value = 'feat/merged';\n");
git('add', '-A'); git('commit', '-qm', 'Work on feat/merged (#1)'); git('push', '-q', 'origin', 'main');
git('worktree', 'add', '-q', path.join(tmp, 'wt-merged'), 'feat/merged');
git('worktree', 'add', '-q', path.join(tmp, 'wt-dirty'), 'feat/open');
fs.writeFileSync(path.join(tmp, 'wt-dirty', 'open.js'), "export const value = 'unsaved work';\n");
const prs = [
  { number: 1, state: 'MERGED', title: 'Work on feat/merged', headRefName: 'feat/merged', author: { login: 'eval' }, updatedAt: '2026-09-01T10:00:00Z', mergedAt: '2026-09-01T10:00:00Z', closedAt: '2026-09-01T10:00:00Z', url: 'https://github.com/acme/app/pull/1', isDraft: false },
  { number: 2, state: 'CLOSED', title: 'Work on feat/closed', headRefName: 'feat/closed', author: { login: 'eval' }, updatedAt: '2026-09-05T10:00:00Z', mergedAt: null, closedAt: '2026-09-05T10:00:00Z', url: 'https://github.com/acme/app/pull/2', isDraft: false },
  { number: 3, state: 'OPEN', title: 'Work on feat/open', headRefName: 'feat/open', author: { login: 'eval' }, updatedAt: '2026-10-29T10:00:00Z', mergedAt: null, closedAt: null, url: 'https://github.com/acme/app/pull/3', isDraft: false },
];
fs.writeFileSync(path.join(tmp, 'prs.json'), JSON.stringify(prs));
fs.writeFileSync(path.join(bin, 'gh'), `#!/usr/bin/env node
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(path.join(tmp, 'gh.log'))}, args.join(' ') + '\\n');
const flag = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const out = value => {
  const text = JSON.stringify(value);
  const jq = flag('--jq') ?? flag('-q');
  if (jq) { const r = spawnSync('jq', ['-r', jq], { input: text, encoding: 'utf8' }); process.stdout.write(r.stdout); process.exit(r.status); }
  process.stdout.write(text + '\\n');
};
const prs = JSON.parse(fs.readFileSync(${JSON.stringify(path.join(tmp, 'prs.json'))}, 'utf8'));
const [a, b] = args;
if (a === 'auth') { console.log('Logged in to github.com account eval'); process.exit(0); }
if (a === 'repo' && b === 'view') out({ nameWithOwner: 'acme/app', name: 'app', owner: { login: 'acme' }, defaultBranchRef: { name: 'main' }, deleteBranchOnMerge: false, url: 'https://github.com/acme/app' });
else if (a === 'pr' && b === 'list') {
  const state = (flag('--state') ?? flag('-s') ?? 'open').toLowerCase();
  const head = flag('--head') ?? flag('-H');
  out(prs.filter(p => (state === 'all' || p.state.toLowerCase() === state) && (!head || p.headRefName === head)));
}
else if (a === 'pr' && b === 'view') { const key = args[2]; out(prs.find(p => String(p.number) === key || p.headRefName === key) ?? process.exit(1)); }
else if (a === 'api' && args.some(x => /^(PATCH|PUT|POST|DELETE)$/i.test(x))) { console.log('{}'); }
else if (a === 'api' && /user$/.test(b ?? '')) out({ login: 'eval' });
else if (a === 'api' && /repos\\//.test(b ?? '')) out({ full_name: 'acme/app', default_branch: 'main', delete_branch_on_merge: false });
else if (a === 'pr' && b === 'close') console.log('closed');
else { console.error('gh: unsupported in this test'); process.exit(1); }
`, { mode: 0o755 });
