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
| `--skills` / `-Skills` | `core`, `formal`, `ui`, `ops`, or a list. The default is `core`. Use `none` to install only the rules. |
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

For Claude Code, the installer also writes the output style
`~/.claude/output-styles/sentinel.md`. See "Rules". The installer writes its
SHA-256 into `output-styles/.sentinel-owned`. It does not replace or remove a
`sentinel.md` that it did not write or that somebody changed.

`CODEX_HOME`, `CLAUDE_CONFIG_DIR`, `COPILOT_HOME`, `KIRO_HOME` and
`XDG_CONFIG_HOME` change these folders. When the installer replaces a rules
file, the file keeps its mode. A project install writes the rules to `AGENTS.md`, and
`CLAUDE.md` imports that file. Project skills go to `.agents/skills`,
`.claude/skills` and `.kiro/skills`.

## Rules

`rules/AGENTS.md` holds the rules. They tell an agent to do these things:

- Change files only when the user asks for a change.
- On a feature branch, add each new request to that branch and its PR. Record
  postponed work in the tracker that the user or the project names.
- Make the smallest complete change. Do not add layers, options or guards that
  the task does not need.
- Write no audit, findings, plan or handoff files.
- Leave the agent instruction files to the user.
- Add no comments to code, except the few that code cannot replace. Remove the
  other comments in each file that the agent changes.
- Remove the temporary files, worktrees, branches and stashes of a task before
  the task ends.
- For a bug, first add one test that fails, then fix the bug and run it again.
- When a mechanical mistake occurred before, add a lint rule or a type check
  that CI runs.
- Write all prose in ASD-STE100 Simplified Technical English. This does not
  limit the reasoning of the agent. Ask for plain prose to stop it in a
  session. To stop it in a repository, say so in its `AGENTS.md`.

`rules/output-style.md` is a Claude Code output style for short replies. It
tells the agent to give each fact once and to add no claim that it did not
check. In the evals, it cut the replies of Opus and Haiku by half or more. The
installer writes it, but Claude Code uses it only after you pick it: run
`/output-style Sentinel`, or set `"outputStyle": "Sentinel"` in
`~/.claude/settings.json`.

## Skills

The `core` profile is for delivery, review, understanding and writing. An
agent can also load each skill when its description fits the task.

| Skill | Say | Result |
|---|---|---|
| `full-send` | "full send" | The agent does the work, proves it, files the pull request and merges it when the checks of the branch protection pass. |
| `full-stop` | "full stop" | The agent stops when the pull request is ready for you to merge. |
| `sol-loop` | "sol loop" | GPT Sol reviews the change in a loop until both agents agree. |
| `council` | "council" | Claude Opus and GPT Sol review until they agree, for 3 rounds by default. Each model runs at high effort by default. Name other models, efforts or limits in the request. |
| `council` | "arena", or a design request to the council | Each model writes its own plan. A judge scores the plans without model names. The agent merges the best parts into one plan. |
| `file-pr` | "file a PR" | The agent files a short pull request. |
| `babysit-pr` | "babysit" | The agent watches CI and review bots and fixes real findings. |
| `modernize` | "modernize" | The agent rebases an old pull request and asks if it still has a use. |
| `leaving-pr-comments` | (automatic) | The agent marks the comments that it writes for you. |
| `untangle` | "untangle" | The agent finds what a codebase does not need and proves each cut. |
| `cleanup` | "clean up the branches" | The agent removes merged worktrees and branches and reports the others. |
| `verify-pr` | "verify this PR" | A tester from another model family runs the app, compares each fault with the base, and reports each regression with steps to reproduce. `full-stop` runs it before the handoff. |
| `no-comments` | "remove the comments" | The agent removes comments that code can replace, and keeps the others with a reason. |
| `why` | "why is X like this" | The agent searches git, pull requests and your MCP servers, and gives the reason with a confidence level. |
| `tldr` | "tldr" | A short version that keeps each fact that you need to decide or act. |
| `technical-writing` | "simplify this", "STE" | Docs, PR text and rewrites in simple technical English, without AI patterns. |

