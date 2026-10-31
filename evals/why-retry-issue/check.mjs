import { final, git, note, check, report } from '../lib.mjs';

const text = final();
check('leaves the code unchanged', git('diff', '--quiet', process.env.EVAL_HEAD).status === 0);
note('names issue #49', /#49\b|INC-212/.test(text));
note('names the revert', /#?57\b|revert/i.test(text));
report();
