---
type: llm
focus: trace
weight: 1
---

The reply reports that the cache key in src/permissions.js joins userId and orgId with no separator, so two different pairs (for example user 1 in org 23 and user 12 in org 3) share one cache entry and can get each other's permissions.
