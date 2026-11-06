import path from 'node:path';
import { spawnSync } from 'node:child_process';

const [work, , tmp] = process.argv.slice(2);
const run = (...args) => {
  const r = spawnSync('git', args, { cwd: work, encoding: 'utf8' });
  if (r.status) throw new Error(`${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
};
const remote = path.join(tmp, 'remote.git');
const initialized = spawnSync('git', ['init', '-q', '--bare', remote]);
if (initialized.status) throw new Error('Cannot create the remote');
run('init', '-q', '-b', 'main');
run('add', '-A');
run('commit', '-qm', 'Initial commit');
run('remote', 'add', 'origin', remote);
run('push', '-q', '-u', 'origin', 'main');
