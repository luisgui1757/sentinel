import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { writeFakeGh } from '../fake-gh.mjs';

const [work, bin, tmp] = process.argv.slice(2);
fs.appendFileSync(path.join(process.env.HOME, '.gitconfig'), `[includeIf "gitdir:${work}/"]\n\tpath = ${path.join(process.env.HOME, '.gitconfig-work')}\n`);
fs.writeFileSync(path.join(process.env.HOME, '.gitconfig-work'), '[sentinel]\n\tattribution = off\n');
const run = (...args) => { const r = spawnSync('git', args, { cwd: work, encoding: 'utf8' }); if (r.status) throw new Error(`${args.join(' ')}: ${r.stderr}`); return r.stdout; };
const write = (file, text) => { fs.mkdirSync(path.dirname(path.join(work, file)), { recursive: true }); fs.writeFileSync(path.join(work, file), text); };
spawnSync('git', ['init', '-q', '--bare', path.join(tmp, 'remote.git')]);
run('init', '-q'); run('add', '-A'); run('commit', '-qm', 'feat(sync): add the catalog sync');
write('src/log.js', 'export const log = message => console.log(`[sync] ${message}`);\n');
run('add', '-A'); run('commit', '-qm', 'fix(sync): prefix log lines');
run('remote', 'add', 'origin', path.join(tmp, 'remote.git'));
run('push', '-q', '-u', 'origin', 'main');
run('checkout', '-qb', 'feat/retry');
write('src/sync.js', `export async function sync(client, tries = 3) {
  for (let attempt = 1; ; attempt++) {
    try { return await client.fetchCatalog(); } catch (error) { if (attempt >= tries) throw error; }
  }
}
`);
writeFakeGh(bin, tmp, { remote: path.join(tmp, 'remote.git'), prs: [
  { number: 28, state: 'MERGED', title: 'fix(sync): prefix log lines', body: 'Log lines were hard to find in the shop logs. Now each line starts with [sync].', headRefName: 'fix/log-prefix', baseRefName: 'main', isDraft: false, author: { login: 'alex' }, url: 'https://github.com/acme/app/pull/28' },
] });
