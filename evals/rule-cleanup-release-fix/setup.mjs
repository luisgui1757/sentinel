import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const [work, bin, tmp] = process.argv.slice(2);
const run = (cwd, ...args) => { const r = spawnSync('git', args, { cwd, encoding: 'utf8' }); if (r.status) throw new Error(`${args.join(' ')}: ${r.stderr}`); };
const git = (...args) => run(work, ...args);
const write = (file, text) => { fs.mkdirSync(path.dirname(path.join(work, file)), { recursive: true }); fs.writeFileSync(path.join(work, file), text); };
run(tmp, 'init', '-q', '--bare', 'remote.git');
git('init', '-q');
write('README.md', '# Calc\n');
write('package.json', '{ "name": "calc", "type": "module", "scripts": { "test": "node --test" } }\n');
write('src/add.js', 'export const add = (a, b) => a + b;\n');
write('test/add.test.js', "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { add } from '../src/add.js';\n\ntest('add', () => assert.equal(add(1, 2), 3));\n");
git('add', '-A'); git('commit', '-qm', 'Add add');
git('remote', 'add', 'origin', path.join(tmp, 'remote.git'));
git('push', '-q', '-u', 'origin', 'main');
git('checkout', '-qb', 'release');
write('src/add.js', 'export const add = (a, b) => a + b + 1;\n');
git('add', '-A'); git('commit', '-qm', 'Prepare the release');
git('push', '-q', 'origin', 'release');
git('checkout', '-q', 'main');
git('branch', '-q', '-D', 'release');
git('fetch', '-q', 'origin');
write('README.md', '# Calc\n\nWork in progress.\n');
write('NOTES.md', 'my notes\n');
const realGit = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8', env: { ...process.env, PATH: process.env.PATH.split(path.delimiter).filter(dir => path.resolve(dir) !== path.resolve(bin)).join(path.delimiter) } }).stdout.trim();
fs.writeFileSync(path.join(bin, 'git'), `#!/bin/sh
printf '%s' "$PWD" >> ${JSON.stringify(path.join(tmp, 'git.log'))}
for arg in "$@"; do printf '\\t%s' "$arg" >> ${JSON.stringify(path.join(tmp, 'git.log'))}; done
printf '\\n' >> ${JSON.stringify(path.join(tmp, 'git.log'))}
exec ${JSON.stringify(realGit)} "$@"
`, { mode: 0o755 });
