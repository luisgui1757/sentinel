---
name: council
description: Trigger this if the user says 'council'.
---

# Council

Bring in three delegates to help with the user's request, usually for review
or feedback. Use one strong model from each of three different providers, at
high reasoning effort. If the user's instructions name council members, use
those. Otherwise pick the latest flagship model from each provider, for
example Claude Opus, GPT Sol, and Gemini Pro.

Start one delegate per model in parallel. Use the harness's subagent tools
when they can run the model. Otherwise start each delegate as a background
command with a CLI that runs the model. Set `<effort>` to `high`, unless the
user names another effort:

| CLI | Read-only command |
| --- | --- |
| Claude Code | `claude -p --model <id> --effort <effort> --permission-mode plan` (brief on stdin) |
| Codex | `codex exec --sandbox read-only --model <id> -c model_reasoning_effort=<effort> -` (brief on stdin) |
| Copilot CLI | `copilot -p "<brief>" -s --model <id> --effort=<effort> --allow-tool 'read,shell(git diff:*),shell(git status:*),shell(git log:*),shell(git show:*)'` |
| OpenCode | `opencode run --agent plan --model <provider>/<id> --variant <effort> "<brief>"` |
| Kiro CLI | `kiro-cli chat --no-interactive --agent <name> --effort <effort> "<brief>"`, with the model in the agent file |

Copilot CLI and OpenCode can run models from several providers. If you cannot
reach three providers, or a named member is unavailable, report it instead of
substituting.

Give each delegate the request and relevant context. For review or feedback,
keep their work read-only. Collect their responses and summarize the useful
findings, disagreements, and recommended next steps.

For a code review, ask each delegate for a score out of 10.
Count each full review pass as one round.
A fresh review after fixes starts a new round.

If the work ends in a pull request, put the results in the PR description.
Put this section before the model and harness line at the end:

```markdown
## Council review

Rounds: 2

| Delegate | Round 1 | Round 2 |
| --- | --- | --- |
| Claude Opus | 7/10 | 9/10 |
| GPT Sol | 8/10 | 10/10 |
| Gemini Pro | 7/10 | 9/10 |
```

If a delegate gives no score, write `no score`. Do not invent one.
If the PR is open, edit the description. Do not post a comment for this.
If there is no PR, put the same results in the final reply only.

If you agree with their recommendations, make the changes and request a fresh
review after. Continue this process until all delegates are satisfied with the
outcome, for at most 3 rounds. The user can set another limit in the request or
in their instructions. When the limit ends, report the open findings and let
the user decide.

Do not let repeated reviews result in scope creep. It is your job to fight to
keep scope limited.
