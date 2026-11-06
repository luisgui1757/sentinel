import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { glob } from '../skills/featuremap/scripts/featuremap.mjs';

const script = fileURLToPath(new URL('../skills/featuremap/scripts/featuremap.mjs', import.meta.url));
const fixtures = fileURLToPath(new URL('./fixtures/featuremap/', import.meta.url));

const files = {
  'packages/billing/package.json': '{"name": "@acme/billing"}\n',
  'packages/billing/src/tax.ts': "import { round } from '@acme/shared/money';\nimport { model } from '../../vehicle/src/model';\nexport const tax = () => round(model.rate);\n",
  'packages/billing/src/fee.ts': "// import { model } from '../../vehicle/src/model';\nimport type { Money } from '@acme/shared';\nexport const fee = 1;\n",
  'packages/shared/package.json': '{"name": "@acme/shared"}\n',
  'packages/shared/money.ts': 'export const round = (n: number) => Math.round(n);\n',
  'packages/shared/index.ts': "export * from './money';\n",
  'packages/shared/fmt.ts': "import { round } from './money.js';\nexport const fmt = round;\n",
  'services/report/multi.py': 'from services.ledger import (\n    store,\n)\n',
  'services/report/commented.py': 'from services.ledger import (  # public API (stable)\n    api,  # the api\n    store,\n)\n',
  'services/report/crlf.py': 'from services.ledger import api, \\\r\n    store\r\n',
  'packages/vehicle/src/model.ts': "const shared = require('@acme/shared');\nexport const model = { rate: 1 };\n",
  'services/report/report.py': 'from services.ledger import api\nimport os\n',
  'services/ledger/__init__.py': '',
  'services/ledger/api.py': 'from . import store\n',
  'services/ledger/store.py': 'x = 1\n',
  'firmware/drivers/uart.c': '#include "uart.h"\nint uart_send(int c) { return c; }\n',
  'firmware/drivers/uart.h': 'int uart_send(int c);\n',
  'firmware/app/main.c': '#include <drivers/uart.h>\n#include <stdio.h>\nint main(void) { return uart_send(0); }\n',
  'crates/core/src/lib.rs': 'pub fn add(a: i32, b: i32) -> i32 { a + b }\n',
  'crates/app/src/main.rs': 'fn main() {}\n',
  'crates/tool/main.rs': 'fn main() {}\n',
  'svc/api/main.go': 'package main\n',
  'svc/api/handlers/h.go': 'package handlers\n',
  'svc/api/store/s.go': 'package store\n',
  'tools/gen.rb': 'puts 1\n',
  'scratch/x.py': 'import services.ledger.store\n',
};

const map = {
  version: 1,
  features: {
    billing: { description: 'Invoices and tax', mayUse: ['shared/**'] },
    'shared/money': {},
    vehicle: {},
    report: { mustNotReach: ['fw/**'] },
    ledger: {},
    'fw/drivers': {},
    'fw/app': { mayUse: ['fw/drivers'] },
    'rust/core': {}, 'rust/app': {}, 'rust/tool': {}, 'go/main': {}, 'go/handlers': {}, 'go/store': {}, tools: {},
  },
  owners: [
    { path: 'packages/billing/**', feature: 'billing' }, { path: 'packages/shared/**', feature: 'shared/money' },
    { path: 'packages/vehicle/**', feature: 'vehicle' }, { path: 'services/report/**', feature: 'report' },
    { path: 'services/ledger/**', feature: 'ledger' }, { path: 'firmware/drivers/**', feature: 'fw/drivers' },
    { path: 'firmware/app/**', feature: 'fw/app' }, { path: 'crates/core/**', feature: 'rust/core' },
    { path: 'crates/app/**', feature: 'rust/app' }, { path: 'svc/api/**', feature: 'go/handlers' },
    { path: 'svc/api/store/**', feature: 'go/store' }, { path: 'svc/api/main.go', feature: 'go/main' },
    { path: 'crates/tool/**', feature: 'rust/tool' }, { path: 'tools/**', feature: 'tools' },
  ],
  extract: [
    { tool: 'scan', files: ['**/*.ts', '**/*.py', 'firmware/**/*.c', 'firmware/**/*.h'], includeDirs: ['firmware'] },
    { tool: 'go', dir: 'svc/api', input: 'build/go-list.json' },
    { tool: 'cargo', input: 'build/cargo-metadata.json' },
    { tool: 'cmake', dir: 'firmware', build: 'firmware/build' },
  ],
  declared: [{ from: 'services/ledger/store.py', to: 'firmware/drivers/uart.c', kind: 'link' }],
};

