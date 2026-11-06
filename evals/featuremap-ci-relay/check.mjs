import { check, report, pullRequests, productChanges } from '../lib.mjs';

const changed = productChanges([
  'control/console/', 'control/transport/', 'control/protocol/',
  'config/provision/', 'config/plans/', 'config/catalog/',
  'engine/gateway/', 'engine/filter/', 'engine/wire/',
], { allow: ['README.md', 'Makefile', '.gitignore', 'package.json', '.github/', 'tools/', 'scripts/', 'tests/'] });
check('changes no product file', !changed.length, changed.join(', '));

const pr = pullRequests();
const probe = (name, expect, plant) => {
  try {
    const result = plant();
    check(name, expect === 'pass' ? result.pass && result.ran !== 0 : result.caught, result.detail);
  } catch (error) { check(name, false, error.message); }
};
const caught = (name, plant) => probe(name, 'caught', () => {
  pr.branch(name.replace(/\W+/g, '-'));
  plant();
  pr.commit(name);
  return pr.ci();
});
const source = (target, file) => text => text.replace(
  new RegExp(`(add_library\\(${target} [^)]*)\\)`), `$1 ${file})`);

try {
  probe('CI passes on main push', 'pass', () => pr.branch('main').ci({ event: 'push', base: process.env.EVAL_HEAD }));
  probe('CI passes on an unchanged pull request', 'pass', () => pr.branch('unchanged').ci());
  probe('CI passes on allowed dependencies in all languages', 'pass', () => {
    pr.branch('allowed')
      .write('control/transport/version.mjs', 'import { VERSION } from "../protocol/version.mjs";\nimport { endpoint } from "./http.mjs";\n\nexport const describe = () => `${VERSION}: ${endpoint()}`;\n')
      .write('config/plans/limits.py', 'from config.catalog.limits import MAX_BATCH\nfrom .batch import batch_size\n\n\ndef spare():\n    return MAX_BATCH - batch_size()\n')
      .write('engine/filter/budget.c', '#include "wire/frame.h"\n#include "filter/policy.h"\n\nint budget(int samples) { return frame_size(samples) + SAMPLE_BYTES; }\n')
      .edit('engine/CMakeLists.txt', source('filter', 'filter/budget.c'));
    pr.commit('Add transport descriptions and batch budgets');
    return pr.ci();
  });
  caught('CI fails on a new JavaScript dependency', () => pr
    .write('control/protocol/endpoint.mjs', 'import { endpoint } from "../transport/http.mjs";\n\nexport const pingUrl = () => `${endpoint()}/ping`;\n'));
  caught('CI fails on a new Python dependency', () => pr
    .write('config/catalog/tuning.py', 'import config.plans.batch as batch\n\n\ndef preferred_size():\n    return batch.batch_size()\n'));
  caught('CI fails on a new C dependency', () => pr
    .write('engine/wire/queue.c', '#include "gateway/runtime.h"\n\nint queue_capacity(void) { return QUEUE_DEPTH; }\n')
    .edit('engine/CMakeLists.txt', source('wire', 'wire/queue.c')));
  caught('CI fails on a second break from the same file', () => pr
    .edit('control/protocol/labels.mjs', text => 'import { ACCENT } from "../console/theme.mjs";\n' + text + '\nexport const labelColor = () => ACCENT;\n'));
  caught('CI fails when a break moves to another part', () => pr
    .edit('control/protocol/labels.mjs', text => text.replace('import { DISPLAY_UNIT } from "../console/settings.mjs";', 'const DISPLAY_UNIT = "samples";'))
    .edit('control/transport/http.mjs', text => 'import { DISPLAY_UNIT } from "../console/settings.mjs";\n' + text + '\nexport const unit = () => DISPLAY_UNIT;\n'));
  probe('CI fails when refresh-debt adds permission on a pull request', 'caught', () => {
    pr.branch('grow').write('config/catalog/region.py', 'from config.provision.settings import REGION\n\n\ndef region_label():\n    return REGION.upper()\n');
    pr.make('refresh-debt');
    pr.commit('Add region labels and refresh debt');
    pr.edit('control/protocol/version.mjs', text => text + '\nexport const MAX_FRAME = 512;\n');
    pr.commit('Add a frame limit');
    return pr.ci();
  });
  let shrunk = null;
  probe('CI passes after removing a break and running refresh-debt', 'pass', () => {
    pr.branch('shrink').write('config/catalog/defaults.py', 'def default_region():\n    return "eu"\n');
    const made = pr.make('refresh-debt');
    if (made.code !== 0) throw new Error(`make refresh-debt exit ${made.code}: ${made.output}`);
    shrunk = pr.commit('Keep the default region in catalog');
    return pr.ci();
  });
  probe('CI fails when the removed break returns', 'caught', () => {
    if (!shrunk) throw new Error('The shrink probe made no commit');
    pr.branch('restore', shrunk).write('config/catalog/defaults.py', 'from config.provision.settings import REGION\n\n\ndef default_region():\n    return REGION\n');
    pr.commit('Read the provision region again');
    return pr.ci({ base: shrunk });
  });
} finally {
  pr.cleanup();
}
report();
