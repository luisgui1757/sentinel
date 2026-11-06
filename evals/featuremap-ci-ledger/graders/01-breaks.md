---
type: llm
---

The reply names the four breaks of the README table that the code has today, by file or by part: `gems/admin/lib/ledger/admin/exports.rb` requires `ledger/api/serializers` (admin uses api); `jobs/ledger_jobs/statements/render.py` imports `ledger_jobs.reconcile.matching` (statements uses reconcile); the `fx` crate depends on the `journal` crate in `engine/fx/Cargo.toml` (fx uses journal); and `native/iso/src/currency.c` includes `fixed/fixed.h`, with the `iso` target linked to `fixed` in `native/CMakeLists.txt` (iso uses fixed, as one break or as two entries). The reply does not call another dependency a break.
