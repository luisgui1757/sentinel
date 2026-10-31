# Skill evals

These cases measure whether a skill or a rule changes what an agent does. Each
case runs two times on each target model:

- **with**: a fresh install of all skills and the current rules.
- **without**: the same install without the skill of the case. For a rule
  case, the rules from `origin/main` replace the current rules.

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

- Five skills help on most models: `council` (design mode), `sol-loop`,
  `no-comments`, `cleanup` and `maintain-verification-skill`.
- `technical-writing` and the no-comments rule help on the GPT models. Opus
  and Haiku keep old comments with or without the rule.
- `how`, `create-verification-skill`, `create-formal-verification-skill`,
  `statechart` and the cleanup rule show no gain: each model did these tasks
  without them. They do no harm, and a harder task can still show a gain.
- Haiku did not load 6 of the skills. For Haiku, those results measure the
  description of the skill, not its steps.
- Council copies against mixed models: one strong model found each planted
  bug, so the review case cannot tell them apart.

Runs of 30 and 31 October 2026. Each cell gives the passes **with** · **without**
the skill. "(not loaded)" means that the **with** arm did not read the skill.

### Guide

| Skill | Result at xhigh | Use |
| --- | --- | --- |
| `council` (design mode) | Gain on Opus, Sol, Terra and Haiku. The one Luna run did not name its base plan, and step 6 does not ask for it yet. | Use it. |
| `sol-loop` | Gain on Opus, Sol, Terra and Luna. Haiku fails both arms: it declined a finding without a reason. | Use it. |
| `no-comments` | Gain on 5 of 5 models. | Use it. |
| No-comments rule | Gain on Sol, Terra and Luna. Opus and Haiku fail both arms: they keep the old comments. | Works on GPT models only. |
| `technical-writing` | Gain on Sol and Terra, small gain on Luna. Opus ties: both arms make advice into orders. Haiku did not load it. | Use it with GPT models. |
| `tldr` | Gain on Sol. The other models fail both arms: the summary is longer than a third of the source, drops a trade-off, or adds a claim. | Gain on Sol only. |
| `cleanup` | Gain on Opus and Terra, and on all 3 models at medium. Sol, Haiku and Luna pass both arms. | Use it. |
| `maintain-verification-skill` | Gain on Terra and Haiku, small gain on Luna. Opus and Sol pass both arms. | Use it. |
| `maintain-formal-verification-skill` | Gain on Terra, and on Sol and Terra at medium. The others pass both arms. | Some gain. |
| `why` | Gain on Luna. The others pass both arms. Haiku did not load it. | No measured gain on the stronger models. |
| `how` | All models pass both arms. | No measured gain. |
| `create-verification-skill` | All models pass both arms. Haiku did not load it. | No measured gain. |
| `create-formal-verification-skill` | All models pass both arms. Haiku did not load it. | No measured gain. |
| `statechart` | All models pass both arms. Haiku did not load it. | No measured gain. |
| Cleanup rule | All models pass both arms. | No measured gain. |
| Triggers | `cleanup`, `council` and `tldr` stay unloaded for a question that only looks like their task. | Correct. |

"No measured gain" means that the model did the task of the case without the
skill. A harder case can still show a gain.

The `council-design` row comes from a rerun with the final council text.

### xhigh

| Case | opus-5.5-xhigh | gpt-6.1-sol-xhigh | gpt-6.1-terra-xhigh | haiku-5.5-xhigh | gpt-6-luna-xhigh |
|---|---|---|---|---|---|
| cleanup-repo | 2/3 · 0/3 | 1/1 · 1/1 | 3/3 · 0/3 | 1/1 · 1/1 | 1/1 · 1/1 |
| council-design | 3/3 · 0/3 | 3/3 · 0/3 | 3/3 · 0/3 | 3/3 · 0/3 | 0/1 · 0/1 |
| create-formal-lease | 1/1 · 1/1 | 1/1 · 1/1 | 1/1 · 1/1 | 1/1 · 1/1 (not loaded) | 1/1 · 1/1 |
| create-verification-http | 1/1 · 1/1 | 1/1 · 1/1 | 1/1 · 1/1 | 1/1 · 1/1 (not loaded) | 1/1 · 1/1 |
| how-tax-production | 1/1 · 1/1 | 1/1 · 1/1 | 1/1 · 1/1 | 1/1 · 1/1 | 1/1 · 1/1 |
| maintain-formal-merges | 1/1 · 1/1 | 1/1 · 1/1 | 3/3 · 0/3 | 1/1 · 1/1 | 1/1 · 1/1 |
| maintain-verification-drift | 1/1 · 1/1 | 1/1 · 1/1 | 3/3 · 0/3 | 3/3 · 1/3 | 1/3 · 0/3 |
| neg-cleanup-question | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 |
| neg-council-review | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 |
| neg-tldr-explain | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 |
| no-comments-claims | 3/3 · 1/3 | 3/3 · 0/3 | 3/3 · 0/3 | 3/3 · 0/3 | 3/3 · 0/3 |
| rule-cleanup-release-fix | 1/1 · 1/1 | 1/1 · 1/1 | 1/1 · 1/1 | 1/1 · 1/1 | 1/1 · 1/1 |
| rule-no-comments | 0/1 · 0/1 | 3/3 · 0/3 | 3/3 · 0/3 | 0/1 · 0/1 | 3/3 · 0/3 |
| sol-loop-pagination | 3/3 · 0/3 | 3/3 · 0/3 | 3/3 · 0/3 | 0/1 · 0/1 | 2/3 · 0/3 |
| statechart-renewal-support | 1/1 · 1/1 | 1/1 · 1/1 | 1/1 · 1/1 | 1/1 · 1/1 (not loaded) | 1/1 · 1/1 |
| technical-writing-rewrite | 1/3 · 1/3 | 3/3 · 1/3 | 3/3 · 0/3 | 0/1 · 0/1 (not loaded) | 1/3 · 0/3 |
| tldr-long-reply | 0/1 · 0/1 | 3/3 · 0/3 | 0/1 · 0/1 | 0/1 · 0/1 (not loaded) | 0/1 · 0/1 |
| why-retry-issue | 1/1 · 1/1 | 1/1 · 1/1 | 1/1 · 1/1 | 1/1 · 1/1 (not loaded) | 3/3 · 0/3 |

