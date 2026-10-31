import { final, git, read, skillFiles, check, note, report } from '../lib.mjs';

note('says that two workers can hold the lease', /\byes\b|can (both )?hold|both (workers )?(hold|get|acquire)|two workers (can|could)|held by two/i.test(final()));
const skills = skillFiles();
const docs = ['AGENTS.md', 'CLAUDE.md', 'README.md'].map(read).filter(Boolean).join('\n');
const original = { test: 'node --test' };
const scripts = Object.entries(JSON.parse(read('package.json') ?? '{}').scripts ?? {}).filter(([name, value]) => original[name] !== value).map(([name]) => name);
check('gives agents a way to run the check again', skills.length > 0 || scripts.length > 0 || /\b(node|bash|sh|python3?) [\w./-]+|npm (run )?[\w:-]+|\.\/[\w./-]+\.(m?js|sh)\b|java |tlc\b/i.test(docs),
  skills.join(', ') || scripts.join(', ') || 'docs only');
const added = git('status', '--porcelain', '--untracked-files=all').stdout.split('\n').map(l => l.slice(3)).filter(f => f && !/^(src|test)\//.test(f) && !/skills\//.test(f));
check('adds a model or a checker outside src and test', added.length > 0, added.join(', '));
report();
