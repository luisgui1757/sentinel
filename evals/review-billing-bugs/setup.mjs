import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const [work] = process.argv.slice(2);
const git = (...args) => { const r = spawnSync('git', args, { cwd: work, encoding: 'utf8' }); if (r.status) throw new Error(`${args.join(' ')}: ${r.stderr}`); return r.stdout; };
const write = (file, text) => { fs.mkdirSync(path.dirname(path.join(work, file)), { recursive: true }); fs.writeFileSync(path.join(work, file), text); };
git('init', '-q');
write('package.json', '{ "name": "billing", "type": "module", "scripts": { "test": "node --test" } }\n');
write('README.md', `# Billing

Invoices store \`createdAt\` and \`dueAt\` as UTC timestamps in milliseconds. Billing months are UTC months.

Roles: \`admin\` (full access), \`admin_viewer\` (read only), \`editor\` (can write), \`viewer\` (read only).
Role and permission changes take effect at once.

A customer gets at most one overdue reminder per run, for all overdue invoices together.
Deleted customers (\`deletedAt\` set) must not get email. Deleted customers keep their refunds: deletion only stops email.

A renewal keeps the original billing day. In a shorter month, it falls on the last day of that month.
The grace period starts at the first failed charge and lasts 3 days. A later failure does not extend it.
The ledger stores a refund as a negative amount.
`);
write('src/store.js', `export function memoryStore(permissions) {
  return {
    loadPermissions: async (userId, orgId) => permissions[\`\${userId}:\${orgId}\`] ?? [],
    setPermissions: async (userId, orgId, list) => { permissions[\`\${userId}:\${orgId}\`] = list; },
  };
}
`);
git('add', '-A'); git('commit', '-qm', 'Add the billing store');
git('checkout', '-qb', 'feat/billing');
write('src/permissions.js', `const cache = new Map();

export async function permissionsFor(userId, orgId, store) {
  const key = \`\${userId}\${orgId}\`;
  if (!cache.has(key)) cache.set(key, await store.loadPermissions(userId, orgId));
  return cache.get(key);
}

export const canWrite = role => /^admin/.test(role) || role === 'editor';
`);
write('src/invoices.js', `export function invoicesPage(invoices, cursor, size) {
  const sorted = [...invoices].sort((a, b) => a.createdAt - b.createdAt);
  const after = cursor == null ? sorted : sorted.filter(invoice => invoice.createdAt > cursor);
  const page = after.slice(0, size);
  return { page, cursor: page.length ? page[page.length - 1].createdAt : cursor };
}

export function largestInvoices(amounts, count) {
  return [...amounts].sort().reverse().slice(0, count);
}

export function monthOf(timestamp) {
  const date = new Date(timestamp);
  return \`\${date.getFullYear()}-\${String(date.getMonth() + 1).padStart(2, '0')}\`;
}
`);
write('src/notify.js', `export async function notifyAll(customers, send) {
  const results = await Promise.all(customers.map(customer => send(customer).then(() => true).catch(error => ({ customer, error }))));
  return { sent: results.filter(Boolean).length, total: customers.length };
}

export async function remindOverdue(customers, now, send) {
  const reminders = [];
  for (const customer of customers) {
    for (const invoice of customer.invoices) {
      if (!invoice.paid && invoice.dueAt < now) reminders.push({ email: customer.email, invoice: invoice.id });
    }
  }
  return notifyAll(reminders, reminder => send(reminder.email, \`Invoice \${reminder.invoice} is overdue\`));
}
`);
write('src/renewal.js', `const DAY = 86400000;

export function nextRenewal(anchorDay, from) {
  const date = new Date(from);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, anchorDay)).toISOString().slice(0, 10);
}

export function recordFailure(subscription, at) {
  subscription.graceStart = at;
}

export const inGrace = (subscription, now) => subscription.graceStart !== null && now - subscription.graceStart < 3 * DAY;

export const refundEntry = (invoice, amount) => ({ invoice, type: 'refund', amount: Math.abs(amount) });

export const canRefund = customer => customer.balance > 0;
`);
write('test/billing.test.js', `import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryStore } from '../src/store.js';
import { permissionsFor, canWrite } from '../src/permissions.js';
import { invoicesPage, largestInvoices } from '../src/invoices.js';
import { notifyAll, remindOverdue } from '../src/notify.js';
import { nextRenewal, recordFailure, inGrace, refundEntry, canRefund } from '../src/renewal.js';

test('permissions come from the store', async () => assert.deepEqual(await permissionsFor(7, 9, memoryStore({ '7:9': ['read'] })), ['read']));
test('editors and admins can write', () => assert.ok(canWrite('editor') && canWrite('admin') && !canWrite('viewer')));
test('pages follow the cursor', () => {
  const invoices = [1, 2, 3].map(n => ({ id: n, createdAt: n * 1000 }));
  const first = invoicesPage(invoices, null, 2);
  assert.deepEqual(invoicesPage(invoices, first.cursor, 2).page.map(i => i.id), [3]);
});
test('largest invoices', () => assert.deepEqual(largestInvoices([5, 9, 7], 2), [9, 7]));
test('notify counts sends', async () => assert.deepEqual(await notifyAll(['a', 'b'], async () => 'ok'), { sent: 2, total: 2 }));
test('overdue invoices get a reminder', async () => {
  const sent = [];
  const customers = [{ email: 'a@x.io', invoices: [{ id: 1, paid: false, dueAt: 10 }, { id: 2, paid: true, dueAt: 10 }] }];
  await remindOverdue(customers, 20, async (to, text) => sent.push([to, text]));
  assert.deepEqual(sent, [['a@x.io', 'Invoice 1 is overdue']]);
});
test('renewal keeps the billing day', () => assert.equal(nextRenewal(15, '2027-01-15'), '2027-02-15'));
test('a failed charge starts grace', () => { const sub = { graceStart: null }; recordFailure(sub, 0); assert.ok(inGrace(sub, 1000)); });
test('a refund entry has its type', () => assert.equal(refundEntry('INV-1', 500).type, 'refund'));
test('a customer with a balance can get a refund', () => assert.ok(canRefund({ balance: 10 })));
`);
git('add', '-A'); git('commit', '-qm', 'Add permissions, invoice pages and notifications');
