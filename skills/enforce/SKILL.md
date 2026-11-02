---
name: enforce
description: "Use when a mistake happened before and the user wants a check that stops it, or asks to turn a rule into a lint rule, a CI check or a hook. Picks the enforcer for the class of the rule, proves that the check fails on the old mistake and passes on the fix, and adds it to CI."
---

# Enforce

Turn a rule or a repeated mistake into a check that runs without a person. A
check whose message names the fix stops the mistake. A line in a rules file
only asks.

Use the strongest fix that the task allows. In order: a design that makes the
mistake impossible, a type, a lint rule whose message names the fix, a test,
then documentation.

## Pick the class

| Class | Enforcer | Example |
| --- | --- | --- |
| Code pattern | The linter that the repo already runs. ast-grep when that linter cannot express the rule. | No `process.env` read outside the config module |
| Diff pattern | `scripts/diffcheck.mjs` in CI, on the diff of the PR | No added suppression, skipped test, deleted test or removed assertion |
| Agent action | A hook or a command rule of the agent host | Block `gh pr merge` and a push to `main` |
| Prose | `ste-lint` in CI | Sentences of 20 words or fewer |
| Judgment | One line in the review checklist. No tool enforces it. | The smallest change that solves the task |

## Steps

1. Find each copy of the mistake. Search the code, and the history with
   `git log -S '<text>'` or `git log -G '<regex>'`. Keep one old bad example
   as the failing example and its fix as the passing example.
2. Write the check with the enforcer of its class. Write a message that names
   the fix, for example "Read API_URL with config.get('API_URL')".
3. Run the check on the failing example and see it fail. Run it on the fix and
   see it pass. Then run it on the whole repo.
4. Fix each copy that the check finds, or list each copy in the report. Do not
   add a check that fails on the default branch unless the task fixes each
   copy, or the user agrees to a baseline.
5. Add the check to the CI job that already runs lint. Add a new job only when
   no job runs lint.
6. Report the check, the CI job that runs it, the failure that you saw, and
   each copy that is still open.

A check in CI must run from the repo, not from your skill folder. Copy a script
from this skill into the repo, for example to `tools/`, and commit it.

## Code pattern

Use a rule of the linter that the repo already runs:

| Linter | Rule |
| --- | --- |
| ESLint | `no-restricted-syntax`, `no-restricted-imports`, `no-restricted-properties` |
| Ruff | `TID251` (banned API) with `[lint.flake8-tidy-imports.banned-api]` |
| Clippy | `disallowed_methods`, `disallowed_types` in `clippy.toml` |
| clang-tidy | A check in `.clang-tidy`, or a `-Werror=` flag in the build |
| golangci-lint | `forbidigo`, `depguard` |

When no linter of the repo can express the rule, use ast-grep. See
`references/ast-grep.md`. It parses many languages and runs a test file of
valid and invalid examples for each rule.

## Diff pattern

Some mistakes show only in a diff: an added suppression, a skipped test, a
deleted test file, or a removed assertion. Copy `scripts/diffcheck.mjs` into the
repo and run it in CI on the PR:

```sh
node tools/diffcheck.mjs --base <base commit> [--head <commit>] [--config diffcheck.json]
```

It exits 0 when it finds nothing, 1 when it finds something, and 2 on an error.
Each line names the kind, the file, the line and the text. A finding needs a
review. It does not prove a fault: a test can move, and a suppression can be
right.

The default patterns cover common linters, test frameworks and test paths in
JavaScript, TypeScript, Python, Go, Rust, Java, C and C++. A config file with
the keys `suppressions`, `skips`, `tests` and `assertions` replaces that list of
regular expressions. An empty list turns that kind off.

In GitHub Actions, check out the full history and compare with the base of the
PR:

```yaml
- uses: actions/checkout@v7
  with:
    fetch-depth: 0
- run: node tools/diffcheck.mjs --base "${{ github.event.pull_request.base.sha }}"
```

In Azure Pipelines, use `fetchDepth: 0` on the checkout and
`--base "origin/$(System.PullRequest.targetBranchName)"`. Add the pipeline to a
build validation branch policy. In GitLab CI, set `GIT_DEPTH: 0` and use
`--base "$CI_MERGE_REQUEST_DIFF_BASE_SHA"` in a merge request pipeline. When a
reviewer accepts a finding, the reviewer approves the PR with the check red.
Or the repo adds the case to its config.

## Agent action

A hook stops an agent before a command runs. See `references/hooks.md` for
Claude Code and Codex. When the host has no hook, say so, and rely on branch
protection.

A hook guards one agent on one machine. Protect the branch on the server too.

## Prose

Run `ste-lint` from the `agent-ste` package in CI, with a pinned version:

```sh
npx --yes --package agent-ste@0.5.2 ste-lint README.md docs/*.md
```

## Judgment

Add one line to the review checklist of the repo, for example the PR template.
Say in the report that no tool enforces it.
