---
name: council
description: Trigger this if the user says 'council' or 'arena'.
---

# Council

Bring in delegates to help with the user's request, usually for review or
feedback. By default, use Claude Opus and GPT Sol, in their latest versions,
one seat each, at high reasoning effort. Start a delegate for each seat, also
for the model that you run on. If the user names members, use only those, one
seat each. If the user asks for more seats than members, fill the extra seats
with copies, in the order of the user's list. Report a named member that you
cannot reach. If you can reach only one model family, report it. Do not
substitute a model.

In T3 Code, use `orchestrator_capabilities` to resolve the models, then
`delegate_task` to start one delegate per seat in parallel. Elsewhere, use
the harness's subagent tools when they can run the model. Otherwise start each
delegate as a background command with a CLI that runs the model. Set `<effort>` to `high`, unless the
user names another effort:

| CLI | Read-only command |
| --- | --- |
| Claude Code | `claude -p --model <id> --effort <effort> --permission-mode plan` (brief on stdin) |
| Codex | `codex exec --sandbox read-only --model <id> -c model_reasoning_effort=<effort> -` (brief on stdin) |
| Copilot CLI | `copilot -p "<brief>" -s --model <id> --effort=<effort> --allow-tool 'read,shell(git diff:*),shell(git status:*),shell(git log:*),shell(git show:*)'` |
| OpenCode | `opencode run --agent plan --model <provider>/<id> --variant <effort> "<brief>"` |
| Kiro CLI | `kiro-cli chat --no-interactive --agent <name> --effort <effort> "<brief>"`, with the model in the agent file |

Copilot CLI and OpenCode can run models from several model families. Before
you decide that a family is out of reach, check which of these CLIs are on the
`PATH`.

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

## Design mode

Use this mode when the user asks the council to design, plan or choose an
approach, or says "arena".

1. Write the task and 3 to 6 criteria that a good plan meets. Give each
   delegate the task, not the criteria.
2. Each delegate writes its own plan, read-only. Delegates do not see the
   other plans.
3. Start one judge from a model family other than yours. Give it the criteria
   and the plans, with labels such as "Plan A" and no model names. It scores
   each plan against each criterion. If the user named the members and none of
   them is from another family, do not start a judge, and say so.
4. Read each plan in full and score it yourself. If you and the judge pick
   different plans, read both reasons before you decide.
5. Take the best plan as the base. Add the strong parts of the other plans to
   it, and give the source of each part.
6. Show the criteria, the scores, the merged plan with the source of each
   part, and the parts that you rejected. Build it only when the user asks.
