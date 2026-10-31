import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { writeFakeGh } from '../fake-gh.mjs';

const [work, bin, tmp] = process.argv.slice(2);
const run = (cwd, ...args) => { const r = spawnSync('git', args, { cwd, encoding: 'utf8' }); if (r.status) throw new Error(`${args.join(' ')}: ${r.stderr}`); return r.stdout; };
run(tmp, 'init', '-q', '--bare', 'remote.git');
run(work, 'init', '-q'); run(work, 'add', '-A'); run(work, 'commit', '-qm', 'feat(stats): add percent');
run(work, 'remote', 'add', 'origin', path.join(tmp, 'remote.git'));
run(work, 'push', '-q', '-u', 'origin', 'main');
fs.writeFileSync(path.join(tmp, 'main.sha'), run(work, 'rev-parse', 'HEAD').trim());
writeFakeGh(bin, tmp, { remote: path.join(tmp, 'remote.git'), prs: [] });
