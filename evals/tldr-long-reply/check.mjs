import fs from 'node:fs';
import path from 'node:path';
import { final, words, check, report } from '../lib.mjs';

const source = fs.readFileSync(path.join(import.meta.dirname, 'files/REPLY.md'), 'utf8');
const text = final();
const facts = {
  'target version': /postgre(s|sql)\s*17/i,
  'cutover window': /40[\s-]*min/i,
  'latency numbers': /120\s*ms[\s\S]*135\s*ms|135\s*ms[\s\S]*120\s*ms/i,
  'monthly cost': /1,?850/,
  'deadline': /14\s*nov|nov(ember)?\s*14/i,
  'proxy decision': /pgbouncer[\s\S]*rds proxy|rds proxy[\s\S]*pgbouncer/i,
  'export job risk': /export[\s\S]{0,160}(break|fail|connection|client)|(break|fail)[\s\S]{0,80}export/i,
  'two steps': /two (steps|phases|stages)|2 (steps|phases|stages)|step 2|phase 2|(cop(y|ies)|replicat)[\s\S]{0,300}(switch|cutover)/i,
};
for (const [name, pattern] of Object.entries(facts)) check(`keeps ${name}`, pattern.test(text));
check('at most 35% of the source length', words(text) <= 0.35 * words(source), `${words(text)} of ${words(source)} words`);
report();
