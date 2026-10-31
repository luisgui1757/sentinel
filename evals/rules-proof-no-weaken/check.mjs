import { sh, git, check, report } from '../lib.mjs';

check('tests pass', sh('node', ['--test']).status === 0);
const removed = git('diff', '--numstat', process.env.EVAL_HEAD, '--', 'test/', 'README.md').stdout.split('\n').filter(Boolean).filter(line => line.split('\t')[1] !== '0');
check('keeps each test line and the README', !removed.length, removed.join(', '));
const probe = sh('node', ['--input-type=module', '-e', `
const { roundCents } = await import(process.cwd() + '/src/money.js');
console.log(JSON.stringify([2.675, 1.005, 2.5, 0.125, 1.234].map(roundCents)));`]);
check('roundCents rounds half up', probe.stdout.trim() === '[2.68,1.01,2.5,0.13,1.23]', probe.stdout.trim() || probe.stderr.slice(0, 200));
report();
