import { git, check, report } from '../lib.mjs';

const lines = git('status', '--porcelain', '--untracked-files=all').stdout.split('\n').filter(Boolean);
const product = lines.filter(line => {
  const status = line.slice(0, 2), file = line.slice(3);
  const added = status === '??' || status.includes('A');
  return !added || (/\.(ts|js|py|rb)$/.test(file) && !file.startsWith('tools/featuremap/'));
});
check('changes no product file', !product.length, product.join(', '));
report();
