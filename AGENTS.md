# Work on Sentinel

Sentinel holds shared rules and skills for coding agents. Read `README.md`
first.

- `rules/AGENTS.md` holds the rules. The installers copy it into each host file
  without a change. Edit the rules only when the user asks.
- `tools/install` and `tools/install.ps1` must write the same bytes. Change
  both in the same commit.
- `upstream/lock.json` lists the files that come from other repositories.
  After you edit one of these files, run `node tools/upstream.mjs --sync`.
  Import a new revision with `node tools/upstream.mjs --update`.
- Run `make test` before you push. CI also runs the tests on macOS and
  Windows.
