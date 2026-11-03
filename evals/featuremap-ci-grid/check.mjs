import { check, report, pullRequests, productChanges } from '../lib.mjs';

const changed = productChanges(['web/', 'sdk/', 'shared/', 'services/', 'native/', 'agent/'],
  { allow: ['README.md', 'Makefile', '.gitignore', 'package.json', '.github/', '**/Cargo.lock'] });
check('changes no product file', !changed.length, changed.join(', '));

const pr = pullRequests();
const probe = (name, expect, plant) => {
  try {
    const result = plant();
    check(name, expect === 'pass' ? result.pass : result.caught, result.detail);
  } catch (error) { check(name, false, error.message); }
};
const caught = (name, plant) => probe(name, 'caught', () => { pr.branch(name.replace(/\W+/g, '-')); plant(); pr.commit(name); return pr.ci(); });
const cmake = (target, file) => text => text.replace(new RegExp(`(add_(?:library|executable)\\(${target} [^)]*)\\)`), `$1 ${file})`);

try {
  probe('CI passes on main', 'pass', () => pr.branch('main-again').ci());

  probe('CI passes on a clean pull request', 'pass', () => {
    pr.branch('clean')
      .write('services/api/app/due.py', 'from . import billing\nfrom ...shared.money import cents\n\n\ndef due(amount, paid):\n    return cents(billing.invoice_line(amount)["amount"] - paid)\n')
      .write('web/src/bills.ts', "import { retry, usage } from '@grid/sdk';\nimport { formatKwh } from '@shared/format';\n\nexport async function bills(meter: string) {\n  return retry(async () => formatKwh(Number(await usage(meter))));\n}\n")
      .write('web/src/charts/line.ts', "import { render } from '../usage';\n\nexport const line = (meter: string) => render(meter, 'chart');\n")
      .write('native/ingest/src/sample.cc', '#include <dsp/filter.h>\n#include <dsp/window.h>\n#include "ingest/clock.h"\n\nnamespace ingest {\nfloat sample(const ring_t &r) { return dsp::lowpass(r, dsp::hann(1, 4)) * SAMPLE_RATE_HZ; }\n}\n')
      .edit('native/CMakeLists.txt', cmake('ingest', 'ingest/src/sample.cc'))
      .edit('agent/collector/src/main.rs', text => `${text}\n#[allow(dead_code)]\nfn label(frame: &wire::Frame) -> String {\n    format!("{}:{}", frame.meter, frame.wh)\n}\n`);
    pr.commit('feat: due amounts, bills and samples');
    return pr.ci();
  });

  caught('CI fails on a new TS import from a file that already has a break', () => pr.edit('shared/ts/src/format.ts',
    text => `import { retry } from '@sdk/retry';\n${text}\nexport const formatLater = (wh: number) => retry(async () => formatWh(wh));\n`));

  caught('CI fails on a new Python relative import across parts', () => pr.write('services/billing/tariff/peak.py',
    'from ...api.app.settings import TAX_RATE\n\n\ndef peak_with_tax(amount):\n    return round(amount * (1 + TAX_RATE), 2)\n'));

  caught('CI fails on a new C++ include through an include folder', () => pr
    .write('native/dsp/src/drift.cc', '#include <dsp/window.h>\n#include "clock.h"\n\nnamespace dsp {\nfloat drift(long ms) { return ms * ingest::SAMPLE_RATE_HZ / 1000.0f; }\n}\n')
    .edit('native/CMakeLists.txt', cmake('dsp', 'dsp/src/drift.cc')));

  caught('CI fails on a new cargo path dependency', () => pr
    .edit('agent/wire/Cargo.toml', text => `${text}\n[dependencies]\nstats = { path = "../metrics", package = "metrics" }\n`)
    .edit('agent/wire/src/lib.rs', text => `${text}\npub fn count(frames: &[Frame]) -> u64 {\n    let mut seen = stats::Counter::default();\n    seen.add(frames.len() as u64);\n    seen.get()\n}\n`));

  caught('CI fails when a break moves to another file', () => pr
    .write('shared/ts/src/format.ts', 'export const formatKwh = (kwh: number) => `${kwh.toFixed(1)} kWh`;\n\nexport const formatWh = (wh: number) => formatKwh(wh / 1000);\n')
    .edit('sdk/src/client.ts', text => text.replace("import { retry } from './retry';", "import { retry } from './retry';\nimport { SESSION_HEADER } from '../../web/src/session';")
      .replace('fetch(`/api/meters/${meter}/usage`)', 'fetch(`/api/meters/${meter}/usage`, { headers: { [SESSION_HEADER]: meter } })')));

  probe('CI fails when a pull request runs make boundaries-baseline to allow a new break', 'caught', () => {
    pr.branch('grow').write('services/shared/labels.py', 'from ..api.app.settings import CURRENCY\n\n\ndef label(amount):\n    return f"{amount:.2f} {CURRENCY}"\n');
    const made = pr.make('boundaries-baseline');
    if (made.code !== 0) throw new Error(`make boundaries-baseline exit ${made.code}: ${made.output}`);
    pr.commit('feat: currency labels');
    pr.edit('sdk/src/units.ts', text => `${text}\nexport const KWH_PER_MWH = 1000;\n`).commit('feat: MWh');
    return pr.ci();
  });

  probe('CI passes after a break is removed and make boundaries-baseline runs', 'pass', () => {
    pr.branch('shrink').edit('services/billing/tariff/rates.py', text => text.replace('from ... import api\n', '').replace('api.TAX_RATE', 'TAX_RATE')
      .replace('OFF_PEAK = 0.18\n', 'OFF_PEAK = 0.18\nTAX_RATE = 0.2\n'));
    const made = pr.make('boundaries-baseline');
    if (made.code !== 0) throw new Error(`make boundaries-baseline exit ${made.code}: ${made.output}`);
    pr.commit('refactor: billing keeps its own tax rate');
    return pr.ci();
  });
} finally {
  pr.cleanup();
}
report();
