# ast-grep

ast-grep finds code by its syntax tree in many languages. Each rule has a test
file with valid and invalid examples.

Install a pinned version: `npm install --save-dev @ast-grep/cli@0.51.0`, or
`cargo install ast-grep`, or `pip install ast-grep-cli`.

`sgconfig.yml` at the root of the repo:

```yaml
ruleDirs:
  - rules
testConfigs:
  - testDir: rule-tests
```

`rules/no-env-read.yml`:

```yaml
id: no-env-read
language: javascript
severity: error
message: Read settings with config.get('NAME'), not process.env.
rule:
  pattern: process.env.$NAME
ignores:
  - src/config.js
```

`rule-tests/no-env-read-test.yml` holds the failing example from the history
and its fix:

```yaml
id: no-env-read
valid:
  - "const url = config.get('API_URL');"
invalid:
  - "const url = process.env.API_URL;"
```

Run both in CI:

```sh
ast-grep test --skip-snapshot-tests
ast-grep scan
```

`ast-grep scan` exits 1 when a rule with `severity: error` matches. Before you
add it to CI, run it on the old commit with the mistake and see it fail.
