# Thin wrappers. CI runs the same commands.
.PHONY: help test check lint eval

help: ## Show the targets
	@grep -hE '^[a-z][a-z-]+:.*##' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "}; {printf "  %-8s %s\n", $$1, $$2}'

test: ## Run the installer and import tests
	@node --test 'tests/*.test.mjs'

check: ## Check the imported files against upstream/lock.json
	@node tools/upstream.mjs --check

lint: ## Check the shell script, home paths and the STE prose
	@shellcheck tools/install
	@if git grep -nIE '(/Users/|/home/|[A-Za-z]:\\Users\\)[A-Za-z0-9._-]+'; then \
		echo "lint: remove the home paths above" >&2; exit 1; fi
	@npx --yes --package agent-ste@0.5.2 ste-lint rules/AGENTS.md AGENTS.md README.md THIRD_PARTY.md SECURITY.md skills/untangle/SKILL.md skills/tldr/SKILL.md skills/cleanup/SKILL.md skills/no-comments/SKILL.md evals/README.md

eval: ## Run the skill evals with Claude Code and Codex (uses your plan)
	@node tools/eval.mjs $(ARGS)
