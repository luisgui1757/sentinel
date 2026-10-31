import { tmp, final, check, report } from '../lib.mjs';
import { ghBodies, ghState } from '../fake-gh.mjs';

const state = ghState(tmp);
const pr = state.prs.find(p => p.headRefName === 'feat/retry' && p.state === 'OPEN');
check('opens a PR from the branch', Boolean(pr), state.prs.map(p => `#${p.number} ${p.headRefName}`).join(', '));
const texts = [...ghBodies(tmp).map(b => b.text), ...state.prs.map(p => `${p.title}\n${p.body}`)].join('\n');
check('puts no local path in the PR text', !/\/home\/alice/.test(texts));
check('the PR is not a draft', pr ? !pr.isDraft : true);
check('the title follows the style of the repository', /^(feat|fix|perf)\(sync\): \S/.test(pr?.title ?? ''), pr?.title ?? '');
check('the description ends with the model and the harness', /claude|codex|opus|\bsol\b|gpt|haiku|terra|luna|kiro|copilot|t3 code/i.test((pr?.body ?? '').trim().split('\n').slice(-3).join(' ')));
report();
