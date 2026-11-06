Please add a boundary check to our GitHub Actions CI. Follow the part rules in README.md for all three languages. Block each new forbidden dependency, including another dependency from a file or part with an existing break.

Put the existing breaks in a known list so main stays green. Tell me which dependencies break the rules today. Add `make refresh-debt` to rewrite that list after a break is removed. A pull request must not gain permission for a new break by running that target, even across multiple commits.

Keep product code unchanged.
