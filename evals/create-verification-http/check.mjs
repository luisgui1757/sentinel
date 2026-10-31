import fs from 'node:fs';
import path from 'node:path';
import { work, read, skillFiles, processesIn, check, note, report } from '../lib.mjs';

const skills = skillFiles();
const docs = ['AGENTS.md', 'CLAUDE.md', 'README.md'].map(read).filter(Boolean).join('\n');
const original = { start: 'node server.js' };
const scripts = Object.entries(JSON.parse(read('package.json') ?? '{}').scripts ?? {}).filter(([name, value]) => original[name] !== value).map(([name]) => name);
check('gives agents a way to find the check', skills.length > 0 || scripts.length > 0 || /\b(node|bash|sh|python3?) [\w./-]+|npm (run )?[\w:-]+|\.\/[\w./-]+\.(m?js|sh)\b/.test(docs.replace('`npm start`', '')),
  skills.join(', ') || scripts.join(', ') || 'docs only');
const skill = skills[0] ? fs.readFileSync(path.join(work, skills[0]), 'utf8') : '';
if (skills.length) check('the skill has frontmatter with a name and a description', /^---\n[\s\S]*name:\s*\S+[\s\S]*description:[\s\S]*?\n---/.test(skill));
const dir = skills[0] ? path.dirname(path.join(work, skills[0])) : null;
const features = dir && fs.existsSync(path.join(dir, 'features')) ? fs.readdirSync(path.join(dir, 'features')) : [];
note('has a feature map with at least one feature', features.includes('README.md') && features.length >= 2, features.join(', '));
check('keeps the repo data file untouched', !fs.existsSync(path.join(work, 'data/notes.json')));
const left = processesIn(work);
check('no process from the run stays', !left.length, left.join(','));
report();
