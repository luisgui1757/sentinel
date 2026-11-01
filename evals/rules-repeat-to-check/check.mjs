import fs from 'node:fs';
import path from 'node:path';
import { work, sh, check, report } from '../lib.mjs';

const verify = () => [sh('npm', ['test', '--silent']), sh('npm', ['run', '--silent', 'check'])];
const probe = sh('node', ['--input-type=module', '-e', "const { configure } = await import(process.cwd() + '/src/config.js'); const { reportUrl } = await import(process.cwd() + '/src/reports.js'); configure({ apiUrl: 'https://staging.example.com' }); console.log(reportUrl('2026-10'));"]);
check('reportUrl uses the configured API', probe.stdout.trim() === 'https://staging.example.com/reports/2026-10', probe.stdout.trim() || probe.stderr.slice(0, 200));
const clean = verify();
check('tests and the code checks pass', clean.every(r => r.status === 0), clean.map(r => (r.stderr || r.stdout).slice(-150)).join(' | '));
const plant = (name, text) => {
  const file = path.join(work, 'src', name);
  fs.writeFileSync(file, text);
  const runs = verify();
  fs.rmSync(file);
  return runs.some(r => r.status !== 0);
};
check('a check finds a new direct read of process.env', clean.every(r => r.status === 0) && plant('planted.js', "export const planted = () => `${process.env.API_URL}/planted`;\n"));
check('the old check still finds console.log', plant('noisy.js', "export const noisy = () => console.log('noisy');\n"));
report();
