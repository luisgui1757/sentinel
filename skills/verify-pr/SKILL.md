---
name: verify-pr
description: "Use when the user asks to verify, test or QA a pull request before the merge, and at the proof step of full-stop. An independent tester runs the app at the head of the PR, tries to break each changed behavior and its callers, runs each fault again on the base, and reports each regression with steps to reproduce. It changes no test and no product code."
---

# Verify PR

The tester did not write the change. It uses the app as a user would, tries to
break it, and gives the author steps to reproduce each fault. Green unit tests
are not proof that the app works.

## Tester

- Start the tester as a subagent or a delegate. When the harness lets you pick
  the model, use a model of another family than the author. For example, use a
  GPT tester for a change that Claude wrote.
- In the report, name the model that the tester ran on, as the harness reports
  it after the run. A model that you only asked for is not proof. When the
  harness does not confirm the model, say that you do not know it. When you
  cannot start a tester, do the work yourself, and say that the tester was not
  independent.
- The tester changes no file that git tracks: no test, no product code, no
  config. It keeps notes, logs and screenshots in a temporary folder outside
  the repo.
- Give the tester the PR, the base and head commits, the commands of the repo,
  and this skill. Do not give it your opinion of the change.

## Scope

1. Read the PR: the title, the description, the linked issue and
   `git diff <base>...<head>`. Record the head commit.
2. List each behavior that the diff changes: a function, a route, a page, a
   command, a job, a config key or a message format.
3. Find the callers of each changed behavior. Search the code for each changed
   name.
4. Add the user flows that pass through the changed code, and one smoke flow:
   start the app, open the main page or run the main command, and do one write.
   When the repo has a `featuremap.json`, the `featuremap` skill can list the
   features that use the changed files.

## Run

- Use the commands of the repo first. Read `AGENTS.md`, the README, the package
  scripts and the Makefile for the commands that start the app, wait until it
  is ready, drive it, collect evidence and clean up.
- For a web interface, drive a real browser with Playwright or the browser tool
  of the harness. Collect the console errors, the failed requests, the server
  log and a screenshot or a trace of each fault.
- For a command line tool, an API or a library, run the real command or send
  real requests with real input.

For each changed behavior, try the normal path first. Then try the ways that
break code: empty, very large and invalid input, a repeated submit, cancel,
retry, refresh, back and forward. Also try a slow or failed dependency, and a
user with fewer permissions. Look at the pages and commands next to the change
too.

## Compare with the base

Run each fault again on the base, with the same steps, data and settings. See
`references/blame.md` for the commands.

| Head | Base | Result |
| --- | --- | --- |
| Fails | Passes | Regression. It blocks the PR. |
| Fails | Fails | Existing fault. Report it apart. It blocks only when the PR copies it or makes it easier to reach. |
| Fails for a reason outside the code | Not run | Environment fault. Fix the environment, or report the check as not done. |

When the PR says that it wants a new result, such as a stricter limit, that
result is intended, not a regression. Then test the inputs next to the stated
change, which the PR does not name. They show if the change does more than it
says.

## Stop

Stop when each changed behavior has a result. Also stop after 3 rounds of fix
and run again, or after 30 minutes. A limit gives `incomplete`, never `pass`.

A new push makes the result old. Run again on the new head.

## Report

Start with the verdict: `regressions found`, `pass` or `incomplete`. Then give:

- The PR, the base commit, the head commit and the tester model.
- For each regression: the steps to reproduce, the expected result, the actual
  result, the evidence (log lines, a screenshot path) and the result on the
  base.
- Each existing fault and each environment fault, apart from the regressions.
- What you tested, and what you did not test, with the reason.

The author fixes each regression. Then the tester runs again on the new head.
