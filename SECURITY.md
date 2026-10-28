# Security

Report a security problem in private. On GitHub, open **Security**, then
**Advisories**, then **Report a vulnerability**. Do not open a public issue that
shows a secret or a private path.

CI scans the full history for secrets with gitleaks. It also checks the tree
for paths in a user home folder. The installers copy files and run no code from
the imported skills.

`upstream/lock.json` records the SHA-256 of each imported file. CI compares the
files with the lock and with the pinned upstream revisions.

Fixes go to `main` and to the next release.
