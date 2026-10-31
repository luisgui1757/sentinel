import { git, check, report } from '../lib.mjs';

const changed = git('status', '--porcelain', '--untracked-files=all').stdout.trim();
check('changes no file', changed === '', changed);
report();
