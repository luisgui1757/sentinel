---
name: patrol
description: "Use when the user asks for an outer loop, scheduled agents, a nightly or weekly scan, agents that work through the issue queue, or an agent that tests each PR in CI. Sets up patrol jobs in GitHub Actions, GitLab CI or Azure Pipelines: a fix job that turns one ready tracker item into a draft PR, a weekly scan that files at most 3 defects, and a PR test job. The agent job gets no token that can push or open a PR, and nothing merges."
---

# Patrol

Patrol runs coding agents in CI on a schedule. The tracker holds the state. A
person reviews and merges each result.

| Job | Trigger | Result |
| --- | --- | --- |
| Fix | Each workday, or by hand | One item with the label or tag `patrol:ready` becomes one draft PR |
| Scan | Each week | At most 3 new items with `patrol:triage`, each with evidence |
| Verify | Each PR that is not a draft | One comment with the result of an independent test of the PR |

## How it stays safe

Each job has separate CI jobs, and each CI job gets only the access that it
needs:

1. **claim** (fix job only) reads the tracker with the forge token and marks
   one item as `patrol:working`. It runs no agent.
2. **agent** gets the checkout and the key of the model provider, but no token
   that can push, open a PR or change the tracker. `patrol.mjs agent` removes
   the forge tokens from the environment of the agent and stops the agent at
   the deadline. It removes the value of each secret from its files, and saves
   a patch, a report and a result.
3. **publish** gets the forge token. It runs `patrol.mjs` from the default
   branch and does not run code from the patch. It rejects a patch that changes
   CI files, CODEOWNERS, agent instruction files, `tools/patrol/` or `.git`, or
   more than 40 files or 2000 lines. It pushes the branch `patrol/<item>` and
   opens a draft PR, or comments on the PR that is already open.

Patrol never merges and never turns on auto-merge. It takes one item in each
run. An item gets 3 tries. Then it gets `patrol:stuck`, and a person must
look at it.

These risks stay:

- The agent can read the provider key, and code that it runs can read the key
  too. Use a key with a spend limit, for patrol only.
- The verify job runs the code of the PR with the provider key. The GitHub
  and GitLab templates skip PRs from forks.
- On GitLab, each job gets a `CI_JOB_TOKEN`, and the agent can read it while
  the job runs. It cannot push or change issues and MRs. It can publish
  packages, container images and releases of the project. If the project
  does not use its package registry, container registry or releases, turn
  them off. Keep job token push access off.
- Tracker text can try to give the agent orders. The prompts mark it as data,
  and publish checks the patch. A person still reviews each draft.

## Set up

1. Copy the files into the repo:
   - `scripts/patrol.mjs` and `prompts/` to `tools/patrol/`.
   - For GitHub: `templates/github/*.yml` to `.github/workflows/`.
   - For GitLab: `templates/gitlab/*.yml` to `.gitlab/`, and add each file to
     `include` in `.gitlab-ci.yml`. The jobs use the stage `test`. If your
     `stages` list has no `test`, change the stage in the files.
   - For Azure Pipelines: `templates/azure/*.yml` to `.azure-pipelines/`, and
     make one pipeline for each file. If the default branch is not `main`,
     change the branch in the `schedules` of the fix and scan files.
2. Give the agent a key:
   - GitHub: the secret `OPENAI_API_KEY`.
   - GitLab: the masked CI/CD variable `AZURE_OPENAI_API_KEY`, and a CI/CD
     variable `CODEX_CONFIG` of the type File with the Codex settings of your
     provider.
   - Azure: a variable group `patrol` with the secret `AZURE_OPENAI_API_KEY`,
     and a secure file `codex-config.toml` with the Codex settings of your
     provider. The template copies it to `~/.codex/config.toml`.
3. Give the publish job access:
   - GitHub: a PR that the default `GITHUB_TOKEN` opens starts no workflow, so
     CI does not run on it. Add a secret `PATROL_GH_TOKEN` with a fine-grained
     token or a GitHub App token that can write contents, issues and pull
     requests. The templates use `GITHUB_TOKEN` when the secret is missing.
   - GitLab: make a project access token with the Developer role and the
     scopes `api` and `write_repository`. Put it in the CI/CD variable
     `PATROL_GITLAB_TOKEN`, protected and masked, with the environment scope
     `patrol`. Only the claim and publish jobs use that environment, so the
     agent job never gets the token.
   - GitLab verify: make a second token with the Reporter role and the scope
     `api`. That role can comment, but it cannot push or merge. Put it in a
     variable with the same name, masked but not protected, with the
     environment scope `patrol-verify`. A merge request pipeline gets no
     protected variable. A person who can push a branch can read this token
     through the CI file. The token gives that person no new right.
   - Azure: give the build service of the project the rights to contribute,
     to create branches, to contribute to pull requests, and to edit work
     items.
