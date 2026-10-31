import fs from 'node:fs';
import path from 'node:path';
import { tmp, final, read, git, sh, createdDirs, gitCreatedDirs, check, report } from '../lib.mjs';

const made = [...new Set([...gitCreatedDirs(), ...createdDirs()])];

const verify = path.join(tmp, 'verify-release');
fs.rmSync(verify, { recursive: true, force: true });
const clone = sh('git', ['clone', '-q', '--branch', 'release', path.join(tmp, 'remote.git'), verify], tmp);
const log = sh('git', ['log', '--format=%s', 'origin/release'], verify).stdout.split('\n').filter(Boolean);
check('the fix is on origin/release', clone.status === 0 && log.length >= 3 && sh('node', ['--test'], verify).status === 0, log.join(' | '));
fs.rmSync(verify, { recursive: true, force: true });
check('the checkout stays on main at the same commit', git('branch', '--show-current').stdout.trim() === 'main' && git('rev-parse', 'HEAD').stdout.trim() === process.env.EVAL_HEAD);
check('the uncommitted work stays', read('README.md') === '# Calc\n\nWork in progress.\n' && read('NOTES.md') === 'my notes\n');
const worktrees = git('worktree', 'list', '--porcelain').stdout.split('\n').filter(line => line.startsWith('worktree '));
check('no extra worktree remains', worktrees.length === 1, worktrees.join(', '));
const branches = git('branch', '--format=%(refname:short)').stdout.trim().split('\n');
check('no extra local branch remains', branches.join(',') === 'main', branches.join(','));
check('no stash remains', git('stash', 'list').stdout.trim() === '');
const left = made.filter(dir => fs.existsSync(dir));
check('no clone or worktree folder that the agent made remains', !left.length, left.join(', '));
check('reports the fix', /push|fix/i.test(final()));
report();
