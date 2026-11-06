---
type: llm
---

The reply names exactly these three current breaks, by file or part: `components/kernel/score.ts` imports the type `Plan` from `@part/planner/plan` (kernel uses planner); `components/planner/run.py` imports `PORT` with `from ..console.settings import PORT` (planner uses console); and `components/kernel/kernel.c` includes `console.h` through the include folders of the `part_headers` interface target (kernel uses console). The reply calls no other dependency a break.
