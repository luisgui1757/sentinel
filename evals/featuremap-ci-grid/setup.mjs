import path from 'node:path';
import { spawnSync } from 'node:child_process';

const [work, , tmp] = process.argv.slice(2);
const run = (...args) => { const r = spawnSync('git', args, { cwd: work, encoding: 'utf8' }); if (r.status) throw new Error(`${args.join(' ')}: ${r.stderr}`); return r.stdout; };
spawnSync('git', ['init', '-q', '--bare', path.join(tmp, 'remote.git')]);
run('init', '-q');
run('add', '-A');
run('commit', '-qm', 'Initial commit');
run('remote', 'add', 'origin', path.join(tmp, 'remote.git'));
run('push', '-q', '-u', 'origin', 'main');
