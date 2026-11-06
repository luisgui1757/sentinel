# Ledger

Ledger keeps double-entry books for our customers. The API and the admin
console are Ruby gems, the nightly jobs are Python, the posting engine is
Rust, and the money math that the gems and the jobs load is a C library.

| Part | Folder | Language | May use |
| --- | --- | --- | --- |
| core | `gems/core/` | Ruby | nothing |
| api | `gems/api/` | Ruby | core |
| admin | `gems/admin/` | Ruby | core |
| common | `jobs/ledger_jobs/common/` | Python | nothing |
| reconcile | `jobs/ledger_jobs/reconcile/` | Python | common |
| statements | `jobs/ledger_jobs/statements/` | Python | common |
| journal | `engine/journal/` | Rust | nothing |
| fx | `engine/fx/` | Rust | nothing |
| posting | `engine/posting/` | Rust | journal, fx |
| server | `engine/server/` | Rust | posting, journal, fx |
| fixed | `native/fixed/` | C | nothing |
| iso | `native/iso/` | C | nothing |
| ffi | `native/ffi/` | C | fixed, iso |

A part may always use its own code. The tests in `tests/` may use any part.
A dependency is a `require`, an import, an `#include`, or a dependency in a
build file: a gemspec, a `Cargo.toml` or `native/CMakeLists.txt`.

## Build

```sh
make test
```
