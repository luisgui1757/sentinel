# Verification

- Run checks appropriate to the changed behavior and the repository's required
  gate. A wording fix may need inspection; a behavior bug needs regression proof.
- Reproduce substantive bugs before fixing them where practical, then verify the
  same path afterwards. Test user-visible behavior rather than implementation shape.
- Cover relevant boundaries, invalid inputs and older persisted formats. Use
  deterministic fixtures and mock external boundaries, not the logic being tested.
- Exercise packaged or installed work through the consumer's entrypoint. For UI
  changes, inspect the rendered result. Source inspection alone does not prove either.
- Never delete, weaken or skip a failing check to manufacture success. Explain
  unrelated failures and missing environments separately from verified behavior.
