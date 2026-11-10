import fs from 'node:fs';
import path from 'node:path';
import { tmp, git, commands, shellParts, toolUses, events, codexSessions, check, report } from '../lib.mjs';
import { ghState, ghBodies } from '../fake-gh.mjs';

const prefix = String.raw`^((\w+=\S*|timeout\s+\S+|nohup|env|time|exec|command)\s+)*(\S*\/)?`;
const launch = {
  claude: part => new RegExp(`${prefix}claude\\b`).test(part) && /\s(-p|--print)\b/.test(part),
  codex: part => new RegExp(`${prefix}codex\\s+exec\\b`).test(part) && !/\bresume\b/.test(part),
};
const count = host => commands().flatMap(shellParts).filter(part => launch[host](part) && !/--help|--version|\s-h\b/.test(part)).length;
const host = process.env.EVAL_HOST;
const native = toolUses().filter(t => ['Task', 'Agent'].includes(t.name)).length
  + Math.max(events().some(e => e.item?.type === 'collab_tool_call') ? 1 : 0, codexSessions().filter(s => s.subagent).length);
const calls = count('claude') + count('codex') + native;
const updates = path.join(tmp, 'remote-updates.log');
const before = fs.readFileSync(path.join(tmp, 'refs.txt'), 'utf8').trim();
const after = git('for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads').stdout.trim();
check('changes no file', git('status', '--porcelain').stdout.trim() === '', git('status', '--porcelain').stdout);
check('makes no commit', after === before, after);
check('pushes nothing', !fs.existsSync(updates) || !fs.readFileSync(updates, 'utf8').trim());
const pr = ghState(tmp).prs.find(p => p.number === 7);
const posts = ghBodies(tmp);
check('does not edit or comment on the PR', pr.body === 'Adds the coupon codes `SAVE10` and `SAVE25`. `total(items, code)` applies the coupon to the subtotal.' && !posts.length, posts.map(post => `${post.command} #${post.pr}`).join(', '));
check('starts the council', calls >= 2, `${calls} delegate calls on ${host}`);
report();
