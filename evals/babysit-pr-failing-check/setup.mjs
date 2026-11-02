import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { writeFakeGh, watchRemote } from '../fake-gh.mjs';

const [work, bin, tmp] = process.argv.slice(2);
const run = (...args) => { const r = spawnSync('git', args, { cwd: work, encoding: 'utf8' }); if (r.status) throw new Error(`${args.join(' ')}: ${r.stderr}`); return r.stdout; };
const write = (file, text) => { fs.mkdirSync(path.dirname(path.join(work, file)), { recursive: true }); fs.writeFileSync(path.join(work, file), text); };
const remote = path.join(tmp, 'remote.git');
spawnSync('git', ['init', '-q', '--bare', remote]);
run('init', '-q'); run('add', '-A'); run('commit', '-qm', 'feat(cart): add the cart subtotal');
run('remote', 'add', 'origin', remote);
run('push', '-q', '-u', 'origin', 'main');
run('checkout', '-qb', 'feat/coupons');
write('src/coupon.js', `const coupons = { SAVE10: 10, SAVE25: 25 };

export function applyCoupon(cents, code) {
  const percent = coupons[code.toUpperCase()] ?? 0;
  return cents - Math.round((cents * percent) / 10);
}
`);
write('src/cart.js', `import { applyCoupon } from './coupon.js';

export const subtotal = items => items.reduce((sum, item) => sum + item.price * item.qty, 0);

export const total = (items, code = '') => applyCoupon(subtotal(items), code);
`);
write('test/coupon.test.js', `import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCoupon } from '../src/coupon.js';
import { total } from '../src/cart.js';

test('SAVE10 takes 10 percent off', () => assert.equal(applyCoupon(2000, 'SAVE10'), 1800));
test('an unknown code changes nothing', () => assert.equal(applyCoupon(2000, 'WELCOME'), 2000));
test('total applies the coupon to the subtotal', () => assert.equal(total([{ price: 500, qty: 2 }], 'save25'), 750));
`);
run('add', '-A'); run('commit', '-qm', 'feat(cart): apply percent coupons');
run('push', '-q', '-u', 'origin', 'feat/coupons');
const head = run('rev-parse', 'HEAD').trim();
fs.writeFileSync(path.join(tmp, 'heads.json'), JSON.stringify({ main: run('rev-parse', 'main').trim(), pr: head, cart: run('rev-parse', 'HEAD:src/cart.js').trim() }));
watchRemote(remote, tmp);
const bot = { login: 'reviewbot', bot: true };
const finding = `**Possible crash on an empty cart**

\`total([])\` calls \`subtotal([])\`, and \`reduce\` on an empty array throws \`TypeError: Reduce of empty array with no initial value\`. Return 0 early when \`items\` is empty.

\`\`\`suggestion
export const total = (items, code = '') => (items.length ? applyCoupon(subtotal(items), code) : 0);
\`\`\``;
writeFakeGh(bin, tmp, { remote, prs: [{
  number: 7, state: 'OPEN', title: 'feat(cart): apply percent coupons', body: 'Adds the coupon codes `SAVE10` and `SAVE25`. `total(items, code)` applies the coupon to the subtotal.',
  headRefName: 'feat/coupons', baseRefName: 'main', isDraft: false, author: { login: 'alex' }, url: 'https://github.com/acme/app/pull/7',
  ci: { name: 'test', workflow: 'ci', command: ['node', '--test'], pending: 60 },
  reviews: [{ id: 'PRR_kwDOAA801', databaseId: 801, author: bot, state: 'COMMENTED', body: 'Reviewed 3 files and left 1 comment.', submittedAt: '2026-11-01T09:12:00Z', commit: head }],
  threads: [{ id: 'PRRT_kwDOAA901', isResolved: false, path: 'src/cart.js', line: 5, comments: [{ id: 'PRRC_kwDOAA1101', databaseId: 1101, review: 801, author: bot, body: finding, createdAt: '2026-11-01T09:12:00Z' }] }],
}] });
