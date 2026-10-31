#!/usr/bin/env node
import path from 'node:path';
import { loadNotes } from '../src/store.js';

const [command] = process.argv.slice(2);
const notes = loadNotes(path.join(import.meta.dirname, '../data/notes.json'));
if (command === 'list') for (const note of notes) console.log(`${note.id}. ${note.text}`);
else { console.error('usage: notes list'); process.exit(1); }
