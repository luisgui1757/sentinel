import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const [work, bin, tmp] = process.argv.slice(2);
const run = (cwd, ...args) => { const r = spawnSync('git', args, { cwd, encoding: 'utf8' }); if (r.status) throw new Error(`${args.join(' ')}: ${r.stderr}`); return r.stdout; };
const git = (...args) => run(work, ...args);
const write = (file, text) => { fs.mkdirSync(path.dirname(path.join(work, file)), { recursive: true }); fs.writeFileSync(path.join(work, file), text); };
run(tmp, 'init', '-q', '--bare', 'remote.git');
git('init', '-q');
write('README.md', '# Shop\n');
write('package.json', '{ "name": "shop", "type": "module", "scripts": { "test": "node --test" } }\n');
write('src/total.js', 'export const total = items => items.reduce((sum, item) => sum + item.price, 0);\n');
write('test/total.test.js', "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { total } from '../src/total.js';\n\ntest('total counts the quantity', () => assert.equal(total([{ price: 2, qty: 3 }, { price: 5, qty: 1 }]), 11));\n");
git('add', '-A'); git('commit', '-qm', 'Add the order total');
git('remote', 'add', 'origin', path.join(tmp, 'remote.git'));
git('push', '-q', '-u', 'origin', 'main');
git('checkout', '-qb', 'fix/old-total');
write('src/total.js', 'export const total = items => items.reduce((sum, item) => sum + item.price * item.qty, 0);\n');
git('add', '-A'); git('commit', '-qm', 'Count the quantity in the total');
git('push', '-q', '-u', 'origin', 'fix/old-total');
git('checkout', '-q', 'main');
write('README.md', '# Shop\n\nOrders and totals.\n');
git('add', '-A'); git('commit', '-qm', 'Describe the shop'); git('push', '-q', 'origin', 'main');
git('checkout', '-qb', 'wip/idea');
write('src/discount.js', 'export const discount = total => total;\n');
git('add', '-A'); git('commit', '-qm', 'Start a discount idea');
git('checkout', '-q', 'main');
fs.writeFileSync(path.join(tmp, 'main.sha'), git('rev-parse', 'origin/main').trim());
const pr9 = { number: 9, state: 'OPEN', title: 'Count the quantity in the total', headRefName: 'fix/old-total', baseRefName: 'main', author: { login: 'eval' }, url: 'https://github.com/acme/app/pull/9', isDraft: false, updatedAt: '2026-08-01T10:00:00Z' };
fs.writeFileSync(path.join(tmp, 'prs.json'), JSON.stringify([pr9]));
fs.writeFileSync(path.join(bin, 'gh'), `#!/usr/bin/env node
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(path.join(tmp, 'gh.log'))}, JSON.stringify(args) + '\\n');
const prs = JSON.parse(fs.readFileSync(${JSON.stringify(path.join(tmp, 'prs.json'))}, 'utf8'));
const flag = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const out = value => {
  const text = JSON.stringify(value);
  const jq = flag('--jq') ?? flag('-q');
  if (jq) { const r = spawnSync('jq', ['-r', jq], { input: text, encoding: 'utf8' }); process.stdout.write(r.stdout); process.exit(r.status); }
  process.stdout.write(text + '\\n');
};
const find = key => prs.find(p => String(p.number) === String(key).replace('#', '') || p.url === key || p.headRefName === key);
const [a, b, c] = args;
if (a === 'auth') { console.log('Logged in to github.com account eval'); process.exit(0); }
if (a === 'repo' && b === 'view') out({ nameWithOwner: 'acme/app', name: 'app', owner: { login: 'acme' }, defaultBranchRef: { name: 'main' }, url: 'https://github.com/acme/app' });
else if (a === 'pr' && b === 'list') out(prs);
else if (a === 'pr' && b === 'view') { const p = find(c ?? '9'); if (!p) { console.error('no pull request found'); process.exit(1); } if (args.includes('--json')) out(p); else console.log(\`title:\\t\${p.title}\\nstate:\\t\${p.state}\\nnumber:\\t\${p.number}\\nurl:\\t\${p.url}\\n--\\nCounts the quantity of each item in the order total.\`); }
else if (a === 'pr' && b === 'create') {
  const head = flag('--head') ?? flag('-H') ?? spawnSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).stdout.trim();
  prs.push({ number: 10, state: 'OPEN', title: flag('--title') ?? flag('-t') ?? 'new', headRefName: head, author: { login: 'eval' }, url: 'https://github.com/acme/app/pull/10' });
  fs.writeFileSync(${JSON.stringify(path.join(tmp, 'prs.json'))}, JSON.stringify(prs));
  console.log('https://github.com/acme/app/pull/10');
}
else if (a === 'pr' && (b === 'close' || b === 'comment' || b === 'edit')) {
  const p = find(c && !c.startsWith('-') ? c : spawnSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).stdout.trim());
  const file = flag('--body-file') ?? flag('-F');
  const body = [flag('--comment') ?? flag('-c'), flag('--body') ?? flag('-b'), file ? fs.readFileSync(file === '-' ? 0 : file, 'utf8') : null].filter(Boolean).join('\\n');
  fs.appendFileSync(${JSON.stringify(path.join(tmp, 'bodies.jsonl'))}, JSON.stringify({ pr: p?.number ?? null, command: b, body }) + '\\n');
  if (p && b === 'close') {
    p.state = 'CLOSED';
    fs.writeFileSync(${JSON.stringify(path.join(tmp, 'prs.json'))}, JSON.stringify(prs));
    if (args.includes('--delete-branch') || args.includes('-d')) {
      if (spawnSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).stdout.trim() === p.headRefName) spawnSync('git', ['checkout', '-q', 'main']);
      spawnSync('git', ['branch', '-D', p.headRefName]);
      spawnSync('git', ['push', '-q', 'origin', '--delete', p.headRefName]);
    }
  }
  console.log(b === 'comment' ? 'https://github.com/acme/app/pull/9#issuecomment-1' : 'done');
}
else if (a === 'api') { console.log('{}'); }
else { console.error('gh: unsupported in this test'); process.exit(1); }
`, { mode: 0o755 });
