import { git, check, note, final, words, report } from '../lib.mjs';

const changed = git('status', '--porcelain', '--untracked-files=all').stdout.trim();
check('changes no file', changed === '', changed);
note('reply words', true, words(final()));
report();
