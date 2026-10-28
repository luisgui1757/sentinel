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
| `--skills` / `-Skills` | `core`, `ui`, or both. The default is `core`. Use `none` to install only the rules. |
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

`CODEX_HOME`, `CLAUDE_CONFIG_DIR`, `COPILOT_HOME` and `XDG_CONFIG_HOME` change
these folders. A project install writes the rules to `AGENTS.md`, and
`CLAUDE.md` imports that file. Project skills go to `.agents/skills`,
`.claude/skills` and `.kiro/skills`.

## Rules

`rules/AGENTS.md` holds the rules. They tell an agent to do these things:

- Change files only when the user asks for a change.
- Make the smallest complete change. Do not add layers, options or guards that
  the task does not need.
- Write no audit, findings, plan or handoff files.
- Leave the agent instruction files to the user.
- Add a test only when it can find a real regression.
- Write all prose in ASD-STE100 Simplified Technical English. This does not
  limit the reasoning of the agent. Ask for plain prose to stop it in a
  session. To stop it in a repository, say so in its `AGENTS.md`.

## Skills

The `core` profile is for delivery and review. All of these skills except
`untangle` come from [tstack](https://github.com/t3dotgg/tstack). Sentinel
removes the T3 Code parts and adds commands for each CLI.

| Skill | Say | Result |
|---|---|---|
| `full-stop` | "full stop" | The agent stops when the pull request is ready for you to merge. |
| `sol-loop` | "sol loop" | GPT Sol reviews the change in a loop until both agents agree. |
| `council` | "council" | Three models from three providers review until they agree, for 3 rounds by default. Each model runs at high effort by default. Name other models, efforts or limits in the request. |
| `file-pr` | "file a PR" | The agent files a short pull request. |
| `babysit-pr` | "babysit" | The agent watches CI and review bots and fixes real findings. |
| `takeover` | "take over" | The agent finishes the work of another person and keeps their credit. |
| `modernize` | "modernize" | The agent rebases an old pull request and asks if it still has a use. |
| `leaving-pr-comments` | (automatic) | The agent marks the comments that it writes for you. |
| `untangle` | "untangle" | The agent finds what a codebase does not need and proves each cut. |

The repository keeps tstack's `full-send` skill, but the installer does not
install it, because it merges without a person. `full-stop` reads a copy of
it and stops before the merge.

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

A bot compares tstack, Impeccable and Frontend-design with their pins each
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
- OpenCode reads `~/.claude/skills` and `~/.agents/skills`. With Claude Code
  and Codex on the same machine, OpenCode sees each skill two times. Set
  `OPENCODE_DISABLE_CLAUDE_CODE=1` to make OpenCode ignore the Claude folders.

## Maintain

- `make test` runs the installer and import tests. CI also runs them on macOS
  and Windows.
- `make lint` checks the shell script, home paths and the STE prose.
- `make check` compares the imported files with `upstream/lock.json`.
- `node tools/upstream.mjs --update` imports the newest upstream revisions.
  After a manual edit of `upstream/imports.json`, `--sync` imports again at the
  pins.
- To change an imported file, edit it and run `--sync`. The lock records the
  edit, and `--update` merges later upstream changes into it. A conflict stops
  the update with conflict markers in the file. Resolve them, then run
  `--sync`.

Sentinel uses the [MIT license](LICENSE). The imported skills keep their
licenses. See [THIRD_PARTY.md](THIRD_PARTY.md).
