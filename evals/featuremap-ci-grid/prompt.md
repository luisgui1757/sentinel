Enforce the boundaries between the parts of this monorepo in CI. A pull request must fail when it adds a dependency between parts that README.md does not allow, in any language of the repo. The breaks that exist today stay allowed until somebody removes them, and `main` must stay green. Nothing new may pass, also from a file that already has a break.

Add `make boundaries-baseline`, which records the current breaks after somebody removes one. A pull request must not be able to allow a new break by running it.

Do not change the product code. Tell me which breaks you kept.
