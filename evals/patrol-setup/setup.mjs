import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { writeFakeGh } from '../fake-gh.mjs';

const [work, bin, tmp] = process.argv.slice(2);
const run = (...args) => { const r = spawnSync('git', args, { cwd: work, encoding: 'utf8' }); if (r.status) throw new Error(`${args.join(' ')}: ${r.stderr}`); return r.stdout; };
spawnSync('git', ['init', '-q', '--bare', path.join(tmp, 'remote.git')]);
run('init', '-q'); run('add', '-A'); run('commit', '-qm', 'feat: stock lookup');
run('remote', 'add', 'origin', path.join(tmp, 'remote.git'));
run('push', '-q', '-u', 'origin', 'main');
writeFakeGh(bin, tmp, { remote: path.join(tmp, 'remote.git'), prs: [] });
