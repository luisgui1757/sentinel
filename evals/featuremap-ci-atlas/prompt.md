Our packages keep leaking into each other. Add a check to the GitHub Actions workflow that blocks a pull request with a new dependency across the package boundaries in README.md. It must cover the TypeScript packages, the Python pipeline, the native libraries and the Rust crates. Keep the current violations as a known list so that `main` stays green, and report them to me. A PR that adds one more violation in a package that already has one must still fail.

Also add `make deps-baseline` to rewrite the known list after somebody removes a violation. A PR must not be able to get a new violation onto the list by running it.

Do not change product code.
