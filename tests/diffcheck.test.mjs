import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../skills/enforce/scripts/diffcheck.mjs', import.meta.url));

async function repo(base, head) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'diffcheck-'));
  const git = (...args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.email', 'a@example.com');
  git('config', 'user.name', 'A');
  git('config', 'core.autocrlf', 'false');
  const write = async files => {
    for (const [name, text] of Object.entries(files)) {
      const file = path.join(dir, name);
      if (text === null) await fs.rm(file);
      else { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, text); }
    }
    git('add', '-A');
    git('commit', '-qm', 'change');
    return git('rev-parse', 'HEAD').stdout.trim();
  };
  const baseSha = await write(base);
  await write(head);
  return { dir, base: baseSha };
}

function run(dir, ...args) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: dir, encoding: 'utf8' });
  return { code: result.status, out: result.stdout, err: result.stderr };
}

test('finds added suppressions, skipped tests, deleted tests and removed assertions', async () => {
  const { dir, base } = await repo({
    'src/app.js': 'export const add = (a, b) => a + b;\n',
    'src/app.test.js': "test('add', () => {\n  expect(add(1, 2)).toBe(3);\n  expect(add(2, 2)).toBe(4);\n});\n",
    'tests/test_old.py': 'def test_old():\n    assert True\n',
    'lib/core.py': 'def f():\n    return 1\n',
  }, {
    'src/app.js': '// eslint-disable-next-line no-eval\nexport const add = (a, b) => eval(`${a}+${b}`);\n',
    'src/app.test.js': "test.skip('add', () => {\n  expect(add(1, 2)).toBe(3);\n});\n",
    'tests/test_old.py': null,
    'lib/core.py': 'def f():  # type: ignore\n    return 1\n',
  });
  const { code, out } = run(dir, '--base', base);
  assert.equal(code, 1, out);
  assert.match(out, /^suppression src\/app\.js:1: \/\/ eslint-disable-next-line no-eval$/m);
  assert.match(out, /^suppression lib\/core\.py:1: /m);
  assert.match(out, /^skipped-test src\/app\.test\.js:1: /m);
  assert.match(out, /^deleted-test tests\/test_old\.py: test file deleted$/m);
  assert.match(out, /^removed-assertion src\/app\.test\.js: 1 assertion line removed$/m);
  assert.doesNotMatch(out, /removed-assertion tests\/test_old\.py/);
  await fs.rm(dir, { recursive: true, force: true });
});

test('passes a change that adds a test, renames a test in place and edits CRLF files with spaces in names', async () => {
  const { dir, base } = await repo({
    'src/my file.js': 'export const one = 1;\r\n',
    'tests/a.test.js': "test('one', () => {\n  expect(one).toBe(1);\n});\n",
  }, {
    'src/my file.js': 'export const one = 1;\r\nexport const two = 2;\r\n',
    'tests/a.test.js': null,
    'tests/one.test.js': "test('one', () => {\n  expect(one).toBe(1);\n});\n",
    'tests/two.test.js': "test('two', () => {\n  expect(two).toBe(2);\n});\n",
  });
  const { code, out } = run(dir, '--base', base);
  assert.equal(code, 0, out);
  await fs.rm(dir, { recursive: true, force: true });
});

test('does not read a changed line that starts with dashes or pluses as a file name', async () => {
  const { dir, base } = await repo({
    'db/schema.sql': '-- keep the users table\nCREATE TABLE users (id int);\n',
    'src/count.c': 'int count;\n',
  }, {
    'db/schema.sql': 'CREATE TABLE users (id int);\n',
    'src/count.c': 'int count;\n++ count;\nint y; // NOLINT\n',
  });
  const { code, out } = run(dir, '--base', base);
  assert.equal(code, 1, out);
  assert.equal(out.split('\n')[0], 'suppression src/count.c:3: int y; // NOLINT');
  await fs.rm(dir, { recursive: true, force: true });
});

test('flags a test moved out of the test paths, and a config replaces a pattern list', async () => {
  const { dir, base } = await repo({
    'tests/test_a.py': 'def test_a():\n    assert f()\n',
    'src/b.py': 'x = 1\n',
  }, {
    'tests/test_a.py': null,
    'scratch/a.py': 'def test_a():\n    assert f()\n',
    'src/b.py': 'x = 1  # noqa: E501\n',
  });
  const moved = run(dir, '--base', base);
  assert.equal(moved.code, 1, moved.out);
  assert.match(moved.out, /^deleted-test tests\/test_a\.py: test file moved out of the test paths to scratch\/a\.py$/m);
  await fs.writeFile(path.join(dir, 'diffcheck.json'), JSON.stringify({ suppressions: [], tests: ['^scratch/'] }));
  const configured = run(dir, '--base', base, '--config', 'diffcheck.json');
  assert.equal(configured.code, 0, configured.out);
  await fs.rm(dir, { recursive: true, force: true });
});

test('ignores a suppression that only moved or kept its comment, and assertions moved to another file', async () => {
  const { dir, base } = await repo({
    'src/app.py': 'def a():\n    return x  # type: ignore[no-any-return]\n\n\ndef b():\n    return 1\n',
    'tests/test_all.py': 'def test_a():\n    assert a() == 1\n\n\ndef test_b():\n    assert b() == 1\n',
  }, {
    'src/app.py': 'def b():\n    return 1\n\n\ndef a():\n    return y  # type: ignore[no-any-return]\n',
    'tests/test_all.py': 'def test_a():\n    assert a() == 1\n',
    'tests/test_b.py': 'def test_b():\n    assert b() == 1\n',
  });
  const { code, out } = run(dir, '--base', base);
  assert.equal(code, 0, out);
  await fs.rm(dir, { recursive: true, force: true });
});

test('an assertion moved into a file does not hide an assertion that the same file lost', async () => {
  const { dir, base } = await repo({
    'tests/test_a.py': 'def test_a():\n    assert a()\n',
    'tests/test_b.py': 'def test_b():\n    assert b()\n',
  }, {
    'tests/test_a.py': 'def test_a():\n    pass\n',
    'tests/test_b.py': 'def test_b():\n    assert a()\n',
  });
  const { code, out } = run(dir, '--base', base);
  assert.equal(code, 1, out);
  assert.match(out, /^removed-assertion tests\/test_b\.py: 1 assertion line removed$/m);
  await fs.rm(dir, { recursive: true, force: true });
});

test('reads a quoted path with an emoji once', { skip: process.platform === 'win32' }, async () => {
  const { dir, base } = await repo({ 'tests/😀"case.test.js': "test('a', () => {\n  expect(1).toBe(1);\n});\n", 'a.txt': 'a\n' }, { 'tests/😀"case.test.js': null });
  const { code, out } = run(dir, '--base', base);
  assert.equal(code, 1, out);
  assert.equal(out.split('\n').filter(l => /^[a-z-]+ /.test(l)).join('\n'), 'deleted-test tests/😀"case.test.js: test file deleted');
  await fs.rm(dir, { recursive: true, force: true });
});

test('exits 2 on a bad revision or a missing option', async () => {
  const { dir } = await repo({ 'a.txt': 'a\n' }, { 'a.txt': 'b\n' });
  assert.equal(run(dir).code, 2);
  const bad = run(dir, '--base', 'no-such-rev');
  assert.equal(bad.code, 2);
  assert.match(bad.err, /^diffcheck: git diff/);
  await fs.rm(dir, { recursive: true, force: true });
});
