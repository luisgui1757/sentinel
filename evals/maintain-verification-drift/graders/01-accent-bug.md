---
type: llm
focus: trace
weight: 1
---

The feature map still treats status 201 as the correct result when a note with accented text, such as "café", is created. The map can record that the app returns 500 today as a known bug, but it does not present 500 as the expected result. The reply reports the 500 for accented text as a bug in the app, not as the new intended behavior.
