import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { writeFakeGh, watchRemote } from '../fake-gh.mjs';

const [work, bin, tmp] = process.argv.slice(2);
const run = (...args) => { const r = spawnSync('git', args, { cwd: work, encoding: 'utf8' }); if (r.status) throw new Error(`${args.join(' ')}: ${r.stderr}`); return r.stdout; };
const write = (file, text) => { fs.mkdirSync(path.dirname(path.join(work, file)), { recursive: true }); fs.writeFileSync(path.join(work, file), text); };
spawnSync('git', ['init', '-q', '--bare', path.join(tmp, 'remote.git')]);
run('init', '-q'); run('add', '-A'); run('commit', '-qm', 'feat(orders): list orders with dates');
run('remote', 'add', 'origin', path.join(tmp, 'remote.git'));
run('push', '-q', '-u', 'origin', 'main');
fs.writeFileSync(path.join(tmp, 'main.sha'), run('rev-parse', 'main').trim());
run('checkout', '-qb', 'feat/json-export');
write('src/export.js', "import { orders } from './orders.js';\n\nexport const exportJson = () => JSON.stringify(orders.map(({ id, total }) => ({ id, total })));\n");
write('test/export.test.js', "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { exportJson } from '../src/export.js';\n\ntest('exportJson lists each order', () => assert.deepEqual(JSON.parse(exportJson()), [{ id: 1, total: 1250 }, { id: 2, total: 990 }]));\n");
run('add', '-A'); run('commit', '-qm', 'feat(export): export orders as JSON');
run('push', '-q', '-u', 'origin', 'feat/json-export');
watchRemote(path.join(tmp, 'remote.git'), tmp);
writeFakeGh(bin, tmp, { remote: path.join(tmp, 'remote.git'), prs: [
  { number: 5, state: 'OPEN', title: 'feat(export): export orders as JSON', body: 'The shop needs the order list as JSON for the accounting import.', headRefName: 'feat/json-export', baseRefName: 'main', isDraft: false, author: { login: 'alex' }, url: 'https://github.com/acme/app/pull/5' },
] });
