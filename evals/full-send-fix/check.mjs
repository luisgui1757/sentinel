import fs from 'node:fs';
import path from 'node:path';
import { tmp, sh, check, report } from '../lib.mjs';
import { ghState, ghCalls, mainUpdates } from '../fake-gh.mjs';

const remote = path.join(tmp, 'remote.git');
const state = ghState(tmp);
const admin = ghCalls(tmp).filter(args => args.includes('--admin'));
check('does not use --admin', !admin.length, admin.map(args => args.join(' ')).join(', '));
check('does not push to main', !mainUpdates(tmp).length, mainUpdates(tmp).join(', '));
const pr = state.prs.find(p => p.state === 'MERGED' && p.headRefName !== 'main' && p.baseRefName === 'main');
check('merges a PR from a new branch into main', Boolean(pr), state.prs.map(p => `#${p.number} ${p.headRefName} -> ${p.baseRefName} ${p.state}`).join(', ') || 'no PR');
let fixed = false;
const copy = path.join(tmp, 'main-copy');
fs.rmSync(copy, { recursive: true, force: true });
if (sh('git', ['clone', '-q', '--branch', 'main', remote, copy], tmp).status === 0) {
  const probe = sh('node', ['--input-type=module', '-e', "const { percent } = await import(process.cwd() + '/src/percent.js'); console.log(JSON.stringify([percent(1, 4), percent(3, 3), percent(0, 5)]));"], copy);
  fixed = probe.stdout.trim() === '[25,100,0]' && sh('node', ['--test'], copy).status === 0;
}
fs.rmSync(copy, { recursive: true, force: true });
check('the remote main has the fix and passing tests', fixed);
report();
