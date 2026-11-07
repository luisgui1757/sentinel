# Design note: Run the general CI pool on spot instances

| | |
|---|---|
| Author | Ines Barros, CI platform team |
| Status | Ready for approval |
| Last update | 28 October 2026 |
| Decision needed from | Head of Engineering |

## Summary

In short, we want to move most of our CI jobs to spot instances, keep the risky jobs where they are, and save a large part of the runner bill. The rest of this note explains the details, the pilot, and the options that we looked at. Please read it in full before you comment, because a lot of thought went into it.

## Background

Some history first, because it explains how we got here. When we moved off Jenkins in 2023, we sized the runner fleet for the traffic of that year, and since then we have mostly added machines whenever queue times went up. Every runner today is an on-demand VM. That was the right call at the time. On-demand machines are simple, they never disappear in the middle of a job, and nobody had to think about capacity planning while the company was growing fast.

The fleet has served us very well, and I want to thank everyone who kept it healthy through three reorganizations and two cloud migrations. CI is one of the most appreciated parts of our developer experience: in the spring survey, engineers gave build reliability 4.4 out of 5, the best score of any internal tool. Nothing in this proposal should put that at risk, and I believe that nothing in it does.

Cost efficiency is also one of the core values of the platform org this year, and this note is one part of that wider effort. We have already done a lot of good work there, and this is the natural next step.

## Problem

The runner fleet cost $41,800 in October 2026. Most of that money goes to the general pool, which runs the pull request checks and the merge queue. These jobs are short, they are safe to run again, and nothing breaks if one of them restarts. We pay on-demand prices for work that does not need what on-demand machines guarantee.

## Proposal

Move the general pool to spot instances, with an automatic fallback to on-demand machines. In detail:

- Release builds and the nightly signing job stay on on-demand runners. They hold the signing keys, and a restart in the middle of a release costs us more than spot would save.
- Jobs that usually run longer than 45 minutes also stay on on-demand runners. In the pilot, 9% of these long jobs were evicted at least once, so their retries would eat most of the saving.
- An evicted job retries once, automatically, on any free runner. If it is evicted a second time, it fails, and the author has to start it again by hand.
- When the scheduler cannot get spot capacity for 10 minutes, it starts on-demand runners instead. The fallback can start at most 120 on-demand runners, so a long spot shortage cannot make the bill grow without limit.

With these rules, we expect the fleet to cost about $17,500 per month, a saving of about $24,300 per month. This is a projection from the pilot, not a measured result.

## Pilot

From 13 to 26 October 2026, we ran 40 spot runners next to the normal fleet and sent part of the pull request traffic to them. The results:

- 2.6% of the jobs on spot runners were evicted at least once.
- The p90 queue time stayed at 6 minutes, the same as on the on-demand fleet.
- Every evicted job passed on its automatic retry.

One caveat that I want to be honest about: the pilot ran in the second half of October, which is a quiet month for spot demand in our region. I do not know whether the eviction rate holds during the end-of-year peak, and the pilot cannot tell us.

The pilot crew did amazing work here. They stood up the runners, the dashboards and the routing in less than a week, and I am very grateful to all of them.

## Rollout

- Phase 1 moves 25% of the general pool to spot on 16 November 2026, but only after Security signs off (see open question 1).
- We go past 25% only if the eviction rate stays below 4% of jobs in every 7-day window of phase 1. If it goes above that, we stay at 25% and come back with a new proposal.
- No rollout step happens during the code freeze, from 14 December 2026 to 4 January 2027.
- If all gates pass, the full rollout ends on 11 January 2027.
- Rollback is one flag: set `runner_pool.spot_enabled` to `false`. The scheduler then drains the spot runners and moves all jobs to on-demand runners in less than 15 minutes. The build-infra on-call engineer can roll back without asking anyone.

Ines Barros owns the rollout and the gates.

## Alternatives that we rejected

**Reserved instances.** A 3-year reservation for the current fleet saves about $13,000 per month, but it commits us to $1.1M over 3 years. The monorepo team expects the split in Q2 2027 to cut CI load by about a third, and we would then pay for machines that we no longer use. We rejected it for that reason.

**A hosted CI service.** The best quote that we got was $36,000 per month, which saves much less than spot. The vendor also has no GPU runners, so the nightly GPU test jobs of the ML team would still need a fleet of their own. We rejected it.

**Do nothing.** Doing nothing is always an option, and it is the simplest one. But it leaves the problem exactly where it is today, and the problem does not get smaller on its own.

## Open questions

1. **Security sign-off** (raised by Mei Ishikawa, Security). The runner image caches credentials for the artifact store on local disk for up to 6 hours. Mei wants proof that a spot runner wipes this disk when it is evicted. She treats this as a blocker: phase 1 does not start until she signs off. Her review is on 12 November 2026. If she has not signed off by then, the phase 1 date moves.

2. **Size of the saving** (raised by Tomasz Lind, Finance). Tomasz thinks the real saving is closer to $15,000 per month, because spot prices in our region rose about 30% last winter. He says this is a rough figure from last year's bills, not a model. He does not object to the change, but he asks that the Q1 2027 budget count only that lower figure.

3. **Retries and flaky tests** (raised by Rafael Quintero, mobile team). If the scheduler cannot tell an eviction from a crash of the test process, a flaky test that crashes gets a free second run, and we stop seeing it. Rafael raised this as a question, not as an objection. Nobody has measured it yet.

## Process

This note went through two review rounds. I shared the first draft in #ci-platform on 2 October, and we discussed it at the platform syncs on 9 and 16 October. Many people left comments, and the note is much better for them. Thank you all for the time and the care that you put into it.

## Ask

To restate the main point: we think spot instances are the right answer for the general pool, and we think the risk is small and easy to undo. I ask you to approve phase 1 and the gates above today, so that we can prepare the change before the security review.