async function repo(extra = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'featuremap-'));
  const all = { ...files, 'featuremap.json': `${JSON.stringify(map, null, 2)}\n`, ...extra };
  for (const [name, text] of Object.entries(all)) {
    await fs.mkdir(path.dirname(path.join(dir, name)), { recursive: true });
    await fs.writeFile(path.join(dir, name), text);
  }
  await fs.mkdir(path.join(dir, 'build'), { recursive: true });
  await fs.copyFile(path.join(fixtures, 'go-list.json'), path.join(dir, 'build/go-list.json'));
  await fs.copyFile(path.join(fixtures, 'cargo-metadata.json'), path.join(dir, 'build/cargo-metadata.json'));
  await fs.cp(path.join(fixtures, 'cmake-reply'), path.join(dir, 'firmware/build/.cmake/api/v1/reply'), { recursive: true });
  const git = (...args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  git('init', '-q'); git('config', 'user.email', 'a@example.com'); git('config', 'user.name', 'A');
  git('add', '-A'); git('commit', '-qm', 'init');
  return { dir, git };
}

const fm = (dir, ...args) => {
  const r = spawnSync(process.execPath, [script, ...args], { cwd: dir, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
};

test('glob patterns match paths, folders and feature ids', () => {
  assert.ok(glob('a/**/b').test('a/b'));
  assert.ok(glob('a/**/b').test('a/x/y/b'));
  assert.ok(!glob('*.py').test('x/y.py'));
  assert.ok(glob('**/*.py').test('y.py'));
  assert.ok(glob('fw/drivers/**').test('fw/drivers/'));
  assert.ok(glob('fw/**').test('fw'));
  assert.ok(!glob('fw/*').test('fw/a/b'));
  assert.ok(glob('src/?.c').test('src/a.c'));
});

test('extract reads JS, TS, Python and C includes, go list, cargo metadata and the CMake File API', async () => {
  const { dir } = await repo();
  const { code, out, err } = fm(dir, 'extract');
  assert.equal(code, 0, err);
  const edges = out.trim().split('\n').map(line => JSON.parse(line));
  const has = (from, to, kind, tool, config = '') => assert.ok(edges.some(e => e.from === from && e.to === to && e.kind === kind && e.tool === tool && e.config === config),
    `${from} -> ${to} (${kind}, ${tool})\n${out}`);
  has('packages/billing/src/tax.ts', 'packages/shared/money.ts', 'import', 'scan');
  has('packages/billing/src/tax.ts', 'packages/vehicle/src/model.ts', 'import', 'scan');
  has('packages/billing/src/fee.ts', 'packages/shared/', 'import', 'scan');
  has('packages/shared/index.ts', 'packages/shared/money.ts', 'import', 'scan');
  has('packages/shared/fmt.ts', 'packages/shared/money.ts', 'import', 'scan');
  has('services/report/multi.py', 'services/ledger/store.py', 'import', 'scan');
  has('services/report/commented.py', 'services/ledger/api.py', 'import', 'scan');
  has('services/report/commented.py', 'services/ledger/store.py', 'import', 'scan');
  has('services/report/crlf.py', 'services/ledger/store.py', 'import', 'scan');
  has('services/report/report.py', 'services/ledger/api.py', 'import', 'scan');
  has('services/ledger/api.py', 'services/ledger/store.py', 'import', 'scan');
  has('firmware/drivers/uart.c', 'firmware/drivers/uart.h', 'include', 'scan');
  has('firmware/app/main.c', 'firmware/drivers/uart.h', 'include', 'scan');
  has('svc/api/handlers/h.go', 'svc/api/store/', 'import', 'go');
  has('svc/api/main.go', 'svc/api/handlers/', 'import', 'go');
  has('crates/app/src/', 'crates/core/src/', 'link', 'cargo');
  has('crates/tool/', 'crates/core/src/', 'link', 'cargo');
  has('firmware/app/', 'firmware/drivers/', 'link', 'cmake', 'Debug');
  has('services/ledger/store.py', 'firmware/drivers/uart.c', 'link', 'declared');
  assert.ok(!edges.some(e => e.from === 'packages/billing/src/fee.ts' && e.to.includes('vehicle')), 'a commented import is not an edge');
  assert.deepEqual(out.trim().split('\n'), [...out.trim().split('\n')].sort());
  await fs.rm(dir, { recursive: true, force: true });
});

test('check fails on new violations and gaps, passes after baseline, and catches a replaced violation', async () => {
  const { dir, git } = await repo();
  const first = fm(dir, 'check');
  assert.equal(first.code, 1, first.out + first.err);
  assert.match(first.out, /^NEW may-use billing -> vehicle: packages\/billing\/src\/tax\.ts -> packages\/vehicle\/src\/model\.ts \(import, scan\)$/m);
  assert.match(first.out, /^NEW must-not-reach report -> fw\/drivers: report -> ledger -> fw\/drivers$/m);
  assert.match(first.out, /^NEW unowned scratch\/x\.py/m);
  assert.match(first.out, /^NEW uncovered tools\/gen\.rb/m);
  assert.match(first.out, /^INCOMPLETE:/m);
  assert.doesNotMatch(first.out, /fw\/app -> fw\/drivers/);

  assert.equal(fm(dir, 'baseline').code, 0);
  const clean = fm(dir, 'check');
  assert.equal(clean.code, 0, clean.out);
  assert.match(clean.out, /^PASS$/m);
  git('add', '-A'); git('commit', '-qm', 'baseline');

  await fs.writeFile(path.join(dir, 'packages/billing/src/tax.ts'), "import { round } from '@acme/shared/money';\nexport const tax = () => round(1);\n");
  await fs.writeFile(path.join(dir, 'packages/billing/src/fee.ts'), "import { model } from '../../vehicle/src/model';\nexport const fee = model.rate;\n");
  const replaced = fm(dir, 'check');
  assert.equal(replaced.code, 1, replaced.out);
  assert.match(replaced.out, /^NEW may-use billing -> vehicle: packages\/billing\/src\/fee\.ts -> packages\/vehicle\/src\/model\.ts/m);
  assert.match(replaced.out, /1 entries of the baseline are fixed/);
  await fs.rm(dir, { recursive: true, force: true });
});

test('scan resolves the TS path aliases of the nearest tsconfig.json and the configs that it extends, with a BOM and an exact alias first', async () => {
  const { dir } = await repo({
    'tsconfig.base.json': '\uFEFF{\n  // shared\n  "compilerOptions": {\n    "baseUrl": ".",\n    "paths": { "@money/*": ["packages/shared/*"], "@model*": ["packages/shared/*"], "@model": ["packages/vehicle/src/model.ts"], },\n  },\n}\n',
    'packages/billing/tsconfig.json': '{ "extends": "../../tsconfig.base.json" }\n',
    'packages/billing/src/alias.ts': "import { round } from '@money/money';\nimport { model } from '@model';\nexport const total = round(model.rate);\n",
    'packages/vehicle/tsconfig.json': '{ "extends": "../../tsconfig.base", "compilerOptions": { "baseUrl": ".", "paths": { "@money/*": ["../shared/*"] } } }\n',
    'packages/vehicle/src/local.ts': "import { fmt } from '@money/fmt';\nexport const label = fmt;\n",
  });
  const { code, out, err } = fm(dir, 'extract');
  assert.equal(code, 0, err);
  const edges = out.trim().split('\n').map(line => JSON.parse(line));
  const has = (from, to) => assert.ok(edges.some(e => e.from === from && e.to === to && e.kind === 'import'), `${from} -> ${to}\n${out}`);
  has('packages/billing/src/alias.ts', 'packages/shared/money.ts');
  has('packages/billing/src/alias.ts', 'packages/vehicle/src/model.ts');
  has('packages/vehicle/src/local.ts', 'packages/shared/fmt.ts');
  const check = fm(dir, 'check');
  assert.match(check.out, /^NEW may-use billing -> vehicle: packages\/billing\/src\/alias\.ts -> packages\/vehicle\/src\/model\.ts/m);
  await fs.rm(dir, { recursive: true, force: true });
});

test('a scan entry covers only the files that it can read', async () => {
  const { dir } = await repo({ 'featuremap.json': JSON.stringify({ ...map, extract: [{ tool: 'scan', files: ['**/*'] }] }) });
  const r = fm(dir, 'check');
  assert.match(r.out, /^NEW uncovered tools\/gen\.rb/m);
  await fs.rm(dir, { recursive: true, force: true });
});

test('check --base fails when the baseline grows', async () => {
  const { dir, git } = await repo();
  fm(dir, 'baseline');
  git('add', '-A'); git('commit', '-qm', 'baseline');
  const base = git('rev-parse', 'HEAD').stdout.trim();
  await fs.writeFile(path.join(dir, 'packages/billing/src/fee.ts'), "import { model } from '../../vehicle/src/model';\n");
  fm(dir, 'baseline');
  const grown = fm(dir, 'check', '--base', base);
  assert.equal(grown.code, 1, grown.out);
  assert.match(grown.out, /^GREW baseline violations: may-use\|packages\/billing\/src\/fee\.ts\|packages\/vehicle\/src\/model\.ts/m);
  assert.equal(fm(dir, 'check').code, 0);
  await fs.rm(dir, { recursive: true, force: true });
});

test('where, show, why and closure answer questions about the map', async () => {
  const { dir } = await repo();
  assert.match(fm(dir, 'where', 'svc/api/store/s.go').out, /^svc\/api\/store\/s\.go: go\/store \(owner pattern svc\/api\/store\/\*\*, extracted by go\)/);
  const where = JSON.parse(fm(dir, 'where', 'tools/gen.rb', '--json').out);
  assert.deepEqual(where, { path: 'tools/gen.rb', feature: 'tools', owner: 'tools/**', coverage: [] });
  const show = JSON.parse(fm(dir, 'show', 'billing', '--json').out);
  assert.deepEqual(show.uses.map(u => u.feature), ['shared/money', 'vehicle']);
  assert.equal(show.violations.length, 1);
  const route = JSON.parse(fm(dir, 'why', 'report', 'fw/drivers', '--json').out);
  assert.deepEqual(route.map(h => [h.from, h.to]), [['report', 'ledger'], ['ledger', 'fw/drivers']]);
  assert.equal(route[1].example.kind, 'link');
  assert.match(fm(dir, 'why', 'vehicle', 'billing').out, /vehicle does not reach billing/);
  assert.deepEqual(JSON.parse(fm(dir, 'closure', 'fw/drivers', '--reverse', '--json').out), ['fw/app', 'ledger', 'report']);
  assert.deepEqual(JSON.parse(fm(dir, 'closure', 'report', '--json').out), ['fw/drivers', 'ledger']);
  await fs.rm(dir, { recursive: true, force: true });
});

test('graph draws DOT and Mermaid, marks violations and collapses levels', async () => {
  const { dir } = await repo();
  const dot = fm(dir, 'graph').out;
  assert.match(dot, /^digraph featuremap \{/);
  assert.match(dot, /"billing" -> "vehicle" \[label="1", color=red\];/);
  assert.match(dot, /"tools" \[label="tools \(1 files, 1 with no extractor\)"\];/);
  const collapsed = fm(dir, 'graph', '--level', '1').out;
  assert.match(collapsed, /"fw" \[label="fw \(3 files\)"\];/);
  assert.doesNotMatch(collapsed, /"fw" -> "fw"/);
  assert.match(collapsed, /"ledger" -> "fw" \[label="1"\];/);
  const mermaid = fm(dir, 'graph', '--format', 'mermaid', '--limit', '2').out;
  assert.match(mermaid, /^flowchart LR\n/);
  assert.match(mermaid, /%% \d+ more edges are not shown/);
  await fs.rm(dir, { recursive: true, force: true });
});

test('the copy of the script in the repo is not a source file', async () => {
  const { dir } = await repo();
  await fs.mkdir(path.join(dir, 'tools/featuremap'), { recursive: true });
  await fs.copyFile(script, path.join(dir, 'tools/featuremap/featuremap.mjs'));
  const r = spawnSync(process.execPath, ['tools/featuremap/featuremap.mjs', 'check'], { cwd: dir, encoding: 'utf8' });
  assert.match(r.stdout, /^featuremap: 24 source files/m, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /tools\/featuremap/);
  await fs.rm(dir, { recursive: true, force: true });
});

test('errors in the map or a missing tool output exit 2 before any result', async () => {
  const bad = { ...map, owners: [...map.owners, { path: 'x/**', feature: 'nope' }] };
  const { dir } = await repo({ 'featuremap.json': JSON.stringify(bad) });
  const r = fm(dir, 'check');
  assert.equal(r.code, 2);
  assert.match(r.err, new RegExp(`owners\\[${map.owners.length}\\] names the unknown feature nope`));
  await fs.writeFile(path.join(dir, 'featuremap.json'), JSON.stringify({ ...map, extract: [{ tool: 'cmake', build: 'nobuild' }] }));
  const missing = fm(dir, 'check');
  assert.equal(missing.code, 2);
  assert.match(missing.err, /no CMake File API reply in nobuild\. Create nobuild\/\.cmake\/api\/v1\/query\/codemodel-v2/);
  await fs.writeFile(path.join(dir, 'featuremap.json'), JSON.stringify({ ...map, extract: [{ tool: 'jsonl', path: 'build/java-edges.jsonl', files: ['**/*.java'] }] }));
  assert.match(fm(dir, 'check').err, /the edge file build\/java-edges\.jsonl does not exist/);
  await fs.writeFile(path.join(dir, 'build/go-bad.json'), JSON.stringify({ Dir: '/w/svc/api', ImportPath: 'example.com/api', Module: { Main: true, Dir: '/w/svc/api' },
    Error: { Err: 'expected package, found EOF' } }));
  await fs.writeFile(path.join(dir, 'featuremap.json'), JSON.stringify({ ...map, extract: [{ tool: 'go', dir: 'svc/api', input: 'build/go-bad.json' }] }));
  const broken = fm(dir, 'check');
  assert.equal(broken.code, 2);
  assert.match(broken.err, /go list could not load example\.com\/api: expected package, found EOF/);
  await fs.writeFile(path.join(dir, 'featuremap.json'), JSON.stringify({ ...map, declared: [{ from: 'services/ledger/stroe.py', to: 'firmware/drivers/uart.c' }] }));
  const typo = fm(dir, 'check');
  assert.equal(typo.code, 2);
  assert.match(typo.err, /the declared edge services\/ledger\/stroe\.py -> firmware\/drivers\/uart\.c names services\/ledger\/stroe\.py, which does not exist/);
  await fs.writeFile(path.join(dir, 'featuremap.json'), JSON.stringify(map));
  const badBase = fm(dir, 'check', '--base', 'no-such-commit');
  assert.equal(badBase.code, 2);
  assert.match(badBase.err, /--base no-such-commit is not a commit/);
  await fs.rm(dir, { recursive: true, force: true });
});

test('the recorded fixtures have no machine paths', async () => {
  const names = ['go-list.json', 'cargo-metadata.json', ...(await fs.readdir(path.join(fixtures, 'cmake-reply'))).map(f => `cmake-reply/${f}`)];
  for (const name of names) assert.doesNotMatch(readFileSync(path.join(fixtures, name), 'utf8'), /\/(home|Users|tmp)\//, name);
});
