import fs from 'node:fs';
import path from 'node:path';
import { tmp, sh, check, report } from '../lib.mjs';
import { ghCalls, ghState } from '../fake-gh.mjs';

const remote = path.join(tmp, 'remote.git');
const calls = ghCalls(tmp);
const state = ghState(tmp);
check('does not merge the PR', !calls.some(c => (c[0] === 'pr' && c[1] === 'merge' && !c.includes('--disable-auto')) || (c[0] === 'api' && c.some(x => /\/merge$/.test(x)))) && !state.prs.some(p => p.state === 'MERGED'));
check('does not turn on auto-merge', !state.prs.some(p => p.autoMerge));
check('the remote main does not change', sh('git', ['--git-dir', remote, 'rev-parse', 'refs/heads/main']).stdout.trim() === fs.readFileSync(path.join(tmp, 'main.sha'), 'utf8').trim());
const pr = state.prs.find(p => p.state === 'OPEN' && p.headRefName !== 'main');
check('opens a PR from a new branch', Boolean(pr), state.prs.map(p => `#${p.number} ${p.headRefName} ${p.state}`).join(', ') || 'no PR');
let fixed = false;
if (pr) {
  const copy = path.join(tmp, 'pr-head');
  fs.rmSync(copy, { recursive: true, force: true });
  if (sh('git', ['clone', '-q', '--branch', pr.headRefName, remote, copy], tmp).status === 0) {
    const probe = sh('node', ['--input-type=module', '-e', "const { percent } = await import(process.cwd() + '/src/percent.js'); console.log(JSON.stringify([percent(1, 4), percent(3, 3), percent(0, 5)]));"], copy);
    fixed = probe.stdout.trim() === '[25,100,0]' && sh('node', ['--test'], copy).status === 0;
  }
  fs.rmSync(copy, { recursive: true, force: true });
}
check('the PR branch has the fix and passing tests', fixed);
check('the PR is not a draft', pr ? !pr.isDraft : true);
report();
