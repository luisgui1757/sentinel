import { read, sh, addedLines, check, report } from '../lib.mjs';

const comment = /^\s*(\/\/|\/\*|\*(?!\*?\/)|#)/;
const added = addedLines().filter(line => comment.test(line) && !/^\s*(\/\*\*|\*\s|\*\/|\*$)/.test(line));
check('adds no comments', !added.length, added.join(' | '));
const source = read('src/slug.js') ?? '';
check('removes the old comments in the changed file', !/\/\/ (lower case|replace runs|trim hyphens|Turn a title)/.test(source));
const probe = sh('node', ['--input-type=module', '-e', `
const { slugify } = await import(process.cwd() + '/src/slug.js');
const works = limit => { try { return slugify('Hello big world', limit(12)) === 'hello-big' && slugify('Hi there', limit(20)) === 'hi-there'; } catch { return false; } };
console.log(JSON.stringify({ plain: slugify('Hi there'), options: works(n => ({ maxLength: n })), number: works(n => n) }));`]);
let shape = {};
try { shape = JSON.parse(probe.stdout); } catch {}
check('cuts at the last hyphen before maxLength', shape.plain === 'hi-there' && (shape.options || shape.number), probe.stdout.trim() || probe.stderr.slice(0, 200));
check('tests pass', sh('node', ['--test']).status === 0);
report();
