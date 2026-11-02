#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const defaults = {
  suppressions: [
    'eslint-disable', '@ts-ignore', '@ts-expect-error', '@ts-nocheck', 'biome-ignore', 'deno-lint-ignore',
    '#\\s*noqa', '#\\s*type:\\s*ignore', 'pylint:\\s*disable', 'pragma:\\s*no cover', '(istanbul|c8|v8) ignore',
    '#!?\\[allow\\(', '\\bnolint\\b', 'NOLINT', '@SuppressWarnings', '#pragma\\s+warning\\s*\\(?\\s*disable',
    '#pragma\\s+(GCC|clang)\\s+diagnostic\\s+ignored', '-Wno-', 'rubocop:disable', 'swiftlint:disable',
  ],
  skips: [
    '\\.skip\\s*\\(', '\\b(xit|xdescribe|xtest)\\s*\\(', '@pytest\\.mark\\.(skip|xfail)', '@unittest\\.skip', 'pytest\\.skip\\(',
    '@Disabled\\b', '@Ignore\\b', '\\bt\\.Skip(f|Now)?\\(', '#\\[ignore\\]', 'GTEST_SKIP', '\\bDISABLED_\\w+',
  ],
  tests: [
    '(^|/)(tests?|__tests__|specs?)/', '[._-](test|spec)\\.[^/]+$', '_test\\.(go|py|rs|c|cc|cpp)$', '(^|/)test_[^/]+\\.py$',
    'Tests?\\.(java|kt|cs|swift)$',
  ],
  assertions: [
    '\\b(assert\\w*|expect|EXPECT_\\w+|ASSERT_\\w+|REQUIRE\\w*|CHECK_\\w+|CHECK|verify)\\s*[(!]', '\\bassert\\b',
    '\\b(require|assert)\\.\\w+\\(', '\\bt\\.(Error|Errorf|Fatal|Fatalf|Fail|FailNow)\\b', '\\.should\\b',
  ],
};

function options(argv) {
  const opts = { head: 'HEAD' };
  for (let i = 0; i < argv.length; i++) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (flag === '--base') { opts.base = value; i++; }
    else if (flag === '--head') { opts.head = value; i++; }
    else if (flag === '--config') { opts.config = value; i++; }
    else throw new Error(`unknown option: ${flag}`);
  }
  if (!opts.base) throw new Error('usage: diffcheck.mjs --base <rev> [--head <rev>] [--config <file>]');
  return opts;
}