4. On GitHub, make the labels once:
   `gh label create patrol:ready`, then the same for `patrol:working`,
   `patrol:done`, `patrol:stuck` and `patrol:triage`. On GitLab, make the
   label `patrol:ready` once, so that people can select it. GitLab makes the
   other labels when patrol first adds them. Azure tags need no setup.
5. On GitLab, make two pipeline schedules on the default branch. Give one the
   variable `PATROL_JOB` with the value `fix` and run it each workday. Give
   the other `PATROL_JOB=scan` and run it each week.
6. Run each job once by hand, for example with
   `gh workflow run patrol-fix.yml`, with "Run pipeline" and the same
   `PATROL_JOB` in GitLab, or with "Run pipeline" in Azure. Check
   the draft PR, the comment, or the new items. When you may not run the jobs,
   tell the user the secrets to add and the command that starts each job once.

To use another agent, change the install step and `PATROL_AGENT`, and give
the agent job its key. Any command that reads the prompt on stdin works:

| Agent | `PATROL_AGENT` | Key |
| --- | --- | --- |
| Claude Code | `claude -p --dangerously-skip-permissions` | `ANTHROPIC_API_KEY` |
| Kiro CLI | `kiro-cli chat --no-interactive --trust-all-tools "$(cat)"` | `KIRO_API_KEY` |
| Copilot CLI | `copilot -p "$(cat)" --allow-all-tools` | `COPILOT_GITHUB_TOKEN` |

`patrol.mjs agent` removes `GH_TOKEN` and `GITHUB_TOKEN`, so Copilot CLI must
get its token as `COPILOT_GITHUB_TOKEN`.

## GitLab notes

- A GitLab schedule also runs your other jobs that have no rules. To run only
  patrol, add this first rule to those jobs: `- if: $PATROL_JOB` with
  `when: never`.
- The patrol jobs run only in schedules, in merge request pipelines, and in
  pipelines that a person starts with "Run pipeline" or the API. A pipeline
  that a job token starts cannot run them. If your `workflow:rules` stop
  merge request pipelines, allow them for verify.
- GitLab starts no pipeline when a draft MR becomes ready. Run the pipeline of
  the MR again.
- Any runner works if each job gets a new container, for example with the
  Docker or Kubernetes executor, and a job cannot read the credentials of the
  runner machine. The claim and publish jobs make a new clone. So files that
  the agent left in a shared build folder cannot change them.

## Report

End with these facts:

- The files that you added.
- The secrets and permissions that the user must set.
- The command that starts each job once.
- Each step that you did not run.

## Work the queue

A person or a triage agent adds `patrol:ready` to an item that is clear enough
to fix. To try a done or stuck item again, add `patrol:ready` to it again. Each
item moves through these states:

| State | Meaning |
| --- | --- |
| `patrol:ready` | Waiting for the fix job |
| `patrol:working` | Claimed. The lease ends after 120 minutes, and then a run can claim it again. |
| `patrol:done` | A draft PR is open |
| `patrol:stuck` | 3 tries gave no change |
| `patrol:triage` | Filed by the scan. A person decides. |

On GitHub and GitLab, a comment on the item holds the number of tries and the lease. On Azure,
the tags `patrol:try-<n>` and `patrol:until-<time>` hold them.

## Commands

```sh
node tools/patrol/patrol.mjs claim --forge github|gitlab|azure --out item.json [--label patrol:ready] [--lease 120] [--max-attempts 3]
node tools/patrol/patrol.mjs agent --prompt FILE --out DIR [--item item.json] [--minutes 45]
node tools/patrol/patrol.mjs publish --forge github|gitlab|azure --in DIR --mode pr|comment|issues [--item item.json] [--pr N] [--base main] [--type Bug] [--label patrol:ready]
```

When the team already has a queue label, such as `ready`, give it with
`--label` to `claim` and to `publish` in the fix job.

`agent` runs the command in `PATROL_AGENT` with the prompt on stdin. It sets
`PATROL_OUT` to the output folder, which must be outside the repo. The agent
writes `report.md` there, and the scan also writes `findings.json`.

To test a change to the scripts, set `PATROL_AGENT` to a small script that edits
one file and writes `report.md`. Then run `agent` and `publish` against a test
repo.
