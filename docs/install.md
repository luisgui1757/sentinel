# Install rules and skills

Run these commands from a trusted Sentinel checkout. Rules and skills are
independent: installing one never silently installs the other.

## Rules

```sh
tools/install --target /path/to/project --hosts codex
tools/install --global --hosts claude,copilot,kiro
```

On Windows, use `pwsh tools/install.ps1` with `-Target`, `-Global`, `-Hosts`,
`-Check`, `-Remove` or `-DryRun`. The two installers render identical bytes. PowerShell accepts both
`-Hosts claude,copilot` and `-Hosts "claude,copilot"`.
Omitting hosts selects all four supported CLIs. T3 uses its provider's host;
there is no separate T3 global path.

Use `--dry-run` to preview, `--check` to compare selected entrypoints with this
checkout, and `--remove` to remove only Sentinel's managed block. Preserve your
own instructions outside the block. Missing selected files fail `--check`.
Check and remove never create missing instruction files.

The project paths are `AGENTS.md`, `CLAUDE.md` and
`.github/copilot-instructions.md`. Kiro and Codex share `AGENTS.md`.
Copilot can read multiple instruction formats, so select only the adapters you
need. It may receive repeated rules in a repository that installs all formats.
Codex's `AGENTS.override.md` can shadow `AGENTS.md`; reconcile it yourself.

Global Codex and Claude rules respect `CODEX_HOME` and `CLAUDE_CONFIG_DIR`.
Copilot CLI uses `~/.copilot/copilot-instructions.md`; Kiro uses
`~/.kiro/steering/AGENTS.md`. Custom agent inheritance is covered in
[host coverage](tool-ingestion.md).

## Skills

Requires Node.js 22.19 or newer. List choices, then install named skills or groups:

```sh
node tools/skills.mjs --list
node tools/skills.mjs --host codex --target /path/to/project --skills documents --dry-run
node tools/skills.mjs --host codex --target /path/to/project --skills documents
node tools/skills.mjs --host claude --global --skills delivery,writing
```

Groups are `delivery`, `documents`, `writing` and `all`. Individual names work
as well. Dependencies are included, with their references, scripts and licenses.
There are twelve callable skills: eight primary and four specialist commands.
Internal procedures travel with their parent folder and are not selectable names.
The [catalog](../skills/catalog.json) records those dependencies. A caller link
may create a packaging cycle; it never tells a helper to restart its parent.

| Host | Project skills | User skills |
|---|---|---|
| Codex | `.agents/skills` | `~/.agents/skills` |
| Claude Code | `.claude/skills` | `$CLAUDE_CONFIG_DIR/skills`, normally `~/.claude/skills` |
| GitHub Copilot CLI | `.agents/skills` | `~/.agents/skills` |
| Kiro | `.kiro/skills` | `~/.kiro/skills` |

Codex and Copilot share a supported location and ownership registry. Checking,
updating or removing skills through either host affects that shared installation.
Copilot also discovers `.github/skills`, `.claude/skills` and `~/.copilot/skills`.
Inspect those and installed plugins before adding the same names. The installer
checks its destination; it cannot inventory every host's plugin catalog.
Start a fresh agent session and verify the skill names and loaded source paths.

Repeat the install command after updating this checkout. It adds selected roots
and updates their dependency set. `--check` verifies all installed roots against
this checkout. `--remove` removes all managed skills; `--remove --skills NAME`
removes that requested root and dependencies no remaining root needs. A skill
still needed by another root stays installed. Partial removal requires remaining
skills to match this checkout; update first when versions differ. Removing a
named dependency that was never selected as a root fails and names the roots
that still need it.

The installer stores ownership hashes in `.sentinel-skills.json`. It refuses
unowned folders, symlinks, changed files and concurrent installs. It stages copies
and restores replaced folders if a caught write fails. After an interrupted
process, inspect the PID in `.sentinel-skills.lock` and `.sentinel-stage-*` backups
before recovering; never delete a live install's lock. Keep the ownership file
with copied skills if you want Sentinel to update or remove them later.

## Impeccable

The documents group includes Impeccable, Beast UI, Frontend-design, TLDR and
Unslop. Impeccable's design playbooks and resources are bundled at a pinned
upstream revision. The upstream files are retained without editorial changes.

Its detector needs a native engine. Set it up explicitly using the installed
skill's helper, for example after a project Codex installation:

```sh
node /path/to/project/.agents/skills/impeccable/scripts/sentinel-engine.mjs --setup
```

Setup downloads the platform's pinned engine and verifies its size and SHA-256
before saving it. The helper checks those bytes before each execution. It uses
`~/.impeccable/sentinel/` by default; `IMPECCABLE_HOME` selects another cache.
Supported engine builds are macOS arm64/x64, Linux arm64/x64 and Windows x64.
No hooks, shortcuts, agents or model settings are registered by setup.
Printed follow-up commands use Node, with PowerShell syntax on Windows.
Update the bundle through Sentinel, never through upstream update notices or
`npx impeccable`. The cache is shared independently of skill copies; uninstall does not delete it.

Use the same helper for engine commands. The packaged upstream launchers use
upstream's own cache and download policy; Sentinel's entrypoint directs agents
through its pinned helper instead. A missing engine must be reported before
claiming a full Beast UI or detector pass.

## Migrate existing installations

If an earlier Sentinel copy lists `file-pr`, `babysit-pr`, `takeover` or
`modernize` as roots, the update reports retired commands. In the same target
and host, run `--remove` without `--skills`, then install the current selection.
The registry is checked before removal; edited files block it and must be
preserved first. Do not delete them to bypass the check. The four procedures
now ship inside Full-stop, which Full-send also includes. A check or dry run
never migrates or removes an installed command.
If those helpers were installed only as dependencies, a normal update removes
their old folders after verifying their ownership hashes.

For Helix links or manually copied skills, inspect each collision, preserve any
local changes, and move the old entry aside before installing Sentinel's copy.
There is no force/adopt flag. Do not delete an existing Anthropic plugin or
Impeccable installation just to make a conflict disappear.

Retired hosts are excluded from new installs. To inspect or remove only their
old rule blocks, preserving surrounding user text:

```sh
tools/install --global --legacy --check
tools/install --global --legacy --remove
```

The legacy path covers the old OpenCode and Pi global entrypoints and honors
their previous directory overrides. PowerShell supports `-Global -Legacy -Check`
and `-Global -Legacy -Remove`. It cannot install new rules there.

Pinned consumers, including external installers, keep their old bundle until
explicitly updated after this change is merged and released. Installing a new
checkout does not update those pins or rewrite instructions outside managed blocks.
