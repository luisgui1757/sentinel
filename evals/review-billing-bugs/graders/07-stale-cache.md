---
type: llm
focus: trace
weight: 1
---

The reply reports that the permission cache in src/permissions.js never expires or clears, so a permission change through setPermissions does not take effect, while the README says that changes take effect at once.
