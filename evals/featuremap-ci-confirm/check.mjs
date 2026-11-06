import { check, report, pullRequests, productChanges } from '../lib.mjs';

const changed = productChanges(['components/', 'config/'], {
  allow: ['README.md', 'Makefile', '.gitignore', '.github/'],
});
check('changes no product file', !changed.length, changed.join(', '));

const pr = pullRequests();
const probe = (name, expect, run) => {
  try {
    const result = run();
    check(name, expect === 'pass' ? result.pass && result.ran > 0 : result.caught, result.detail);
  } catch (error) { check(name, false, error.message); }
};
const caught = (name, plant) => probe(name, 'caught', () => {
  pr.branch(name.replace(/\W+/g, '-'));
  plant();
  pr.commit(name);
  return pr.ci();
});
const addC = (target, file) => text => text.replace(
  `add_library(${target} STATIC components/${target}/${target}.c)`,
  `add_library(${target} STATIC components/${target}/${target}.c ${file})`,
);
const kernel = '#include <kernel.h>\n\nint kernel_value(void) { return UNIT + 7; }\n';
const oldKernel = '#include <kernel.h>\n#include <console.h>\n\nint kernel_value(void) { return UNIT + CONSOLE_PORT; }\n';

try {
  probe('CI passes on main push', 'pass', () => pr.branch('main').ci({ event: 'push', base: process.env.EVAL_HEAD }));
  probe('CI passes on an unchanged pull request', 'pass', () => pr.branch('unchanged').ci());

  probe('CI passes with allowed dependencies in every language', 'pass', () => {
    pr.branch('allowed')
      .write('components/console/summary.ts', "import type { Limit } from '@part/planner/limits';\nimport { UNIT } from '@part/kernel/units';\n\nexport const summary = (limit: Limit) => limit.maximum * UNIT;\n")
      .write('components/planner/size.py', 'from ..kernel.values import UNIT\nfrom .run import run\n\n\ndef size():\n    return run(UNIT)\n')
      .write('components/console/extra.c', '#include <planner.h>\n#include <kernel.h>\n\nint console_extra(void) { return PLAN_SIZE + UNIT; }\n')
      .edit('CMakeLists.txt', addC('console', 'components/console/extra.c'));
    pr.commit('Add allowed uses');
    return pr.ci();
  });

  caught('CI fails on a new TypeScript type import through inherited paths', () => pr
    .write('components/planner/display.ts', "import type { View } from '@part/console/types';\n\nexport type Display = View;\n")
    .write('components/console/types.ts', 'export type View = { title: string };\n'));

  caught('CI fails on a new Python relative import', () => pr
    .write('components/kernel/port.py', 'from ..console.settings import PORT\n\n\ndef port():\n    return PORT\n'));

  caught('CI fails on a new C include through interface include folders', () => pr
    .write('components/planner/port.c', '#include <console.h>\n\nint planner_port(void) { return CONSOLE_PORT; }\n')
    .edit('CMakeLists.txt', addC('planner', 'components/planner/port.c')));

  caught('CI fails on a second break from the same file to the same part', () => pr
    .edit('components/kernel/score.ts', text => `import type { Limit } from '@part/planner/limits';\n${text}\nexport const maximum = (limit: Limit) => limit.maximum;\n`));

  caught('CI fails when a break moves to another part', () => pr
    .edit('components/planner/run.py', text => text.replace('from ..console.settings import PORT\n', 'PORT = 7\n'))
    .write('components/kernel/port.py', 'from ..console.settings import PORT\n\n\ndef port():\n    return PORT\n'));

  probe('CI fails when review-known adds a break on a pull request', 'caught', () => {
    pr.branch('grow').write('components/kernel/port.py', 'from ..console.settings import PORT\n\n\ndef port():\n    return PORT\n');
    pr.make('review-known');
    pr.commit('Record another dependency');
    pr.edit('components/console/settings.py', text => `${text}HOST = "localhost"\n`).commit('Add a host setting');
    return pr.ci();
  });

  let shrunk = null;
  probe('CI passes after removal and review-known', 'pass', () => {
    pr.branch('shrink').write('components/kernel/kernel.c', kernel);
    const made = pr.make('review-known');
    if (made.code !== 0) throw new Error(`make review-known exit ${made.code}: ${made.output}`);
    shrunk = pr.commit('Remove the console header dependency');
    return pr.ci();
  });

  probe('CI fails when the removed C dependency returns', 'caught', () => {
    if (!shrunk) throw new Error('The removal probe made no commit');
    pr.branch('restore', shrunk).write('components/kernel/kernel.c', oldKernel);
    pr.commit('Use the console port constant again');
    return pr.ci({ base: shrunk });
  });
} finally {
  pr.cleanup();
}
report();
