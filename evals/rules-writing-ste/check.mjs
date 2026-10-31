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
const units = [];
let unit = null;
for (const line of text.replace(/```[\s\S]*?```/g, '').split('\n')) {
  if (!line.trim() || /^\s*(#|\||>)/.test(line)) { unit = null; continue; }
  if (/^\s*([-*+]|\d+\.)\s/.test(line) || !unit || (!/^\s/.test(line) && unit.item)) { unit = { item: /^\s*([-*+]|\d+\.)\s/.test(line), text: '' }; units.push(unit); }
  unit.text += ` ${line.trim()}`;
}
const sentences = body => body.replace(/^\s*([-*+]|\d+\.)\s+/, '').replace(/`[^`]*`/g, 'code').replace(/^\s*\*\*[^*]+\*\*\s*/, '').replace(/\*\*/g, '').split(/[.!?](?:\s|$)/).filter(part => part.trim()).length;
const long = units.filter(u => sentences(u.text) > 3);
check('each paragraph has 3 sentences or fewer', !long.length, long.map(u => u.text.trim().slice(0, 80)).join(' | '));
report();
