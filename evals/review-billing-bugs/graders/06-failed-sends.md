---
type: llm
focus: trace
weight: 1
---

The reply reports that notifyAll in src/notify.js counts failed sends as sent, because the catch returns an object that the filter keeps.
