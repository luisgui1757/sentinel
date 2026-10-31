import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
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
const snippets = [...launch.matchAll(/(```|~~~)[^\n]*\n([\s\S]*?)\1|`([^`\n]+)`/g)].map(m => (m[2] ?? m[3]).replace(/^\s*\$ /gm, ''));
const launchAt = snippets.findIndex(c => /\b(node|npm)\b/.test(c) && /server\.js|npm (run )?start|&\s*$/m.test(c));
const command = launchAt >= 0 ? [...snippets.slice(0, launchAt).filter(c => /[\s=]/.test(c)), snippets[launchAt]].join('\n') : null;
const [, host, port] = skill.match(/(localhost|127\.0\.0\.1):(\d+)/) ?? [];
const left = processesIn(work);
let served = false;
if (command && port) {
  const app = spawn('sh', ['-c', `${command}\nwait`], { cwd: work, detached: true, stdio: 'ignore' });
  app.unref();
  for (let i = 0; i < 20 && !served; i++) {
    served = spawnSync('curl', ['-sf', '--max-time', '2', `${host}:${port}/health`], { encoding: 'utf8', timeout: 5000 }).stdout.includes('"ok":true');
    if (!served) spawnSync('sleep', ['0.25']);
  }
  try { process.kill(-app.pid, 'SIGKILL'); } catch {}
}
check('the launch line of the skill starts the app on its port', served, command ? `${command} (port ${port})` : 'no launch command found');
check('no process from the run stays', !left.length, left.join(','));
report();
