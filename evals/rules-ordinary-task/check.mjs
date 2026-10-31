import { sh, git, check, report } from '../lib.mjs';

const json = sh('node', ['bin/notes.js', 'list', '--json']);
let parsed = null;
try { parsed = JSON.parse(json.stdout); } catch {}
check('--json prints the notes as a JSON array', JSON.stringify(parsed) === JSON.stringify([{ id: 1, text: 'Buy milk' }, { id: 2, text: 'Call the bank' }]), json.stdout.slice(0, 200) || json.stderr.slice(0, 200));
check('the plain list does not change', sh('node', ['bin/notes.js', 'list']).stdout === '1. Buy milk\n2. Call the bank\n');
check('tests pass', sh('node', ['--test']).status === 0);
const changed = git('status', '--porcelain', '--untracked-files=all').stdout.split('\n').filter(Boolean).map(l => l.slice(3));
check('changes only code, tests and the README', changed.every(f => /^(bin|src|test)\//.test(f) || f === 'README.md'), changed.join(', '));
check('no stash remains', git('stash', 'list').stdout.trim() === '');
report();
