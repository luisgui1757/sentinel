---
type: llm
focus: trace
weight: 1
---

The rewritten CACHE.md keeps each fact of the original with the same meaning and adds no new claim: the scheduler flushes the cache every 15 minutes; keys expire after 24 hours, and the `CACHE_TTL` environment variable changes that; Redis 7.2 or later is required because the eviction logic needs it; the cache memory limit is 512 MB; ask the platform team before you change the eviction policy, because such changes caused latency regressions in other services; when the cache is down, requests go to the database, which can raise load; the on-call engineer raises an alert when this fallback lasts longer than 10 minutes.
