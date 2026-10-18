#!/usr/bin/env bash
# Run the Sentinel Bats and Node suites. In strict mode (SENTINEL_STRICT=1, used by CI and
# release-check) a missing bats FAILS -- a gate must never certify having run no
# tests. On a clean dev clone without bats it skips loudly instead of blocking.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v bats >/dev/null 2>&1; then
  if [[ "${SENTINEL_STRICT:-0}" == 1 ]]; then
    echo "tests: FAIL: bats-core is required in strict mode but is not installed." >&2
    exit 1
  fi
  echo "tests: bats-core not installed; SKIPPING (set SENTINEL_STRICT=1 to require the suite)." >&2
else
  bats "$ROOT/tests"
fi
node --test "$ROOT"/tests/*.test.mjs
