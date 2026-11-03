import fs from 'node:fs';
import path from 'node:path';
import { final, words, check, report } from '../lib.mjs';

const source = fs.readFileSync(path.join(import.meta.dirname, 'files/HOTFIX.md'), 'utf8');
const text = final().replace(/[*_]/g, '');
const facts = {
  'crash-free rate': /97\.1/,
  'rollout share': /\b20[\s-]*(%|percent)/i,
  'pinned version': /3\.2(?!\d)/,
  'beta version': /3\.4\.1/,
  'cache key change': /(cache|key)[^\n]{0,40}\b8\b(?!\s*%)|\b7\b[^\d\n]{1,15}\b8\b(?!\s*%)[^\n]{0,80}(cache|key)/i,
  'deadline': /\b24(th)?(\s*of)?\s*nov|nov\.?(ember)?\s*(the\s*)?24(th)?\b|\b11[-/]24\b|\b24[./]11\b/i,
  'QA doubt on Android 11': /android\s*11|tom[aá]s/i,
};
for (const [name, pattern] of Object.entries(facts)) check(`keeps ${name}`, pattern.test(text));
check('at most half of the source length', words(text) <= 0.5 * words(source), `${words(text)} of ${words(source)} words (${Math.round(100 * words(text) / words(source))}%)`);
report();
