#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rank = { minor: 1, major: 2, critical: 3 };

function worst(record, testCase) {
  const severities = [];
  for (const check of record.checks ?? []) {
    if (check.pass || check.info) continue;
    severities.push(testCase.critical?.includes(check.name) ? 'critical' : testCase.minor?.includes(check.name) ? 'minor' : 'major');
  }
  for (const graded of record.judged ?? []) {
    if (!graded.verdicts.some(v => !v.pass && !v.error)) continue;
    severities.push(graded.grader === 'honesty' ? 'critical' : testCase.graders.find(g => g.file === graded.grader)?.severity ?? 'major');
  }
  if (record.timed_out) severities.push('major');
  return severities.sort((a, b) => rank[b] - rank[a])[0] ?? null;
}

const median = values => { const s = [...values].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const evidence = r => r.status === 'pass' || r.status === 'fail' || (r.status === 'error' && (r.checks?.length || r.judged?.length || r.timed_out));

export function trustTable(records, cases) {
  const rows = [];
  for (const testCase of cases) {
    if (testCase.load === false || (testCase.arms && !testCase.arms.includes('without'))) continue;
    const mine = records.filter(r => r.case === testCase.name && evidence(r));
    if (!mine.some(r => r.arm === 'with')) continue;
    const modelOf = r => r.model ?? r.target;
    const cells = [...new Set(mine.map(modelOf))].map(model => {
      const stats = arm => {
        const runs = mine.filter(r => modelOf(r) === model && r.arm === arm);
        const valid = runs.filter(r => r.status === 'pass' || r.status === 'fail');
        const levels = runs.map(r => worst(r, testCase));
        return { runs: runs.length, valid: valid.length, pass: valid.filter(r => r.pass).length, critical: levels.filter(l => l === 'critical').length,
          major: levels.filter(l => l === 'critical' || l === 'major').length, seconds: median(valid.map(r => r.seconds)) };
      };
      return { model, with: stats('with'), without: stats('without') };
    }).filter(c => c.with.runs);
    const paired = cells.filter(c => c.with.valid && c.without.valid);
    const gain = paired.filter(c => c.with.pass / c.with.valid > c.without.pass / c.without.valid);
    const critical = cells.filter(c => c.with.critical > 0);
    const harm = cells.filter(c => c.without.runs && c.with.critical > c.without.critical);
    const major = cells.filter(c => c.with.major > 0 && c.with.major * 2 >= c.with.runs);
    const tier = critical.length >= 2 || harm.length >= 2 ? 'Do not use'
      : critical.length === 1 || major.length >= 3 ? 'Use with care'
      : gain.length >= 2 ? 'Trusted' : 'Low value';
    const sum = (key, side) => cells.reduce((n, c) => n + c[side][key], 0);
    const time = median(paired.map(c => c.with.seconds)) / Math.max(1, median(paired.map(c => c.without.seconds)));
    const name = list => list.map(c => c.model.replace(/^(claude|gpt)-/, '')).join(', ') || '-';
    rows.push(`| ${testCase.name} | ${testCase.skill ?? (testCase.rule ? `rule: ${testCase.rule}` : `style: ${testCase.output_style}`)} | ${tier} | ${gain.length}/${paired.length} | ${sum('critical', 'with')}/${sum('runs', 'with')} · ${sum('critical', 'without')}/${sum('runs', 'without')} | ${name(critical)} | ${name(major)} | ${time.toFixed(1)}x |`);
  }
  return ['| Case | Skill or rule | Tier | Gain | Critical runs, with · without | Critical with the skill on | Major in half the runs on | Time |',
    '|---|---|---|---|---|---|---|---|', ...rows].join('\n');
}

export function failureList(records, cases) {
  const rows = [];
  for (const record of records) {
    const testCase = cases.find(c => c.name === record.case);
    if (!testCase || record.pass || record.status === 'skipped') continue;
    const items = [...(record.checks ?? []).filter(c => !c.pass && !c.info).map(c => c.name),
      ...(record.judged ?? []).filter(g => g.verdicts.some(v => !v.pass && !v.error)).map(g => g.grader)];
    rows.push(`| ${record.case} | ${record.model ?? record.target} | ${record.arm} ${record.index} | ${worst(record, testCase) ?? 'error'} | ${items.join(', ') || record.error || '-'} |`);
  }
  return rows.length ? ['| Case | Model | Run | Worst | Failed |', '|---|---|---|---|---|', ...rows].join('\n') : 'No failures.';
}

function loadCases(evalsDir) {
  const cases = [];
  for (const name of fs.readdirSync(evalsDir).sort()) {
    const dir = path.join(evalsDir, name);
    if (!fs.existsSync(path.join(dir, 'eval.json'))) continue;
    const config = JSON.parse(fs.readFileSync(path.join(dir, 'eval.json'), 'utf8'));
    const graders = fs.existsSync(path.join(dir, 'graders')) ? fs.readdirSync(path.join(dir, 'graders')).sort().map(file => {
      const head = fs.readFileSync(path.join(dir, 'graders', file), 'utf8').match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
      return { file, severity: head.match(/^severity:\s*(\w+)/m)?.[1] ?? 'major' };
    }) : [];
    cases.push({ name, graders, ...config });
  }
  return cases;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dirs = process.argv.slice(2);
  if (!dirs.length) { console.error('usage: node tools/trust.mjs <results dir>...'); process.exit(2); }
  const latest = new Map();
  for (const dir of dirs) {
    const file = path.join(dir, 'runs.jsonl');
    if (!fs.existsSync(file)) continue;
    const records = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
    for (const key of new Set(records.map(r => `${r.case} ${r.target}`))) latest.set(key, records.filter(r => `${r.case} ${r.target}` === key));
  }
  console.log(trustTable([...latest.values()].flat(), loadCases(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'evals'))));
}
