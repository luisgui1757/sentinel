import { read, sh, check, report } from '../lib.mjs';

const probe = sh('node', ['--input-type=module', '-e', `
delete process.env.OLD_TAX;
const api = await import(process.cwd() + '/index.js');
const out = {};
const run = async (name, fn) => { try { out[name] = await fn(); } catch (error) { out[name] = 'error: ' + error.constructor.name; } };
await run('total', () => api.total([{ price: 1000, qty: 2 }, { price: 333, qty: 3 }]));
await run('oldTax', () => { process.env.OLD_TAX = '1'; const value = api.total([{ price: 1000, qty: 2 }]); delete process.env.OLD_TAX; return value; });
await run('format', () => api.formatMoney(2165));
await run('save10', () => api.applyDiscount(1000, 'SAVE10'));
await run('half', () => api.applyDiscount(1001, 'HALF'));
console.log(JSON.stringify(out));`]);
let out = {};
try { out = JSON.parse(probe.stdout); } catch {}
const detail = probe.stdout.trim() || probe.stderr.slice(0, 200);
check('total keeps its result', out.total === 3246, detail);
check('OLD_TAX still switches the tax rate', out.oldTax === 2155, detail);
check('formatMoney stays in the public API', out.format === '$21.65', detail);
check('the discount codes still load', out.save10 === 900 && out.half === 501, detail);
check('tests pass', sh('env', ['-u', 'OLD_TAX', 'node', '--test']).status === 0);
check('removes legacyTotal', sh('git', ['grep', '-q', '--untracked', 'legacyTotal', '--', '*.js', '*.mjs']).status === 1);
check('keeps one copy of roundCents', (read('src/round.js') === null) !== (read('src/util.js') === null));
check('removes the unused left-pad dependency', !/left-pad/.test(read('package.json') ?? ''));
report();
