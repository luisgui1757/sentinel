---
name: cleanup
description: Finds the worktrees, local branches, remote branches and pull requests that past work left in a repository, removes the ones that are safe to remove, and reports the others. Use when the user asks to clean up, tidy or prune branches, worktrees or PRs, or says that a repository has too many of them.
---

# Cleanup

Remove what past work left in a repository. Remove only the items that are
safe to remove. Report each other item with the reason that you kept it. This
skill is the permission to delete the safe items.

## 1. Collect

Change nothing in this step. Run:

- `git worktree list --porcelain`
- `git branch --format='%(refname:short) %(objectname:short) %(upstream:short) %(upstream:track)'`
- `git ls-remote --heads origin`
- `gh pr list --state all --limit 300 --json number,state,author,headRefName,updatedAt,url`
- `gh api repos/{owner}/{repo} --jq .delete_branch_on_merge`
- `git stash list`

A squash merge does not make the branch an ancestor of the default branch. So
use the state of the PR to find merged work, not only `git branch --merged`.

## 2. Classify

| Item | Safe to remove when | Keep and report when |
|---|---|---|
| Worktree | Its branch has a merged or closed PR, or the default branch contains it, and it has no changes to tracked files. | It has changes to tracked files or an open PR, or a session uses it now. |
| Local branch | Its PR merged or closed, or the default branch contains it, and each of its commits is on the remote. | It has commits that are on no remote. |
| Remote branch | Its PR merged, or its PR closed and you are the author. | It has an open PR or no PR, or another person closed it. |
| Pull request | Never in this skill. | It had no update for 30 days, or a newer PR replaces it. |
| Stash | Never in this skill. | Always. Other worktrees share the stash list. |

Never remove the default branch, the current branch, the main worktree or the
worktree that you run in. Take each path from `git worktree list`. Do not type
a path by hand.

## 3. Remove the safe items

- Worktree: `git worktree remove <path>`. If only untracked files stop it,
  name the files in the report, then use `--force`. Then run
  `git worktree prune`.
- Local branch: record its SHA, then run `git branch -D <name>`.
- Remote branch: `git push origin --delete <name>`.
- Stale tracking refs: `git fetch --prune origin`.

## 4. Find the cause

If `delete_branch_on_merge` is `false`, tell the user. Give this command to
turn it on: `gh api -X PATCH repos/{owner}/{repo} -f delete_branch_on_merge=true`.
Run it only when the user asks, because it changes a repository setting.

## Report

- Each item that you removed. For each local branch, give its SHA, so that
  `git branch <name> <sha>` can restore it.
- Each item that you kept, with its reason.
- Each stash, with its message.
- Each open PR that is stale or replaced, with its link and your
  recommendation.
- A remote branch of a merged or closed PR can come back from the PR page.
