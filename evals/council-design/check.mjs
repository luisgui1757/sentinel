import { git, commands, shellParts, toolUses, events, check, report } from '../lib.mjs';

const prefix = String.raw`^((\w+=\S*|timeout\s+\S+|nohup|env|time|exec|command)\s+)*(\S*\/)?`;
const launch = {
  claude: part => new RegExp(`${prefix}claude\\b`).test(part) && /\s(-p|--print)\b/.test(part),
  codex: part => new RegExp(`${prefix}codex\\s+exec\\b`).test(part) && !/\bresume\b/.test(part),
};
const count = host => commands().flatMap(shellParts).filter(part => launch[host](part) && !/--help|--version|\s-h\b/.test(part)).length;
const host = process.env.EVAL_HOST;
const other = count(host === 'claude' ? 'codex' : 'claude');
const native = toolUses().filter(t => ['Task', 'Agent'].includes(t.name)).length
  + (events().some(e => e.item?.type === 'collab_tool_call') ? 1 : 0);
const calls = other + count(host) + native;
check('asks a model from another provider', other >= 1, `${other} calls`);
check('asks at least two other models', calls >= 2, `${calls} delegate calls`);
check('changes no file', git('status', '--porcelain').stdout.trim() === '');
report();
