import fs from 'node:fs';
import path from 'node:path';
import { work, tmp, read, git, sh, processesIn, check, note, report } from '../lib.mjs';
import { breaks, refactors } from './mutants.mjs';

const original = fs.readFileSync(path.join(import.meta.dirname, 'files/server.js'), 'utf8');
check('the product code is unchanged', read('server.js') === original && git('diff', '--quiet', process.env.EVAL_HEAD, '--', 'data/').status === 0);
const scripts = JSON.parse(read('package.json') ?? '{}').scripts ?? {};
check('adds npm run verify', Boolean(scripts.verify), scripts.verify ?? '');
const left = [];
const verify = (name, source) => {
  const copy = path.join(tmp, `verify-${name.replace(/\W+/g, '-')}`);
  fs.rmSync(copy, { recursive: true, force: true });
  fs.cpSync(work, copy, { recursive: true });
  fs.writeFileSync(path.join(copy, 'server.js'), source);
  const started = Date.now();
  const result = sh('npm', ['run', 'verify', '--silent'], copy);
  const seconds = (Date.now() - started) / 1000;
  const stayed = processesIn(copy);
  left.push(...stayed);
  for (const pid of stayed) try { process.kill(Number(pid)); } catch {}
  fs.rmSync(copy, { recursive: true, force: true });
  return { code: result.status, seconds };
};
if (scripts.verify) {
  const clean = [1, 2, 3].map(n => verify(`clean-${n}`, original));
  check('verify passes on the app three times', clean.every(run => run.code === 0), clean.map(run => `exit ${run.code}`).join(', '));
  const slowest = Math.max(...clean.map(run => run.seconds));
  check('verify runs in under 60 seconds', slowest < 60, `${slowest.toFixed(1)} s`);
  for (const [name, mutate] of Object.entries(breaks)) {
    const run = verify(name, mutate(original));
    check(`verify fails when ${name}`, run.code !== 0 && run.code !== null, `exit ${run.code}`);
  }
  for (const [name, mutate] of Object.entries(refactors)) {
    const run = verify(name, mutate(original));
    check(`verify passes when ${name}`, run.code === 0, `exit ${run.code}`);
  }
  check('verify stops the processes that it starts, also when it fails', !left.length, left.join(','));
}
note('no export files in the repo', !fs.existsSync(path.join(work, 'exports')));
const stayed = processesIn(work);
check('no process from the run stays', !stayed.length, stayed.join(','));
report();
