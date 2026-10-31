import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadNotes } from '../src/store.js';

test('loadNotes reads the notes', () => assert.equal(loadNotes(path.join(import.meta.dirname, '../data/notes.json')).length, 2));