At xhigh, `council`, `cleanup`, `no-comments`, `technical-writing`, `tldr`
and the rules for comments and cleanup changed the result on 4 or 5 models.
`sol-loop`, `why` and `statechart` changed it on 2 or 3 models.
See [evals/README.md](evals/README.md).

`patrol` changed the result on 5 models, and `verify-pr` on 2. For a CI check
of the boundaries, `featuremap` changed it on 2 or 3 models. As a one-off map,
it changed it on 1 model. Its script ran on real projects.

Sources: `untangle`, `cleanup`, `no-comments`, `tldr`, `verify-pr`, `patrol`
and `featuremap` are from Sentinel. `why`, `technical-writing` and `statechart` are
from [pstack](https://github.com/cursor/plugins/tree/main/pstack). The other
skills are from [tstack](https://github.com/t3dotgg/tstack). Sentinel keeps
the T3 Code routes of tstack and adds a route for each other CLI.

`full-send` merges without a person, and only the words "full send" start
it. It merges through the branch protection of the repository and never uses
`--admin` or another bypass. So the checks of the branch protection are the gate.
In the evals, it changed the result on 5 models. `full-stop` reads a copy of
it and stops before the merge.

The `formal` profile holds `statechart`, for code where events can occur in
many orders, such as locks, retries, queues and protocols. It checks a TLA+
model with TLC and draws it as a Mermaid chart, with the shortest path to each
state that breaks a rule.

`statechart` needs Node 22.18 or later, Bun or Deno. On the first run, it
installs Java and TLC with mise and needs the network. Set `TLA2TOOLS` and
`JAVA` to use your own copies. It does not run on Windows outside WSL.

The `ops` profile holds two skills that ship scripts. Both need Node 22 or
later. Copy the script into the repository, so that CI runs the same file.

- `patrol` runs coding agents in GitHub Actions, GitLab CI or Azure
  Pipelines. A fix job turns one ready tracker item into a draft PR. A weekly
  scan files at most 3 defects. A PR job tests each PR. The agent job gets no
  token that can push or open a PR, and nothing merges.
- `featuremap` writes one feature map for a monorepo in many languages. It
  reads edges from JS, TS, Python, C and C++ code, `go list`, `cargo metadata`
  and the CMake File API. It checks which features may use which in CI, with a
  baseline that can only shrink, and draws the graph.

Install it with `--skills core,ops`.

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
- T3 Code does not show Kiro skills in its `/` and `$` menus
  ([pingdotgg/t3code#31645](https://github.com/pingdotgg/t3code/issues/31645)).
  The Kiro session still lists them. A Kiro custom agent also gets the skills
  in `~/.kiro/skills` when its `resources` list has no `skill://` entry.
- OpenCode reads `~/.claude/skills` and `~/.agents/skills`. With Claude Code
  and Codex on the same machine, OpenCode sees each skill two times. Set
  `OPENCODE_DISABLE_CLAUDE_CODE=1` to make OpenCode ignore the Claude folders.

## Maintain

- `make test` runs the installer and import tests. CI also runs them on macOS
  and Windows.
- `make lint` checks the shell script, home paths and the STE prose.
- `make check` compares the imported files with `upstream/lock.json`.
- `make eval` runs the eval cases that your changes touch, on Opus and Sol,
  with Claude Code and Codex, in a new temporary home folder with a fresh
  install. The runs use your logins and count against your plan. Pass options
  with `ARGS`, for example `make eval ARGS="--case tldr"`, or
  `ARGS="--ab"` for the full A/B with and without each skill. Results go to
  `evals/results/`, which git ignores. `evals/README.md` explains the modes
  and gives the last results for each skill.
- `node tools/upstream.mjs --update` imports the newest upstream revisions.
  After a manual edit of `upstream/imports.json`, `--sync` imports again at the
  pins.
- To change an imported file, edit it and run `--sync`. The lock records the
  edit, and `--update` merges later upstream changes into it. A conflict stops
  the update with conflict markers in the file. Resolve them, then run
  `--sync`.

Sentinel uses the [MIT license](LICENSE). The imported skills keep their
licenses. See [THIRD_PARTY.md](THIRD_PARTY.md).
