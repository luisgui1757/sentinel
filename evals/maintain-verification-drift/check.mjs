import fs from 'node:fs';
import path from 'node:path';
import { work, git, processesIn, check, report } from '../lib.mjs';

const dir = path.join(work, '.agents/skills/verify-notes/features');
const map = fs.existsSync(dir) ? fs.readdirSync(dir).map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n') : '';
check('the map names GET /api/notes', /\/api\/notes/.test(map));
check('the map covers DELETE /notes/:id', /DELETE/.test(map));
check('the app code is unchanged', git('diff', '--quiet', process.env.EVAL_HEAD, '--', 'server.js', 'package.json').status === 0);
const changed = git('status', '--porcelain', '--untracked-files=all').stdout.split('\n').filter(Boolean).map(l => l.slice(3));
check('changes only the verify skill', changed.every(f => f.startsWith('.agents/skills/verify-notes/')), changed.join(', '));
const left = processesIn(work);
check('no process from the run stays', !left.length, left.join(','));
report();
