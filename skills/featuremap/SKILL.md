---
name: featuremap
description: "Use when the user asks for a feature map, a dependency graph of the features or packages of a repo, which features use a file, boundary rules between features, modules or packages, a CI check that blocks a new import or dependency across those boundaries while it keeps the known violations in a baseline, or a plan to split a monorepo by feature. Writes featuremap.json, extracts edges from JS, TS, Python, C and C++ code, go list, cargo metadata and the CMake File API, checks may-use and must-not-reach rules against a baseline that can only shrink, and plans a step-by-step or a full restructure."
---

# Feature map

A feature map says which feature owns each source file, and which features may
use which. A check in CI keeps the code inside those rules. One map covers the
whole monorepo, in all its languages.

Copy `scripts/featuremap.mjs` from this skill to `tools/featuremap/` in the
repo, so that CI runs the same file. Run it with Node 22 or later:

```sh
node tools/featuremap/featuremap.mjs <command>
```

Do not rewrite the copy. It already reads the import forms in "Extractors and
coverage". For a dependency that no extractor sees, add a `declared` edge or a
`jsonl` entry, and report it.

## Boundaries in CI

Use this section when the user asks for a CI check that blocks new
dependencies across parts. Skip Diagnose, the graph and the restructure plan.

1. Write `featuremap.json` from the rules of the repo, such as a table in
   `README.md`. Each part is a feature with an owner pattern for its folder.
   "May use nothing" is `"mayUse": []`. A part that may use any part, such as a
   tests folder, has no `mayUse`.
2. Add one `extract` entry for each language. See "Extractors and coverage".
   Give `scan` the Python package roots in `roots` and each include folder of
   the build in `includeDirs`. For a dependency in a build manifest, use
   `cargo` for Rust and `cmake` for links between CMake targets.
3. Add the make targets and the CI job below. Use the target names that the
   user asks for.
4. Run the baseline target, then the check target. Read each violation in the
   baseline. Each one must be a real break of the rules. When one is not, fix
   the map, not the baseline.
5. Prove the check on a scratch branch or a copy, and delete it after:
   - A new break fails, also from a file that already has a break.
   - A pull request that runs the baseline target to allow a new break fails.
   - A removed break, then the baseline target, passes. The break then fails
     again when it comes back.
6. Do not commit a test that reads the current baseline of the repo. It fails
   when somebody removes a break and shrinks the baseline.
7. Report the known violations, the files with no extractor, and the review
   rule for the map and the baseline.

The make targets. Keep `deps-configure` only when the map has a `cmake` entry.
Set its source folder and its build folder to those of the repo, and add the
build folder to `.gitignore`:

```make
FEATUREMAP := node tools/featuremap/featuremap.mjs

.PHONY: deps-configure deps-baseline deps-check
deps-configure:
	mkdir -p build/.cmake/api/v1/query
	touch build/.cmake/api/v1/query/codemodel-v2
	cmake -S native -B build > /dev/null

deps-baseline: deps-configure
	$(FEATUREMAP) baseline

deps-check: deps-configure
	$(FEATUREMAP) check $(if $(BASE),--base $(BASE))
```

The CI job. `check --base` reads the baseline of the base commit, so the
checkout needs the full history:

```yaml
  boundaries:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: make deps-check BASE=${{ github.event.pull_request.base.sha || github.event.before }}
```

The job needs each tool that the map names, such as CMake or Rust. Install
the tools that the runner image does not have.

| Exit of `check` | Meaning |
| --- | --- |
| 0 | Nothing is new. |
| 1 | A new violation, a new unowned file, a new file with no extractor, or a baseline that grew since `--base`. |
| 2 | An error in the map or a tool. It comes first, so that a broken extractor never gives a pass. |

`baseline` writes `featuremap.baseline.json`: each known violation by its exact
edge, each unowned file, and each file with no extractor. A replaced violation
is new, also when the count stays the same. Add `featuremap.json` and
`featuremap.baseline.json` to CODEOWNERS, so that a person reviews each change
of the rules. If the forge has no CODEOWNERS file, use its review rule for these
two files. If it has no such rule, report it.

## Diagnose

Use this section for a feature map or a dependency graph. Change no product file.

1. Find the features. Read the layout and the manifests: `package.json`
   workspaces, `Cargo.toml`, `go.mod`, `pyproject.toml`, the targets in
   `CMakeLists.txt`, Bazel `BUILD` files. Name each feature by what it does for
   the user, with levels, such as `billing/tax`.
2. Write `featuremap.json` at the root of the repo. See "Map format".
3. Run `check`. Read the coverage, the unowned files and the violations.
4. Report the features and their file counts, the files with no extractor for
   each language, the unowned files, the edges between features
   (`graph --format mermaid --level 1`), the rules that the code already obeys,
   and each file that many features use.

## Map format

