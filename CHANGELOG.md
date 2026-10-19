# Changelog

All notable changes to Sentinel. Format follows [Keep a Changelog]; the project
uses [Semantic Versioning]. Consumers pin a version and a `bundle-sha256`.

## [Unreleased]

### Changed

- Refresh pinned Impeccable and Unslop sources. Impeccable adds line-break
  guidance and live-browser fallbacks for plain HTTP and clipboard failures.
  Unslop shortens wording while retaining its numbered rules and Sentinel
  safeguards. The engine remains at 0.1.15.
- The packaged upstream launcher now cleans up interrupted downloads.
  Sentinel continues to use its own verified engine helper.

## [0.2.0] - 2026-10-19

Pin to `v0.2.0` and verify the rendered rules with this hash:

**bundle-sha256:** `e6a3681891e1ace509b20c95c17a5ae1f7f8328b90f1b219be151df88eeadcb8`

The hash covers the rules. Verify installed skills separately with
`node tools/skills.mjs --check` and the original host and target options.

### Combined rules and skills

- Bring Helix's delivery, review, writing and document workflows into Sentinel.
- Make skills optional with project/user installation, dependency resolution,
  ownership checks and preservation of existing files.
- Include Impeccable and Beast UI, with explicit pinned engine setup.
- Shorten default rules and remove routine audit diaries. Keep plain writing,
  authority, privacy and meaningful verification as defaults.
- Add Copilot CLI and Kiro paths and cross-provider dispatch guidance. Keep T3
  as an optional orchestration route and retire other hosts from new installs.
- Fix PowerShell global installation and add native global lifecycle coverage.
- Require browser inspection for HTML document views; support useful diagrams
  and official icons from any relevant vendor.
- Combine pending dependency updates with verified hashes and asset paths.
- Keep eight primary and four specialist commands; make filing, monitoring,
  takeover and modernization internal procedures with safe removal of older copies.
- Share Helix's independent review across both delivery endpoints. Preserve
  Sol-loop's selected policy and used rounds through PR fixes without a second loop.
- Run Beast UI for layout-sensitive document additions and browser-found layout defects.
- Automate pinned upstream imports and weekly draft updates with full file diffs.
  Keep adaptations separate, check source hashes in CI and require review before use.
- Add a TLDR README how-to for installation, calls, updates and verification.

### Added

- Five first-principles clauses now cover executable supply-chain boundaries,
  recoverable external mutations, baseline capture, exact-artifact evidence,
  and consumer-entrypoint testing for packaged deliverables.
- `tools/repository-policy-check` verifies workflow provenance, SHA pinning,
  single-source branch policy, and the Renovate/Dependabot ownership split.
- `docs/GOVERNANCE.md` specifies the live GitHub contract and its exact-main,
  snapshot, rollback, recovery, and readback procedure.

### Changed

- Renamed the project and its complete public/tooling namespace from Sentinel's
  former name to `sentinel`, including manifest identity, shell helpers,
  environment flags, temporary-file prefixes, tests, documentation, schemas,
  workflows, and generated adapters.
- Main-branch integrity is now unbypassable; the owner bypass is PR-only and
  limited to review and branch-update rules. CodeQL is merge-blocking and
  classic branch protection no longer overlaps the ruleset source of truth.
- Repository Actions are restricted to selected GitHub-owned, full-SHA-pinned
  dependencies. Renovate owns routine version updates, while GitHub-native
  Dependabot retains vulnerability alerts and security-update ownership.
- The strict manifest validator is refreshed from `check-jsonschema` 0.29.4 to
  0.38.2. Python lint tools and their complete transitive graph install from a generated,
  SHA-256-required lock that Renovate maintains.
- `scripts/apply-repo-safeguards.sh` now requires an exact, clean live `main`,
  captures a private recovery snapshot, detects concurrent drift, rolls back a
  failed apply, supports explicit restoration, and verifies all controls by
  live readback.

### Security

- Future published GitHub releases are immutable, and live policy validation
  covers Actions permissions, workflow defaults, CodeQL, secret scanning, push
  protection, Dependabot security updates, and private vulnerability reporting.

### Fixed

- Safeguard activation handles expected GitHub 404 responses on macOS Bash,
  stops before writing when recovery state cannot be read, and rolls back
  actual API failures.
- Live CodeQL verification requires both Actions and JavaScript/TypeScript
  while accepting GitHub's additional language entries.
