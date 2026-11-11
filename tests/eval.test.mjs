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

const councilDesignCheck = fileURLToPath(new URL('../evals/council-design/check.mjs', import.meta.url));

async function councilSeats({ launches = [], wait = false, child = null }) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'council-'));
  const work = path.join(dir, 'work'), home = path.join(dir, 'home'), sessions = path.join(home, '.codex', 'sessions');
  await fs.mkdir(work, { recursive: true });
  await fs.mkdir(sessions, { recursive: true });
  spawnSync('git', ['init', '-q'], { cwd: work });
  const trace = [{ type: 'thread.started', thread_id: 'chair' },
    ...launches.map(command => ({ type: 'item.completed', item: { type: 'command_execution', command } })),
    ...(wait ? [{ type: 'item.completed', item: { type: 'collab_tool_call', tool: 'wait' } }] : [])];
  await fs.writeFile(path.join(dir, 'trace.jsonl'), trace.map(e => JSON.stringify(e)).join('\n'));
  if (child) await fs.writeFile(path.join(sessions, 'child.jsonl'), [
    { type: 'session_meta', payload: { id: 'child', source: { subagent: { thread_spawn: { parent_thread_id: 'chair' } } } } },
    { type: 'turn_context', payload: { model: 'gpt-6.1-sol' } },
    { type: 'response_item', payload: { type: 'message', role: 'assistant', phase: child } },
  ].map(e => JSON.stringify(e)).join('\n'));
  const r = spawnSync(process.execPath, [councilDesignCheck], { encoding: 'utf8',
    env: { ...process.env, EVAL_WORK: work, EVAL_TMP: dir, EVAL_HOME: home, EVAL_TRACE: path.join(dir, 'trace.jsonl'), EVAL_HOST: 'codex' } });
  await fs.rm(dir, { recursive: true, force: true });
  return JSON.parse(r.stdout).checks.find(c => c.name === 'asks at least two other models').pass;
}

test('the council check counts one Claude seat and one Sol seat that gave a final answer', async () => {
  const opus = 'claude -p --model claude-opus-5-5';
  assert.equal(await councilSeats({ launches: [opus], child: 'final_answer' }), true);
  assert.equal(await councilSeats({ launches: [opus], wait: true }), false);
  assert.equal(await councilSeats({ launches: [opus], child: 'commentary' }), false);
  assert.equal(await councilSeats({ launches: [opus, opus] }), false);
});
