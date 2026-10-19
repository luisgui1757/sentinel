# Repository Governance

Sentinel's checked-in policy and GitHub's effective policy must agree. A green
source-tree check is not proof of live enforcement, and a successful API write
is not proof of the resulting state.

## Canonical sources

- `.github/rulesets/main-integrity.json` owns unbypassable merge integrity.
- `.github/rulesets/main-review.json` owns review semantics.
- `.github/rulesets/main-owner-updates.json` prevents direct branch updates.
- `.github/settings.yml` owns non-branch repository settings only.
- `renovate.json` owns routine version updates; GitHub-native Dependabot owns
  vulnerability alerts and security updates. The upstream import workflow owns
  only the three vendored skill sources in `upstream/imports.json`.
- `.github/ci-requirements.in` owns direct Python CI-tool pins; its generated
  `.txt` lock pins the transitive graph and accepted SHA-256 artifact digests.
- `scripts/apply-repo-safeguards.sh` is the sole live apply path.

Classic branch protection must be absent. It is not a fallback: overlapping
branch mechanisms create two sources of truth, stale required contexts, and an
effective policy that neither checked-in source describes.

## Required live state

| Boundary | Required state |
| --- | --- |
| Integrity | PR, strict GitHub Actions `ci`, CodeQL errors and high-or-higher security alerts, linear history, no delete, no non-fast-forward; no bypass actors |
| Review | One code-owner approval, stale-review dismissal, last-push approval, resolved threads; owner bypass only in `pull_request` mode |
| Updates | Only the owner may bypass the update rule, and only in `pull_request` mode |
| Merge methods | Squash only; auto-merge disabled; merged branches deleted |
| Actions | Enabled; selected GitHub-owned Actions only; full commit SHA required; default token read-only; PR creation enabled for the import bot |
| Security | Secret scanning, push protection, Dependabot security updates, private vulnerability reporting, and weekly default-suite CodeQL for Actions and JavaScript/TypeScript enabled |
| Releases | Immutable future releases enabled |

The stable required status context is `ci`; its workflow aggregates every
blocking job. New blocking jobs join that aggregate instead of becoming another
ruleset context.

CodeQL must cover both Actions and JavaScript/TypeScript. GitHub's default setup
[adds supported languages automatically](https://docs.github.com/en/code-security/concepts/code-scanning/setup-types)
when the code changes. Additional language entries are accepted; losing either
required language fails verification.

Only `upstream-imports.yml` grants job-level `contents: write` and
`pull-requests: write`. It runs from `main` on a schedule or manual dispatch,
opens one draft update and never approves or merges it. CI stays read-only.
GitHub's PR-creation setting also permits review submission; GitHub offers no
separate toggle. The workflow submits none, and code-owner review remains required.
Bot-created PR workflows may need a maintainer to select **Approve workflows to
run** before checks start. This is separate from approving the PR's contents.

The workflow is JSON, which GitHub accepts as YAML. This lets the existing jq
policy check validate its exact permission scopes without adding a YAML parser.
The workflow allowlist contains only CI and upstream imports. Adding a workflow
requires an explicit policy update; renaming the bot cannot evade its checks.

## Verification and cutover

Local source checks:

```bash
make gate
tools/ruleset-check
tools/repository-policy-check
```

Live changes occur only after the policy PR is merged. From a clean checkout of
`main` whose `HEAD` exactly equals GitHub's current `main`:

```bash
scripts/apply-repo-safeguards.sh --preflight-only luisgui1757/sentinel
scripts/apply-repo-safeguards.sh luisgui1757/sentinel
tools/ruleset-check --repo luisgui1757/sentinel --owner-id 139752288
```

Preflight proves repository identity, clean exact-main state, local policy,
successful exact-head CodeQL analysis, and non-duplicated live ruleset names.
Immediately before its first write, apply checks `main` again for concurrent
drift. It then applies every control and reads the effective state back through
GitHub's APIs.

macOS's bundled Bash 3.2 is supported. Absent classic protection is a normal
HTTP 404, not an apply failure. An unreadable vulnerability-alerts setting stops
snapshot capture before any write. A failed classic-protection read after writes
triggers rollback.

## Recovery

Before writing, the apply script stores a mode-`0600` JSON snapshot under the
repository's git common directory. It includes the repository, Actions,
security, immutable-release, ruleset, and prior classic-protection state. A
failed apply automatically restores it. Retain the printed path until postflight
verification is complete; an explicit replay is:

```bash
scripts/apply-repo-safeguards.sh --restore /absolute/path/to/snapshot.json luisgui1757/sentinel
```

If rollback itself fails, stop all further mutations and use that exact command.
Do not improvise partial settings in the GitHub UI: restore the captured state,
re-establish a clean exact-main baseline, correct the source, and retry.
