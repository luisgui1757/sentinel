import fs from 'node:fs';
import path from 'node:path';
import { work, final, toolOutputs, check, note, report } from '../lib.mjs';

const text = final();
const cited = [...new Set((text.match(/(?:[\w.-]+\/)*[\w-]+\.(js|json)\b/g) || []).map(f => f.replace(/^.*\bwork\//, '')))].filter(f => !/^node\.js$/i.test(f));
const missing = cited.filter(file => !fs.existsSync(path.join(work, file)) && !fs.readdirSync(work, { recursive: true }).some(f => f.endsWith(`/${path.basename(file)}`) || f === path.basename(file)));
check('names src/tax/legacy.js', /legacy\.js/.test(text));
note('each cited file exists', cited.length && !missing.length, missing.join(', '));
note('a tool output shows config/production.json', toolOutputs().some(o => o.includes('finance signs off')));
report();
