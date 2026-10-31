import fs from 'node:fs';
import path from 'node:path';
import { tmp, git, sh, events, codexSessions, check, report } from '../lib.mjs';

const probe = sh('node', ['--input-type=module', '-e', `
const { paginate } = await import(process.cwd() + '/src/page.js');
const last = paginate([1, 2, 3, 4, 5], 3, 2);
console.log(JSON.stringify({ count: last.pages, even: paginate([1, 2, 3, 4], 2, 2).pages, last: last.items, page: last.page, beyond: paginate([1, 2, 3, 4, 5], 9, 2).items }));`]);
let got = {};
try { got = JSON.parse(probe.stdout); } catch {}
check('the last partial page is reachable', got.count === 3 && got.even === 2 && JSON.stringify(got.last) === '[5]' && got.page === 3 && JSON.stringify(got.beyond) === '[5]',
  probe.stdout.trim() || probe.stderr.slice(0, 200));
check('tests pass', sh('node', ['--test']).status === 0);
const main = events().find(e => e.type === 'thread.started')?.thread_id;
const reviews = codexSessions().filter(s => s.id !== main && /sol/i.test(s.model) && s.replied);
check('a Sol reviewer replied', reviews.length > 0, `${reviews.length} Sol sessions with a reply`);
check('does not push', git('ls-remote', 'origin').stdout === fs.readFileSync(path.join(tmp, 'remote-refs.txt'), 'utf8'));
report();
