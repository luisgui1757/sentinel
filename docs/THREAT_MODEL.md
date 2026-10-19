# Threat model

Sentinel publishes reusable rules and skills. Its privacy checks look for known
private terms, home paths and secret patterns before they enter a public tree.
They cannot prove that a repository contains no private data.

## Assets and boundary

Protect private project names, internal domains, machine-local paths and the
integrity of installed rules and skills. Sentinel should hold no credentials,
tokens or user data.

The maintainer's machine and its gitignored `tools/forbidden-terms.local` are
trusted. Treat committed files, repository history, CI logs and published bundles
as public. A commit can remain accessible after it is deleted from a branch.

This model covers mistakes: an author or agent includes private content, a
scanner repeats it in a diagnostic, or a consumer runs altered or stale code
while believing it has a pinned release. It does not model a malicious owner
who deliberately disables controls or publishes their own secrets.

## Controls

- **Separate denylists.** `MANIFEST.json` contains generic, publishable patterns.
  Private terms stay in the ignored local file and are never enumerated publicly.
- **Whole-working-tree scan.** `tools/check` scans tracked and untracked files
  except ignored files, plus path names and the manifest. Unreadable paths and
  scanner errors fail the check.
- **Redacted findings.** Private matches report a location without matching
  content. Private terms in paths are masked too. Generic patterns may be shown.
- **Rule integrity.** Generated blocks include `bundle-sha256`. `tools/status`
  compares the entire managed block, so a current header cannot conceal an
  altered body. `tools/verify-vendor` requires the expected pinned hash by default.
- **Executable dependencies.** Actions use approved GitHub-owned sources and full
  commit SHAs. Python CI tools use a hash-required transitive lock. Native tools
  use pinned versions and verified digests before execution. Repository-policy
  checks reject mutable or disallowed workflow inputs.
- **Immutable releases.** GitHub's immutable-release control protects published
  tags and assets from replacement. Verify the effective setting before release.
- **Upstream proposals.** Only the main-only import bot has workflow write access.
  It treats upstream files as data and opens a draft PR. It never approves,
  merges or installs them. Install reviewed Sentinel revisions. For bot PRs,
  a maintainer approves the workflow runs before CI executes a changed engine.
  Source verification and normal merge gates still apply.
- **Optional skills.** Ownership hashes prevent overwriting unowned or edited
  copies. Caught failures restore replaced folders; interrupted operations retain
  staging backups for explicit recovery. Imported files retain source hashes
  and licenses. Impeccable setup verifies pinned engine bytes before saving them,
  and its helper verifies them again before execution. Installation registers no
  upstream hooks or provider configuration.

## Limits

- The private-term scan only knows configured strings. Add new terms before
  writing about them. Gitleaks scans known secret patterns across Git history;
  it complements the private-term scan and cannot identify every secret.
- Encoded, hashed or split terms can evade matching. Plain words match case
  sensitively at word boundaries. Add relevant inflections, case variants and
  compound forms to the private list.
- Without jq, manifest reading is approximate; a bracket inside a term can
  truncate its generic list. The strict gate requires the full toolchain.
- The content scanner does not follow symlinks outside the tree. It still checks
  their names. The skills installer separately refuses destination symlinks.
- `tools/check` scans the current working tree, not historical private terms.
  History may already contain a leak that the current check cannot find or remove.
- Force-adding the local denylist or disabling its ignore rule exposes its terms.
- Skill instructions do not enforce model permissions or sandboxing. Hosts own
  those controls. Installation and configured roles do not prove runtime behavior.

## Operating rules

Run `make ci` for local preflight and `make gate` before pushing. Install the
pre-push gate with `make install-hooks` when wanted. Keep the local denylist
private and current. Never print private matches to debug a scan. Treat a green
result as "no known leak found."
