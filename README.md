# Sentinel

Sentinel gives your coding agents one set of rules and a small set of skills.
It supports Codex, Claude Code, GitHub Copilot CLI, Kiro and OpenCode.

## Install

Clone the repository and run the installer for your hosts.

```sh
git clone https://github.com/luisgui1757/sentinel.git
cd sentinel
tools/install --global --hosts codex,claude --skills core,ui
```

On Windows, use PowerShell 7:

```powershell
pwsh -File tools/install.ps1 -Global -Hosts codex,claude -Skills core,ui
```

Windows PowerShell 5.1 also works. Run
`powershell -ExecutionPolicy Bypass -File tools\install.ps1` with the same
options.

Start a new agent session after the install.

| Option | Use |
|---|---|
| `--hosts` / `-Hosts` | `codex`, `claude`, `copilot`, `kiro`, `opencode`, or `all` |
| `--skills` / `-Skills` | `core`, `formal`, `ui`, `explain`, or a list. The default is `core`. Use `none` to install only the rules. |
| `--global` / `-Global` | Install into your user folder. |
| `--project DIR` / `-Project DIR` | Install into one repository. |
| `--no-rules` / `-NoRules` | Install only the skills. |
| `--check` / `-Check` | Report the files that differ from this checkout. |
| `--remove` / `-Remove` | Remove the rules and the skills that the installer wrote. |

The rules go into a managed block. The installer keeps the text outside the
block. It writes `.sentinel-owned` into each skill folder that it installs. It
does not replace a folder that it did not write or that somebody changed. When
Sentinel stops shipping a skill, the next run removes that folder, and
`--check` reports it as `RETIRED`.

The installer also takes over the skill folders of Sentinel v0.2.0 if nobody
changed them. `--check` reports these folders as `LEGACY`.

## Where the files go

| Host | Rules | Skills |
|---|---|---|
| Codex | `~/.codex/AGENTS.md` | `~/.agents/skills` |
| Claude Code | `~/.claude/CLAUDE.md` | `~/.claude/skills` |
| Copilot CLI | `~/.copilot/copilot-instructions.md` | `~/.agents/skills` |
| Kiro | `~/.kiro/steering/AGENTS.md` | `~/.kiro/skills` |
| OpenCode | `~/.config/opencode/AGENTS.md` | `~/.agents/skills` |

`CODEX_HOME`, `CLAUDE_CONFIG_DIR`, `COPILOT_HOME`, `KIRO_HOME` and
`XDG_CONFIG_HOME` change these folders. When the installer replaces a rules
file, the file keeps its mode. A project install writes the rules to `AGENTS.md`, and
`CLAUDE.md` imports that file. Project skills go to `.agents/skills`,
`.claude/skills` and `.kiro/skills`.

## Rules

`rules/AGENTS.md` holds the rules. They tell an agent to do these things:

- Change files only when the user asks for a change.
- Read the skill whose description fits the task before the task starts.
- Make the smallest complete change. Do not add layers, options or guards that
  the task does not need.
- Write no audit, findings, plan or handoff files.
- Leave the agent instruction files to the user.
- Add no comments to code, except the few that code cannot replace. Remove the
  other comments in each file that the agent changes.
- Remove the temporary files, worktrees, branches and stashes of a task before
  the task ends.
- Add a test only when it can find a real regression.
- Write all prose in ASD-STE100 Simplified Technical English. This does not
  limit the reasoning of the agent. Ask for plain prose to stop it in a
  session. To stop it in a repository, say so in its `AGENTS.md`.

## Skills

The `core` profile is for delivery, review, understanding and writing. An
agent can also load each skill when its description fits the task.

| Skill | Say | Result |
|---|---|---|
| `full-stop` | "full stop" | The agent stops when the pull request is ready for you to merge. |
| `sol-loop` | "sol loop" | GPT Sol reviews the change in a loop until both agents agree. |
| `council` | "council" | Claude Opus and GPT Sol review until they agree, for 3 rounds by default. Each model runs at high effort by default. Name other models, efforts or limits in the request. |
| `council` | "arena", or a design request to the council | Each model writes its own plan. A judge scores the plans without model names. The agent merges the best parts into one plan. |
| `file-pr` | "file a PR" | The agent files a short pull request. |
| `babysit-pr` | "babysit" | The agent watches CI and review bots and fixes real findings. |
| `takeover` | "take over" | The agent finishes the work of another person and keeps their credit. |
| `modernize` | "modernize" | The agent rebases an old pull request and asks if it still has a use. |
| `leaving-pr-comments` | (automatic) | The agent marks the comments that it writes for you. |
| `untangle` | "untangle" | The agent finds what a codebase does not need and proves each cut. |
| `cleanup` | "clean up the branches" | The agent removes merged worktrees and branches and reports the others. |
| `no-comments` | "remove the comments" | The agent removes comments that code can replace, and keeps the others with a reason. |
| `why` | "why is X like this" | The agent searches git, pull requests and your MCP servers, and gives the reason with a confidence level. |
| `tldr` | "tldr" | A short version that keeps each fact that you need to decide or act. |
| `technical-writing` | "simplify this", "STE" | Docs, PR text and rewrites in simple technical English, without AI patterns. |
| `create-verification-skill` | "make a verification skill" | The agent writes a project skill that starts the app and proves features the way a user does. |
| `maintain-verification-skill` | "check the verify skill" | The agent drives each feature again and fixes the skill where the app changed. |

