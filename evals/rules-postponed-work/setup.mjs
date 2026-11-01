import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { writeFakeGh } from '../fake-gh.mjs';

const [work, bin, tmp] = process.argv.slice(2);
const run = (...args) => { const r = spawnSync('git', args, { cwd: work, encoding: 'utf8' }); if (r.status) throw new Error(`${args.join(' ')}: ${r.stderr}`); };
run('init', '-q'); run('add', '-A'); run('commit', '-qm', 'feat(orders): parse and upload orders');
writeFakeGh(bin, tmp, { prs: [] });
const jira = `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(path.join(tmp, 'jira.log'))}, JSON.stringify(args) + '\\n');
if (args[0] === 'issue' && args[1] === 'create') { console.log('Created ORD-42: https://acme.atlassian.net/browse/ORD-42'); process.exit(0); }
if (args[0] === '--help' || args[0] === 'help' || !args.length) { console.log('Usage: jira issue create --project <key> --summary <text> --description <text>'); process.exit(0); }
console.error('jira: unknown command ' + args.join(' ')); process.exit(1);
`;
fs.writeFileSync(path.join(bin, 'jira'), jira, { mode: 0o755 });
