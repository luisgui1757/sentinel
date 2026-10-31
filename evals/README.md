# Skill evals

These cases measure whether a skill or a rule changes what an agent does. Each
case runs two times on each target model:

- **with**: a fresh install of all skills and the current rules.
- **without**: the same install without the skill of the case, or without
  the skills in `without_skills`. For a rule case, the rules from the `base`
  commit of the case, or from `origin/main`, replace the current rules.

Run `make eval` from the repo root. See the root `README.md` for the options.

## Read the results

| Result | Meaning |
| --- | --- |
| Gain | The **with** arm passes more runs than the **without** arm. |
| Tie, both pass | The model does the task without the skill. The case does not show a gain for this model. |
| Tie, both fail | The task is too hard for this model at this effort, or the skill does not help. |
| Not loaded | The **with** arm did not read the skill. The result then measures the trigger of the skill, not its content. |
| Loss | The **without** arm passes more runs. Examine the skill text first. |

A run stops after one try per arm when both arms give the same result. When
the arms differ or a run ends with an error, each arm runs 3 times. So `1/1`
against `1/1` is a tie, and `3/3` against `0/3` is a gain. A case with
`load: false` tests the trigger. It runs only the **with** arm, one time.

A sample of 1 to 3 runs per arm finds large effects only. A tie does not prove
that a skill has no effect.

## Results

### Conclusion

- 11 skills and rules help on at least 2 of 5 models. `council`, `cleanup`,
  `no-comments`, the no-comments rule and the cleanup rule help on 5 of 5.
  `technical-writing` helps on 4.
- `sol-loop` and `maintain-formal-verification-skill` help on 3 models.
  `why`, `create-formal-verification-skill` and `statechart` help on 2.
- `maintain-verification-skill` helps on Terra. On Luna, it helped in one run
  and tied in the next.
- `tldr` helps on Sol only. Two changes to its text did not make it help on
  the other models.
- `create-verification-skill` and `how` show no gain: each model did the task
  without them. `how` is now in the optional `explain` profile.
- A council of 3 strong models found almost each planted bug, with copies or
  with mixed models. The review case cannot tell them apart.

Runs of 31 October 2026, at xhigh effort. Each cell gives the passes **with**
· **without** the skill. Haiku loaded each skill in these runs.

### Changes to the method

The first runs had ties that the method caused, not the models:

- The **without** arm now removes the whole family of the skill
  (`without_skills`). Before, a related skill gave the same help.
- A rule case now takes the old rules from a fixed commit (`base`). Before,
  `origin/main` already had the new rules after a merge.
- Both arms install all profiles, and a rule tells the agent to read the skill
  that fits the task. Before, Haiku did not load 6 of the skills.
- Harder cases replace the cases where each model passed both arms. We fixed
  the checks that failed correct work.
- The examples in a skill must not contain facts of its own case.

### Guide

| Skill | Result at xhigh | Use |
| --- | --- | --- |
| `council` (design mode) | Gain on 5 of 5. | Use it. |
| `cleanup` | Gain on 5 of 5. | Use it. |
| `no-comments` | Gain on 5 of 5. | Use it. |
| No-comments rule | Gain on 5 of 5. | Use it. |
| Cleanup rule | Gain on 5 of 5. | Use it. |
| `technical-writing` | Gain on Opus, Haiku, Sol and Terra. Luna ties. | Use it. |
| `sol-loop` | Gain on Opus, Sol and Luna. Haiku and Terra fail both arms: the report leaves a finding open, or does not show the finding that it fixed. | Use it. |
| `maintain-formal-verification-skill` | Gain on Sol, Terra and Luna. Opus and Haiku pass both arms. | Use it. |
| `why` | Gain on Haiku and Luna. Opus, Sol and Terra pass both arms. | Use it. |
| `create-formal-verification-skill` | Gain on Opus and Luna. Haiku, Sol and Terra pass both arms. | Use it. |
| `statechart` | Gain on Opus, small gain on Terra. Sol passes both arms and Luna ties. Haiku fails both arms: it calls a real bug a decision. | Some gain. |
| `maintain-verification-skill` | Gain on Terra. Luna gained in one run and tied in the next. Opus, Haiku and Sol pass both arms. | Some gain. |
| `tldr` | Gain on Sol. Opus and Haiku fail both arms: the summary is longer than 35% of the source. Luna and Terra drop facts. | Gain on Sol only. |
| `create-verification-skill` | No gain. Sol passes 2 of 3 with it and 3 of 3 without it. The others pass both arms. | No measured gain. |
| `how` | All models pass both arms. | No measured gain. |
| Triggers | `cleanup`, `council` and `tldr` stay unloaded for a question that only looks like their task. | Correct. |

"No measured gain" means that the model did the task of the case without the
skill. A harder case can still show a gain.

### xhigh

