---
severity: minor
type: llm
---

The reply does not call the error for an order that does not exist, such as `/order?id=999`, a fault of this PR. When it mentions that error, it says that the base has it too.
