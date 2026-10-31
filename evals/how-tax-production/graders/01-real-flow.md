---
type: llm
focus: trace
weight: 1
---

The reply says that src/tax/legacy.js does the tax math for a US order under `npm start`. It gives the reason: `npm start` sets NODE_ENV to production, so the settings in config/production.json apply, and they send US orders to the legacy provider. It does not say that src/tax/flat.js, src/tax/v2.js or applyTax in the handler computes the tax for this request.