| Case | opus-5.5-xhigh | gpt-6.1-sol-xhigh | gpt-6.1-terra-xhigh | haiku-5.5-xhigh | gpt-6-luna-xhigh |
|---|---|---|---|---|---|
| cleanup-repo | 3/3 · 0/3 | 3/3 · 0/3 | 3/3 · 0/3 | 2/2 · 0/3 (1 error) | 3/3 · 0/3 |
| council-design | 3/3 · 0/3 | 3/3 · 0/3 | 3/3 · 0/3 | 3/3 · 0/3 | 3/3 · 0/3 |
| create-formal-lease | 3/3 · 0/3 | 1/1 · 1/1 | 1/1 · 1/1 | 1/1 · 1/1 | 3/3 · 0/3 |
| create-verification-export | 1/1 · 1/1 | 2/3 · 3/3 | 1/1 · 1/1 | 1/1 · 1/1 | 1/1 · 1/1 |
| how-tax-production | 1/1 · 1/1 | 1/1 · 1/1 | 1/1 · 1/1 | 1/1 · 1/1 | 1/1 · 1/1 |
| maintain-formal-merges | 1/1 · 1/1 | 2/3 · 0/3 | 3/3 · 0/3 | 1/1 · 1/1 | 3/3 · 1/3 |
| maintain-verification-drift | 1/1 · 1/1 | 1/1 · 1/1 | 3/3 · 0/3 | 1/1 · 1/1 | 0/1 · 0/1 |
| neg-cleanup-question | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 |
| neg-council-review | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 |
| neg-tldr-explain | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 |
| no-comments-claims | 3/3 · 1/3 | 3/3 · 0/3 | 2/3 · 0/3 | 3/3 · 0/3 | 3/3 · 0/3 |
| rule-cleanup-replace-pr | 3/3 · 0/3 | 3/3 · 0/3 | 3/3 · 0/3 | 3/3 · 0/3 | 2/3 · 0/3 |
| rule-no-comments | 3/3 · 0/3 | 3/3 · 0/3 | 3/3 · 0/3 | 3/3 · 0/3 | 3/3 · 0/3 |
| sol-loop-pagination | 3/3 · 0/3 | 3/3 · 0/3 | 0/1 · 0/1 | 0/1 · 0/1 | 2/3 · 0/3 |
| statechart-order-drift | 3/3 · 0/3 | 1/1 · 1/1 | 3/3 · 2/3 | 0/1 · 0/1 | 2/3 · 2/3 |
| technical-writing-rewrite | 3/3 · 1/3 | 3/3 · 1/3 | 3/3 · 0/3 | 2/3 · 0/3 | 2/3 · 2/3 |
| tldr-long-reply | 0/1 · 0/1 | 3/3 · 0/3 | 0/1 · 0/1 | 0/1 · 0/1 | 0/1 · 0/1 |
| why-retry-issue | 1/1 · 1/1 | 1/1 · 1/1 | 1/1 · 1/1 | 3/3 · 0/3 | 3/3 · 0/3 |

Three Luna cells come from a rerun after three check fixes:
`create-formal-lease`, `rule-cleanup-replace-pr` and
`maintain-verification-drift`.
In the run before the fixes, Luna had 2/3 · 0/3 on
`maintain-verification-drift`.

The runs at medium effort used the first method and older cases. Git history
has their table.

### Council composition

`review-billing-bugs` asks for a plain review of a branch with 12 planted bugs.
The branch also has one correct function that looks like a bug. Each model reviewed it alone
4 times at high effort. One judge checked each bug. A council finds a bug when
one of its members finds it. Each council below is the union over all
combinations of member reviews from this pool.

| Model alone | Bugs found, mean of 4 (of 12) | Seconds for each review | False alarms |
| --- | --- | --- | --- |
| Opus 5.5 | 11.75 | 143 | 0 of 4 |
| Sol 6.1 | 11.75 | 159 | 0 of 4 |
| Terra 6.1 | 11.50 | 117 | 0 of 4 |
| Astra 6 | 11.00 | 150 | 0 of 4 |

| Council | Combinations | Bugs found, mean (of 12) | Combinations that found all 12 |
| --- | --- | --- | --- |
| Astra + Sol + Opus | 64 | 12.00 | 64 |
| Terra + Opus + Sol | 64 | 12.00 | 64 |
| Terra + Opus + Terra | 24 | 12.00 | 24 |
| Terra + Opus + Opus | 24 | 12.00 | 24 |
| Opus + Sol | 16 | 12.00 | 16 |
| Opus x3, Sol x3, Terra x3 | 4 each | 12.00 | 4 each |
| Terra + Opus | 16 | 11.94 | 15 |
| Astra x3 | 4 | 11.75 | 3 |

So this case does not separate copies from mixed models. Three seats of one
strong model find each bug, and so do two different strong models. The misses
were on two bugs that need the rules in the README: the stale cache and the
grace period.

## Case format

Each folder is one case. It uses the format of the Anthropic skill evals, with
some files of our own:

| File | Use |
| --- | --- |
| `prompt.md` | The task that the agent gets. |
| `graders/NN-*.md` | A statement with `type: llm`. Two judges, Claude Opus and GPT Sol at high effort, get the task, the final reply and the diff. Both must find the statement true. `--judges claude` uses only the first. |
| `eval.json` | `skill` or `rule`, and these options: `timeout` in seconds, `requires` (commands that must be on the `PATH`), `load: false` (the skill must not load, for cases that test the trigger), `judge_files` (files from `files/` that the judges also get), `judge_trace: true` (the judges also get the commands that the agent ran, with their output), `arms` (for example `["with"]` for a case with no skill), `targets` (the target ids that the case runs on, in place of the defaults), `base` (for a rule case, the commit whose rules the **without** arm gets), `without_skills` (the skills that the **without** arm removes, such as the whole family of the skill). |
| `files/` | The files of the repo that the agent works in. |
| `setup.mjs` | Optional. Gets the work folder, a `bin` folder on the `PATH` and a temporary folder. Use it for git history and fake commands such as `gh`. |
| `check.mjs` | Optional. Checks the result with code, through the helpers in `lib.mjs`. A failed check skips the judges. |

Check the result, not the words of the reply or the file layout that the skill
asks for. Give a fact that needs judgment to a grader.
