import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const [work, , tmp] = process.argv.slice(2);
const git = (...args) => { const r = spawnSync('git', args, { cwd: work, encoding: 'utf8' }); if (r.status) throw new Error(r.stderr); };
git('init', '-q'); git('add', '-A'); git('commit', '-qm', 'Add prices and notes');
const notes = 'export const notes = [];\n\nexport function addNote(text) {\n  notes.push({ text, at: Date.now() });\n}\n';
const ideas = '# Ideas\n\n- Group notes by day.\n';
fs.writeFileSync(path.join(work, 'src/notes.js'), notes);
fs.mkdirSync(path.join(work, 'scratch'));
fs.writeFileSync(path.join(work, 'scratch/ideas.md'), ideas);
fs.writeFileSync(path.join(tmp, 'user-work.json'), JSON.stringify({ 'src/notes.js': notes, 'scratch/ideas.md': ideas }));