- `tools/check` now excludes tracked paths deleted from the working tree before
  scanning, avoiding a false unreadable-path failure while preserving the
  fail-closed behavior for files that actually exist.

## [0.1.2] - 2026-07-01

Pin to the tag `v0.1.2` and verify the rendered rules with:

**bundle-sha256:** `0b79f9d33727d0d53edc0d3f88f4f46fc18802b7845f7ba4f9a6cb764d83437e`

```bash
tools/verify-vendor <vendored-dir> 0b79f9d33727d0d53edc0d3f88f4f46fc18802b7845f7ba4f9a6cb764d83437e
```

### Added

- Communication rules now require direct answers, concise wording, and clear
  separation between verified facts, judgment, assumptions, and uncertainty.
- Workflow rules now forbid hand-editing generated artifacts and require source
  edits, generator runs, and generated-output verification instead.
- Git workflow rules now require agents to follow repository attribution and
  provenance policy instead of inventing commit trailers.
- Sentinel contributor guidance now allows configured agent author/committer
  identity while forbidding unsolicited `Co-authored-by`-style boilerplate
  trailers.
- Bug-fix testing rules now require the highest-fidelity practical reproduction
  path before fixing, preferring end-user or E2E workflows where available.

### Fixed

- `tools/release-check` now validates `VERSION` as `x.y.z`, matches changelog
  release headings by the exact bracketed version token, ignores fenced fake
  headings, rejects duplicate release sections or bundle-hash entries, and
  fails closed when `origin` tag state cannot be checked.

## [0.1.1] - 2026-06-22

Pin to the tag `v0.1.1` and verify the rendered rules with:

**bundle-sha256:** `19c74a2a3c056c8895f2ecb1dd112ffd6a396f3371210149cd9e1c618176751a`

```bash
tools/verify-vendor <vendored-dir> 19c74a2a3c056c8895f2ecb1dd112ffd6a396f3371210149cd9e1c618176751a
```

### Added
- `core/REVIEW_PROTOCOL.md` is now part of the required injected bundle, with
  generated-adapter coverage proving REVIEW mode has no dangling protocol
  reference.
- `templates/adapters/tool-metadata.tsv` is the canonical supported-tool matrix
  for adapter paths, global paths, install scope, binaries, imports, and dated
  evidence status.
- `tools/ruleset-check` semantically verifies the checked-in or live GitHub
  rulesets: active `main` targeting, owner `always` bypass, strict required
  GitHub Actions `ci`, squash-only PRs, review requirements, linear history, and
  update/delete/non-fast-forward protection.
- `make preflight` names the fast local check surface, and `make gate` runs the
  strongest local proof: strict preflight, ruleset verification, bats, and the
  PowerShell drift check.
- Consumer onboarding now includes a proof checklist in `templates/OVERLAY.md`
  and hash-required vendor verification guidance.

### Changed
- The execution contract now explicitly sets the delivery bar as the
  uncompromised ubiquitous canonical gold-standard and rejects unapproved
  workarounds, shortcuts, fake-green changes, test deletions, checker
  suppressions, hardcoded results, partial implementations, degraded fallbacks,
  and undocumented temporary compromises as finished work.
- `tools/status` now compares the full managed block against freshly composed
  adapter output instead of trusting only the stamped header hash; tampered
  bodies now report stale. Global Codex status now reports `overridden` when an
  existing `AGENTS.override.md` would shadow the installed `AGENTS.md`, and
  `tools/install --global` warns about that state.
- Manifest handling is stricter everywhere: `core_dir` is honored, required and
  optional core files must exist, unsafe absolute/parent paths are rejected, and
  JSON Schema mirrors those containment rules.
- `tools/verify-vendor` now requires the expected `bundle-sha256` by default.
  The old non-integrity behavior is available only through explicit
  `--structure-only`.
- `tools/release-check` now requires a clean index/worktree with no untracked
  files, rejects existing local/checkable remote version tags, verifies the
  exact current bundle hash in the matching changelog section, and prints the
  certified commit. Regression tests now prove it invokes and propagates
  failures from adapter drift, local CI, and bats gates.
- Tool-ingestion docs and README claims now distinguish `live-verified`,
  `docs-confirmed`, and `local-package-confirmed` surfaces instead of implying
  every supported tool has the same proof level.
