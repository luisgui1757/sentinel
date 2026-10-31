---
tags: [formal]
---

Several workers call `lease.acquire()` at the same time. Set up a formal check in this repo that proves whether two workers can ever hold the lease at once, so that agents can run it again after each change. Tell me what it finds. Do not fix the lease yet.
