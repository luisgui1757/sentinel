import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const work = process.argv[2];
const git = (...args) => { const r = spawnSync('git', args, { cwd: work, encoding: 'utf8' }); if (r.status) throw new Error(r.stderr); };
git('init', '-q'); git('add', '-A'); git('commit', '-qm', 'Describe the page API');
fs.writeFileSync(path.join(work, 'src/range.js'), `export const PAGE_SIZE = 20;

export function range(start, end) {
  const out = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}

export async function loadPage(fetchPage, n) {
  const rows = fetchPage(n);
  return rows.map(row => row.id);
}
`);
git('add', '-A'); git('commit', '-qm', 'Add range and loadPage');