- `scripts/apply-repo-safeguards.sh` now runs semantic ruleset verification
  before applying local JSON and after applying live GitHub rulesets.
- `tools/install.ps1` now writes through a target-directory temp file and atomic
  replace/move instead of rewriting adapter files directly.
- Gate docs now distinguish local preflight, strongest local gate, and the
  required GitHub `ci` aggregate. `yamllint` line length is an error, not a
  warning, after wrapping the workflow lines that previously warned.

### Fixed
- Rewrote `sentinel_check_core` path resolution to avoid the `A && B || C` shell
  idiom that older CI ShellCheck versions flag, while preserving the manifest
  `core_dir` mismatch check.
- Made `tools/status` home-relative path display deterministic across Bash
  versions, fixing the Ubuntu-only Codex `AGENTS.override.md` status test.

## [0.1.0] - 2026-06-16

First tagged release. Pin to the tag `v0.1.0` and verify the rendered rules with:

**bundle-sha256:** `4b85911c73f793da9b812ba6c83eb07933b267a155c1ca0391fc3071ac4b3a5c`

```bash
tools/verify-vendor <vendored-dir> 4b85911c73f793da9b812ba6c83eb07933b267a155c1ca0391fc3071ac4b3a5c
```

### Added
- Auto-ingestion installer (`tools/install`): inlines the core into each tool's
  native entrypoint; `--target`, `--global`, `--check`, `--dry-run`, and
  `--remove` (uninstall, preserving surrounding content).
- **Windows install path** (`tools/install.ps1`): a PowerShell port of the
  installer with the same flags (`-Target`/`-Global`/`-Check`/`-Remove`/`-DryRun`).
  It renders **byte-identical** output to the bash installer (same bundle
  sha256, LF endings), so a repo installs/checks the same from Windows or POSIX
  and the drift check stays green on both. Proven by a `windows-latest` CI job
  (`-Check`) plus a Linux bats test that cross-compares bash-vs-pwsh output;
  `.gitattributes` forces LF on every installer-touched file so a Windows
  checkout cannot CRLF-corrupt the hashed bundle.
- Gold-standard rule clauses (the "name the road to a fake-green" set): never
  weaken/skip/comment-out/delete a failing test (quarantine only with
  authorization + a tracked follow-up); never silence an error by catch-and-
  discard; satisfy a checker, never silence it (no inline diagnostic
  suppression without a documented false-positive justification); never ship a
  stub as done; and "calibrate to stakes" is now bound to blast radius /
  reversibility (persisted shape, security, secrets, external contracts, and
  migrations are never "trivial"). Overlays may tighten freely but may relax a
  baseline rule only with an explicit, documented justification.
- Two-tier privacy: gitignored `tools/forbidden-terms.local`; whole-working-tree
  leak scan (incl. untracked files, path names, and the manifest) with redaction.
- `core/EXECUTION.md` (always-on execution discipline).
- Observability and provenance: `tools/status`, `tools/verify-vendor`.
- `tests/` bats regression suite; cross-platform (Linux + macOS) CI matrix with a
  stable `ci` gate.
- CI `lint` job (required via the `ci` gate): **gitleaks** secret-shape scan,
  **yamllint**, and **editorconfig-checker**, with configs that pass the tree.
- `consumers.md` records Sentinel's own dogfood install.
- House repo config: branch-protection rulesets, `settings.yml`, CODEOWNERS, PR
  template, `.editorconfig`/`.gitattributes`, `scripts/apply-repo-safeguards.sh`.
- Docs: `docs/THREAT_MODEL.md`, `docs/tool-ingestion.md`, `CONTRIBUTING.md`,
  `SECURITY.md`, `docs/RELEASE.md`, `schemas/manifest.schema.json`.
- `jq`-preferred manifest parser (string-aware; decodes escapes), locale
  determinism (`LC_ALL=C`), and an enforced injected-bundle byte budget.

### Changed
- Restructured core into single-axis files: `PRINCIPLES`→`INVARIANTS`,
  `PRACTICES`→`EXECUTION`, `MODES` first; moved testing/git out of the old
  PRINCIPLES and de-duplicated repeated maxims to one home each.
- The injected bundle is now **brand-neutral**: no "Sentinel"/repo names or
  source paths in the content; the managed-block marker is `AGENT-RULES`; the
  bundle renders as one document with nested section headings.
