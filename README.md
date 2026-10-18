# Sentinel

Shared coding rules and optional skills for Codex, Claude Code, GitHub Copilot
CLI and Kiro. T3 Code uses its configured provider and native orchestration.

The rules set everyday behavior: stay within scope, verify claims, preserve
work and write plainly. Skills handle specific jobs when you ask for them.
Helix's delivery and document skills now live here.

## How to use (TLDR)

Clone this repository and run commands from its root:

```sh
git clone https://github.com/luisgui1757/sentinel.git
cd sentinel

# Rules for one repository.
tools/install --target /path/to/project --hosts codex

# Optional skills for the same repository. Requires Node.js 22.19 or newer.
node tools/skills.mjs --target /path/to/project --host codex --skills delivery,documents

# Document/design skills: download and verify the pinned Impeccable engine once.
node /path/to/project/.agents/skills/impeccable/scripts/sentinel-engine.mjs --setup
```

Use `--global` instead of `--target` for a per-user installation. For rules on
Windows, run `pwsh tools/install.ps1 -Target C:\path\to\project -Hosts codex`.
The skills command is the same on Windows, macOS and Linux. Change `codex` to
`claude`, `copilot` or `kiro` for your host; engine setup uses that host's installed
skill path. [Host paths and setup](docs/install.md) cover the differences.

Open a new agent session in your project. In Codex, try `$full-stop fix this bug`
or `$doc-view ROADMAP.md`. In Claude Code, use `/full-stop` or `/doc-view`.
To update, pull a reviewed Sentinel revision and repeat the install commands.
Add `--check` to the rules and skills commands (`-Check` for PowerShell rules).
Rerun the engine's `--setup` to verify its cached binary without another download.

Choose rules, skills or both. Installation preserves surrounding rules and
refuses to replace edited or unowned skills. No hooks or model settings are
installed. [Installation and migration](docs/install.md) covers preview, updates,
removal, existing Helix links and Impeccable's pinned engine setup.

## Choose a skill

Eight commands cover the main workflows:

| Job | Commands |
|---|---|
| Implement and independently review a change | `helix` |
| Deliver a PR for your review | `full-stop` |
| Deliver and merge after every gate passes | `full-send` |
| Review a change or challenge a decision | `sol-loop`, `second-opinion` |
| Read a Markdown document as HTML | `doc-view` |
| Shorten or clean up writing | `tldr`, `unslop` |

Four specialist commands are also callable:

| Job | Commands |
|---|---|
| Design or check an interface | `impeccable`, `beast-ui`, `frontend-design` |
| Choose writer and reviewer models | `setup-helix` |

Use `$helix` in Codex or `/helix` in Claude Code. Other hosts expose skills
through their own catalogs. See [the command guide](docs/how-to.md) for each
skill's purpose and [host dispatch](skills/helix/references/dispatch.md) for
cross-provider reviews. Filing, monitoring, takeover and modernization are
internal procedures used by delivery workflows. Use Full-stop to continue an
existing PR as well as to create one. Full-stop and Full-send share Helix's
implementation and review process; their endpoints differ.

## Where rules load

| Host | Project | User |
|---|---|---|
| Codex | `AGENTS.md` | `$CODEX_HOME/AGENTS.md`, normally `~/.codex/AGENTS.md` |
| Claude Code | `CLAUDE.md` | `$CLAUDE_CONFIG_DIR/CLAUDE.md`, normally `~/.claude/CLAUDE.md` |
| GitHub Copilot CLI | `.github/copilot-instructions.md` | `~/.copilot/copilot-instructions.md` |
| Kiro | `AGENTS.md` | `~/.kiro/steering/AGENTS.md` |
| T3 Code | Its provider's files, including `AGENTS.md` | Its provider's configuration |

File installation is not proof that every agent session loaded the rules.
Custom agents, overrides and trust settings can change that. See
[host coverage](docs/tool-ingestion.md) and [verification limits](docs/limits.md).

## Maintain

Edit `core/` for rules and custom `skills/` for workflows. Regenerate rules with
`tools/install`, then run `make gate`. Upstream imports arrive as draft PRs with
exact pins and file diffs; nothing updates in installed copies automatically.
See [upstream updates](docs/upstream.md). [CONTRIBUTING.md](CONTRIBUTING.md)
lists checks and [ROADMAP.md](ROADMAP.md) tracks outstanding work.

Privacy scans reject known private terms, home paths and secret patterns. They
cannot identify every unknown secret. See the [threat model](docs/THREAT_MODEL.md).
Required CI, CodeQL and human review remain in force; see
[repository governance](docs/GOVERNANCE.md).

Sentinel uses the [MIT license](LICENSE). Bundled skills retain their
[third-party licenses and source credits](THIRD_PARTY.md).
