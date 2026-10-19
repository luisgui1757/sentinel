# Verification limits

Sentinel supplies rules and skills. It does not enforce sandboxing, model choice,
repository permissions or merge gates. Those remain the host's responsibility.
A file or configured role is not proof of runtime behavior.

- Deterministic checks cover rule rendering, installer ownership, copied skill
  dependencies, pinned imports and model-discovery transports. Both policy installers have
  lifecycle coverage, including global paths and preservation of user content. They do not prove
  a model will follow every instruction.
- CLI instructions cover Codex, Claude Code, Copilot CLI and Kiro. T3 uses its
  live orchestration schema. Account access, available models and flags vary.
  Verify them on the installed version. Copilot, Kiro and T3 live task execution
  still need configured-account validation.
- The Claude review route exposes Read, Glob and Grep only. Its model appears in
  execution events; requested reasoning effort may not be independently exposed.
  Codex native children can inherit writer permissions. Report actual access.
- Impeccable's upstream files are pinned separately from its engine. Sentinel's
  helper verifies the engine's pinned digest before execution; it does not enable
  hooks or certify every upstream design command. Engine checks cover the
  `context` and `detect` paths used by document views.
- Doc-view is an agent workflow, not a background synchronization service. A
  browser check that cannot run must remain an explicit limitation. Tests cannot
  guarantee the rendering of arbitrary future documents or vendor icons.
- Internal references stay out of the skill command catalog. They are readable
  files, not an access-control boundary.
- Existing global installs and pinned downstream consumers do not update merely
  because this repository changes. Migration remains explicit.

For a release or PR, report the exact revision, commands, actual results, live
checks and remaining gaps there. Do not accumulate per-session audit documents.
