import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const [work, , tmp] = process.argv.slice(2);
const run = (cwd, ...args) => { const r = spawnSync('git', args, { cwd, encoding: 'utf8' }); if (r.status) throw new Error(`${args.join(' ')}: ${r.stderr}`); return r.stdout; };
const git = (...args) => run(work, ...args);
const write = (file, text) => { fs.mkdirSync(path.dirname(path.join(work, file)), { recursive: true }); fs.writeFileSync(path.join(work, file), text); };
run(tmp, 'init', '-q', '--bare', 'remote.git');
git('init', '-q');
write('package.json', '{ "name": "catalog", "type": "module", "scripts": { "test": "node --test" } }\n');
write('src/page.js', `export function paginate(items, page, size) {
  const start = (page - 1) * size;
  return items.slice(start, start + size);
}
`);
write('test/page.test.js', `import test from 'node:test';
import assert from 'node:assert/strict';
import { paginate } from '../src/page.js';

test('first page', () => assert.deepEqual(paginate([1, 2, 3, 4, 5], 1, 2), [1, 2]));
`);
git('add', '-A'); git('commit', '-qm', 'Add pagination');
git('remote', 'add', 'origin', path.join(tmp, 'remote.git'));
git('push', '-q', '-u', 'origin', 'main');
fs.writeFileSync(path.join(tmp, 'remote-refs.txt'), git('ls-remote', 'origin'));
write('src/page.js', `export const pageCount = (total, size) => Math.floor(total / size);

export function paginate(items, page, size) {
  const pages = Math.max(pageCount(items.length, size), 1);
  const current = Math.min(Math.max(page, 1), pages);
  const start = (current - 1) * size;
  return { items: items.slice(start, start + size), page: current, pages };
}
`);
write('test/page.test.js', `import test from 'node:test';
import assert from 'node:assert/strict';
import { paginate } from '../src/page.js';

test('first page', () => assert.deepEqual(paginate([1, 2, 3, 4, 5], 1, 2).items, [1, 2]));
test('page below 1 shows the first page', () => assert.equal(paginate([1, 2, 3], 0, 2).page, 1));
`);