function git(args) {
  const result = spawnSync('git', ['-c', 'core.quotePath=false', ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${(result.stderr || result.error?.message || '').trim()}`);
  return result.stdout;
}

function unquote(name) {
  if (!name.startsWith('"')) return name;
  const bytes = [], escapes = { a: 7, b: 8, f: 12, n: 10, r: 13, t: 9, v: 11, '"': 34, '\\': 92 };
  for (const [part, escape] of name.slice(1, -1).matchAll(/\\([0-7]{3}|.)|[^\\]+/gs)) {
    if (escape === undefined) bytes.push(...Buffer.from(part));
    else bytes.push(/^[0-7]{3}$/.test(escape) ? parseInt(escape, 8) : escapes[escape] ?? escape.charCodeAt(0));
  }
  return Buffer.from(bytes).toString('utf8');
}
const compile = list => list.length ? new RegExp(list.join('|')) : null;

export function diffcheck({ base, head = 'HEAD', config } = {}) {
  const lists = { ...defaults, ...(config ? JSON.parse(readFileSync(config, 'utf8')) : {}) };
  const [suppression, skip, test, assertion] = ['suppressions', 'skips', 'tests', 'assertions'].map(key => compile(lists[key]));
  const range = `${base}...${head}`;
  const findings = [];
  const deleted = new Set();
  const status = git(['diff', '-M', '--name-status', '-z', range]).split('\0');
  for (let i = 0; i < status.length - 1;) {
    const code = status[i];
    const paths = code.startsWith('R') || code.startsWith('C') ? [status[i + 1], status[i + 2]] : [status[i + 1]];
    i += 1 + paths.length;
    if (!test) continue;
    if (code === 'D' && test.test(paths[0])) { findings.push({ kind: 'deleted-test', file: paths[0], line: 0, text: 'test file deleted' }); deleted.add(paths[0]); }
    if (code.startsWith('R') && test.test(paths[0]) && !test.test(paths[1])) findings.push({ kind: 'deleted-test', file: paths[0], line: 0, text: `test file moved out of the test paths to ${paths[1]}` });
  }
  let file = null, oldFile = null, line = 0, header = false;
  const files = new Map();
  const of = name => {
    if (!files.has(name)) files.set(name, { supp: [], skip: [], goneSupp: [], goneSkip: [], added: [], removed: [] });
    return files.get(name);
  };
  const token = (re, text) => text.slice(re.exec(text).index).trim();
  for (const raw of git(['diff', '-M', '--no-color', '--unified=0', range]).split('\n')) {
    const text = raw.replace(/\r$/, '');
    if (text.startsWith('diff --git ')) { header = true; file = oldFile = null; continue; }
    const hunk = text.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) { header = false; line = Number(hunk[1]); continue; }
    if (header) {
      if (text.startsWith('--- ')) oldFile = text === '--- /dev/null' ? null : unquote(text.slice(4)).replace(/^a\//, '');
      if (text.startsWith('+++ ')) file = text === '+++ /dev/null' ? oldFile : unquote(text.slice(4)).replace(/^b\//, '');
      continue;
    }
    if (!file || text.startsWith('\\')) continue;
    const body = text.slice(1), entry = of(file);
    if (text.startsWith('+')) {
      if (suppression?.test(body)) entry.supp.push({ line, text: body.trim(), token: token(suppression, body) });
      if (skip?.test(body)) entry.skip.push({ line, text: body.trim() });
      if (assertion?.test(body)) entry.added.push(body.trim());
      line++;
    } else if (text.startsWith('-')) {
      if (suppression?.test(body)) entry.goneSupp.push(token(suppression, body));
      if (skip?.test(body)) entry.goneSkip.push(body.trim());
      if (assertion?.test(body)) entry.removed.push(body.trim());
    }
  }
  const take = (list, value) => { const i = list.indexOf(value); if (i >= 0) list.splice(i, 1); return i >= 0; };
  const pool = new Map(), moved = new Map(), used = new Map();
  for (const [name, entry] of files) for (const text of entry.added) pool.set(text, [...(pool.get(text) ?? []), name]);
  for (const [name, entry] of files) {
    for (const text of entry.removed) {
      const other = pool.get(text)?.find(n => n !== name);
      if (!other) continue;
      pool.get(text).splice(pool.get(text).indexOf(other), 1);
      moved.set(name, (moved.get(name) ?? 0) + 1);
      used.set(other, (used.get(other) ?? 0) + 1);
    }
  }
  for (const [name, entry] of files) {
    for (const s of entry.supp) if (!take(entry.goneSupp, s.token)) findings.push({ kind: 'suppression', file: name, line: s.line, text: s.text });
    for (const s of entry.skip) if (!take(entry.goneSkip, s.text)) findings.push({ kind: 'skipped-test', file: name, line: s.line, text: s.text });
    if (deleted.has(name)) continue;
    const count = entry.removed.length - (moved.get(name) ?? 0) - (entry.added.length - (used.get(name) ?? 0));
    if (count > 0) findings.push({ kind: 'removed-assertion', file: name, line: 0, text: `${count} assertion line${count > 1 ? 's' : ''} removed` });
  }
  return findings;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const opts = options(process.argv.slice(2));
    const findings = diffcheck(opts);
    for (const f of findings) console.log(`${f.kind} ${f.file}${f.line ? `:${f.line}` : ''}: ${f.text}`);
    if (findings.length) {
      console.log(`\n${findings.length} finding${findings.length > 1 ? 's' : ''} need a review. A reviewer decides if each one hides a fault.`);
      process.exitCode = 1;
    } else console.log('No added suppression, skipped test, deleted test or removed assertion.');
  } catch (error) {
    console.error(`diffcheck: ${error.message}`);
    process.exitCode = 2;
  }
}
