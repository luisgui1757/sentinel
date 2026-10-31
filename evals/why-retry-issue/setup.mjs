import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const [work, bin, tmp] = process.argv.slice(2);
const git = (...args) => { const r = spawnSync('git', args, { cwd: work, encoding: 'utf8' }); if (r.status) throw new Error(r.stderr); return r.stdout.trim(); };
const write = (file, text) => { fs.mkdirSync(path.dirname(path.join(work, file)), { recursive: true }); fs.writeFileSync(path.join(work, file), text); };
const client = (retries, name = 'lastError') => `export const MAX_RETRIES = ${retries};

export async function callVendor(request, send) {
  let ${name};
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try { return await send(request); } catch (error) { ${name} = error; }
  }
  throw ${name};
}
`;
git('init', '-q');
git('remote', 'add', 'origin', 'https://github.com/acme/vendor-sync.git');
write('README.md', '# Vendor sync\n\nSends orders to the Acme API.\n');
write('src/vendor.js', client(5));
git('add', '-A'); git('commit', '-qm', 'Add the Acme vendor client');
write('src/vendor.js', client(3));
git('add', '-A'); git('commit', '-qm', 'Lower retries to keep order sync fast (#41)');
write('src/vendor.js', client(6));
git('add', '-A'); git('commit', '-qm', 'Raise MAX_RETRIES to 6 for the flaky network (#55)');
const raised = git('rev-parse', 'HEAD');
git('revert', '--no-edit', raised);
git('commit', '--amend', '-qm', `Revert "Raise MAX_RETRIES to 6 for the flaky network" (#57)\n\nThis reverts commit ${raised}.`);
write('src/orders.js', "import { callVendor } from './vendor.js';\n\nexport const syncOrder = (order, send) => callVendor({ type: 'order', order }, send);\n");
git('add', '-A'); git('commit', '-qm', 'Add order sync (#58)');
write('src/vendor.js', client(3, 'failure'));
git('add', '-A'); git('commit', '-qm', 'Tidy constants (#60)');
const pr = (number, title, body, comments = []) => ({ number, title, body, state: 'MERGED', author: { login: 'dev' }, url: `https://github.com/acme/vendor-sync/pull/${number}`,
  comments: comments.map(([login, text]) => ({ author: { login }, body: text, createdAt: '2026-09-02T10:00:00Z' })), reviews: [], labels: [], closingIssuesReferences: [] });
const prs = [
  pr(41, 'Lower retries to keep order sync fast', 'Each retry adds about 400 ms. With 3 retries, order sync stays under 2 seconds at p99.'),
  pr(55, 'Raise MAX_RETRIES to 6 for the flaky network', 'The network is flaky. More retries help. Latency no longer matters here, because order sync now runs in a background queue.'),
  pr(57, 'Revert "Raise MAX_RETRIES to 6 for the flaky network"', 'Reverts #55.', [
    ['ops-oncall', 'Rolling this back. Details in #49.'],
  ]),
  pr(58, 'Add order sync', 'Adds order sync.'),
  pr(60, 'Tidy constants', 'Renames a variable.'),
];
const issue = (number, title, body, comments = []) => ({ ...pr(number, title, body, comments), state: 'CLOSED', url: `https://github.com/acme/vendor-sync/issues/${number}` });
const issues = [
  issue(49, 'INC-212: Acme blocked our API key', 'After #55 shipped, Acme blocked our API key for one hour. Acme blocks a key after 5 failed calls in one minute. With MAX_RETRIES = 6, one failing request makes 7 calls. With 3, it makes 4 calls and stays under the limit.', [
    ['acme-liaison', 'Acme support confirmed: the limit is 5 failed calls per key in one minute. They will not raise it for our plan.'],
  ]),
];
fs.writeFileSync(path.join(tmp, 'prs.json'), JSON.stringify(prs));
fs.writeFileSync(path.join(tmp, 'issues.json'), JSON.stringify(issues));
fs.writeFileSync(path.join(bin, 'gh'), `#!/usr/bin/env node
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(path.join(tmp, 'gh.log'))}, args.join(' ') + '\\n');
const prs = JSON.parse(fs.readFileSync(${JSON.stringify(path.join(tmp, 'prs.json'))}, 'utf8'));
const issues = JSON.parse(fs.readFileSync(${JSON.stringify(path.join(tmp, 'issues.json'))}, 'utf8'));
const flag = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const out = value => {
  const text = JSON.stringify(value);
  const jq = flag('--jq') ?? flag('-q');
  if (jq) { const r = spawnSync('jq', ['-r', jq], { input: text, encoding: 'utf8' }); process.stdout.write(r.stdout); process.exit(r.status); }
  process.stdout.write(text + '\\n');
};
const find = (key, list = [...prs, ...issues]) => list.find(p => String(p.number) === String(key).replace('#', '') || p.url === key);
const asText = p => [\`title:\\t\${p.title}\`, \`state:\\t\${p.state}\`, \`number:\\t\${p.number}\`, '--', p.body, ...p.comments.map(c => \`--\\n\${c.author.login} commented:\\n\${c.body}\`)].join('\\n');
const [a, b, c] = args;
if (a === 'auth') { console.log('Logged in to github.com account dev'); process.exit(0); }
if ((a === 'pr' || a === 'issue') && b === 'view') {
  const p = find(c, a === 'pr' ? prs : issues);
  if (!p) { console.error(a === 'pr' ? 'no pull request found' : 'Could not resolve to an issue'); process.exit(1); }
  if (args.includes('--json')) out(p); else console.log(asText(p));
}
else if (a === 'pr' && b === 'list') out(prs);
else if (a === 'issue' && b === 'list') out(issues);
else if (a === 'api') {
  const m = (b ?? '').match(/(pulls|issues)\\/(\\d+)(\\/comments)?/);
  const p = m && find(m[2]);
  if (!p) { console.error('Not Found'); process.exit(1); }
  out(m[3] ? p.comments.map(x => ({ user: { login: x.author.login }, body: x.body, created_at: x.createdAt })) : { number: p.number, title: p.title, body: p.body, user: { login: 'dev' } });
}
else if (a === 'search') {
  const words = args.slice(2).filter((w, i, all) => !w.startsWith('-') && !(all[i - 1] ?? '').startsWith('-')).join(' ').toLowerCase().split(/\\s+/).filter(Boolean);
  const list = b === 'prs' ? prs : b === 'issues' ? issues : [];
  out(list.filter(p => words.some(w => JSON.stringify(p).toLowerCase().includes(w))));
}
else { console.error('gh: unsupported in this test'); process.exit(1); }
`, { mode: 0o755 });
