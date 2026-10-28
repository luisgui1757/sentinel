#!/usr/bin/env node
// Runs only from the default branch. Imports are data; no upstream code runs here.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { run } from './upstream.mjs';

export async function propose({ command, update }) {
  const branch = 'codex/upstream-skills';
  if (command('git', ['status', '--porcelain']).trim()) throw new Error('Update checkout must be clean');
  const prs = JSON.parse(command('gh', ['pr', 'list', '--state', 'open', '--head', branch, '--json', 'number,isCrossRepository']));
  if (prs.some(pr => pr.isCrossRepository === false)) return 'An upstream update PR is already open; leave it for review';
  if (command('git', ['ls-remote', '--heads', 'origin', `refs/heads/${branch}`]).trim()) {
    throw new Error('Update branch already exists without an open PR; inspect it before retrying');
  }
  // A merge conflict still gets a draft PR, so that a person resolves it there.
  let conflicts = [];
  try { await update(); } catch (error) { if (!error.conflicts) throw error; conflicts = error.conflicts; }
  const paths = command('git', ['status', '--porcelain', '--untracked-files=all']).trim();
  if (!paths) return 'Upstream pins are current';
  command('git', ['switch', '-c', branch]);
  command('git', ['add', '--', 'upstream/imports.json', 'upstream/lock.json', 'skills']);
  command('git', ['-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com',
    'commit', '-m', 'chore(deps): update pinned upstream skills', '-m',
    'Import the selected upstream files at their new revisions. Require review and all checks before merging.']);
  command('gh', ['auth', 'setup-git']);
  command('git', ['push', '--set-upstream', 'origin', `HEAD:refs/heads/${branch}`]);
  const url = command('gh', ['pr', 'create', '--base', 'main', '--head', branch, '--draft',
    '--title', 'chore(deps): update pinned upstream skills', '--body',
    'Update the pinned sources and the files that Sentinel imports from them.\n\nReview the full diff, especially licenses, scripts and new skills. Approve workflow runs on this PR if GitHub requests it, resolve findings, and require all checks before marking it ready. No automatic merge or installation.'
    + (conflicts.length ? `\n\nThe upstream changes conflict with Sentinel edits in ${conflicts.map(file => `\`${file}\``).join(', ')}. Resolve the conflict markers, then run \`node tools/upstream.mjs --sync\`.` : '')]);
  return `Created draft update: ${url.trim()}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    if (process.env.GITHUB_REF !== 'refs/heads/main' || !['schedule', 'workflow_dispatch'].includes(process.env.GITHUB_EVENT_NAME)) {
      throw new Error('The update bot runs only on main, by schedule or manual dispatch');
    }
    const root = fileURLToPath(new URL('../', import.meta.url));
    const command = (name, args) => execFileSync(name, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    console.log(await propose({ command, update: () => run({ root, mode: 'update' }) }));
  } catch (error) { console.error(`upstream bot: ${error.message}`); process.exitCode = 1; }
}
