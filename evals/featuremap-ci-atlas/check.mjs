import { check, report, pullRequests, productChanges } from '../lib.mjs';

const changed = productChanges(['packages/', 'pipeline/', 'native/', 'crates/'],
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
const baseline = () => {
  const made = pr.make('deps-baseline');
  if (made.code !== 0) throw new Error(`make deps-baseline exit ${made.code}: ${made.output}`);
};

try {
  probe('CI passes on main', 'pass', () => pr.branch('main-again').ci());

  probe('CI passes on a clean pull request', 'pass', () => {
    pr.branch('clean')
      .write('packages/editor/src/tools/base.ts', "export type Tool = { name: string };\n")
      .write('packages/editor/src/tools/pan.ts', "import { distance, type Point } from '@core/geometry';\nimport { drawLine } from '@atlas/renderer';\nimport type { Tool } from './base';\n\nexport const pan: Tool = { name: 'pan' };\n\nexport function panBy(canvas: HTMLCanvasElement, a: Point, b: Point) {\n  drawLine(canvas, a, b);\n  return distance(a, b);\n}\n")
      .write('packages/renderer/src/gl/viewport.ts', "import { clip } from '@gl/clip';\n\nexport const zoomLevel = (z: number) => clip(z, 0, 22);\n")
      .write('pipeline/src/pipeline/export/sizes.py', 'from pipeline.tiles.cut import TILE_SIZE\n\nfrom .formats import EXTENSION\n\n\ndef tile_name(x, y):\n    return f"{x // TILE_SIZE}_{y // TILE_SIZE}{EXTENSION}"\n')
      .write('native/cli/tools.cc', '#include <atlas/font.h>\n\nnamespace atlas {\ndouble label_width(const char *text) {\n  double w = 0;\n  for (; *text; ++text) w += em(advance(*text));\n  return w;\n}\n}\n')
      .edit('native/CMakeLists.txt', cmake('atlas', 'cli/tools.cc'))
      .edit('crates/server/src/main.rs', text => `${text}\n#[allow(dead_code)]\nfn warm(cache: &mut Cache) {\n    cache.put(0, 0, 0, Vec::new());\n}\n`);
    pr.commit('feat: pan tool, tile names and label width');
    return pr.ci();
  });

  caught('CI fails on a new TS import through a path alias', () => pr.write('packages/core/src/bounds.ts',
    "import { clip } from '@gl/clip';\n\nexport const clampLat = (lat: number) => clip(lat, -85, 85);\n"));

  caught('CI fails on a new dynamic import of a workspace package', () => pr.write('packages/renderer/src/labels.ts',
    "export async function labelFont(zoom: number) {\n  const fonts = await import('@atlas/editor/src/fonts');\n  return `${fonts.fontSize(zoom)}px ${fonts.FONT_FAMILY}`;\n}\n"));

  caught('CI fails on a second Python import from a package that already has a violation', () => pr.write('pipeline/src/pipeline/tiles/pack.py',
    'import pipeline.export.formats as formats\n\n\ndef pack(names):\n    return {"format": formats.FORMAT, "count": len(names)}\n'));

  caught('CI fails on a new C++ include through the include folders', () => pr
    .write('native/geom/src/label.cc', '#include <atlas/font.h>\n#include <atlas/geom.h>\n\nnamespace atlas {\ndouble label_gap(Point a, Point b) { return distance(a, b) - em(12); }\n}\n')
    .edit('native/CMakeLists.txt', cmake('geom', 'geom/src/label.cc')));

  caught('CI fails on a new workspace dependency between crates', () => pr
    .edit('crates/tilecache/Cargo.toml', text => `${text}style.workspace = true\n`)
    .edit('crates/tilecache/src/lib.rs', text => `${text}\npub fn border(key: u64) -> f32 {\n    style::line_width(key) * 2.0\n}\n`));

  caught('CI fails when a violation moves to another package', () => pr
    .edit('packages/plugins/measure/src/index.ts', text => text.replace("import { context } from '@gl/context';\n", '').replace('  context(canvas);\n', '  canvas.getContext(\'webgl2\');\n'))
    .edit('packages/renderer/src/draw.ts', text => text.replace("import { context } from '@gl/context';", "import { context } from '@gl/context';\nimport { FONT_FAMILY } from '@atlas/editor/src/fonts';")
      .replace('return { gl, length: distance(a, b) };', 'return { gl, length: distance(a, b), font: FONT_FAMILY };')));

  probe('CI fails when a pull request runs make deps-baseline to allow a new violation', 'caught', () => {
    pr.branch('grow').write('pipeline/src/pipeline/common/paths.py', 'from pipeline.tiles.cut import TILE_SIZE\n\n\ndef tile_path(z, x, y):\n    return f"{z}/{x * TILE_SIZE}/{y * TILE_SIZE}"\n');
    baseline();
    pr.commit('feat: tile paths');
    pr.edit('packages/core/src/units.ts', text => `${text}\nexport const KM = 1000;\n`).commit('feat: km');
    return pr.ci();
  });

  probe('CI passes after a violation is removed and make deps-baseline runs', 'pass', () => {
    pr.branch('shrink').write('native/text/src/glyph.cc', '#include <atlas/font.h>\n\nnamespace atlas {\nint glyph_alpha(char c) { return em(advance(c)) > 0.5 ? 255 : 0; }\n}\n');
    baseline();
    pr.commit('refactor: text computes its own alpha');
    return pr.ci();
  });
} finally {
  pr.cleanup();
}
report();