At xhigh, `council`, `cleanup`, `no-comments`, `technical-writing` and the
rules for comments and cleanup changed the result on 4 or 5 models. `sol-loop`, `why` and the formal skills changed it on 2
or 3 models. `tldr` helped on GPT Sol only. `create-verification-skill` and
`how` showed no gain. See [evals/README.md](evals/README.md).

Sources: `untangle`, `cleanup`, `no-comments` and `tldr` are from
Sentinel. `how`, `why`, `technical-writing` and the verification skills are
from [pstack](https://github.com/cursor/plugins/tree/main/pstack). The other
skills are from [tstack](https://github.com/t3dotgg/tstack). Sentinel keeps
the T3 Code routes of tstack and adds a route for each other CLI.

The repository keeps tstack's `full-send` skill, but the installer does not
install it, because it merges without a person. `full-stop` reads a copy of
it and stops before the merge.

The `formal` profile is for code where events can occur in many orders, such
as locks, retries, queues and protocols. These skills are from pstack.

| Skill | Use |
|---|---|
| `create-formal-verification-skill` | A project skill that proves a rule of the code with a model checker or a prover |
| `maintain-formal-verification-skill` | Bring the model back in line with the code after the code changes |
| `statechart` | Check a TLA+ model with TLC and draw it as a Mermaid chart, with the shortest path to each state that breaks a rule |

`statechart` needs Node 22.18 or later, Bun or Deno. On the first run, it
installs Java and TLC with mise and needs the network. Set `TLA2TOOLS` and
`JAVA` to use your own copies. It does not run on Windows outside WSL.

The `explain` profile holds `how`: say "how does X work", and the agent
explains the code with the files that it read. In the evals, strong models
explained the code as well without it. It starts 1 to 5 subagents for each
question. Install it with `--skills core,explain` if you want its
delegated explanations.

The `ui` profile is for interface work.

| Skill | Use |
|---|---|
| `impeccable` | Design commands: craft, shape, critique, audit, layout, typeset, polish and more |
| `beast-ui` | One quality pass before handoff: audit, layout, typeset, polish and optimize |
| `frontend-design` | Creative direction for a new interface |
| `doc-view` | A readable HTML view of a Markdown document |

Start new interface work with `impeccable craft` or `frontend-design`. Use an
Impeccable command for one fix. Run `beast-ui` before you hand off.
`file-pr` runs beast-ui on an interface change if you installed the `ui`
profile.

To add the UI skills to one repository only:

```sh
tools/install --project ../web-app --hosts all --skills ui --no-rules
```

## Updates

A bot compares tstack, pstack, Impeccable and Frontend-design with their pins each
Monday. When an imported file changes, the bot opens a draft pull request with
the new pins and the full diff. It merges each upstream change into the
Sentinel edits of that file. After you merge the pull request, pull this
repository and run the installer again.

## Known limits

- The installer does not prove that a session loaded the rules. A custom agent
  can ignore the user files.
- Codex reads `AGENTS.override.md` instead of `AGENTS.md` when both exist. The
  installer gives a warning in that case.
- `babysit-pr` waits with `pr-wait`, which needs Python 3 and the GitHub CLI.
- A Kiro custom agent loads a skill only when its `resources` list names the
  skill with `skill://`.
- OpenCode reads `~/.claude/skills` and `~/.agents/skills`. With Claude Code
  and Codex on the same machine, OpenCode sees each skill two times. Set
  `OPENCODE_DISABLE_CLAUDE_CODE=1` to make OpenCode ignore the Claude folders.

## Maintain

- `make test` runs the installer and import tests. CI also runs them on macOS
  and Windows.
- `make lint` checks the shell script, home paths and the STE prose.
- `make check` compares the imported files with `upstream/lock.json`.
- `make eval` runs the cases in `evals/` with Claude Code and Codex. Each case
  runs with and without its skill or rule, in a new temporary home folder with
  a fresh install. The runs use your logins and count against your plan.
  `evals/targets.json` lists the models and efforts. Pass options with
  `ARGS`, for example `make eval ARGS="--case tldr --targets opus-5.5-medium"`.
  Results go to `evals/results/`, which git ignores. `evals/README.md`
  explains the cases and gives the last results for each skill.
- `node tools/upstream.mjs --update` imports the newest upstream revisions.
  After a manual edit of `upstream/imports.json`, `--sync` imports again at the
  pins.
- To change an imported file, edit it and run `--sync`. The lock records the
  edit, and `--update` merges later upstream changes into it. A conflict stops
  the update with conflict markers in the file. Resolve them, then run
  `--sync`.

Sentinel uses the [MIT license](LICENSE). The imported skills keep their
licenses. See [THIRD_PARTY.md](THIRD_PARTY.md).
