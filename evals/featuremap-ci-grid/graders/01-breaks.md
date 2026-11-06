---
type: llm
---

The reply names the four breaks of the README rules that the code has today, by file or by part: `shared/ts/src/format.ts` imports `sdk/src/units.ts` (shared-ts uses sdk), `services/billing/tariff/rates.py` imports the api package with `from ... import api` (billing uses api), `native/dsp/src/window.cc` includes `clock.h` of ingest through an include folder (dsp uses ingest), and the `store` crate depends on the `metrics` crate under the name `stats` (store uses metrics). The reply does not call another dependency a break.