### medium

Opus 5.5, Sol 6.1 and Terra 6.1 at medium, for reference. `sol-loop-pagination`
did not run at medium. The medium `council-design` row used the council text
from before its seat rules.

| Case | opus-5.5-medium | gpt-6.1-sol-medium | gpt-6.1-terra-medium |
|---|---|---|---|
| cleanup-repo | 3/3 · 1/3 | 3/3 · 1/3 | 3/3 · 0/3 |
| council-design | 2/3 · 0/3 | 3/3 · 0/3 | 3/3 · 0/3 |
| create-formal-lease | 3/3 · 2/3 | 1/1 · 1/1 | 1/1 · 1/1 |
| create-verification-http | 1/1 · 1/1 | 1/1 · 1/1 | 1/1 · 1/1 |
| how-tax-production | 1/1 · 1/1 (not loaded) | 1/1 · 1/1 | 1/1 · 1/1 |
| maintain-formal-merges | 1/1 · 1/1 | 3/3 · 0/3 | 3/3 · 0/3 |
| maintain-verification-drift | 1/1 · 1/1 | 1/1 · 1/1 | 2/3 · 0/3 |
| neg-cleanup-question | 1/1 | 1/1 | 1/1 |
| neg-council-review | 1/1 | 1/1 | 1/1 |
| neg-tldr-explain | 1/1 | 1/1 | 1/1 |
| no-comments-claims | 3/3 · 2/3 | 2/3 · 0/3 | 3/3 · 0/3 |
| rule-cleanup-release-fix | 1/1 · 1/1 | 1/1 · 1/1 | 1/1 · 1/1 |
| rule-no-comments | 0/1 · 0/1 | 3/3 · 0/3 | 3/3 · 0/3 |
| statechart-renewal-support | 1/1 · 1/1 | 1/1 · 1/1 | 1/1 · 1/1 |
| technical-writing-rewrite | 0/1 · 0/1 (not loaded) | 3/3 · 1/3 | 3/3 · 0/3 |
| tldr-long-reply | 0/1 · 0/1 | 3/3 · 0/3 | 1/3 · 0/3 |
| why-retry-issue | 1/1 · 1/1 (not loaded) | 1/1 · 1/1 | 1/1 · 1/1 |

### Council composition

`review-billing-bugs` asks for a plain review of a branch with 9 planted bugs.
Each model reviewed it alone 4 times at high effort, with one judge for each
bug. A council finds a bug when one of its members finds it. Each council below
is the union over all combinations of member reviews from this pool.

| Model alone | Bugs found, mean of 4 (of 9) | Seconds for each review |
| --- | --- | --- |
| Opus 5.5 | 9.00 | 82 |
| Sol 6.1 | 9.00 | 100 |
| Astra 6 | 8.75 | 103 |
| Terra 6.1 | 8.50 | 75 |

Each council found 9 of 9 bugs in each combination. The councils were Astra +
Sol + Opus, Terra + Opus, Terra + Opus + Terra, Terra + Opus + Opus, Terra +
Opus + Sol, Opus x3, Sol x3 and Opus + Sol. So this case does not separate
copies from mixed models: one strong member finds each bug.

The only misses were on the two bugs that need the rules in the README: the
stale cache and the limit of one reminder. A case that separates the
compositions needs more bugs of that kind.

## Case format

Each folder is one case. It uses the format of the Anthropic skill evals, with
some files of our own:

| File | Use |
| --- | --- |
| `prompt.md` | The task that the agent gets. |
| `graders/NN-*.md` | A statement with `type: llm`. Two judges, Claude Opus and GPT Sol at high effort, get the task, the final reply and the diff. Both must find the statement true. `--judges claude` uses only the first. |
| `eval.json` | `skill` or `rule`, and these options: `timeout` in seconds, `requires` (commands that must be on the `PATH`), `load: false` (the skill must not load, for cases that test the trigger), `judge_files` (files from `files/` that the judges also get), `judge_trace: true` (the judges also get the commands that the agent ran, with their output), `arms` (for example `["with"]` for a case with no skill), `targets` (the target ids that the case runs on, in place of the defaults). |
| `files/` | The files of the repo that the agent works in. |
| `setup.mjs` | Optional. Gets the work folder, a `bin` folder on the `PATH` and a temporary folder. Use it for git history and fake commands such as `gh`. |
| `check.mjs` | Optional. Checks the result with code, through the helpers in `lib.mjs`. A failed check skips the judges. |

Check the result, not the words of the reply or the file layout that the skill
asks for. Give a fact that needs judgment to a grader.
