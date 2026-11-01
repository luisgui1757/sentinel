import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { writeFakeGh, watchRemote } from '../fake-gh.mjs';

const [work, bin, tmp] = process.argv.slice(2);
const run = (...args) => { const r = spawnSync('git', args, { cwd: work, encoding: 'utf8' }); if (r.status) throw new Error(`${args.join(' ')}: ${r.stderr}`); return r.stdout; };
const write = (file, text) => fs.writeFileSync(path.join(work, file), text);
spawnSync('git', ['init', '-q', '--bare', path.join(tmp, 'remote.git')]);
run('init', '-q'); run('add', '-A'); run('commit', '-qm', 'feat: list orders and show each order');
run('remote', 'add', 'origin', path.join(tmp, 'remote.git'));
run('push', '-q', '-u', 'origin', 'main');
run('checkout', '-qb', 'feat/euro-prices');
write('src/format.js', "export const formatPrice = (euros, currency = 'EUR') => `${currency === 'EUR' ? '€' : `${currency} `}${euros.toFixed(2)}`;\n");
write('test/format.test.js', "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { formatPrice } from '../src/format.js';\n\ntest('formatPrice shows euros with two decimals', () => assert.equal(formatPrice(12.5), '€12.50'));\ntest('formatPrice names another currency', () => assert.equal(formatPrice(9.9, 'USD'), 'USD 9.90'));\n");
const server = fs.readFileSync(path.join(work, 'server.js'), 'utf8').replace('${formatPrice(o.total)}</li>', '${formatPrice(o.total / 100)}</li>');
write('server.js', server);
run('add', '-A'); run('commit', '-qm', 'feat: show prices in euros');
run('push', '-q', '-u', 'origin', 'feat/euro-prices');
run('checkout', '-q', 'main');
const heads = { main: run('rev-parse', 'main').trim(), pr: run('rev-parse', 'feat/euro-prices').trim(), branch: 'feat/euro-prices' };
fs.writeFileSync(path.join(tmp, 'heads.json'), JSON.stringify(heads));
watchRemote(path.join(tmp, 'remote.git'), tmp);
writeFakeGh(bin, tmp, { remote: path.join(tmp, 'remote.git'), prs: [
  { number: 3, state: 'OPEN', title: 'feat: show prices in euros', body: 'Prices now show with the euro sign. `formatPrice` takes euros and an optional currency.', headRefName: 'feat/euro-prices', baseRefName: 'main', isDraft: false, author: { login: 'sam' }, url: 'https://github.com/acme/app/pull/3' },
] });
