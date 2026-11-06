# Relay

Relay collects sensor frames, applies filters, and exports batches.
Its layout takes inspiration from OpenTelemetry Collector receivers, processors, and exporters.
The control tools and configuration generator ship with the native gateway.

| Part | Folder | Language | May use |
| --- | --- | --- | --- |
| console | `control/console/` | JavaScript | protocol, transport |
| transport | `control/transport/` | JavaScript | protocol |
| protocol | `control/protocol/` | JavaScript | nothing |
| provision | `config/provision/` | Python | plans, catalog |
| plans | `config/plans/` | Python | catalog |
| catalog | `config/catalog/` | Python | nothing |
| gateway | `engine/gateway/` | C | filter, wire |
| filter | `engine/filter/` | C | wire |
| wire | `engine/wire/` | C | nothing |

Each part may use itself. Each import, include, or explicit build dependency counts.
Include search folders alone do not count as dependencies.
Tools and tests outside these part folders may use all parts.
JavaScript uses native ESM. Python modules start at the repository root.
CMake supplies the engine folder as the include search root.

Run `make test` to test the tools and build the gateway.
