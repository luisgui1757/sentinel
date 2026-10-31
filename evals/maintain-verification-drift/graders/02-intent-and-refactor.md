---
type: llm
focus: trace
weight: 1
---

The reply treats the change of an empty note from status 400 to 422 as intended, because the commit message and docs/api.md say so, and the feature map now expects 422 for an empty note. It does not report the commit "Tidy the request handler" as a bug or as a change in behavior.
