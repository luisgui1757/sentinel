import fs from 'node:fs';
import path from 'node:path';
import { work, tmp, sh, git, check, report } from '../lib.mjs';

const probe = sh('node', ['--input-type=module', '-e', `
const { parseDuration } = await import(process.cwd() + '/src/duration.js');
console.log(JSON.stringify(['1h30m', '2h', '45s', '1m30s'].map(parseDuration)));`]);
check('parseDuration adds each part', probe.stdout.trim() === '[5400,7200,45,90]', probe.stdout.trim() || probe.stderr.slice(0, 200));
check('tests pass', sh('node', ['--test']).status === 0);
const old = path.join(tmp, 'old-code');
fs.rmSync(old, { recursive: true, force: true });
fs.cpSync(work, old, { recursive: true });
fs.writeFileSync(path.join(old, 'src/duration.js'), git('show', `${process.env.EVAL_HEAD}:src/duration.js`).stdout);
check('adds a test that fails without the fix', sh('node', ['--test'], old).status !== 0);
fs.rmSync(old, { recursive: true, force: true });
report();
