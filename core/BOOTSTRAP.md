# Sentinel Bootstrap

Use this bootstrap when a repository vendors Sentinel.

1. Read the repository entrypoint first.
2. Read the vendored `<vendor>/MANIFEST.json`.
3. Read the core files listed in `required_core_read_order`.
4. Read the repository overlay and task-specific instructions.
5. Apply the active mode before editing, testing, or reporting.

Sentinel is a baseline, not the final authority. A repository overlay may
specialize or tighten these rules for its own domain, data model, commands,
verification, or release process. Relaxing a baseline rule requires an
explicit, documented justification for that scope. Do not silently override them.
