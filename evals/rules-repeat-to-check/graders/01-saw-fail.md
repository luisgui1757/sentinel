---
type: llm
---

The commands that the agent ran show its new check fail on code that reads `process.env` directly, such as the old src/reports.js or a sample file. After the fix, the agent ran the check again and saw it pass.
