import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const work = process.argv[2];
const git = (...args) => { const r = spawnSync('git', args, { cwd: work, encoding: 'utf8' }); if (r.status) throw new Error(r.stderr); };
const write = (file, text) => { fs.mkdirSync(path.dirname(path.join(work, file)), { recursive: true }); fs.writeFileSync(path.join(work, file), text); };
git('init', '-q');
write('AGENTS.md', '# Lease and quota\n\nUse the formal-lease skill after each change to src/lease.js, and the formal-quota skill after each change to src/quota.js.\n');
write('package.json', '{ "name": "lease", "type": "module", "scripts": { "test": "node --test" } }\n');
write('src/lease.js', `export class Lease {
  constructor(store) {
    this.store = store;
  }

  async acquire(worker) {
    return this.store.compareAndSet('holder', null, worker);
  }

  async release(worker) {
    await this.store.compareAndSet('holder', worker, null);
  }
}
`);
write('verify/lease-model.mjs', `const programs = { acquire: ['cas'] };
const start = { holder: null, pc: [0, 0], held: [false, false] };
const key = s => JSON.stringify(s);

function steps(state) {
  const next = [];
  for (const w of [0, 1]) {
    if (state.pc[w] >= programs.acquire.length) continue;
    const s = structuredClone(state);
    if (s.holder === null) { s.holder = w; s.held[w] = true; }
    s.pc[w] += 1;
    next.push({ worker: w, step: 'cas', state: s });
  }
  return next;
}

const seen = new Set([key(start)]);
const queue = [{ state: start, path: [] }];
while (queue.length) {
  const { state, path } = queue.shift();
  if (state.held.filter(Boolean).length > 1) {
    console.log('VIOLATION: two workers hold the lease');
    console.log(path.join(' -> '));
    process.exit(1);
  }
  for (const { worker, step, state: s } of steps(state)) {
    if (seen.has(key(s))) continue;
    seen.add(key(s));
    queue.push({ state: s, path: [...path, \`worker \${worker}: \${step}\`] });
  }
}
console.log(\`OK: \${seen.size} states, at most one holder\`);
`);
write('.agents/skills/formal-lease/SKILL.md', `---
name: formal-lease
description: Prove that at most one worker holds the lease. Use after each change to src/lease.js or to the store that it uses.
---

# Formal check of the lease

\`verify/lease-model.mjs\` models \`Lease.acquire\` for two workers. Each worker takes one atomic step, \`cas\`, which is \`store.compareAndSet('holder', null, worker)\` in \`src/lease.js\`. The model explores every order of steps and checks that at most one worker holds the lease.

Run \`node verify/lease-model.mjs\`. It prints \`OK\` and exits 0, or prints \`VIOLATION\` with the order of steps and exits 1.
`);
write('src/quota-store.js', `export function memoryQuotaStore() {
  const holders = new Map();
  return {
    claimIfBelow: async (name, worker, max) => {
      const set = holders.get(name) ?? new Set();
      if (set.has(worker) || set.size >= max) return false;
      set.add(worker);
      holders.set(name, set);
      return true;
    },
    release: async (name, worker) => holders.get(name)?.delete(worker) ?? false,
  };
}
`);
write('src/quota.js', `export class Quota {
  constructor(store, max) {
    this.store = store;
    this.max = max;
  }

  async take(worker) {
    return this.store.claimIfBelow('quota', worker, this.max);
  }
}
`);
write('verify/quota-model.mjs', `const max = 1;
const start = { used: 0, held: [false, false], pc: [0, 0] };
const key = s => JSON.stringify(s);

function steps(state) {
  const next = [];
  for (const w of [0, 1]) {
    if (state.pc[w] > 0) continue;
    const s = structuredClone(state);
    if (s.used < max && !s.held[w]) { s.used += 1; s.held[w] = true; }
    s.pc[w] = 1;
    next.push({ worker: w, step: 'take', state: s });
  }
  return next;
}

const seen = new Set([key(start)]);
const queue = [{ state: start, path: [] }];
while (queue.length) {
  const { state, path } = queue.shift();
  if (state.used !== state.held.filter(Boolean).length || state.used > max) {
    console.log('VIOLATION: more claims than holders, or more than max');
    console.log(path.join(' -> '));
    process.exit(1);
  }
  for (const { worker, step, state: s } of steps(state)) {
    if (seen.has(key(s))) continue;
    seen.add(key(s));
    queue.push({ state: s, path: [...path, \`worker \${worker}: \${step}\`] });
  }
}
console.log(\`OK: \${seen.size} states, each claim has one holder and at most max\`);
`);
write('.agents/skills/formal-quota/SKILL.md', `---
name: formal-quota
description: Prove that the quota never gives out more slots than its maximum, and that each slot has one holder. Use after each change to src/quota.js or to src/quota-store.js.
---

# Formal check of the quota

\`verify/quota-model.mjs\` models \`Quota\` for two workers and a maximum of 1. Each worker takes one atomic step, \`take\`, which is \`store.claimIfBelow('quota', worker, max)\` in \`src/quota.js\`. \`src/quota-store.js\` gives a slot only to a worker that has none, while fewer than max slots are taken. The model explores every order of steps and checks that each claim has one holder and that at most max slots are taken.

Run \`node verify/quota-model.mjs\`. It prints \`OK\` and exits 0, or prints \`VIOLATION\` with the order of steps and exits 1.
`);
git('add', '-A'); git('commit', '-qm', 'Add the lease and its formal check');
write('src/lease.js', `export class Lease {
  constructor(store) {
    this.store = store;
  }

  async acquire(worker) {
    const holder = await this.store.get('holder');
    if (holder !== null) return false;
    await this.store.set('holder', worker);
    return true;
  }

  async release(worker) {
    if ((await this.store.get('holder')) === worker) await this.store.set('holder', null);
  }
}
`);
git('add', '-A'); git('commit', '-qm', 'Use plain get and set in the lease store');
write('src/quota.js', fs.readFileSync(path.join(work, 'src/quota.js'), 'utf8').replace(`    return this.store.claimIfBelow('quota', worker, this.max);
  }`, `    return this.store.claimIfBelow('quota', worker, this.max);
  }

  async refund(worker) {
    return this.store.release('quota', worker);
  }`));
git('add', '-A'); git('commit', '-qm', 'Let a worker give back its quota slot');
write('src/lease.js', fs.readFileSync(path.join(work, 'src/lease.js'), 'utf8').replace(`  async release(worker) {
    if ((await this.store.get('holder')) === worker) await this.store.set('holder', null);
  }`, `  async release(owner) {
    const current = await this.store.get('holder');
    if (current === owner) await this.store.set('holder', null);
  }`));
git('add', '-A'); git('commit', '-qm', 'Name the release argument owner');
