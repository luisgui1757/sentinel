import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { writeFakeGh, watchRemote } from '../fake-gh.mjs';

const [work, bin, tmp] = process.argv.slice(2);
const run = (cwd, ...args) => { const r = spawnSync('git', args, { cwd, encoding: 'utf8' }); if (r.status) throw new Error(`${args.join(' ')}: ${r.stderr}`); return r.stdout; };
const git = (...args) => run(work, ...args);
const write = (file, text) => { fs.mkdirSync(path.dirname(path.join(work, file)), { recursive: true }); fs.writeFileSync(path.join(work, file), text); };
const remote = path.join(tmp, 'remote.git');
run(tmp, 'init', '-q', '--bare', remote);
git('init', '-q'); git('add', '-A'); git('commit', '-qm', 'feat(orders): list the orders');
git('remote', 'add', 'origin', remote);
git('push', '-q', '-u', 'origin', 'main');
write('src/tsv.js', "export const toTsv = rows => rows.map(row => Object.values(row).join('\\t')).join('\\n');\n");
git('add', 'src/tsv.js'); git('stash', 'push', '-q', '-m', 'try a tab separated export');
const stash = git('rev-parse', 'stash@{0}').trim();
git('checkout', '-qb', 'feat/csv-export');
const header = `import test from 'node:test';
import assert from 'node:assert/strict';
import { toCsv } from '../src/export.js';
`;
const toCsv = "export const toCsv = rows => [Object.keys(rows[0]).join(','), ...rows.map(row => Object.values(row).map(field).join(','))].join('\\n');\n";
write('src/export.js', `const field = value => String(value);\n\n${toCsv}`);
write('test/export.test.js', `${header}import { orders } from '../src/orders.js';

test('writes a header row and one line for each order', () => assert.equal(toCsv(orders), 'id,customer,total\\n1,Ana Lima,1250\\n2,Bo Chen,990'));
`);
git('add', '-A'); git('commit', '-qm', 'feat(export): export the orders as CSV');
git('push', '-q', '-u', 'origin', 'feat/csv-export');
const clone = path.join(tmp, 'clone');
run(tmp, 'clone', '-q', '--branch', 'feat/csv-export', remote, clone);
fs.appendFileSync(path.join(clone, 'README.md'), '\n## Export\n\nCall `toCsv(rows)` to get the orders as CSV text for the accounting import.\n');
run(clone, '-c', 'user.name=Sam Rivera', '-c', 'user.email=sam@example.com', 'commit', '-qam', 'docs(export): describe the CSV export');
run(clone, 'push', '-q', 'origin', 'feat/csv-export');
const sam = run(clone, 'rev-parse', 'HEAD').trim();
fs.rmSync(clone, { recursive: true, force: true });
write('src/export.js', `const field = value => {
  const text = String(value);
  return text.includes(',') ? \`"\${text}"\` : text;
};

${toCsv}`);
fs.appendFileSync(path.join(work, 'test/export.test.js'), "test('quotes a field that holds a comma', () => assert.equal(toCsv([{ id: 3, customer: 'Smith, Jo', total: 500 }]), 'id,customer,total\\n3,\"Smith, Jo\",500'));\n");
git('add', '-A'); git('commit', '-qm', 'fix(export): quote a field that holds a comma');
const unpushed = git('rev-parse', 'HEAD').trim();
write('src/export.js', `const field = value => {
  const text = String(value).replaceAll('"', '""');
  return text.includes(',') ? \`"\${text}"\` : text;
};

${toCsv}`);
fs.appendFileSync(path.join(work, 'CHANGELOG.md'), '- Export the orders as CSV.\n');
write('test/quotes.test.js', `${header}
test('doubles a quote inside a field', () => assert.equal(toCsv([{ id: 4, customer: 'Jo "JJ" Smith', total: 700 }]), 'id,customer,total\\n4,"Jo ""JJ"" Smith",700'));
`);
fs.writeFileSync(path.join(tmp, 'heads.json'), JSON.stringify({ main: git('rev-parse', 'main').trim(), stash, sam, unpushed }));
watchRemote(remote, tmp);
writeFakeGh(bin, tmp, { remote, prs: [{
  number: 9, state: 'OPEN', title: 'feat(export): export the orders as CSV',
  body: 'Adds `toCsv` for the order list.\n\n- [x] A header row and one line for each order\n- [ ] Quote a field that holds a comma, a quote or a line break, as RFC 4180 says',
  headRefName: 'feat/csv-export', baseRefName: 'main', isDraft: false, author: { login: 'alex' }, url: 'https://github.com/acme/app/pull/9',
  comments: [{ id: 'IC_kwDOAA1301', databaseId: 1301, author: { login: 'sam' }, body: 'A customer name can hold a comma, a quote or a line break, and each one breaks the CSV. Quote such a field and double each quote in it, as RFC 4180 says. I pushed a README note for the export to this branch.', createdAt: '2026-10-30T16:05:00Z' }],
}] });
