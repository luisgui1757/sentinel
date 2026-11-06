Add a GitHub Actions check for the part boundaries in README.md. A pull request must fail if it adds a dependency that those rules forbid. Cover every language in this repo. Keep the current breaks in a known list so that main stays green, and tell me which breaks you kept. A new break must fail, also from a file or part that already has one.

Add `make review-known` to rewrite that list after somebody removes a break. A pull request must not be able to allow a new break by running this target.

Do not change product code.
