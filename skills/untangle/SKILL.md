---
name: untangle
description: Finds the parts of a repository, or of one area, that its objective does not need, and removes them only with proof that behavior and numeric results stay the same. Use only when the user asks to untangle, reduce complexity, or find what to cut or delete. Not for the review of one diff.
---

# Untangle

Find the parts of a codebase that do not serve its objective. Remove or merge
them only with proof. "Already minimal" is a correct and complete result. Do
not make a change to show progress.

This skill changes no files until the user approves a list of proposals.
Apply a proposal only when the user asks.

## Budget

- A run has two passes at most: the analysis in steps 1 to 5, and one check
  pass in step 6. Never start a third pass.
- Do not start subagents or other reviewers, unless the user asks. One agent
  keeps the full map, so that a second run gives the same result.
- If the check pass finds a material proposal, report it and stop. Start a new
  run only when the user asks.

## 1. Write the contract

Read the README, the public interfaces, the persisted formats, the tests of
public behavior and the CI gate. Then write the contract:

- The objective of the repository, in one or two sentences.
- Each behavior that a user or a caller needs. Include commands, interfaces,
  file formats, outputs and supported platforms.
- Each numeric output, with the tolerance that the project states. If the
  project states no tolerance, the output must stay byte-equal.
- The gate: the commands that must pass.

Give the source of each item. Show the contract to the user and wait for
approval. If the evidence does not give a contract, stop and ask.

A feature that the user keeps on purpose belongs in the contract. If the
README does not name it, propose one README line for it. Conventional behavior,
such as `--help` or exit codes, and files that a tool reads, such as
`.editorconfig`, need no README line. Do not keep a file of rejected
proposals.

## 2. Map each part to the contract

List files, modules, functions, dependencies, configuration, CI jobs, scripts,
tests and documents. Find the contract item that each part serves.
Use references, imports, call sites, CI configuration and links as evidence.
Do not judge a part by its name.

Build the `Kept` list now, with the three groups in step 5.
Add each matching part, even when it never becomes a removal proposal.
Record its exact name, the reason to keep it and the evidence.

## 3. Find candidates

A part is a candidate when it has one of these problems:

- Dead: nothing calls, imports, runs or links to it.
- Duplicate: two parts give the same behavior.
- Speculative: an option, host, mode or layer that no user or caller uses.
- Defensive: a guard for a state that the contract, the types or the callers
  exclude.
- Ceremony: a check, a document or a step that only verifies another check,
  document or step.
- Frozen: a test that locks wording, file layout or a private helper, and no
  behavior of the contract.
- Tangled: a layer with one caller and no boundary, or a dependency in the
  wrong direction.

If you do not know why a part exists, read its history with `git log` first.
Keep the part if the reason still applies.

A candidate is material when its removal takes away a whole part. Examples are
a file, a dependency, a CI job, an option, a layer or a code path. Other
candidates are nits, such as one guard condition or one assertion.

## 4. Apply the gate

Each proposal needs all of this evidence:

- No contract item depends on the part. Show the search that proves it.
- Each behavior that moves has a new place, and you name it.
- A plan to compare before and after: the gate passes, and the observable
  outputs stay equal. For numeric code, use the fixtures of the project and
  representative inputs. Compare the results byte for byte, or within the
  stated tolerance.

If you cannot get this evidence, keep the part and give the reason. Do not
propose to remove these parts:

- A part that the contract names.
- A security boundary or the validation of external input.
- A migration, or a reader for an old persisted format that is still in use.
- A license, a notice or a credit.
- The only test of a contract behavior.

## 5. Report

Start with "Already minimal", or the number of material proposals and whether
you applied them. "Already minimal" means that no material proposal passes
the gate.

Use this format before changes and after approved changes.

### Contract

Give the objective, needed behavior, numeric tolerance and gate, with sources.

### Cuts

List proposals with the largest gain first.
For each, give the part, problem, evidence, change and size.
After changes, state which proposals you applied.

### Kept

Copy the list from step 2.
Give each part its own line with its exact name, reason and evidence.
Use these groups:

- Public interfaces: parts that external callers need, even without internal
  callers.
- Runtime selection: functions or files selected through names built at runtime.
  Name the selected parts and the code that selects them.
- Compatibility: readers for older data and branches for supported modes or
  external settings.

Add other rejected candidates with their reasons.
Write "None found" for an empty group only after checking it.
A contract statement does not replace an entry in this list.

### Proof

Before changes, give the planned checks and output comparisons.
After changes, give the actual results before and after each cut.
State the check-pass result and each check that did not run.

### Nits

Give one line for each nit.
Apply a nit only when the user asks.

## 6. Apply, when the user asks

Apply one proposal in each commit. Capture the outputs before the change. Make
the change, run the gate and compare the outputs again. If a result differs,
revert that proposal and report it. Do not change behavior to make a
comparison pass.

After the last proposal, run steps 2 to 4 again as the check pass. It must
find no new material proposal from the same evidence. If it finds one, report
it as a gap in the first run. Do not apply it.

Finish with the report from step 5, including every retained entry in `Kept`.
