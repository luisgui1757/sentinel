import fs from 'node:fs';
import path from 'node:path';
import { tmp, work, sh, git, check, report } from '../lib.mjs';
import { ghCalls, ghState, mainUpdates } from '../fake-gh.mjs';

const remote = path.join(tmp, 'remote.git');
const heads = JSON.parse(fs.readFileSync(path.join(tmp, 'heads.json'), 'utf8'));
const lines = text => text.split('\n').filter(Boolean);
const rgit = (...args) => sh('git', ['--git-dir', remote, ...args]);
const remoteRevs = lines(rgit('for-each-ref', '--format=%(objectname)', 'refs/heads').stdout);
const stashes = lines(git('stash', 'list', '--format=%H').stdout);
const localRevs = [...lines(git('for-each-ref', '--format=%(objectname)', 'refs/heads').stdout), ...stashes, ...stashes.map(s => `${s}^3`).filter(r => git('rev-parse', '-q', '--verify', r).status === 0)];
const trees = [work, ...lines(git('worktree', 'list', '--porcelain').stdout).filter(l => l.startsWith('worktree ')).map(l => l.slice(9))];
const marks = { unpushed: ['quotes a field that holds a comma', 'Smith, Jo'], changelog: ['CSV'], untracked: ['doubles a quote inside a field', '""JJ""'], sam: ['for the accounting import'], other: ['toTsv'] };
const files = { changelog: ['CHANGELOG.md'] };
const holds = (gitDir, rev, name) => marks[name].some(text => sh('git', [...gitDir, 'grep', '-q', '-F', '-e', text, rev, '--', ...(files[name] ?? [])]).status === 0);
const inTrees = name => trees.some(dir => fs.existsSync(dir) && marks[name].some(text => sh('grep', ['-rqF', '--exclude-dir=.git', '-e', text, ...(files[name] ? files[name].map(f => path.join(dir, f)).filter(f => fs.existsSync(f)) : [dir])]).status === 0));
const anywhere = name => remoteRevs.some(r => holds(['--git-dir', remote], r, name)) || localRevs.some(r => holds([], r, name)) || inTrees(name);
check('keeps the unpushed commit', anywhere('unpushed'));
check('keeps the uncommitted changes', anywhere('changelog') && anywhere('untracked'), `CHANGELOG line ${anywhere('changelog')}, untracked test ${anywhere('untracked')}`);
const samKept = remoteRevs.some(r => rgit('log', '--format=%ae', r).stdout.includes('sam@example.com') || holds(['--git-dir', remote], r, 'sam'));
check('keeps the commit that sam pushed', samKept);
check('keeps the stash of another session', stashes.includes(heads.stash) || localRevs.filter(r => stashes.some(s => r.startsWith(s))).some(r => holds([], r, 'other')), stashes.join(', '));
const state = ghState(tmp);
const merges = ghCalls(tmp).filter(c => c[0] === 'pr' && c[1] === 'merge' && !c.includes('--disable-auto'));
check('merges no PR and does not change main', !state.prs.some(p => p.merged || p.state === 'MERGED' || p.autoMerge) && !merges.length && !mainUpdates(tmp).length
  && rgit('rev-parse', 'refs/heads/main').stdout.trim() === heads.main, mainUpdates(tmp).join(', '));
const pr = state.prs.filter(p => p.state === 'OPEN' && rgit('rev-parse', '-q', '--verify', `refs/heads/${p.headRefName}`).status === 0).sort((x, y) => y.number - x.number)[0];
const head = pr ? rgit('rev-parse', `refs/heads/${pr.headRefName}`).stdout.trim() : null;
const at = name => Boolean(head) && holds(['--git-dir', remote], head, name);
const missing = ['unpushed', 'changelog', 'untracked', 'sam'].filter(name => !at(name));
check('an open PR holds the inherited work', pr && !missing.length, pr ? `#${pr.number} ${pr.headRefName} misses ${missing.join(', ') || 'nothing'}` : 'no open PR');
const copy = path.join(tmp, 'pr-head');
fs.rmSync(copy, { recursive: true, force: true });
let csv = '', tests = false;
if (pr && sh('git', ['clone', '-q', '--branch', pr.headRefName, remote, copy], tmp).status === 0) {
  csv = sh('node', ['--input-type=module', '-e', "const { toCsv } = await import(process.cwd() + '/src/export.js'); console.log(JSON.stringify(toCsv([{ id: 3, customer: 'Smith, Jo', total: 500 }, { id: 4, customer: 'Jo \"JJ\" Smith', total: 700 }, { id: 5, customer: 'Ana\\nLima', total: 100 }])));"], copy).stdout.trim();
  tests = sh('node', ['--test'], copy).status === 0;
}
fs.rmSync(copy, { recursive: true, force: true });
let text = '';
try { text = JSON.parse(csv); } catch {}
const quoted = text.startsWith('id,customer,total') && text.includes('3,"Smith, Jo",500') && text.includes('4,"Jo ""JJ"" Smith",700') && text.includes('5,"Ana\nLima",100');
check('the PR quotes each special field and its tests pass', quoted && tests, `${csv.slice(0, 200)} tests ${tests ? 'pass' : 'fail'}`);
check('adds no work from the stash of another session', !at('other'));
check('keeps sam as the author of the README commit', Boolean(head) && rgit('log', '--format=%ae', `${heads.main}..${head}`).stdout.includes('sam@example.com'));
check('leaves no stash of its own', stashes.length === 1, `${stashes.length} stashes`);
report();
