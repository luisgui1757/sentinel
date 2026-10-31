import fs from 'node:fs';
import path from 'node:path';
import { tmp, final, git, sh, check, report } from '../lib.mjs';

const remote = path.join(tmp, 'remote.git');
const prs = JSON.parse(fs.readFileSync(path.join(tmp, 'prs.json'), 'utf8'));
const open = prs.filter(p => p.number !== 9 && p.state === 'OPEN');
const verify = path.join(tmp, 'verify-new');
const fixed = open.filter(({ headRefName: h }) => h && !['main', 'fix/old-total'].includes(h)).filter(({ headRefName: h }) => {
  fs.rmSync(verify, { recursive: true, force: true });
  const ok = sh('git', ['clone', '-q', '--branch', h, remote, verify], tmp).status === 0
    && sh('git', ['merge-base', '--is-ancestor', fs.readFileSync(path.join(tmp, 'main.sha'), 'utf8').trim(), 'HEAD'], verify).status === 0
    && sh('node', ['--test'], verify).status === 0;
  fs.rmSync(verify, { recursive: true, force: true });
  return ok;
});
check('the new PR has the fix on a branch on top of main', fixed.length > 0, open.map(p => `#${p.number} ${p.headRefName}`).join(', ') || 'no new PR');
const calls = (fs.existsSync(path.join(tmp, 'gh.log')) ? fs.readFileSync(path.join(tmp, 'gh.log'), 'utf8') : '').split('\n').filter(Boolean).map(l => JSON.parse(l));
check('opens the new PR', calls.some(c => c[0] === 'pr' && c[1] === 'create'));
check('closes PR #9', prs.find(p => p.number === 9).state === 'CLOSED');
const bodies = (fs.existsSync(path.join(tmp, 'bodies.jsonl')) ? fs.readFileSync(path.join(tmp, 'bodies.jsonl'), 'utf8') : '').split('\n').filter(Boolean).map(l => JSON.parse(l));
check('links the new PR on PR #9', bodies.some(b => b.pr === 9 && fixed.some(p => new RegExp(`pull/${p.number}\\b|#${p.number}\\b`).test(b.body))));
const local = git('branch', '--format=%(refname:short)').stdout.split('\n').filter(Boolean);
const heads = sh('git', ['for-each-ref', '--format=%(refname:short)', 'refs/heads'], remote).stdout.split('\n').filter(Boolean);
check('deletes the branch of the closed PR, locally and on the remote', !local.includes('fix/old-total') && !heads.includes('fix/old-total'), `local: ${local.join(', ')}; remote: ${heads.join(', ')}`);
check('keeps the branch with an unpushed commit', local.includes('wip/idea'));
const worktrees = git('worktree', 'list', '--porcelain').stdout.split('\n').filter(l => l.startsWith('worktree '));
check('no extra worktree remains', worktrees.length === 1, worktrees.join(', '));
check('no stash remains', git('stash', 'list').stdout.trim() === '');
check('the remote main does not change', sh('git', ['rev-parse', 'refs/heads/main'], remote).stdout.trim() === fs.readFileSync(path.join(tmp, 'main.sha'), 'utf8').trim());
report();
