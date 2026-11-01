---
tags: [rules]
---

Again: `reportUrl` in src/reports.js reads `process.env.API_URL`, so it ignores `configure()`. Fix it.
