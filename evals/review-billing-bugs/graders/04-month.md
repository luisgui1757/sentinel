---
type: llm
focus: trace
weight: 1
---

The reply reports that monthOf in src/invoices.js uses local-time getters, so an invoice near a month boundary can get a month that is not its UTC billing month.
