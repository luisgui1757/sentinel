import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('../skills/babysit-pr/scripts/pr-wait', import.meta.url));
const python = process.platform === 'win32' ? 'python' : 'python3';
// Run pr-wait with a fake gh program, so that pr-wait decodes the output of a
// real process. The PR JSON holds an emoji, and each poll fails with a
// transient error that holds another emoji. A Windows code page cannot decode
// either emoji correctly.
const runner = `
import importlib.machinery, importlib.util, pathlib, subprocess, sys
loader = importlib.machinery.SourceFileLoader("pr_wait", sys.argv[1])
m = importlib.util.module_from_spec(importlib.util.spec_from_loader("pr_wait", loader))
loader.exec_module(m)
m.STATE_DIR = pathlib.Path(sys.argv[2])
EMIT = "import sys; getattr(sys, sys.argv[1]).buffer.write(bytes.fromhex(sys.argv[2])); sys.exit(int(sys.argv[3]))"
VIEW = ["stdout", '{"number": 1, "title": "\\U0001F50D"}'.encode().hex(), "0"]
POLL = ["stderr", "HTTP 503 \\u2705 unavailable".encode().hex(), "1"]
real_run = subprocess.run
def run(cmd, **kwargs):
    out = VIEW if cmd[1:3] == ["pr", "view"] else POLL
    return real_run([sys.executable, "-c", EMIT, *out], **kwargs)
subprocess.run = run
sys.argv = ["pr-wait", "1", "--repo", "o/r", "--interval", "5"]
m.main()
`;

// Answer each gh call from a fake GitHub. The PR JSON comes from a file that
// the test changes. One check, named ci, passes.
const readyRunner = `
import importlib.machinery, importlib.util, pathlib, subprocess, sys
loader = importlib.machinery.SourceFileLoader("pr_wait", sys.argv[1])
m = importlib.util.module_from_spec(importlib.util.spec_from_loader("pr_wait", loader))
loader.exec_module(m)
m.STATE_DIR = pathlib.Path(sys.argv[2])
PR_FILE = pathlib.Path(sys.argv[3])
def run(cmd, **kwargs):
    args = cmd[1:]
    out = ""
    if args[:2] == ["api", "graphql"]:
        out = PR_FILE.read_text()
    elif args[:2] == ["pr", "checks"]:
        out = '[{"name": "ci", "bucket": "pass", "link": "https://example.test/ci", "description": ""}]'
    elif args[:2] == ["pr", "view"]:
        out = '{"number": 1}'
    elif args[0] == "api" and "/compare/" in args[1]:
        out = "0"
    return subprocess.CompletedProcess(cmd, 0, out, "")
subprocess.run = run
sys.argv = ["pr-wait", "1", "--repo", "o/r", "--until", "ready", "--interval", "5"]
m.main()
`;

test('ready waits for each requested review, and a bot reviewer needs no special name', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sentinel-pr-wait-'));
  const state = path.join(dir, 'state'), prFile = path.join(dir, 'pr.json');
  // A state file from an earlier watcher, so that pr-wait reports events at once.
  await fs.mkdir(state);
  await fs.writeFile(path.join(state, 'o__r__1.json'), '{"reported": [], "base_oid": null, "merge_state": null}');
  const head = 'a'.repeat(40), bot = { __typename: 'Bot', login: 'review-bot' };
  // GitHub counts the open review requests of people, teams and bots alike.
  const pr = (requests, reviews) => JSON.stringify({ data: { viewer: { login: 'me' }, repository: { pullRequest: {
    url: 'https://example.test/pull/1', state: 'OPEN', headRefOid: head, baseRefName: 'main', mergeStateStatus: 'CLEAN',
    author: { login: 'me' }, baseRef: { target: { oid: 'b'.repeat(40) } }, comments: { nodes: [] },
    reviewRequests: { totalCount: requests }, reviews: { nodes: reviews }, reviewThreads: { nodes: [] } } } } });
  await fs.writeFile(prFile, pr(1, []));
  const watcher = spawn(python, ['-B', '-c', readyRunner, script, state, prFile]);
  const exited = new Promise(resolve => watcher.on('exit', resolve));
  let stdout = '', stderr = '';
  watcher.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
  watcher.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
  const until = (pattern, ms) => new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = setInterval(() => {
      if (pattern.test(stdout)) { clearInterval(tick); resolve(); }
      else if (Date.now() - started > ms) { clearInterval(tick); reject(new Error(`no ${pattern}:\n${stdout}${stderr}`)); }
    }, 100);
  });
  try {
    // Checks are green, but the bot has not reviewed: no ready line.
    await until(/checks finished on aaaaaaa: .*waiting for 1 requested review;/, 30000);
    assert.doesNotMatch(stdout, /ready on/);
    await fs.writeFile(prFile, pr(0, [{ id: 'r1', url: 'https://example.test/r1', state: 'COMMENTED', body: 'Looks fine.',
      commit: { oid: head }, author: bot }]));
    await until(/ready on aaaaaaa/, 30000);
    assert.equal(await exited, 0, stdout + stderr);
    assert.match(stdout, /review from review-bot \(commented\): Looks fine\./);
  } finally {
    watcher.kill();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('pr-wait runs on this platform and lets one watcher hold a pull request', async () => {
  const state = await fs.mkdtemp(path.join(os.tmpdir(), 'sentinel-pr-wait-'));
  const holder = spawn(python, ['-B', '-c', runner, script, state]);
  const exited = new Promise(resolve => holder.on('exit', resolve));
  try {
    let stderr = '';
    holder.stderr.setEncoding('utf8');
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no poll from the first watcher:\n${stderr}`)), 20000);
      holder.stderr.on('data', chunk => {
        stderr += chunk;
        if (stderr.includes('retry in')) { clearTimeout(timer); resolve(); }
      });
      holder.on('exit', () => { clearTimeout(timer); reject(new Error(`first watcher exited:\n${stderr}`)); });
    });
    assert.match(stderr, /gh api graphql: HTTP 503 ✅ unavailable; retry in 2s/);

    const second = spawnSync(python, ['-B', '-c', runner, script, state], { encoding: 'utf8', timeout: 20000 });
    assert.equal(second.status, 2, second.stdout + second.stderr);
    assert.match(second.stdout, new RegExp(`pid ${holder.pid} already watches o/r#1`));
  } finally {
    holder.kill();
    await exited;
    await fs.rm(state, { recursive: true, force: true });
  }
});
