# Choose the right skill

Use the host's skill catalog to invoke a command. Codex uses `$name`; Claude Code
uses `/name`. Read-only requests stay read-only, even when a delivery skill is
included as review material.

## Eight primary commands

| Skill | Use it for |
|---|---|
| `helix` | Implement, verify and independently review a scoped change. Publication needs task authority. |
| `full-stop` | Deliver a reviewed PR and leave it unmerged for you. |
| `full-send` | Deliver and merge a PR after all checks and approvals pass. Explicit invocation grants that endpoint. |
| `sol-loop` | Run a bounded review and correction loop with a Sol model. Hold pushes until agreement. |
| `second-opinion` | Get an independent challenge to a plan or decision without starting implementation. |
| `doc-view` | Generate a readable HTML view from Markdown after choosing the style. |
| `tldr` | Summarize in plain language, normally under 80 words. |
| `unslop` | Remove AI prose patterns while preserving facts and meaning. |

## Four specialist commands

These remain callable. The grouping helps you choose; it does not hide commands.

| Skill | Use it for |
|---|---|
| `setup-helix` | Choose writer/reviewer models and effort without changing unrelated settings. |
| `beast-ui` | Run Impeccable's ordered UI quality pass and verify the final render. |
| `impeccable` | Apply design playbooks for layout, type, accessibility, interaction and performance. |
| `frontend-design` | Apply Anthropic's frontend design guidance. |

## Delivery and review

Helix implements, verifies and independently reviews. Full-stop adds PR filing,
CI and review handling, then leaves the PR unmerged. Full-send adds a guarded
merge after every required check and approval. Both use Helix's shared process.
For an existing PR, ask Full-stop to continue it; completed work and review are
reused when they still cover the task, current behavior and base.

Sol-loop is a specific review procedure, not another delivery command. Select
it explicitly to use its Sol reviewer, severity rules and three-round budget
(up to five under its stated conditions). It replaces Helix's default review
loop. Naming a Sol model alone keeps the default procedure. PR fixes retain the
selected procedure and used rounds. Exhaustion or a dispute goes back to you;
a helper cannot reset the budget or run a second loop to obtain approval.

## Documents

Ask for `doc-view ROADMAP.md` and specify a style, or answer its style question.
Markdown remains authoritative. The HTML contains a short summary and the full
source content. Refreshing a view reuses its approved style and current source.

New views, substantial layout changes and new layout-sensitive content such as
tables, diagrams or code blocks use Beast UI. Plain text refreshes keep the design
and repeat browser checks; a layout defect found there triggers Beast UI too.
Playwright or an equivalent browser must inspect desktop and narrow layouts,
controls, links, fonts and diagrams.
Mermaid and official icons are useful when they explain the content. They are
not compulsory decoration. Standalone views remain offline.

## Models and hosts

Use `setup-helix` for persistent preferences or name the reviewer in the task.
Explicit choices override saved defaults. Supported routes are Codex, Claude Code,
Copilot CLI and Kiro, plus T3's advertised orchestration. Read
[host dispatch](../skills/helix/references/dispatch.md) for CLI routes, instructions,
permissions and proof of which model ran. No separate orchestration runtime is
installed. A provider that cannot run is reported, never silently substituted.

## Public commands and internal procedures

The twelve commands above form the user-facing catalog. File-pr, Babysit-pr,
Takeover and Modernize live under `full-stop/references/`, alongside attachment,
reply and watcher guidance. They have no `SKILL.md`, so hosts do not discover
them as separate skills. Full-stop and Full-send read them when needed.

Claude Code and Copilot support host-specific menu controls, but those are not
portable access controls. Codex's implicit-invocation setting controls automatic
selection, not explicit invocation. Reference files provide portable separation;
a user can still ask an agent to read them. Internal means an implementation
procedure, not a security boundary.

Plain language can request the same jobs, but it does not guarantee a host will
find an internal file. Name Full-stop when you want its PR workflow and endpoint.

Plain writing is already a Sentinel default. Invoke Unslop for a full editing
pass and TLDR for aggressive compression. Neither workflow runs automatically
on every unrelated task.
