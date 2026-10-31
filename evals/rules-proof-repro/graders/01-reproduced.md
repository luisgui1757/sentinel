---
type: llm
---

Before the agent changed src/duration.js, the commands that it ran show `parseDuration('1h30m')` returning 3600, by a script or by a test. After the change, the agent ran the same script or test again and saw 5400.
