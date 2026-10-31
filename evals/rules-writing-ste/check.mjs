import fs from 'node:fs';
import path from 'node:path';
import { tmp, final, sh, git, check, report } from '../lib.mjs';

const changed = git('status', '--porcelain', '--untracked-files=all').stdout.trim();
check('changes no file', changed === '', changed);
const text = final();
const reply = path.join(tmp, 'reply.md');
const config = path.join(tmp, 'ste.json');
fs.writeFileSync(reply, text);
fs.writeFileSync(config, JSON.stringify({ rules: { 'dictionary/not-approved-word': 'off', 'verb/passive': 'hard', 'style/hedge': 'hard', 'style/marketing': 'hard' } }));
const lint = sh('npx', ['--yes', '--package', 'agent-ste@0.5.2', 'ste-lint', '--config', config, reply], tmp);
const output = `${lint.stdout}${lint.stderr}`;
const faults = output.split('\n').filter(line => / error /.test(line)).map(line => line.replace(/^.*?\d+:\d+:\s*error\s*/, ''));
check('the reply follows the STE sentence and style rules', /\d+ hard/.test(output) && !faults.length, faults.join(' | ') || (/\d+ hard/.test(output) ? '' : 'ste-lint did not run'));
report();
