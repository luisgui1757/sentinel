# Confirm

Confirm computes work plans and shows their status. Each part contains TypeScript, Python, and C code.

The part boundaries apply to imports and includes in every language:

- `components/kernel/` is the kernel part. It may use only its own code.
- `components/planner/` is the planner part. It may use kernel and its own code.
- `components/console/` is the console part. It may use planner, kernel, and its own code.

The folders include each part's public headers. CMake's `part_headers` target supplies header search folders, not permission to use another part.
The TypeScript config extends `config/paths.json`. Python imports use the `components` package.
Build configuration at the repo root supports all parts and is outside these boundaries.

Run `make test` to test Python and build the C libraries. TypeScript files supply types for a browser client.
