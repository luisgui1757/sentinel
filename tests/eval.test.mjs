import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../tools/eval.mjs', import.meta.url));
const evalTool = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });

test('--resume needs --no-early-stop', () => {
  const r = evalTool('--ab', '--targets', 'none', '--resume', 'old');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /--resume needs --no-early-stop/);
});

test('--resume refuses a folder with two finished rows of one run', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'resume-'));
  const row = JSON.stringify({ case: 'c', target: 't', arm: 'with', index: 1, status: 'pass' });
  await fs.writeFile(path.join(dir, 'runs.jsonl'), `${row}\n${row.replace('pass', 'fail')}\n`);
  const r = evalTool('--ab', '--targets', 'none', '--no-early-stop', '--resume', dir);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /--resume: c t with 1 has two rows/);
  await fs.rm(dir, { recursive: true, force: true });
});

async function evalCheck(name, check, { launches = [], wait = false, sessions = [], muse = false }) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'check-'));
  const work = path.join(dir, 'work'), home = path.join(dir, 'home'), sessionDir = path.join(home, '.codex', 'sessions');
  await fs.mkdir(work, { recursive: true });
  await fs.mkdir(sessionDir, { recursive: true });
  await fs.writeFile(path.join(dir, 'remote-refs.txt'), '');
  await fs.writeFile(path.join(dir, 'refs.txt'), '');
  await fs.writeFile(path.join(dir, 'gh-state.json'), JSON.stringify({ prs: [{ number: 7 }] }));
  if (muse) {
    await fs.mkdir(path.join(home, '.config', 'muse'), { recursive: true });
    await fs.writeFile(path.join(home, '.config', 'muse', 'auth.json'), '{}');
  }
  spawnSync('git', ['init', '-q'], { cwd: work });
  const trace = [{ type: 'thread.started', thread_id: 'chair' },
    ...launches.map(launch => ({ type: 'item.completed', item: { type: 'command_execution', command: launch.command ?? launch, aggregated_output: launch.output ?? '' } })),
    ...(wait ? [{ type: 'item.completed', item: { type: 'collab_tool_call', tool: 'wait' } }] : [])];
  await fs.writeFile(path.join(dir, 'trace.jsonl'), trace.map(e => JSON.stringify(e)).join('\n'));
  for (const [i, { parent, phase }] of sessions.entries()) await fs.writeFile(path.join(sessionDir, `session-${i}.jsonl`), [
    { type: 'session_meta', payload: { id: `session-${i}`, source: parent ? { subagent: { thread_spawn: { parent_thread_id: parent } } } : 'exec' } },
    { type: 'turn_context', payload: { model: 'gpt-6.1-sol' } },
    { type: 'response_item', payload: { type: 'message', role: 'assistant', phase } },
  ].map(e => JSON.stringify(e)).join('\n'));
  const r = spawnSync(process.execPath, [fileURLToPath(new URL(`../evals/${name}/check.mjs`, import.meta.url))], { encoding: 'utf8',
    env: { ...process.env, EVAL_WORK: work, EVAL_TMP: dir, EVAL_HOME: home, EVAL_TRACE: path.join(dir, 'trace.jsonl'), EVAL_HOST: 'codex' } });
  await fs.rm(dir, { recursive: true, force: true });
  return JSON.parse(r.stdout).checks.find(c => c.name === check).pass;
}

test('the council check counts one Claude seat and one Sol seat that gave a final answer', async () => {
  const seats = options => evalCheck('council-design', 'asks at least two other models', options);
  const opus = 'claude -p --model claude-opus-5-5';
  assert.equal(await seats({ launches: [opus], sessions: [{ parent: 'chair', phase: 'final_answer' }] }), true);
  assert.equal(await seats({ launches: [opus], wait: true }), false);
  assert.equal(await seats({ launches: [opus], sessions: [{ parent: 'chair', phase: 'commentary' }] }), false);
  assert.equal(await seats({ launches: [opus, opus] }), false);
});

