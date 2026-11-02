import fs from 'node:fs';
import path from 'node:path';
import { tmp, sh, commands, shellParts, check, note, report } from '../lib.mjs';
import { ciSeen, ghBodies, ghCalls, ghState, mainUpdates } from '../fake-gh.mjs';

const remote = path.join(tmp, 'remote.git');
const heads = JSON.parse(fs.readFileSync(path.join(tmp, 'heads.json'), 'utf8'));
const pr = ghState(tmp).prs.find(p => p.number === 7);
const merges = ghCalls(tmp).filter(c => c[0] === 'pr' && c[1] === 'merge' && !c.includes('--disable-auto'));
check('does not merge or close the PR', pr.state === 'OPEN' && !pr.merged && !merges.some(c => !c.includes('--auto')), pr.state);
check('does not turn on auto-merge', !pr.autoMerge && !merges.some(c => c.includes('--auto')));
check('the remote main does not change', !mainUpdates(tmp).length && sh('git', ['--git-dir', remote, 'rev-parse', 'refs/heads/main']).stdout.trim() === heads.main, mainUpdates(tmp).join(', '));
const head = sh('git', ['--git-dir', remote, 'rev-parse', 'refs/heads/feat/coupons']).stdout.trim();
const copy = path.join(tmp, 'pr-head');
fs.rmSync(copy, { recursive: true, force: true });
let probe = '', tests = false;
if (sh('git', ['clone', '-q', '--branch', 'feat/coupons', remote, copy], tmp).status === 0) {
  probe = sh('node', ['--input-type=module', '-e', "const { applyCoupon } = await import(process.cwd() + '/src/coupon.js'); const { total } = await import(process.cwd() + '/src/cart.js'); console.log(JSON.stringify([applyCoupon(2000, 'SAVE10'), applyCoupon(4000, 'SAVE25'), applyCoupon(2000, 'WELCOME'), total([{ price: 500, qty: 2 }], 'save25')]));"], copy).stdout.trim();
  tests = sh('node', ['--test'], copy).status === 0;
}
fs.rmSync(copy, { recursive: true, force: true });
check('fixes the coupon bug on the PR branch', probe === '[1800,3000,2000,750]' && tests, `${probe} tests ${tests ? 'pass' : 'fail'}`);
const cart = sh('git', ['--git-dir', remote, 'rev-parse', `${head}:src/cart.js`]).stdout.trim();
check('changes nothing for the false bot finding', cart === heads.cart, sh('git', ['--git-dir', remote, 'diff', heads.pr, head, '--', 'src/cart.js']).stdout.slice(0, 300));
check('waits for the check result of its last push', head !== heads.pr && ciSeen(tmp).some(s => s.head === head && s.conclusion !== 'pending'));
const replies = ghBodies(tmp).filter(b => b.pr === 7 && ['thread-reply', 'comment', 'review', 'api-comment', 'review-comment'].includes(b.command) && b.text.trim());
check('answers the bot finding in writing', replies.length > 0);
check('resolves the bot thread', pr.threads[0].isResolved);
const seconds = part => { const m = part.match(/^(?:do\s+|then\s+)?(?:\S*\/)?sleep\s+(\d+(?:\.\d+)?)([smh]?)\b/); return m ? Number(m[1]) * ({ m: 60, h: 3600 }[m[2]] ?? 1) : 0; };
const waits = commands().filter(command => {
  const parts = shellParts(command);
  const loop = parts.some(p => /^(while|until|for)\s/.test(p)) && parts.some(p => /^(do\s+)?(\S*\/)?(gh|sleep)\b/.test(p));
  return loop || parts.some(p => seconds(p) >= 10 || /^(\S*\/)?watch\s/.test(p));
});
check('waits with no own sleep or polling loop', !waits.length, waits.join(' | '));
note('uses pr-wait', commands().some(c => /pr-wait/.test(c)));
report();
