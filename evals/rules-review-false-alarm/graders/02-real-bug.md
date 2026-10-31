---
type: llm
---

The reply reports that `loadPage` in src/range.js does not await `fetchPage`, which returns a Promise, so `rows.map` fails. It gives a fix.
