import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawnSync } from 'node:child_process';

const work = process.argv[2];
const git = (...args) => { const r = spawnSync('git', args, { cwd: work, encoding: 'utf8' }); if (r.status) throw new Error(r.stderr); };
const write = (file, text) => { fs.mkdirSync(path.dirname(path.join(work, file)), { recursive: true }); fs.writeFileSync(path.join(work, file), text); };
const source = fs.readFileSync(path.join(import.meta.dirname, '../create-verification-http/files/server.js'), 'utf8');
git('init', '-q');
write('AGENTS.md', '# Notes API\n\nUse the verify-notes skill to prove a change.\n');
write('package.json', '{ "name": "notes-api", "type": "module", "scripts": { "start": "node server.js" } }\n');
write('server.js', source);
const skill = '.agents/skills/verify-notes';
write(`${skill}/SKILL.md`, `---
name: verify-notes
description: Prove that the Notes API works by running it and calling its HTTP routes. Use after each change to server.js.
---

# Verify the Notes API

## Launch

Run \`PORT=4517 NOTES_FILE=$(mktemp -d)/notes.json node server.js &\` and keep its process ID. It is ready when \`curl -s localhost:4517/health\` returns \`{"ok":true}\`.

## Doctor

\`curl -s localhost:4517/health\` must return \`{"ok":true}\`.

## Drive

Use \`curl\` against \`localhost:4517\`. The feature map in \`features/\` lists each route.

## Evidence

Save each response body to a temporary folder outside the repo.

## Cleanup

Kill the process ID that Launch recorded. Do not kill by name.
`);
write(`${skill}/features/README.md`, '# Features\n\n- [List notes](list-notes.md)\n- [Create a note](create-note.md)\n');
write(`${skill}/features/list-notes.md`, '# List notes\n\n## Sub-features\n\nNone.\n\n## How to get to it (user POV)\n\n`GET /notes` returns all notes.\n\n## Driving it with curl\n\n`curl -s localhost:4517/notes` returns a JSON array.\n\n## Gotchas\n\nNone.\n');
write(`${skill}/features/create-note.md`, '# Create a note\n\n## Sub-features\n\nNone.\n\n## How to get to it (user POV)\n\n`POST /notes` with `{"text": "..."}` creates a note.\n\n## Driving it with curl\n\n`curl -s -X POST localhost:4517/notes -d \'{"text":"café"}\'` returns the new note with status 201. Text with accents works.\n\n## Gotchas\n\nAn empty text returns 400.\n');
const port = await new Promise(resolve => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
for (const file of fs.readdirSync(path.join(work, skill), { recursive: true })) {
  const full = path.join(work, skill, file);
  if (fs.statSync(full).isFile()) fs.writeFileSync(full, fs.readFileSync(full, 'utf8').replaceAll('4517', String(port)));
}
git('add', '-A'); git('commit', '-qm', 'Add the Notes API and its verify skill');
let next = source.replace("req.method === 'GET' && req.url === '/notes'", "req.method === 'GET' && req.url === '/api/notes'");
git('add', '-A');
write('server.js', next);
git('add', '-A'); git('commit', '-qm', 'Move the note list under /api');
next = next.replace("  send(404, { error: 'not found' });", `  const remove = req.url.match(/^\\/notes\\/(\\d+)$/);
  if (req.method === 'DELETE' && remove) {
    const notes = load();
    const kept = notes.filter(note => note.id !== Number(remove[1]));
    if (kept.length === notes.length) return send(404, { error: 'not found' });
    save(kept);
    return send(204, {});
  }
  send(404, { error: 'not found' });`);
write('server.js', next);
git('add', '-A'); git('commit', '-qm', 'Let users delete a note');
next = next.replace("    const text = JSON.parse(body || '{}').text;", "    const text = Buffer.from(JSON.parse(body || '{}').text ?? '', 'ascii').toString('ascii') === JSON.parse(body || '{}').text ? JSON.parse(body || '{}').text : null;\n    if (text === null) { res.writeHead(500); return res.end(); }");
write('server.js', next);
git('add', '-A'); git('commit', '-qm', 'Normalize note text');
next = next.replace('process.env.PORT ?? 3000', 'process.env.NOTES_PORT ?? 3000');
write('server.js', next);
git('add', '-A'); git('commit', '-qm', 'Read the port from NOTES_PORT');
