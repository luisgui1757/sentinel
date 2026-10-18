# Host coverage

Supported paths are documented below. Installing bytes, loading instructions
and successfully running a model are different checks. A version command or an
agent quoting a file does not prove automatic startup ingestion.

| Host | Project rules | Global rules | Evidence |
|---|---|---|---|
| Codex | `AGENTS.md` | `${CODEX_HOME:-~/.codex}/AGENTS.md` | docs-confirmed 2026-10-18 |
| Claude Code | `CLAUDE.md` | `${CLAUDE_CONFIG_DIR:-~/.claude}/CLAUDE.md` | docs-confirmed 2026-10-18 |
| GitHub Copilot CLI | `.github/copilot-instructions.md` | `~/.copilot/copilot-instructions.md` | docs-confirmed 2026-10-18 |
| Kiro | `AGENTS.md` | `~/.kiro/steering/AGENTS.md` | docs-confirmed 2026-10-18 |
| T3 Code | `AGENTS.md` and its provider's files | Provider-managed | docs-confirmed 2026-10-18 |

The install/status metadata is in
[tool-metadata.tsv](../templates/adapters/tool-metadata.tsv). Rules default to all
four CLI adapters; select hosts to limit writes. T3 is an orchestration option,
not a separate filesystem adapter. `tools/status` reports the supported project
and global paths; a missing file does not mean the host lacks global support. T3 uses only providers its live catalog offers.

Codex loads project configuration according to trust and can use
`AGENTS.override.md` instead of `AGENTS.md`. Claude supports a configurable user
directory. Copilot CLI reads several instruction formats; custom subagents may
need `include-custom-instructions: true`. Kiro custom agents need explicit
instruction, steering and skill resources. Pass required rules in a reviewer
brief instead of assuming inheritance across clients.

For model routing, permissions and actual execution evidence, read
[host dispatch](../skills/helix/references/dispatch.md). The setup helper discovers
Codex and Claude catalogs; Copilot and Kiro use their current native catalog.
Other coding hosts are outside this bundle's supported integrations.

Sources checked on 2026-10-18:

- [Codex instructions](https://learn.chatgpt.com/docs/custom-instructions)
  and [skills](https://learn.chatgpt.com/docs/build-skills).
- [Claude memory](https://code.claude.com/docs/en/memory)
  and [skills](https://code.claude.com/docs/en/skills).
- [Copilot CLI instructions](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-custom-instructions)
  and [skills](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills).
- [Kiro steering](https://kiro.dev/docs/steering/)
  and [skills](https://kiro.dev/docs/skills/).
- [T3 source control](https://github.com/pingdotgg/t3code/blob/main/docs/user/source-control.md)
  and the bundled [T3 orchestration reference](../skills/helix/references/t3.md).
