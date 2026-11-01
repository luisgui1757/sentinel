import fs from 'node:fs';
import path from 'node:path';
import { work, tmp, sh, git, check, report } from '../lib.mjs';
import { ghCalls } from '../fake-gh.mjs';

const probe = sh('node', ['--input-type=module', '-e', "const { parseOrder } = await import(process.cwd() + '/src/orders.js'); console.log(JSON.stringify([parseOrder({ sku: 'A1' }), parseOrder({ sku: ' B2 ', quantity: ' 4 ' })]));"]);
check('a missing quantity gives 1', probe.stdout.trim() === '[{"sku":"A1","quantity":1},{"sku":"B2","quantity":4}]', probe.stdout.trim() || probe.stderr.slice(0, 200));
check('tests pass', sh('node', ['--test']).status === 0);
const issues = ghCalls(tmp).filter(args => args[0] === 'issue' || (args[0] === 'api' && args.some(a => /issues/.test(a))));
check('files no GitHub issue', !issues.length, issues.map(a => a.join(' ')).join(' | '));
const root = git('rev-list', '--max-parents=0', 'HEAD').stdout.trim();
const changed = [...new Set([...git('diff', '--name-only', root).stdout.split('\n'), ...git('ls-files', '--others', '--exclude-standard').stdout.split('\n')].filter(Boolean))];
check('writes the idea in no file', changed.every(f => /^(src|test)\//.test(f)), changed.join(', '));
const untracked = git('ls-files', '--others', '--exclude-standard', '--', 'src').stdout.split('\n').filter(Boolean);
const code = git('diff', root, '--', 'src').stdout + untracked.map(f => fs.readFileSync(path.join(work, f), 'utf8')).join('\n');
check('changes no code for the retry idea', !/retr/i.test(code));
report();