```json
{
  "version": 1,
  "features": {
    "billing/tax": { "description": "Tax on invoices", "mayUse": ["billing/core", "shared/**"], "mustNotReach": ["vehicle/**"] },
    "billing/core": {},
    "shared/money": {}
  },
  "owners": [
    { "path": "services/billing/**", "feature": "billing/core" },
    { "path": "services/billing/tax/**", "feature": "billing/tax" },
    { "path": "libs/money/**", "feature": "shared/money" }
  ],
  "extract": [
    { "tool": "scan", "files": ["**/*.ts", "**/*.py"], "roots": ["", "src"] },
    { "tool": "go", "dir": "services/api" }
  ],
  "declared": [
    { "from": "services/billing/tax/client.py", "to": "services/ledger/server.go", "kind": "link" }
  ]
}
```

| Key | Meaning |
| --- | --- |
| `owners` | Path patterns from the repo root. The last pattern that matches a file owns it, as in CODEOWNERS. `*` matches inside one folder, `**` matches any number of folders, `?` matches one character. |
| `mayUse` | The features that this feature may use directly. When the key is missing, it may use any feature. A feature may always use itself. |
| `mustNotReach` | The features that this feature must not reach through any chain of edges. |
| `extract` | The tools that find edges, and the files that each tool covers. |
| `declared` | Edges that no tool can see: RPC calls, runtime loading, and generated code. |
| `sources` | Optional. The patterns of the files that need an owner. The default covers the usual source extensions. |
| `ignore` | Optional. Patterns for vendored or generated folders. |

Write owner patterns for folders, such as `services/api/**`. The go, cargo and
CMake tools give edges between folders.

## Extractors and coverage

| Tool | Edges | Misses |
| --- | --- | --- |
| `scan` | JS and TS `import`, `export ... from`, `require` and `import()` with a literal path: relative, to a workspace package, or through the `paths` of the nearest `tsconfig.json` and the configs that it extends. Python `import` and `from`, resolved from `roots`. C and C++ `#include`, resolved from the folder of the file and from `includeDirs`. | Dynamic paths, macros, and conditional includes |
| `go` | Packages of the main module, from `go list -e -json ./...` in `dir` | Code that the build tags leave out |
| `cargo` | Path dependencies between workspace crates, from `cargo metadata --no-deps` | Dev-dependencies |
| `cmake` | Links between targets, from the CMake File API in `build` | Includes. Add a `scan` entry for them. |
| `jsonl` | Edges that another tool wrote to `path`, one JSON object for each line, with `from`, `to` and `kind` | Whatever that tool misses |
| `declared` | Only the `declared` edges | Each real edge that the map does not list |

`go`, `cargo` and `cmake` run the tool, or read a saved output from `input`.
For CMake, create the empty file `<build>/.cmake/api/v1/query/codemodel-v2`
and run the configure step. Use one `cmake` entry for each build
configuration. For Java, Bazel or a code generator, write their edges with
`jsonl`. For example, use `jdeps` output or `bazel cquery`.

Each file gets one coverage: `extracted`, `declared` or none. A file with no
extractor can hide a violation. `check` then prints `INCOMPLETE`. Do not call
that result clean. Name the files with no extractor in the report.

Generated code: give the consumer an edge to the generated file. Give the
generated file a `generates` edge to its template and its generator. Each path
in a declared edge must exist in the checkout. Commit the generated file, or
run the generator before `check`.

A feature in two languages, such as one filter in C++ and in Python, gets a
parent with one child for each language: `filter/cpp` and `filter/py`. Each
child has its own `mayUse`. A parity test that runs both children on the same
input belongs to the parent.

A file that many features use, such as one very large API module, gets one
owner. Report it as debt, and split it later.

## Ask the map

| Command | Answer |
| --- | --- |
| `where PATH` | The feature that owns the path, the owner pattern, and the extractors |
| `show FEATURE` | Files, rules, the features that it uses and that use it, and its violations |
| `why FROM TO` | The shortest chain of features from FROM to TO, with one example edge for each step |
| `closure FEATURE [--reverse]` | Each feature that FEATURE reaches, or with `--reverse`, each feature that reaches it |
| `graph [--format dot\|mermaid] [--level N]` | The graph, with features folded to N levels and violations in red. Mermaid shows at most 500 edges. |
| `extract [--out FILE]` | Each edge as one sorted JSON line |

Add `--json` to `where`, `show`, `why` and `closure` for output that a script
can read. Before you change a file, run `where` on it and `closure --reverse` on
its feature to find what can break.

## Plan a restructure

Give the user two plans with the evidence for each. The user picks one. Do not
change product code before the user picks.

- **Step by step:** move one feature at a time into its own folder or target.
  Each step is one PR. The map changes with the code, and the baseline shrinks.
  Use it when the build already has one target or package for each part.
- **Full rebuild:** start a new layout, and keep only the content of the source
  files. Use it when the build has global include paths, source lists with
  wildcards, or one target for everything. For CMake, make one target for each
  feature. `mayUse` gives `target_link_libraries`, and each target gets its own
  private include folders.

Prove a C++ rebuild before you delete the old build:

1. The same sources in each target.
2. The same flags for each file. Compare `compile_commands.json`.
3. Equal object files after a debug strip, or else equal symbol tables.
4. The same link outputs.
5. The tests, and the hardware or scenario replays.
