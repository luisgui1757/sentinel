The README has a table of which part of the ledger may use which, but nothing checks it, and people keep reaching across. I want a job in our GitHub Actions CI that fails a PR when it adds a dependency between parts that the table does not allow. It has to cover everything: the Ruby gems, the Python jobs, the Rust engine and the C library.

There are already some violations in the code. Put them on a known list so that `main` stays green, and tell me what they are. Known means that exact dependency, not "this file or this part is already dirty": one more from the same file or the same part must still fail.

Also add `make known-breaks` that rewrites the list after somebody fixes one. Running it on a PR must not be a way to get a new violation in.

Don't touch the product code.
