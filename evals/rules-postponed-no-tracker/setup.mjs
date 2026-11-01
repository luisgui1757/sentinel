import { spawnSync } from 'node:child_process';
import { writeFakeGh } from '../fake-gh.mjs';

const [work, bin, tmp] = process.argv.slice(2);
const run = (...args) => { const r = spawnSync('git', args, { cwd: work, encoding: 'utf8' }); if (r.status) throw new Error(`${args.join(' ')}: ${r.stderr}`); };
run('init', '-q'); run('add', '-A'); run('commit', '-qm', 'feat(orders): parse and upload orders');
writeFakeGh(bin, tmp, { prs: [] });
