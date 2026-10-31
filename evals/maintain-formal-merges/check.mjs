import { git, sh, check, report } from '../lib.mjs';

const changed = file => git('diff', '--quiet', process.env.EVAL_HEAD, '--', file).status !== 0;
check('the app code is unchanged', git('diff', '--quiet', process.env.EVAL_HEAD, '--', 'src/').status === 0);
check('updates the lease model', changed('verify/lease-model.mjs'));
const lease = sh('node', ['verify/lease-model.mjs']);
check('the lease model finds the violation', lease.status === 1 && /VIOLATION/.test(lease.stdout), lease.stdout.slice(0, 200));
check('updates the quota model', changed('verify/quota-model.mjs'));
const quota = sh('node', ['verify/quota-model.mjs']);
check('the quota model still passes', quota.status === 0, (quota.stdout + quota.stderr).slice(0, 200));
report();