- Repo-scope `tools/install --check` now fails on a missing required adapter.
- Sharpened and de-duplicated the core rules (fail-safe correctness, blast-radius
  caution, binding mode authority, memory write-authority, bounded retry loop).
- Branch-protection: the owner's ruleset bypass is now `always` (was
  `pull_request`), so the owner can push directly to `main` (no PR) and override
  `ci`/review; non-owners stay fully gated (PR + code-owner review + strict
  `ci`). Source files, `settings.yml`, and the safeguards verifier updated to
  match. Kept in public by design — avoids leaking WIP into public PR diffs.
- Both installers now REFUSE more than one action flag (e.g. `--remove --check`)
  instead of silently letting the last one win — removing a destructive shortcut
  on both `tools/install` and `tools/install.ps1`. The bash/pwsh byte-identity
  guarantee is hardened on boundary inputs (empty `VERSION`, BOM/odd-byte targets
  compared byte-exact like `cmp`) and `.gitattributes` forces LF on the
  extensionless `tools/`+`scripts/` shell entrypoints. The Windows installer is
  proven on amd64 (the real Windows target) by the `windows-latest` job and the
  strict-required bash/pwsh parity test on the amd64 Linux runner.
- Gates are now strict, never silently skipped (gold-standard "a check you did
  not run is not evidence"): `SENTINEL_STRICT=1` (set by CI and `release-check`)
  makes a missing linter or missing `bats` a FAILURE instead of a skip; locally a
  skip is loud and the summary names what was skipped. ShellCheck is now
  **blocking**, runs from one source (`tools/lint-shell`,
  `--source-path=SCRIPTDIR`), and is part of `tools/ci`. `release-check` now runs
  the bats suite (it could previously pass without it). The canonical manifest
  schema is now ENFORCED in CI via `check-jsonschema` (was a doc-only reference).

### Security
- CI supply-chain hardening (public-launch audit): the `lint` job now downloads
  editorconfig-checker and gitleaks, verifies each against a pinned asset
  `sha256` (`sha256sum -c`), and only then extracts — a yanked/retagged/tampered
  upstream release fails loudly instead of executing. `actions/checkout` is
  pinned to a commit SHA (`@08eba0b… # v4.3.0`). `allow_auto_merge: false` added
  to `settings.yml` so the declarative config matches the safeguards script.

### Fixed
- `tools/verify-vendor`: reading an absent `VERSION` leaked a shell
  "No such file" to stderr while still exiting 0 on a structurally incomplete
  vendor; it now reads `VERSION` only when present (it is optional metadata, not
  part of the bundle hash).
- Docs accuracy (public-launch audit): `tool-ingestion.md` points Copilot users
  at the brand-neutral `AGENT-RULES` marker block, not the `make render` debug
  dump (which prints the manifest/layout), and dates the "verified versions"
  snapshot; `THREAT_MODEL.md` states gitleaks is already integrated (not
  roadmap); `consumers.md` shows the exact `verify-vendor` invocation; `README`
  clarifies that the private-term denylist is owner-local.
- Empty-bundle guard: a malformed/unreadable manifest fails loudly instead of
  rendering nothing and hashing to the empty-string sha (jq/no-jq agreement).
- Manifest projection uses `jq 'del(.forbidden_core_terms)'` when jq is present;
  budget rejects non-integers; `tools/status` reads the sha only from the
  generated header line.
- CI `ci` gate runs `if: always()` and fails unless every matrix leg succeeded
  (a skipped required check can read as green otherwise).
- `apply-repo-safeguards.sh` fails closed without jq / a resolved owner id.
- P3 polish: CRLF-safe `VERSION` reads; friendly `--target` errors; escaped
  version match in `release-check`; top-level-anchored no-jq manifest reader;
  `--global` test coverage; de-duplicated/sharpened rule wording.
- CI on public Actions: bumped pinned editorconfig-checker to v3.7.0 (the old
  v2.7.2 release asset 404s upstream); bats end-to-end `check` tests give their
  fixture commit an explicit git identity (`-c user.email/user.name`) so they
  pass on runners with no derivable ident (GitHub `ubuntu-latest`).

### Removed
- `ROADMAP.html` — the canonical roadmap is `ROADMAP.md` (Markdown: diffable,
  grep-able, GitHub-native).

[Keep a Changelog]: https://keepachangelog.com/
[Semantic Versioning]: https://semver.org/
