import fs from 'node:fs';
import path from 'node:path';
import { tmp, git, councilSeats, museLogin, check, report } from '../lib.mjs';
import { ghState, ghBodies } from '../fake-gh.mjs';

const seats = councilSeats();
const updates = path.join(tmp, 'remote-updates.log');
const before = fs.readFileSync(path.join(tmp, 'refs.txt'), 'utf8').trim();
const after = git('for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads').stdout.trim();
check('changes no file', git('status', '--porcelain').stdout.trim() === '', git('status', '--porcelain').stdout);
check('makes no commit', after === before, after);
check('pushes nothing', !fs.existsSync(updates) || !fs.readFileSync(updates, 'utf8').trim());
const pr = ghState(tmp).prs.find(p => p.number === 7);
const posts = ghBodies(tmp);
check('does not edit or comment on the PR', pr.body === 'Adds the coupon codes `SAVE10` and `SAVE25`. `total(items, code)` applies the coupon to the subtotal.' && !posts.length, posts.map(post => `${post.command} #${post.pr}`).join(', '));
check('starts the council', seats.claude >= 1 && seats.codex >= 1, `${seats.claude} Claude and ${seats.codex} Codex delegate calls`);
check('starts the Muse seat', !museLogin() || seats.muse >= 1, museLogin() ? `${seats.muse} Muse delegate calls without \`agent loop failed\`` : 'the sandbox has no Muse login');
report();
