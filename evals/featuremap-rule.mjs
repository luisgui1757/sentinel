import fs from 'node:fs';
import path from 'node:path';

const CASES = ['featuremap-ci-relay', 'featuremap-ci-ledger'];
const TARGETS = ['opus-5.5-xhigh', 'haiku-5.5-xhigh', 'gpt-6.1-sol-xhigh', 'gpt-6.1-terra-xhigh', 'gpt-6-luna-xhigh'];

const cost = r => {
  if (r.host === 'claude') return typeof r.usage?.cost_usd === 'number' ? r.usage.cost_usd : null;
  const { input_tokens: input, cached_input_tokens: cached = 0, output_tokens: output } = r.usage ?? {};
  return typeof input === 'number' && typeof output === 'number' ? input - cached + output : null;
};
const median = values => {
  const v = [...values].sort((a, b) => a - b), mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
};

export function score(records) {
  const rows = records.filter(r => CASES.includes(r.case));
  const models = TARGETS.map(target => {
    const arm = name => {
      const runs = rows.filter(r => r.target === target && r.arm === name);
      const complete = CASES.every(c => {
        const indices = runs.filter(r => r.case === c).map(r => r.index).sort();
        return indices.join() === '1,2,3';
      });
      const costs = runs.map(cost).filter(c => c !== null);
      const perCase = Object.fromEntries(CASES.map(c => [c, runs.filter(r => r.case === c && r.status === 'pass').length]));
      return { runs: runs.length, complete, passes: runs.filter(r => r.status === 'pass').length,
        errors: runs.filter(r => r.status !== 'pass' && r.status !== 'fail').length,
        costed: costs.length, median: costs.length ? median(costs) : null, perCase };
    };
    const w = arm('with'), wo = arm('without');
    const costKnown = w.costed >= 5 && wo.costed >= 5;
    const passGain = w.passes - wo.passes >= 2;
    const costCanCount = w.passes >= wo.passes && CASES.every(c => w.perCase[c] >= 1);
    const costGain = costKnown && costCanCount && w.median <= 0.8 * wo.median;
    const loss = CASES.some(c => wo.perCase[c] - w.perCase[c] >= 2);
    const unclear = [w, wo].some(a => !a.complete || a.errors > 1) || (!costKnown && !passGain && !loss && costCanCount);
    const result = unclear ? 'unclear' : (passGain || costGain) && !loss ? 'improves' : 'no';
    return { target, with: w, without: wo, passGain, costGain, costKnown, loss, result };
  });
  const cases = CASES.map(c => {
    const more = models.filter(m => m.with.perCase[c] >= m.without.perCase[c] + 1).length;
    const losses = models.filter(m => m.without.perCase[c] - m.with.perCase[c] >= 2).length;
    return { case: c, more, losses, passes: more >= 2 && losses === 0 };
  });
  const improved = models.filter(m => m.result === 'improves').length, open = models.filter(m => m.result === 'unclear').length;
  return { models, cases, improved, open, goal: improved >= 4 ? 'met' : improved + open >= 4 ? 'unclear' : 'not met' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const dir = process.argv[2];
  if (!dir) { console.error('usage: node evals/featuremap-rule.mjs <results folder>'); process.exit(2); }
  const records = fs.readFileSync(path.join(dir, 'runs.jsonl'), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
  const s = score(records);
  console.log('| Model | Passes with · without | Errors with · without | Median cost with · without | Pass gain | Cost gain | Loss on a case | Result |\n|---|---|---|---|---|---|---|---|');
  const fmt = v => (v === null ? '-' : v < 100 ? v.toFixed(2) : Math.round(v));
  for (const m of s.models) {
    console.log(`| ${m.target} | ${m.with.passes}/${m.with.runs} · ${m.without.passes}/${m.without.runs} | ${m.with.errors} · ${m.without.errors} | ${fmt(m.with.median)} · ${fmt(m.without.median)} | ${m.passGain ? 'yes' : 'no'} | ${m.costKnown ? (m.costGain ? 'yes' : 'no') : 'unclear'} | ${m.loss ? 'yes' : 'no'} | ${m.result} |`);
  }
  for (const c of s.cases) console.log(`${c.case}: ${c.more} models pass at least 1 more run, ${c.losses} pass 2 or more fewer. ${c.passes ? 'Passes' : 'Does not pass'} (report only).`);
  console.log(`Models that improve: ${s.improved} of 5, unclear: ${s.open}. Goal ${s.goal}.`);
}
