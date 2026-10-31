import fs from 'node:fs';
import path from 'node:path';
import { work, tmp, read, git, sh, processesIn, check, note, report } from '../lib.mjs';
import { mutants } from './mutants.mjs';

const original = fs.readFileSync(path.join(import.meta.dirname, 'files/server.js'), 'utf8');
check('the product code is unchanged', read('server.js') === original && git('diff', '--quiet', process.env.EVAL_HEAD, '--', 'data/').status === 0);
const scripts = JSON.parse(read('package.json') ?? '{}').scripts ?? {};
check('adds npm run verify', Boolean(scripts.verify), scripts.verify ?? '');
const verify = (name, source) => {
  const copy = path.join(tmp, `verify-${name.replace(/\W+/g, '-')}`);
  fs.rmSync(copy, { recursive: true, force: true });
  fs.cpSync(work, copy, { recursive: true });
  fs.writeFileSync(path.join(copy, 'server.js'), source);
  const result = sh('npm', ['run', 'verify', '--silent'], copy);
  const left = processesIn(copy);
  for (const pid of left) try { process.kill(Number(pid)); } catch {}
  fs.rmSync(copy, { recursive: true, force: true });
  return { code: result.status, left };
};
if (scripts.verify) {
  const good = verify('original', original);
  check('verify passes on the working export', good.code === 0, `exit ${good.code}`);
  const left = [...good.left];
  for (const [name, mutate] of Object.entries(mutants)) {
    const bad = verify(name, mutate(original));
    left.push(...bad.left);
    check(`verify fails when the ${name}`, bad.code !== 0 && bad.code !== null, `exit ${bad.code}`);
  }
  check('verify stops the processes that it starts, also when it fails', !left.length, left.join(','));
}
note('no export files in the repo', !fs.existsSync(path.join(work, 'exports')));
const left = processesIn(work);
check('no process from the run stays', !left.length, left.join(','));
report();
