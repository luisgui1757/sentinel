---
type: llm
---

The reply names exactly these three existing breaks, by file or part:

- `control/protocol/labels.mjs` imports `control/console/settings.mjs`: protocol uses console.
- `config/catalog/defaults.py` imports `config/provision/settings.py`: catalog uses provision.
- `engine/wire/frame.c` includes `filter/policy.h`: wire uses filter.

The reply calls no other dependency a break. In particular, console may use protocol and transport, provision may use plans and catalog, and filter may use wire. Include search folders alone do not create dependencies.
