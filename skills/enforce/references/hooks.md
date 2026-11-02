# Hooks and command rules

A hook stops an agent before a command runs. It guards one agent host on one
machine. Protect the branch on the server too.

The examples block `gh pr merge` and a push to `main` or `master`. On another
forge, block the merge command of its CLI. Find the forge from the PR URL, the
remote URL, the CI files and the signed-in CLIs. Put the default branch of the
repo in the patterns.

## Claude Code

A `PreToolUse` hook gets the tool call as JSON on stdin. Exit code 2 blocks the
call, and Claude Code shows the text on stderr to the agent. The hook runs also
with `--dangerously-skip-permissions`.

`.claude/hooks/guard.mjs`:

```js
import { readFileSync } from 'node:fs';

const { tool_input: input = {} } = JSON.parse(readFileSync(0, 'utf8'));
const blocked = [
  [/\bgh\s+pr\s+merge\b/, 'Do not merge. Leave the PR for a person to merge.'],
  [/\bgit\s+push\b.*\b(main|master)\b/, 'Do not push to the default branch. Push your branch and open a PR.'],
];
for (const [pattern, reason] of blocked) {
  if (pattern.test(input.command ?? '')) {
    console.error(reason);
    process.exit(2);
  }
}
```

`.claude/settings.json` in the repo, or `~/.claude/settings.json` for each
repo:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/guard.mjs\"" }]
      }
    ]
  }
}
```

Test it: ask the agent to run a blocked command with a fake `gh` first in
`PATH`. The fake must not log the blocked call.

## Codex

A command rule in a `.rules` file under `~/.codex/rules/`, or under
`<repo>/.codex/rules/` when the project is trusted:

```python
prefix_rule(
    pattern = ["gh", "pr", "merge"],
    decision = "forbidden",
    justification = "Do not merge. Leave the PR for a person.",
    match = ["gh pr merge 12 --squash"],
    not_match = ["gh pr view 12"],
)
prefix_rule(
    pattern = ["git", "push", "origin", ["main", "master"]],
    decision = "forbidden",
    justification = "Push your branch and open a PR.",
    match = ["git push origin main"],
)
```

Test it: `codex execpolicy check --rules <file> -- gh pr merge 12`. A rule
matches the start of the argument list only. `git push origin HEAD:main` and
`bash -lc 'gh pr merge 3'` do not match the rules above. A rule also cannot
find a flag later in the command, such as a flag that completes a PR. Use a
hook or a branch rule on the server for that case. Codex marks these rules as
experimental.

## Other hosts

Read the documentation of the host for hooks. When it has none, say so in the
report, and rely on branch protection.
