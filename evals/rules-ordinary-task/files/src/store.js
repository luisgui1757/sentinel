import fs from 'node:fs';

export function loadNotes(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
