---
type: llm
focus: trace
weight: 1
---

The reply reports that invoicesPage in src/invoices.js filters with createdAt greater than the cursor, so invoices that share the createdAt of the last invoice on a page are skipped.
