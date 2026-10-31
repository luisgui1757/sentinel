import path from 'node:path';
import { work, read, check, report, steHardFaults } from '../lib.mjs';

const text = read('CACHE.md') ?? '';
check('CACHE.md changed', text && !text.includes('It should be noted'));
const facts = { 'flush every 15 minutes': /15 minutes/, 'keys expire after 24 hours': /24 hours/, 'CACHE_TTL': /CACHE_TTL/,
  'Redis 7.2 or later': /7\.2/, '512 MB ceiling': /512\s*MB/, 'ask the platform team': /platform team/i,
  'database fallback': /database/i, 'alert after 10 minutes': /10 minutes/ };
for (const [name, pattern] of Object.entries(facts)) check(`keeps ${name}`, pattern.test(text));
const faults = steHardFaults(path.join(work, 'CACHE.md'));
check('ste-lint finds no hard faults', faults === 0, `${faults} hard faults`);
report();
