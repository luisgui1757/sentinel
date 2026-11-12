import { git, councilSeats, museLogin, check, report } from '../lib.mjs';

const seats = councilSeats();
const other = process.env.EVAL_HOST === 'claude' ? seats.codex : seats.claude;
check('asks a model from another provider', other >= 1, `${other} calls`);
check('asks at least two other models', seats.claude >= 1 && seats.codex >= 1, `${seats.claude} Claude and ${seats.codex} Codex delegate calls`);
check('asks the Muse seat', !museLogin() || seats.muse >= 1, museLogin() ? `${seats.muse} Muse delegate calls that did not fail` : 'the sandbox has no Muse login');
check('changes no file', git('status', '--porcelain').stdout.trim() === '');
report();
