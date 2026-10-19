import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const quote = value => "'" + value.replaceAll("'", "'\"'\"'") + "'";
const enabled = { enabled: true };
async function fixture(options, check) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sentinel-safeguards-'));
  try {
    const repo = path.join(dir, 'repo'), bin = path.join(dir, 'bin');
    await fs.mkdir(repo); await fs.mkdir(bin);
    const env = { PATH: `${bin}${path.delimiter}${process.env.PATH}`, HOME: dir, TMPDIR: dir,
      GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', SAFEGUARDS_STATE: path.join(dir, 'state.json') };
    const run = (command, args) => spawnSync(command, args, { cwd: repo, env, encoding: 'utf8' });
    for (const name of ['scripts', 'tools', '.github', 'renovate.json']) {
      await fs.cp(path.join(root, name), path.join(repo, name), { recursive: true });
    }
    for (const args of [['init', '-b', 'main'], ['add', '.'],
      ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'Fixture']]) {
      const result = run('git', args); assert.equal(result.status, 0, result.stderr);
    }
    const head = run('git', ['rev-parse', 'HEAD']).stdout.trim();
    const state = { ...options, requests: [], values: {
      // Start with a second setting to change, so rollback proves more than the bot toggle.
      '': { owner: { id: 139752288 }, allow_merge_commit: true, allow_squash_merge: true,
        allow_rebase_merge: false, allow_auto_merge: false, delete_branch_on_merge: true,
        security_and_analysis: { secret_scanning: { status: 'enabled' },
          secret_scanning_push_protection: { status: 'enabled' }, dependabot_security_updates: { status: 'enabled' } } },
      '/commits/main': { sha: head },
      [`/commits/${head}/check-runs?per_page=100`]: { check_runs: [{ name: 'ci', app: { slug: 'github-actions' }, conclusion: 'success' }] },
      '/code-scanning/analyses?ref=refs/heads/main&tool_name=CodeQL&per_page=100': [{ commit_sha: head, error: '' }],
      '/code-scanning/default-setup': { state: 'configured',
        languages: options.codeqlLanguages ?? ['actions', 'javascript', 'javascript-typescript', 'typescript'],
        query_suite: 'default', schedule: 'weekly' },
      '/actions/permissions': { enabled: true, allowed_actions: 'selected', sha_pinning_required: true },
      '/actions/permissions/selected-actions': { github_owned_allowed: true, verified_allowed: false, patterns_allowed: [] },
      '/actions/permissions/workflow': { default_workflow_permissions: 'read', can_approve_pull_request_reviews: false },
      '/immutable-releases': enabled, '/private-vulnerability-reporting': enabled,
      '/automated-security-fixes': enabled, '/vulnerability-alerts': enabled,
    } };
    const rules = [];
    for (const [index, name] of ['main-integrity', 'main-review', 'main-owner-updates'].entries()) {
      const rule = JSON.parse(await fs.readFile(path.join(repo, '.github/rulesets', `${name}.json`)));
      rules.push({ id: index + 1, name: rule.name });
      state.values[`/rulesets/${index + 1}`] = rule;
    }
    state.values['/rulesets?includes_parents=false'] = rules;
    await fs.writeFile(env.SAFEGUARDS_STATE, JSON.stringify(state));
    await fs.writeFile(path.join(bin, 'gh'), `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(path.join(root, 'tests/fixtures/safeguards-gh.mjs'))} "$@"\n`, { mode: 0o755 });
    // /bin/bash explicitly exercises Apple's Bash 3.2 even if PATH has a newer Bash.
    const result = run('/bin/bash', ['scripts/apply-repo-safeguards.sh', 'example/sentinel']);
    const after = JSON.parse(await fs.readFile(env.SAFEGUARDS_STATE));
    await check(result, state, after);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

const posix = { skip: process.platform === 'win32' };
test('safeguards accept absent classic protection without rolling back on macOS Bash', posix, async () => fixture({}, (result, before, after) => {
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.doesNotMatch(result.stderr, /rollback|restor/i);
  assert.match(result.stdout, /applied and verified/);
  assert.equal(before.values[''].allow_merge_commit, true);
  assert.equal(after.values[''].allow_merge_commit, false);
  assert.equal(after.values['/actions/permissions/workflow'].can_approve_pull_request_reviews, true);
  assert.equal(after.requests.filter(r => r.method === 'DELETE').length, 0);
}));

test('safeguards roll back an actual failed GitHub write', posix, async () => fixture({ failWrite: true }, (result, before, after) => {
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /starting automatic rollback/);
  assert.equal(after.values['/actions/permissions/workflow'].can_approve_pull_request_reviews, false);
  assert.deepEqual(after.values, before.values);
}));

test('safeguards roll back when classic protection cannot be read after writes', posix, async () => fixture({ protectionError: true }, (result, before, after) => {
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /could not determine classic branch-protection state/);
  assert.match(result.stderr, /starting automatic rollback/);
  assert.equal(after.values['/actions/permissions/workflow'].can_approve_pull_request_reviews, false);
  assert.deepEqual(after.values, before.values);
}));

test('safeguards stop before writing when vulnerability-alerts state cannot be captured', posix, async () => fixture({ alertsError: true }, (result, before, after) => {
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, /could not read .*vulnerability-alerts/);
  assert.deepEqual(after.requests.filter(r => r.method !== 'GET'), []);
  assert.deepEqual(after.values, before.values);
}));

test('safeguards accept canonical CodeQL language IDs without aliases', posix, async () => fixture({ codeqlLanguages: ['actions', 'javascript-typescript'] }, result => {
  assert.equal(result.status, 0, result.stdout + result.stderr);
}));

for (const languages of [['actions'], ['javascript-typescript'], ['github-actions', 'javascript-typescript']]) {
  test(`safeguards reject missing CodeQL coverage: ${languages}`, posix, async () => fixture({ codeqlLanguages: languages }, (result, before, after) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /CodeQL default setup must scan Actions and JavaScript\/TypeScript/);
    assert.match(result.stderr, /starting automatic rollback/);
    assert.deepEqual(after.values, before.values);
  }));
}
