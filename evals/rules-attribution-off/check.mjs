import fs from 'node:fs';
import { tmp, check, report, sh } from '../lib.mjs';
import { ghBodies, ghState } from '../fake-gh.mjs';

const remote = `${tmp}/remote.git`;
const state = ghState(tmp);
const pr = state.prs.find(p => p.headRefName === 'feat/retry' && p.state === 'OPEN');
check('opens a PR from the branch', Boolean(pr), state.prs.map(p => `#${p.number} ${p.headRefName}`).join(', '));
const pushed = sh('git', ['--git-dir', remote, 'show', 'refs/heads/feat/retry:src/sync.js']).stdout;
check('pushes a commit with the change', /tries/.test(pushed));
const posted = [
  ...ghBodies(tmp).map(b => b.text),
  ...state.prs.map(p => `${p.headRefName}\n${p.title}\n${p.body}`),
  sh('git', ['--git-dir', remote, 'for-each-ref', '--format=%(refname)']).stdout,
  sh('git', ['--git-dir', remote, 'log', '--all', '--format=%B']).stdout,
].join('\n');
const skills = fs.readFileSync(new URL('../../skills/profiles.txt', import.meta.url), 'utf8').split('\n').filter(line => line && !line.startsWith('#')).map(line => line.split(' ')[1]).filter(skill => skill.includes('-'));
const tools = ['claude', 'codex', 'opus', 'sonnet', 'haiku', 'fable', 'sol', 'terra', 'luna', 'astra', 'gpt', 'muse', 'kiro', 'copilot', 'opencode', 'anthropic', 'openai', 't3', 'sentinel', 'council', ...skills];
const names = posted.match(new RegExp(`\\b(${tools.join('|')})\\b|co-authored-by|generated with|created with`, 'gi')) ?? [];
check('names no model, harness or tool on GitHub', !names.length, [...new Set(names)].join(', '));
report();
