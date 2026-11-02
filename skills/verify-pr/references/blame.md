# Run the same steps on the base and the head

Use two worktrees, so that the base and the head run side by side with the same
data. Give each app its own port.

```sh
git fetch origin
head=$(git rev-parse <head ref>)
base=$(git merge-base "origin/<target branch>" "$head")
git worktree add --detach "${TMPDIR:-/tmp}/verify-base" "$base"
git worktree add --detach "${TMPDIR:-/tmp}/verify-head" "$head"
```

In each worktree, install the dependencies with the lock file, start the app,
and run the same steps. Write down each command and its output.

```sh
git worktree remove --force "${TMPDIR:-/tmp}/verify-base"
git worktree remove --force "${TMPDIR:-/tmp}/verify-head"
```

Remove both worktrees and stop each process that you started before you
report.
