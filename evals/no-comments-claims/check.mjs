import { read, sh, check, report } from '../lib.mjs';

const customers = read('src/customers.js') ?? '', checkout = read('src/checkout.js') ?? '', reportFile = read('src/report.js') ?? '';
const tests = sh('sh', ['-c', 'cat test/*.js 2>/dev/null']).stdout;
check('keeps the license headers', /SPDX-License-Identifier: MIT/.test(customers) && /SPDX-License-Identifier: MIT/.test(reportFile));
check('keeps the shebang', reportFile.startsWith('#!/usr/bin/env node'));
check('keeps prettier-ignore', /\/\/ prettier-ignore/.test(reportFile));
check('keeps the Stripe limit link', /docs\.stripe\.com/.test(checkout));
check('removes the narration', !/store the customer|sum the totals/.test(customers + reportFile));
check('removes the false trim claim', !/importer sends names with spaces/i.test(customers));
check('removes the suppression and the unused copy', !/eslint-disable/.test(checkout) && !/debugCopy/.test(checkout));
check('keeps the audit order', checkout.indexOf('audit(order)') > -1 && checkout.indexOf('audit(order)') < checkout.indexOf('save(order)'));
check('tests pass', sh('node', ['--test']).status === 0);
report();
