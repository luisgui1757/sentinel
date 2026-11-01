import { final, git, commands, mermaidBlocks, mermaidRenders, check, note, report } from '../lib.mjs';

const charts = mermaidBlocks(final());
check('shows a Mermaid chart', charts.length > 0);
const broken = charts.map(mermaidRenders).filter(r => !r.ok);
check('each Mermaid chart renders', charts.length > 0 && !broken.length, broken.map(r => r.error).join(' | '));
check('the code is unchanged', git('diff', '--quiet', process.env.EVAL_HEAD, '--', 'src/').status === 0);
note('a command ran the code', commands().some(c => /order\.js|node --test|node -e|--input-type/.test(c)));
report();
