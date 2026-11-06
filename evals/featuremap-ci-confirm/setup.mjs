import path from 'node:path';
import { spawnSync } from 'node:child_process';

const [work, , tmp] = process.argv.slice(2);
const run = (...args) => {
  const result = spawnSync('git', args, { cwd: work, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')}: ${result.stderr}`);
};
const remote = path.join(tmp, 'remote.git');
run('init', '-q', '--bare', remote);
run('init', '-q', '-b', 'main');
run('add', '-A');
run('commit', '-qm', 'Initial commit');
run('remote', 'add', 'origin', remote);
run('push', '-q', '-u', 'origin', 'main');
