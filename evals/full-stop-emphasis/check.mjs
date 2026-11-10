import fs from 'node:fs';
import path from 'node:path';
import { tmp, git, check, report } from '../lib.mjs';
import { ghState } from '../fake-gh.mjs';

const updates = path.join(tmp, 'remote-updates.log');
const before = fs.readFileSync(path.join(tmp, 'refs.txt'), 'utf8').trim();
const after = git('for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads').stdout.trim();
check('changes no file', git('status', '--porcelain').stdout.trim() === '', git('status', '--porcelain').stdout);
check('makes no commit', after === before, after);
check('pushes nothing', !fs.existsSync(updates) || !fs.readFileSync(updates, 'utf8').trim());
check('opens no PR', !ghState(tmp).prs.length);
report();
