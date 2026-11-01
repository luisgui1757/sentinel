import fs from 'node:fs';
import path from 'node:path';

const rules = [
  { pattern: /console\.log\(/, message: 'Use log() from src/log.js, not console.log.' },
];

const files = fs.readdirSync('src', { recursive: true }).filter(f => f.endsWith('.js')).map(f => path.join('src', f));
let failed = 0;
for (const file of files) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    for (const rule of rules) if (rule.pattern.test(line)) { console.error(`${file}:${i + 1}: ${rule.message}`); failed++; }
  });
}
process.exit(failed ? 1 : 0);
