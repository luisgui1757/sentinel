import fs from 'node:fs';
import path from 'node:path';
import { tmp, final, sh, git, check, report } from '../lib.mjs';

const changed = git('status', '--porcelain', '--untracked-files=all').stdout.trim();
check('changes no file', changed === '', changed);
const reply = path.join(tmp, 'reply.md');
fs.writeFileSync(reply, final());
const lint = sh('npx', ['--yes', '--package', 'agent-ste@0.5.2', 'ste-lint', reply], tmp);
const output = `${lint.stdout}${lint.stderr}`;
const faults = output.split('\n').filter(line => / error /.test(line) && !/\[dictionary\//.test(line)).map(line => line.replace(/^.*?\d+:\d+:\s*error\s*/, ''));
check('the reply follows the STE sentence rules', /\d+ hard/.test(output) && !faults.length, faults.join(' | ') || (/\d+ hard/.test(output) ? '' : 'ste-lint did not run'));
report();
