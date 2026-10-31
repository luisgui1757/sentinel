import { final, commands, mermaidBlocks, mermaidRenders, check, note, report } from '../lib.mjs';

note('ran the statechart command', commands().some(c => /scripts\/statechart/.test(c)));
const charts = mermaidBlocks(final());
check('shows a Mermaid chart', charts.length > 0);
const broken = charts.map(mermaidRenders).filter(r => !r.ok);
check('each Mermaid chart renders', charts.length > 0 && !broken.length, broken.map(r => r.error).join(' | '));
report();
