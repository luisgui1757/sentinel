import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { work, read, git, processesIn, check, report } from '../lib.mjs';

const dir = path.join(work, '.agents/skills/verify-notes/features');
const map = fs.existsSync(dir) ? fs.readdirSync(dir).map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n') : '';
check('the map names GET /api/notes', /\/api\/notes/.test(map));
check('the map covers DELETE /notes/:id', /DELETE/.test(map));
check('the app code is unchanged', git('diff', '--quiet', process.env.EVAL_HEAD, '--', 'server.js', 'package.json').status === 0);
const changed = git('status', '--porcelain', '--untracked-files=all').stdout.split('\n').filter(Boolean).map(l => l.slice(3));
check('changes only the verify skill', changed.every(f => f.startsWith('.agents/skills/verify-notes/')), changed.join(', '));
const skill = read('.agents/skills/verify-notes/SKILL.md') ?? '';
const launch = (skill.split(/^## Launch/m)[1] ?? '').split(/^## /m)[0];
const command = [...launch.matchAll(/`([^`]+)`/g)].map(m => m[1]).find(c => /server\.js|&\s*$/.test(c));
const [, host, port] = skill.match(/(localhost|127\.0\.0\.1):(\d+)/) ?? [];
let served = false;
if (command && port) {
  const started = spawnSync('sh', ['-c', `${command.replace(/&\s*$/, '')} > /dev/null 2>&1 & echo $!`], { cwd: work, encoding: 'utf8' });
  const pid = Number(started.stdout.trim());
  for (let i = 0; i < 20 && !served; i++) {
    served = spawnSync('curl', ['-sf', `${host}:${port}/health`], { encoding: 'utf8' }).stdout.includes('"ok":true');
    if (!served) spawnSync('sleep', ['0.25']);
  }
  if (pid) try { process.kill(pid); } catch {}
}
check('the launch line of the skill starts the app on its port', served, command ? `${command} (port ${port})` : 'no launch command found');
const left = processesIn(work);
check('no process from the run stays', !left.length, left.join(','));
report();
