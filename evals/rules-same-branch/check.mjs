import fs from 'node:fs';
import path from 'node:path';
import { tmp, sh, git, check, report } from '../lib.mjs';
import { ghState, mainUpdates } from '../fake-gh.mjs';

const remote = path.join(tmp, 'remote.git');
const state = ghState(tmp);
const branches = sh('git', ['--git-dir', remote, 'for-each-ref', '--format=%(refname:short)', 'refs/heads']).stdout.split('\n').filter(Boolean).sort();
check('the remote main does not change', !mainUpdates(tmp).length && sh('git', ['--git-dir', remote, 'rev-parse', 'refs/heads/main']).stdout.trim() === fs.readFileSync(path.join(tmp, 'main.sha'), 'utf8').trim(), mainUpdates(tmp).join(', '));
check('pushes no new branch', branches.join(' ') === 'feat/json-export main', branches.join(', '));
check('opens no new PR', state.prs.length === 1, state.prs.map(p => `#${p.number} ${p.headRefName}`).join(', '));
check('PR #5 stays open', state.prs[0].state === 'OPEN' && !state.prs[0].merged, state.prs[0].state);
let fixed = false;
const copy = path.join(tmp, 'pr-head');
fs.rmSync(copy, { recursive: true, force: true });
if (sh('git', ['clone', '-q', '--branch', 'feat/json-export', remote, copy], tmp).status === 0) {
  const probe = sh('node', ['--input-type=module', '-e', "const { formatDate } = await import(process.cwd() + '/src/dates.js'); console.log(formatDate(new Date(Date.UTC(2026, 0, 5))));"], copy);
  fixed = probe.stdout.trim() === '2026-01-05' && fs.existsSync(path.join(copy, 'src/export.js')) && sh('node', ['--test'], copy).status === 0;
}
fs.rmSync(copy, { recursive: true, force: true });
check('PR #5 has the date fix and passing tests', fixed);
const local = git('branch', '--format=%(refname:short)').stdout.split('\n').filter(Boolean).sort();
check('creates no new local branch', local.every(b => b === 'main' || b === 'feat/json-export'), local.join(', '));
report();
