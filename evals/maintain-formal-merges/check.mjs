import { final, git, sh, check, report } from '../lib.mjs';

check('the app code is unchanged', git('diff', '--quiet', process.env.EVAL_HEAD, '--', 'src/').status === 0);
check('updates the model', git('diff', '--quiet', process.env.EVAL_HEAD, '--', 'verify/').status !== 0);
const model = sh('node', ['verify/lease-model.mjs']);
check('the updated model finds the violation', model.status === 1 && /VIOLATION/.test(model.stdout), model.stdout.slice(0, 200));
check('reports the race', /race|two workers|both workers/i.test(final()));
report();
