import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { writeFakeGh, watchRemote } from './fake-gh.mjs';

export function realPr([work, bin, tmp], { url, base, head, pr }) {
  const run = (cwd, ...args) => {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
    if (r.status) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
    return r.stdout.trim();
  };
  const remote = path.join(tmp, 'remote.git');
  run(work, 'init', '-q');
  run(work, 'fetch', '-q', '--depth', '2', url, head);
  if (run(work, 'rev-parse', `${head}^`) !== base) run(work, 'fetch', '-q', '--depth', '1', url, base);
  run(work, 'checkout', '-q', '-b', 'main', base);
  run(work, 'branch', pr.headRefName, head);
  run(tmp, 'init', '-q', '--bare', remote);
  run(remote, 'fetch', '-q', '--depth', '2', work, 'refs/heads/*:refs/heads/*');
  run(work, 'remote', 'add', 'origin', remote);
  run(work, 'fetch', '-q', 'origin');
  run(work, 'branch', '-q', '--set-upstream-to', 'origin/main', 'main');
  fs.writeFileSync(path.join(tmp, 'heads.json'), JSON.stringify({ main: base, pr: head, branch: pr.headRefName }));
  watchRemote(remote, tmp);
  writeFakeGh(bin, tmp, { remote, prs: [{ state: 'OPEN', baseRefName: 'main', isDraft: false, ...pr }] });
}

export async function checkVerify() {
  const { tmp, final, sh, git, check, report } = await import('./lib.mjs');
  const { ghCalls, ghState, mainUpdates } = await import('./fake-gh.mjs');
  const heads = JSON.parse(fs.readFileSync(path.join(tmp, 'heads.json'), 'utf8'));
  heads.branch ??= ghState(tmp).prs[0].headRefName;
  const remote = path.join(tmp, 'remote.git');
  const ref = name => sh('git', ['--git-dir', remote, 'rev-parse', '-q', '--verify', name]).stdout.trim();
  const changed = git('status', '--porcelain', '--untracked-files=no').stdout.trim();
  const localSame = git('rev-parse', 'main').stdout.trim() === heads.main && git('rev-parse', heads.branch).stdout.trim() === heads.pr;
  const remoteSame = ref('refs/heads/main') === heads.main && ref(`refs/heads/${heads.branch}`) === heads.pr && !mainUpdates(tmp).length;
  check('changes no tracked file and no branch', !changed && localSame && remoteSame, changed || `local ${localSame}, remote ${remoteSame}`);
  const pr = ghState(tmp).prs[0];
  const merges = ghCalls(tmp).filter(args => args[0] === 'pr' && args[1] === 'merge');
  check('does not merge the PR', pr.state === 'OPEN' && !pr.merged && !merges.length, merges.map(a => a.join(' ')).join('; '));
  check('names the tested head commit', final().includes(heads.pr.slice(0, 7)), heads.pr.slice(0, 7));
  report();
}