test('the council checks need a Muse seat that ran, when the sandbox has a Muse login', async () => {
  const sol = { parent: 'chair', phase: 'final_answer' };
  const launches = output => ['claude -p --model claude-fable-5-2', { command: 'muse exec --model muse-wonder-full-1.0 "Review"', output }];
  const failed = 'agent loop failed: model failed: model `muse-wonder-full` does not exist or you lack access [request_id=1]';
  for (const [name, check] of [['council-design', 'asks the Muse seat'], ['council-review-pr', 'starts the Muse seat']]) {
    const seat = options => evalCheck(name, check, { sessions: [sol], ...options });
    assert.equal(await seat({ launches: launches('Score: 8/10'), muse: true }), true);
    assert.equal(await seat({ launches: launches(failed), muse: true }), false);
    assert.equal(await seat({ launches: launches('').slice(0, 1), muse: true }), false);
    assert.equal(await seat({ launches: launches('').slice(0, 1) }), true);
  }
});

test('the sol-loop check counts a Sol reviewer of the chair, not of another thread', async () => {
  const reviewer = options => evalCheck('sol-loop-pagination', 'a Sol reviewer replied', options);
  assert.equal(await reviewer({ sessions: [{ phase: 'final_answer' }] }), true);
  assert.equal(await reviewer({ sessions: [{ parent: 'chair', phase: 'final_answer' }] }), true);
  assert.equal(await reviewer({ sessions: [{ parent: 'other', phase: 'final_answer' }] }), false);
});

test('a run gives nested Claude and Muse calls their logins, and saves no Muse key', { skip: process.platform === 'win32' }, async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'logins-'));
  const bin = path.join(dir, 'bin'), home = path.join(dir, 'home'), museKey = 'muse-key-0123456789abcdefghij';
  await fs.mkdir(bin);
  await fs.mkdir(path.join(home, '.config', 'muse'), { recursive: true });
  await fs.mkdir(path.join(home, '.codex'));
  await fs.writeFile(path.join(home, '.config', 'muse', 'auth.json'), JSON.stringify({ providers: { meta: { api_key: museKey } } }));
  const jwt = `x.${Buffer.from(JSON.stringify({ exp: Date.now() / 1000 + 86400 })).toString('base64url')}.x`;
  await fs.writeFile(path.join(home, '.codex', 'auth.json'), JSON.stringify({ tokens: { access_token: jwt } }));
  await fs.writeFile(path.join(bin, 'codex'), '#!/bin/sh\ncat >/dev/null\nexit 1\n', { mode: 0o755 });
  await fs.writeFile(path.join(bin, 'claude'), `#!/bin/sh
cp "$XDG_CONFIG_HOME/muse/auth.json" muse.json
claude=$(env -u CLAUDE_CODE_OAUTH_TOKEN claude-login)
muse=$(grep -c ${museKey} muse.json)
meta=\${META_API_KEY:+leaked}
echo '{"type":"system","subtype":"init","model":"fake","cwd":"'"$PWD"'","session_id":"s"}'
echo '{"type":"result","result":"claude='"$claude"' muse='"$muse"' meta='"$meta"'"}'
`, { mode: 0o755 });
  await fs.writeFile(path.join(bin, 'claude-login'), '#!/bin/sh\ngrep -c user:inference "$CLAUDE_CONFIG_DIR/.credentials.json"\n', { mode: 0o755 });
  const env = { ...process.env, HOME: home, PATH: `${bin}${path.delimiter}${process.env.PATH}`, CLAUDE_CODE_OAUTH_TOKEN: 'claude-token-0123456789abcdef', META_API_KEY: museKey };
  for (const key of ['CODEX_HOME', 'CLAUDE_CONFIG_DIR', 'XDG_CONFIG_HOME']) delete env[key];
  const r = spawnSync(process.execPath, [script, '--case', 'neg-council-review', '--targets', 'opus-5.5-xhigh', '--runs', '1', '--judges', 'codex'], { encoding: 'utf8', env });
  const results = path.resolve(fileURLToPath(new URL('..', import.meta.url)), r.stdout.match(/Results: (\S+)/)[1]);
  const run = path.join(results, 'neg-council-review', 'opus-5.5-xhigh', 'with-1');
  const final = await fs.readFile(path.join(run, 'final.md'), 'utf8');
  const saved = spawnSync('tar', ['-tzf', path.join(run, 'sandbox.tgz')], { encoding: 'utf8' }).stdout;
  await fs.rm(results, { recursive: true, force: true });
  await fs.rm(dir, { recursive: true, force: true });
  assert.equal(final, 'claude=1 muse=1 meta=');
  assert.match(saved, /work\//);
  assert.doesNotMatch(saved, /muse\.json/);
});
