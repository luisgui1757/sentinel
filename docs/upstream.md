# Upstream updates

Sentinel keeps selected upstream files in Git so installs work without Git,
network access or submodule setup. `upstream/imports.json` names each repository,
exact revision and selected paths. `upstream/lock.json` records source and output
SHA-256 hashes. The branch name is used only to propose the next revision.

The importer reads source trees and files. It never runs upstream code, installs
skills or changes model settings. Unslop's existing scope and factual safeguards
live in `upstream/unslop.patch.json`. It accepts explicitly reviewed introduction
variants; ambiguous or missing anchors stop the import.
Impeccable's wrapper stays local. Its matching engine pins come from official
release asset digests. Missing hashes or platform assets stop the update.
The supplemental platform and screenshot licenses remain local notices.
Bro is not a dependency; TLDR remains a custom skill.

## Maintainer commands

Use Node.js 22.19 or newer from the repository root:

```sh
node tools/upstream.mjs --check   # offline: detect edited imports or stale inputs
node tools/upstream.mjs --verify  # online: reproduce the exact pinned sources
node tools/upstream.mjs --sync    # regenerate from the manifest's exact revisions
node tools/upstream.mjs --update  # propose current upstream revisions locally
```

Sync and update prepare all files before writing. They preserve local additions,
refuse edited imports and conflicting files, and roll back caught write failures.
After an interrupted process, inspect the diff and `.upstream-sync.local` before
removing that lock. Git remains the recovery source for a power loss or killed process.

Review the generated diff, adaptations, licenses and engine pins. Run `make gate`
and `--verify`, obtain independent review, then publish through the normal PR
workflow. Never repair a conflict by silently replacing the local safeguards.
CI blocks stale lock inputs, changed imports and source mismatches.

## Scheduled proposals

Every Monday at 05:17 UTC, **Upstream imports** uses the same importer and opens
one draft PR on `codex/upstream-skills`. It includes pins, actual imported-file
changes and matching engine metadata. An existing update PR is left untouched,
including human edits. A leftover branch without an open PR stops the bot for
inspection. Commits that do not change selected files produce no update.
Manual dispatch is also available, only on `main`.

To activate the bot, apply the canonical repository safeguards from clean
`main` as described in [governance](GOVERNANCE.md). This enables GitHub's required
PR-creation setting. Merging the code alone does not enable publication.
No extra account token is needed.

If activation was paused, re-enable the workflow after the safeguards pass:
`gh workflow enable upstream-imports.yml`. Start the first live run with
`gh workflow run upstream-imports.yml --ref main` and inspect its result.

Review a bot PR before [approving its workflow runs](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)
if GitHub asks. Confirm that CI starts after approval on the first live dispatch.
If GitHub does not create runs, a maintainer can close and reopen the update PR
to trigger them. Resolve
findings, pass all checks and mark it ready for human review. The bot never
approves, merges or updates an installed copy. Renovate continues to own other
routine dependency updates; this workflow owns only the skill imports.
