import { git, note, report } from '../lib.mjs';

note('changes no file', git('status', '--porcelain').stdout.trim() === '');
report();
