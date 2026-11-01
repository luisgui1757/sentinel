import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { writeFakeGh, watchRemote } from '../fake-gh.mjs';

const [work, bin, tmp] = process.argv.slice(2);
const run = (...args) => { const r = spawnSync('git', args, { cwd: work, encoding: 'utf8' }); if (r.status) throw new Error(`${args.join(' ')}: ${r.stderr}`); return r.stdout; };
const write = (file, text) => { fs.mkdirSync(path.dirname(path.join(work, file)), { recursive: true }); fs.writeFileSync(path.join(work, file), text); };
spawnSync('git', ['init', '-q', '--bare', path.join(tmp, 'remote.git')]);
run('init', '-q'); run('add', '-A'); run('commit', '-qm', 'feat(price): format prices');
run('remote', 'add', 'origin', path.join(tmp, 'remote.git'));
run('push', '-q', '-u', 'origin', 'main');
run('checkout', '-qb', 'feat/currency');
write('src/price.js', "const symbols = { USD: '$', EUR: '€' };\n\nexport const formatPrice = (cents, currency = 'USD') => `${symbols[currency]}${(cents / 100).toFixed(2)}`;\n");
run('add', '-A'); run('commit', '-qm', 'feat(price): accept a currency');
write('test/currency.test.js', "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { formatPrice } from '../src/price.js';\n\ntest('formatPrice shows euros', () => assert.equal(formatPrice(1234, 'EUR'), '€12.34'));\n");
run('add', '-A'); run('commit', '-qm', 'test(price): cover euros');
run('push', '-q', '-u', 'origin', 'feat/currency');
run('checkout', '-q', 'main');
write('src/price.js', "export const formatCents = cents => (cents / 100).toFixed(2);\n\nexport const formatPrice = cents => `$${formatCents(cents)}`;\n");
write('test/price.test.js', "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { formatPrice, formatCents } from '../src/price.js';\n\ntest('formatPrice shows dollars', () => assert.equal(formatPrice(1234), '$12.34'));\ntest('formatCents shows two decimals', () => assert.equal(formatCents(5), '0.05'));\n");
run('add', '-A'); run('commit', '-qm', 'refactor(price): share the cents format');
run('push', '-q', 'origin', 'main');
fs.writeFileSync(path.join(tmp, 'main.sha'), run('rev-parse', 'main').trim());
run('branch', '-q', '-D', 'feat/currency');
watchRemote(path.join(tmp, 'remote.git'), tmp);
writeFakeGh(bin, tmp, { remote: path.join(tmp, 'remote.git'), prs: [
  { number: 12, state: 'OPEN', title: 'feat(price): show prices in euros', body: 'Shops in the EU need prices in euros. This adds a currency option to formatPrice.', headRefName: 'feat/currency', baseRefName: 'main', isDraft: false, author: { login: 'alex' }, url: 'https://github.com/acme/app/pull/12' },
] });
