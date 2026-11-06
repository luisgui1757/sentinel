# Grid

Grid reads smart meters, prices the energy, and shows the usage to customers.

| Part | Folder | Language | May use |
| --- | --- | --- | --- |
| web | `web/` | TypeScript | sdk, shared-ts |
| sdk | `sdk/` | TypeScript | shared-ts |
| shared-ts | `shared/ts/` | TypeScript | nothing |
| api | `services/api/` | Python | billing, shared-py |
| billing | `services/billing/` | Python | shared-py |
| shared-py | `services/shared/` | Python | nothing |
| common | `native/common/` | C | nothing |
| dsp | `native/dsp/` | C++ | common |
| ingest | `native/ingest/` | C++ | dsp, common |
| collector | `agent/collector/` | Rust | wire, store, metrics |
| store | `agent/store/` | Rust | wire |
| wire | `agent/wire/` | Rust | nothing |
| metrics | `agent/metrics/` | Rust | nothing |

A part may always use its own code. The tests in `services/tests/` may use any
part. A dependency is an import, an include, or a dependency in a build
manifest such as `Cargo.toml`.

## Build

```sh
make test
cmake -S native -B build && cmake --build build
```
