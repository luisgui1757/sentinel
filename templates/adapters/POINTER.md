# Tool Adapter (pointer template)

A pointer adapter for a specific tool (Claude Code, Codex, Copilot CLI or
Kiro). Prefer `tools/install`, which inlines the contract into the tool's
native auto-loaded entrypoint; use this pointer form only where a tool reliably
expands file references and you deliberately want indirection. It must not fork
policy.

Read the repository entrypoint, then the vendored Sentinel core under
`<vendor>/`, then the project overlay under `<overlay>/`.
