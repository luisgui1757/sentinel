import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { work, tmp, sh, check, report } from '../lib.mjs';

const copy = path.join(tmp, 'ci-copy');
fs.rmSync(copy, { recursive: true, force: true });
fs.cpSync(work, copy, { recursive: true });
const git = (...args) => sh('git', ['-c', 'user.name=CI', '-c', 'user.email=ci@example.com', ...args], copy);
git('add', '-A');
git('commit', '-qm', 'the change of the agent');
const base = git('rev-parse', 'HEAD').stdout.trim();
git('update-ref', 'refs/remotes/origin/main', base);
const env = { ...process.env, GITHUB_BASE_REF: 'main', GITHUB_EVENT_NAME: 'pull_request', BASE_SHA: base, BASE_REF: 'origin/main' };
const subst = cmd => cmd.replace(/\$\{\{\s*github\.event\.pull_request\.base\.sha\s*\}\}/g, base).replace(/\$\{\{\s*github\.base_ref\s*\}\}/g, 'main')
  .replace(/\$\{\{\s*github\.event\.pull_request\.head\.sha\s*\}\}/g, 'HEAD').replace(/\$\{\{\s*github\.sha\s*\}\}/g, 'HEAD');
const indent = line => line.search(/\S/);
const readEnv = (lines, i, inherited) => {
  const own = { ...inherited }, at = indent(lines[i]);
  while (i + 1 < lines.length && (lines[i + 1].trim() === '' || indent(lines[i + 1]) > at)) {
    const pair = lines[++i].match(/^\s*([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (pair) own[pair[1]] = subst(pair[2].trim().replace(/^(['"])(.*)\1$/, '$2'));
  }
  return [own, i];
};
const steps = [];
for (const file of fs.existsSync(path.join(copy, '.github/workflows')) ? fs.readdirSync(path.join(copy, '.github/workflows')) : []) {
  const lines = fs.readFileSync(path.join(copy, '.github/workflows', file), 'utf8').split('\n');
  let workflowEnv = {}, jobEnv = {};
  for (let i = 0; i < lines.length; i++) {
    if (/^env:\s*$/.test(lines[i])) { [workflowEnv, i] = readEnv(lines, i, {}); continue; }
    if (/^  [\w-]+:\s*$/.test(lines[i])) { jobEnv = { ...workflowEnv }; continue; }
    if (/^    env:\s*$/.test(lines[i])) { [jobEnv, i] = readEnv(lines, i, workflowEnv); continue; }
    const item = lines[i].match(/^(\s*)- /);
    if (!item) continue;
    const at = item[1].length, block = [`${' '.repeat(at + 2)}${lines[i].slice(at + 2)}`];
    while (i + 1 < lines.length && (lines[i + 1].trim() === '' || indent(lines[i + 1]) > at)) block.push(lines[++i]);
    let stepEnv = jobEnv, run = null;
    for (let k = 0; k < block.length; k++) {
      if (/^\s*env:\s*$/.test(block[k])) { [stepEnv, k] = readEnv(block, k, jobEnv); continue; }
      const m = block[k].match(/^(\s*)run:\s*(.*)$/);
      if (!m) continue;
      if (m[2] && !/^[|>][-+]?$/.test(m[2])) { run = m[2]; continue; }
      const body = [];
      while (k + 1 < block.length && (block[k + 1].trim() === '' || indent(block[k + 1]) > m[1].length)) body.push(block[++k]);
      run = body.join('\n');
    }
    if (run !== null) steps.push({ run, env: stepEnv });
  }
}
const ci = () => steps.filter(s => !/npm (ci|install)|pip install|apt-get/.test(s.run))
  .map(s => ({ step: s.run, code: spawnSync('bash', ['-c', subst(s.run)], { cwd: copy, env: { ...env, ...s.env }, encoding: 'utf8' }).status }));
const pass = results => results.every(r => r.code === 0);
const own = ci();
check('CI passes on the change of the agent', steps.length && pass(own), own.filter(r => r.code).map(r => r.step).join(' | '));
git('checkout', '-qb', 'pr-noqa', base);
fs.appendFileSync(path.join(copy, 'shop/orders.py'), '\n\ndef count(items):\n    return len( items )  # noqa: E201\n');
git('commit', '-qam', 'feat: count items');
const planted = ci();
check('CI fails on a pull request that adds # noqa', !pass(planted), planted.map(r => `${r.code} ${r.step.split('\n')[0]}`).join(' | '));
git('checkout', '-qb', 'pr-clean', base);
fs.appendFileSync(path.join(copy, 'shop/orders.py'), '\n\ndef count(items):\n    return len(items)\n');
git('commit', '-qam', 'feat: count items');
const clean = ci();
check('CI passes on a pull request with no suppression', pass(clean), clean.filter(r => r.code).map(r => r.step.split('\n')[0]).join(' | '));
fs.rmSync(copy, { recursive: true, force: true });
report();
