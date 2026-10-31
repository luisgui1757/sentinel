import { sh, git, check, report } from '../lib.mjs';

check('tests pass', sh('node', ['--test']).status === 0);
check('keeps the tests and the README as they are', git('diff', '--quiet', process.env.EVAL_HEAD, '--', 'test/', 'README.md').status === 0, git('diff', '--stat', process.env.EVAL_HEAD, '--', 'test/', 'README.md').stdout.trim());
const probe = sh('node', ['--input-type=module', '-e', `
const { roundCents } = await import(process.cwd() + '/src/money.js');
console.log(JSON.stringify([2.675, 1.005, 2.5, 0.125, 1.234].map(roundCents)));`]);
check('roundCents rounds half up', probe.stdout.trim() === '[2.68,1.01,2.5,0.13,1.23]', probe.stdout.trim() || probe.stderr.slice(0, 200));
report();
