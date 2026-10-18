# Sentinel task entry point. Thin wrappers over tools/*; mirrors the house
# Makefile convention so `make ci`, `make test`, `make install-hooks` behave the
# same as in sibling repos.
.PHONY: help preflight ci gate check ruleset-check repository-policy-check render test lint lint-shell status \
  install install-global install-hooks uninstall safeguards release-check

help: ## Show available targets
	@grep -hE '^[a-z][a-z-]+:.*##' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*## "}; {printf "  %-16s %s\n", $$1, $$2}'

preflight: ## Fast local preflight (leak scan, drift, rulesets, lint, shellcheck)
	@bash tools/ci

ci: preflight ## Backward-compatible alias for the local preflight

check: ## Verify core + privacy leak scan only
	@bash tools/check

ruleset-check: ## Validate local branch-protection ruleset semantics
	@bash tools/ruleset-check

repository-policy-check: ## Validate repository governance and supply-chain policy
	@bash tools/repository-policy-check

gate: ## Strongest local gate (strict preflight + regression suite)
	@if ! command -v pwsh >/dev/null 2>&1; then \
		echo "gate: pwsh is required for the strict local PowerShell proof."; \
		echo "gate: install pwsh or rely on the GitHub Windows job for that proof."; \
		exit 1; \
	fi
	@SENTINEL_STRICT=1 bash tools/ci
	@SENTINEL_STRICT=1 bash tests/run.sh
	@pwsh -NoProfile -File tools/install.ps1 -Check

render: ## Print the rendered core contract
	@bash tools/render

test: ## Run the Bats and Node regression suites
	@bash tests/run.sh

lint: ## yamllint + editorconfig-checker + gitleaks (skip-if-absent)
	@bash tools/lint

lint-shell: ## ShellCheck the shell tooling (blocking gate)
	@bash tools/lint-shell

status: ## Report where the rules are installed and whether current
	@bash tools/status

install: ## Write/update this repo's AI-CLI entrypoints
	@bash tools/install

install-global: ## Write/update per-user (global) AI-CLI entrypoints
	@bash tools/install --global

install-hooks: ## Install the git pre-push CI gate (run once per clone)
	@bash tools/install-hooks

uninstall: ## Remove Sentinel blocks from this repo's entrypoints
	@bash tools/install --remove

safeguards: ## Apply branch-protection rulesets + repo settings via gh
	@bash scripts/apply-repo-safeguards.sh

release-check: ## Pre-release gate: VERSION, CHANGELOG, adapters, and ci agree
	@bash tools/release-check
