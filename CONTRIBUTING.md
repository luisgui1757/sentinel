# Contributing

Sentinel owns a small default rule set and optional task skills. Rules belong in
`core/` only when they are generic, actionable, non-redundant and useful across
projects. Put provider mechanics and task workflows in skills or references.
The rendered rules have an 8 KiB ceiling; that is a limit, not a target.

## Make a change

1. Read the affected code or skill, its callers and relevant documentation.
2. Make the smallest complete change. Update the docs and behavioral scenario.
   Edit `core/` and run `tools/install` to regenerate rule blocks.
3. Run the focused checks, then `make gate`. Exercise installed behavior in
   disposable profiles; source checks alone do not prove an agent workflow.
4. Get independent review of the complete final diff and actual check output.
   Fix valid findings, rerun affected checks and obtain review of corrections
   before publication. Do not weaken a required gate.

Keep review findings and concise verification in the PR. Preserve raw evidence
privately when needed. Do not add review diaries, source-search reports or audit
folders. Put durable constraints in the relevant guide, and explain rejected
findings in the PR. Git retains removed files and historical decisions.

## Checks

Use Node.js 22.19 or newer, Bash, Git, jq, bats-core, PowerShell, ShellCheck,
Gitleaks, editorconfig-checker and the pinned Python tools from
`.github/ci-requirements.txt`.

```sh
make install  # regenerate this repository's rules
make gate     # strict preflight, Bats, Node tests and PowerShell drift
```

CI adds Linux/macOS coverage and native Windows installation tests. Live agent
checks use configured accounts and the scenarios under `evals/`; keep their logs
out of Git. See [limits](docs/limits.md) for unverified host behavior.

PowerShell creates runtime folders even with `-NoProfile`. Keep its runtime
profile separate from the installer's `HOME` target; no-write checks require
that target to stay empty. Test the `USERPROFILE` fallback separately.

Bot CLI guard tests clear PATH and credentials so a broken guard cannot reach
a real remote. Publication tests use a disposable Git remote and mock only gh.

## Skills and third-party files

Custom entrypoints should normally stay under 100 lines, and under 150 unless
more detail prevents a real failure. Make the use case clear in the description.
Apply Unslop to authored prose. Keep detailed provider mechanics in references.

Update `skills/catalog.json`, the command guide and package tests when adding a
skill or dependency. Referenced internal procedures have no `SKILL.md` and are
not installed as separate commands. Packaging cycles are allowed; workflow
recursion is not. Keep dependencies intact when copying a bundle.

Helix owns shared implementation and review. Delivery callers carry the selected
review procedure, findings and used rounds through PR fixes. Sol-loop replaces
the default review loop when explicitly selected; helpers cannot reset its budget.

Keep Anthropic's Frontend-design and its license byte-identical to the pinned
source. Preserve Unslop's numbered rules and license. Impeccable's original
entrypoint is `UPSTREAM.md`; its files remain byte-identical to the upstream
lock. Sentinel's small wrapper and pinned engine helper are separate additions.
Use [the importer](docs/upstream.md), not manual copying. Keep adaptations in
`upstream/`; a changed upstream anchor must stop for review rather than guess.
Update source revisions, digests and notices together. Do not reformat imports
or exclude whole directories from secret scanning.

## Installation and governance

The rules installers own only managed blocks. The Node skills installer owns
only folders recorded in its destination registry; refuse collisions and edits.
Keep the Bash/PowerShell host paths and metadata consistent. Test global as well
as project installation, including native Windows.

Use a PR with a clear conventional commit title. Do not add model signatures or
agent attribution trailers. Preserve human credit and licenses. Main's required
checks and approvals remain in force. Merge authority and changes to repository
protections require an explicit request. See [governance](docs/GOVERNANCE.md).

CI dependency updates must change the version, asset path and matching verified
digest together. Renovate's native-tool regex does not update the digest for you.
