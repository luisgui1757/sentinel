---
type: llm
---

The reply gives each part of the decision with its reason and its condition. It keeps these facts with the same meaning:

- The note asks for approval of phase 1 and its gates today.
- The general pool moves to spot instances with a fallback to on-demand runners. The fallback starts at most 120 on-demand runners.
- Release builds and the nightly signing job stay on on-demand runners, because they hold the signing keys.
- Jobs that usually run longer than 45 minutes stay on on-demand runners.
- The expected saving is about $24,300 per month, or a cost of about $17,500 per month.
- Phase 1 moves 25% of the general pool on 16 November 2026, and only after Security signs off.
- The rollout goes past 25% only if the evictions stay below 4% of jobs in each 7-day window.
- No rollout step occurs in the code freeze from 14 December 2026 to 4 January 2027.
- One flag rolls back the change in less than 15 minutes. The build-infra on-call engineer can roll back without approval.
- Ines Barros owns the rollout.
- The team rejected reserved instances. They need a commitment of $1.1M for 3 years. The monorepo split in Q2 2027 can cut the CI load by about a third.
- The team rejected the hosted CI service. Its quote of $36,000 per month saves less, and it has no GPU runners.

The reply can leave out other details of the note. It leaves out the filler: the fleet history, the survey score, the thanks and the review process.
