#!/usr/bin/env bash
# Sentinel generic library.
#
# This file is the GENERIC half of Sentinel tooling. It operates only on a
# Sentinel core directory plus its MANIFEST.json and knows nothing about any
# consuming repository's overlay paths. Consumers `source` this file and add
# their own overlay-aware checks on top, so the generic checks are never
# copy-pasted into each consumer.
#
# Usage:
#   source "<vendor>/tools/sentinel-lib.sh"
#   sentinel_check_core    "<core_dir>" "<manifest.json>"   # returns 0/1
#   sentinel_render_core   "<core_dir>" "<manifest.json>"   # human-readable dump
#   sentinel_render_bundle "<core_dir>" "<manifest.json>"   # inlinable contract
#   sentinel_core_files    "<manifest.json>" [required|all] # prints rel paths
#   sentinel_forbidden_terms "<manifest.json>"              # tagged term list
#   sentinel_scan_terms    "<manifest.json>" <path...>      # leak scan (0/1)
#
# The functions are pure shell + a JSON reader; no jq dependency.

# Whether jq is available for correct, spec-compliant JSON parsing.
_sentinel_have_jq() { command -v jq >/dev/null 2>&1; }

# Read a top-level string scalar from a JSON file.
# Prefers jq (decodes JSON escapes, so a doubly-escaped Windows path becomes the
# real one); falls back to a pure-sed reader so the library has no hard dependency.
# sentinel_manifest_value <file> <key>
sentinel_manifest_value() {
  local file=$1 key=$2
  [[ -f "$file" ]] || return 1
  if _sentinel_have_jq; then
    jq -r --arg k "$key" 'if (has($k) and ((.[$k]|type) == "string")) then .[$k] else empty end' "$file" 2>/dev/null | head -n1
    return
  fi
  sed -n "s/^[[:space:]]*\"$key\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" "$file" | head -n1
}

# Read a top-level integer scalar from a JSON file.
# sentinel_manifest_int <file> <key>
sentinel_manifest_int() {
  local file=$1 key=$2
  [[ -f "$file" ]] || return 1
  if _sentinel_have_jq; then
    jq -r --arg k "$key" 'if (has($k) and ((.[$k]|type) == "number")) then .[$k] else empty end' "$file" 2>/dev/null | head -n1
    return
  fi
  sed -n "s/^[[:space:]]*\"$key\"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p" "$file" | head -n1
}

# Print the entries of a top-level JSON string array, one per line. With jq the
# values are correctly JSON-decoded (escapes resolved, a "]" inside a string is
# safe); the pure-awk fallback handles the common case with no dependency.
# sentinel_manifest_array <file> <key>
sentinel_manifest_array() {
  local file=$1 key=$2
  [[ -f "$file" ]] || return 1
  if _sentinel_have_jq; then
    jq -r --arg k "$key" '(.[$k] // []) | if type == "array" then .[] else empty end' "$file" 2>/dev/null
    return
  fi
  awk -v key="\"$key\"" '
    BEGIN { inarr = 0 }
    {
      if (inarr) {
        line = $0
        if (line ~ /\]/) { inarr = 0 }
        while (match(line, /"[^"]*"/)) {
          item = substr(line, RSTART + 1, RLENGTH - 2)
          print item
          line = substr(line, RSTART + RLENGTH)
        }
        next
      }
      if (index($0, key) > 0 && index($0, "[") > 0) {
        inarr = 1
        rest = substr($0, index($0, "[") + 1)
        if (rest ~ /\]/) { inarr = 0 }
        while (match(rest, /"[^"]*"/)) {
          item = substr(rest, RSTART + 1, RLENGTH - 2)
          print item
          rest = substr(rest, RSTART + RLENGTH)
        }
      }
    }
  ' "$file" | sed 's/\\\\/\\/g; s/\\"/"/g'   # best-effort JSON unescape to match jq
}

# Validate a manifest-owned repo path. Paths are stored as POSIX-style repo
# paths, so absolute paths, parent traversal, empty segments, and backslashes are
# not portable and are not allowed.
_sentinel_validate_relpath() {
  local label=$1 rel=$2
  if [[ -z "$rel" ]]; then
    echo "sentinel: $label must not be empty" >&2
    return 1
  fi
  case "$rel" in
    /*|*\\*|*'//'|*:*) echo "sentinel: $label must be a contained repo-relative POSIX path: $rel" >&2; return 1 ;;
  esac
  local old_ifs=$IFS part
  IFS=/
  for part in $rel; do
    case "$part" in
      ""|"."|"..") IFS=$old_ifs; echo "sentinel: $label contains an unsafe path segment: $rel" >&2; return 1 ;;
    esac
  done
  IFS=$old_ifs
}

# Read and validate the manifest's core_dir.
# sentinel_manifest_core_dir <manifest>
sentinel_manifest_core_dir() {
  local manifest=$1 core_dir
  core_dir=$(sentinel_manifest_value "$manifest" core_dir)
  [[ -n "$core_dir" ]] || { echo "sentinel: manifest missing core_dir" >&2; return 1; }
  _sentinel_validate_relpath core_dir "$core_dir" || return 1
  printf '%s\n' "$core_dir"
}

# List core files relative to the manifest root.
# sentinel_core_files <manifest> [required|all]   (default: all)
sentinel_core_files() {
  local manifest=$1 scope=${2:-all}
  sentinel_manifest_array "$manifest" required_core_read_order
  if [[ "$scope" == "all" ]]; then
    sentinel_manifest_array "$manifest" optional_core_files
  fi
}

# Validate manifest path containment and declared file presence.
# sentinel_check_manifest_paths <manifest>
sentinel_check_manifest_paths() {
  local manifest=$1 base core_dir rel field label failed=0 required_seen=0 optional_seen=0
  [[ -f "$manifest" ]] || { echo "sentinel: missing manifest: $manifest" >&2; return 1; }
  base=$(cd "$(dirname "$manifest")" && pwd)
  core_dir=$(sentinel_manifest_core_dir "$manifest") || failed=1
  if [[ -n "${core_dir:-}" ]]; then
    if [[ ! -d "$base/$core_dir" || -L "$base/$core_dir" ]]; then
      echo "sentinel: core_dir must be a real directory: $core_dir" >&2
      failed=1
    fi
  fi

  for field in required_core_read_order optional_core_files; do
    if [[ "$field" == required_core_read_order ]]; then
      label=required
    else
      label=optional
    fi
    while IFS= read -r rel; do
      if [[ "$field" == required_core_read_order ]]; then
        required_seen=1
      else
        optional_seen=1
      fi
      _sentinel_validate_relpath "$field" "$rel" || { failed=1; continue; }
      if [[ -n "${core_dir:-}" && "$rel" != "$core_dir/"* ]]; then
        echo "sentinel: core file is outside core_dir '$core_dir': $rel" >&2
        failed=1
        continue
      fi
      if [[ ! -f "$base/$rel" || -L "$base/$rel" ]]; then
        echo "sentinel: missing $label core file: $rel" >&2
        failed=1
      fi
    done < <(sentinel_manifest_array "$manifest" "$field")
  done

  if [[ "$required_seen" -eq 0 ]]; then
    echo "sentinel: manifest required_core_read_order must list at least one core file" >&2
    failed=1
  fi
  if [[ "$optional_seen" -eq 0 ]]; then
    echo "sentinel: manifest optional_core_files must list optional core files" >&2
    failed=1
  fi

  local local_denylist
  local_denylist=$(sentinel_manifest_value "$manifest" local_denylist)
  if [[ -n "$local_denylist" ]]; then
    _sentinel_validate_relpath local_denylist "$local_denylist" || failed=1
  fi

  return "$failed"
}

# Print the merged forbidden-term list, one TAB-tagged entry per line:
#   "M<TAB>term"  - generic, publishable term from the manifest
#   "L<TAB>term"  - private term from the gitignored local denylist
#
# The PUBLIC manifest holds only generic patterns (absolute home paths, etc.)
# that are safe to publish. Project-specific / domain / stack terms live ONLY
# in the gitignored file named by the manifest "local_denylist" value, so the
# committed tree never enumerates the owner's other projects. The local file is
# resolved relative to the manifest directory and is absent in the public tree.
# sentinel_forbidden_terms <manifest> [all|M|L]   (default: all)
sentinel_forbidden_terms() {
  local manifest=$1 filter=${2:-all} base term local_denylist
  base=$(cd "$(dirname "$manifest")" && pwd)
  if [[ "$filter" == all || "$filter" == M ]]; then
    while IFS= read -r term; do
      [[ -n "$term" ]] && printf 'M\t%s\n' "$term"
    done < <(sentinel_manifest_array "$manifest" forbidden_core_terms)
  fi
  if [[ "$filter" == all || "$filter" == L ]]; then
    local_denylist=$(sentinel_manifest_value "$manifest" local_denylist)
    # Default location if the manifest names none, so the private scan still
    # works when the manifest key is absent (or has been reverted).
    [[ -z "$local_denylist" ]] && local_denylist="tools/forbidden-terms.local"
    _sentinel_validate_relpath local_denylist "$local_denylist" || return 1
    if [[ -f "$base/$local_denylist" ]]; then
      # One term per line; strip "#" comments, blank lines, and surrounding space.
      sed -e 's/[[:space:]]*#.*$//' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' \
          -e '/^$/d' "$base/$local_denylist" \
        | while IFS= read -r term; do
            [[ -n "$term" ]] && printf 'L\t%s\n' "$term"
          done
    fi
  fi
}

# Scan one or more paths for forbidden terms. Returns 0 if clean, 1 on any hit.
# Privacy guarantees:
#   - A private (L) hit reports the LOCATION ONLY (path:line) -- never the
#     matched content -- so neither the private term nor any adjacent unrelated
#     secret on that line can leak. Any private term in the path itself is masked.
#   - A generic (M) hit shows its line (M-terms are public), but every private
#     term on that line is masked first.
#   - Masking is applied longest-term-first, so a shorter term cannot split a
#     longer overlapping one ("alpha-beta" is masked whole, not "<X>-beta").
#   - -H forces a filename prefix even for a single path; -a treats binaries as
#     text so a term in a binary asset cannot evade the scan; a grep error
#     (unreadable path, rc>=2) fails closed rather than reading as "clean".
# Pass --private to scan for L-terms only (e.g. a file that legitimately declares
# the generic terms, like the manifest).
# sentinel_scan_terms <manifest> [--private] <path...>
sentinel_scan_terms() {
  local manifest=$1; shift
  local filter=all local_denylist
  if [[ "${1:-}" == "--private" ]]; then filter=L; shift; fi
  [[ $# -gt 0 ]] || return 0
  local_denylist=$(sentinel_manifest_value "$manifest" local_denylist)
  [[ -z "$local_denylist" ]] && local_denylist="tools/forbidden-terms.local"
  _sentinel_validate_relpath local_denylist "$local_denylist" || return 1

  # Collect every private term, then sort longest-first for safe masking.
  local lterms=() o t
  while IFS=$'\t' read -r o t; do
    [[ "$o" == L && -n "$t" ]] && lterms+=("$t")
  done < <(sentinel_forbidden_terms "$manifest" L)
  if ((${#lterms[@]} > 1)); then
    local _sorted; _sorted=$(printf '%s\n' "${lterms[@]}" | awk '{print length"\t"$0}' | sort -rn | cut -f2-)
    lterms=(); while IFS= read -r t; do [[ -n "$t" ]] && lterms+=("$t"); done <<< "$_sorted"
  fi

  # Mask every private term (longest-first) out of a string.
  _sentinel_mask() {
    local s=$1 lt
    if ((${#lterms[@]})); then for lt in "${lterms[@]}"; do s=${s//"$lt"/<REDACTED>}; done; fi
    printf '%s' "$s"
  }

  local origin term grep_out rc failed=0 idx=0 wordflag line
  while IFS=$'\t' read -r origin term; do
    [[ -n "$term" ]] || continue
    if [[ "$term" =~ ^[A-Za-z0-9_]+$ ]]; then wordflag="-w"; else wordflag=""; fi
    grep_out=$(grep -R -n -H -a -F $wordflag -- "$term" "$@" 2>/dev/null); rc=$?
    if [[ -n "$grep_out" ]]; then
      failed=1
      if [[ "$origin" == L ]]; then
        idx=$((idx + 1))
        echo "sentinel: private denylist term #$idx found (redacted, location only):" >&2
        # path:line only -- strip the matched content; mask any private term in the path.
        while IFS= read -r line; do
          printf '   %s\n' "$(_sentinel_mask "$line")" >&2
        done < <(printf '%s\n' "$grep_out" | sed 's/:\([0-9][0-9]*\):.*/:\1/')
      else
        echo "sentinel: forbidden term '$(_sentinel_mask "$term")':" >&2
        while IFS= read -r line; do
          printf '   %s\n' "$(_sentinel_mask "$line")" >&2
        done <<< "$grep_out"
      fi
    fi
    if [[ $rc -ge 2 ]]; then
      echo "sentinel: WARNING: a path could not be fully scanned (grep rc=$rc); failing closed." >&2
      failed=1
    fi
  done < <(sentinel_forbidden_terms "$manifest" "$filter")
  return $failed
}

# Scan a list of repo-relative path STRINGS for forbidden terms in the names
# themselves (a file/dir named after a private project still leaks even if its
# content is clean). Reports the masked path -- a path name minus the term is not
# itself a secret. Pass repo-relative paths so absolute prefixes (e.g. a home
# path) do not false-positive. Returns 1 on any hit.
# sentinel_scan_pathnames <manifest> <relpath...>
sentinel_scan_pathnames() {
  local manifest=$1; shift
  [[ $# -gt 0 ]] || return 0
  local local_denylist
  local_denylist=$(sentinel_manifest_value "$manifest" local_denylist)
  [[ -z "$local_denylist" ]] && local_denylist="tools/forbidden-terms.local"
  _sentinel_validate_relpath local_denylist "$local_denylist" || return 1
  local paths=("$@")

  local lterms=() o t
  while IFS=$'\t' read -r o t; do
    [[ "$o" == L && -n "$t" ]] && lterms+=("$t")
  done < <(sentinel_forbidden_terms "$manifest" L)
  if ((${#lterms[@]} > 1)); then
    local _s; _s=$(printf '%s\n' "${lterms[@]}" | awk '{print length"\t"$0}' | sort -rn | cut -f2-)
    lterms=(); while IFS= read -r t; do [[ -n "$t" ]] && lterms+=("$t"); done <<< "$_s"
  fi
  _sentinel_mask_path() {
    local s=$1 lt
    if ((${#lterms[@]})); then for lt in "${lterms[@]}"; do s=${s//"$lt"/<REDACTED>}; done; fi
    printf '%s' "$s"
  }

  local origin term failed=0 p wordful
  while IFS=$'\t' read -r origin term; do
    [[ -n "$term" ]] || continue
    [[ "$term" =~ ^[A-Za-z0-9_]+$ ]] && wordful=1 || wordful=0
    for p in "${paths[@]}"; do
      [[ -n "$p" ]] || continue
      if [[ "$wordful" == 1 ]]; then
        [[ "$p" =~ (^|[^A-Za-z0-9_])"$term"([^A-Za-z0-9_]|$) ]] || continue
      else
        [[ "$p" == *"$term"* ]] || continue
      fi
      failed=1
      echo "sentinel: forbidden term in a tracked path name: $(_sentinel_mask_path "$p")" >&2
    done
  done < <(sentinel_forbidden_terms "$manifest")
  return $failed
}

# Verify the Sentinel core against its manifest.
# sentinel_check_core <core_dir> <manifest>
# Emits diagnostics to stderr; returns 0 on success, 1 on any failure.
sentinel_check_core() {
  local core_dir=$1 manifest=$2
  local base manifest_core_dir expected_core_dir actual_core_dir failed=0
  base=$(cd "$(dirname "$manifest")" && pwd)

  if [[ ! -f "$manifest" ]]; then
    echo "sentinel: missing manifest: $manifest" >&2
    return 1
  fi

  sentinel_check_manifest_paths "$manifest" || failed=1
  manifest_core_dir=$(sentinel_manifest_core_dir "$manifest" 2>/dev/null || true)
  if [[ -n "$manifest_core_dir" ]]; then
    if expected_core_dir=$(cd "$base/$manifest_core_dir" 2>/dev/null && pwd); then
      :
    else
      expected_core_dir=""
    fi
    if actual_core_dir=$(cd "$core_dir" 2>/dev/null && pwd); then
      :
    else
      actual_core_dir=""
    fi
    if [[ -n "$expected_core_dir" && -n "$actual_core_dir" && "$expected_core_dir" != "$actual_core_dir" ]]; then
      echo "sentinel: core_dir argument does not match manifest core_dir '$manifest_core_dir'" >&2
      failed=1
    fi
  fi

  local name
  name=$(sentinel_manifest_value "$manifest" name)
  if [[ "$name" != "sentinel" ]]; then
    echo "sentinel: manifest must name the core 'sentinel' (got '${name:-<none>}')" >&2
    failed=1
  fi

  local rel
  while IFS= read -r rel; do
    [[ -n "$rel" ]] || continue
    if [[ ! -f "$base/$rel" || -L "$base/$rel" ]]; then
      echo "sentinel: missing required core file: $rel" >&2
      failed=1
    fi
  done < <(sentinel_manifest_array "$manifest" required_core_read_order)

  # Forbidden-term scan over the core directory (generic + local denylist).
  sentinel_scan_terms "$manifest" "$core_dir" || failed=1

  return $failed
}

# Print the core read-order files with section banners (human-readable dump).
# Includes the manifest. Used by `tools/render` for inspection.
# sentinel_render_core <core_dir> <manifest>
sentinel_render_core() {
  local core_dir=$1 manifest=$2
  local base rel
  base=$(cd "$(dirname "$manifest")" && pwd)
  sentinel_check_manifest_paths "$manifest" || return 1
  printf '\n\n===== %s =====\n\n' "$(basename "$manifest")"
  cat "$manifest"
  while IFS= read -r rel; do
    [[ -n "$rel" ]] || continue
    _sentinel_validate_relpath core_file "$rel" || return 1
    [[ -f "$base/$rel" && ! -L "$base/$rel" ]] || { echo "sentinel: missing core file: $rel" >&2; return 1; }
    printf '\n\n===== %s =====\n\n' "$rel"
    cat "$base/$rel"
  done < <(sentinel_core_files "$manifest" required)
}

# Print an inlinable, BRAND-NEUTRAL contract: just the required core rule files,
# concatenated, with every heading demoted one level so each file's title nests
# as a section under the injected document's single title. No manifest dump, no
# banners, and no source-path comments (those would leak the repo's layout), so
# the result embeds directly into a tool's auto-loaded entrypoint.
# sentinel_render_bundle <core_dir> <manifest>
sentinel_render_bundle() {
  local core_dir=$1 manifest=$2
  local base rel emitted=0
  base=$(cd "$(dirname "$manifest")" && pwd)
  sentinel_check_manifest_paths "$manifest" || return 1
  while IFS= read -r rel; do
    [[ -n "$rel" ]] || continue
    _sentinel_validate_relpath core_file "$rel" || return 1
    [[ -f "$base/$rel" && ! -L "$base/$rel" ]] || { echo "sentinel: missing core file: $rel" >&2; return 1; }
    awk '
      /^```/ { fence = !fence }
      { if (!fence && $0 ~ /^#{1,6} /) print "#" $0; else print $0 }
    ' "$base/$rel"
    printf '\n'
    emitted=1
  done < <(sentinel_core_files "$manifest" required)
  # Refuse to emit an empty bundle: a malformed/unreadable manifest must FAIL
  # loudly, not silently render to nothing (which would hash to the empty-string
  # sha and make a jq machine disagree with a no-jq one).
  if (( emitted == 0 )); then
    echo "sentinel: empty required_core_read_order (manifest unreadable or empty); refusing empty bundle" >&2
    return 1
  fi
}

# Canonical sha256 of the rendered bundle -- the single source of truth for the
# version stamp in generated blocks and for drift/status comparisons. Hashes the
# exact bytes sentinel_render_bundle emits. Use this EVERYWHERE the bundle sha is
# computed so install, status, and verify-vendor always agree.
# sentinel_bundle_sha256 <core_dir> <manifest>
sentinel_bundle_sha256() {
  local tmp rc
  tmp=$(mktemp "${TMPDIR:-/tmp}/sentinel-bundle.XXXXXX") || return 1
  if sentinel_render_bundle "$1" "$2" > "$tmp"; then
    :
  else
    rc=$?
    rm -f "$tmp"
    return "$rc"
  fi
  sentinel_sha256_stdin < "$tmp"
  rc=$?
  rm -f "$tmp"
  return "$rc"
}

# Render the managed adapter block (markers + provenance header + inlined
# contract). This is shared by install/status so they prove the same bytes.
# sentinel_render_managed_block <core_dir> <manifest> <version_file>
sentinel_render_managed_block() {
  local core_dir=$1 manifest=$2 version_file=$3 ver bundle sha
  ver=$(tr -d ' \r\n' < "$version_file" 2>/dev/null || echo dev)
  bundle=$(sentinel_render_bundle "$core_dir" "$manifest") || return 1
  sha=$(sentinel_bundle_sha256 "$core_dir" "$manifest") || return 1
  printf '%s\n' "<!-- AGENT-RULES:BEGIN do-not-edit-inside-this-block -->"
  printf '%s\n' "<!-- version: $ver  sha256: $sha -->"
  printf '\n%s\n\n' "# Operating Contract"
  printf '%s\n' "Shared defaults for coding tasks. The active task and repository instructions"
  printf '%s\n\n' "set the scope; platform and system requirements take precedence."
  printf '%s\n' "$bundle"
  printf '%s\n' "<!-- AGENT-RULES:END -->"
}

# Compose target content with the block inserted into <out>: replace an existing
# managed block in place (collapsing duplicates to one), otherwise append it.
# Nonzero means the target has BEGIN without END and must not be overwritten.
# sentinel_compose_adapter <target> <blockfile> <out>
sentinel_compose_adapter() {
  local target=$1 blockfile=$2 out=$3
  if [[ -f "$target" ]] && grep -q '^<!-- AGENT-RULES:BEGIN' "$target"; then
    awk -v bf="$blockfile" '
      BEGIN { while ((getline line < bf) > 0) blk = blk line ORS }
      /^<!-- AGENT-RULES:BEGIN/   { if (!done) { printf "%s", blk; done = 1 } skip = 1; next }
      /^<!-- AGENT-RULES:END -->/ { if (skip) { skip = 0; next } }
      skip { next }
      { print }
      END { if (skip) exit 3 }
    ' "$target" > "$out" || return $?
  else
    : > "$out"
    if [[ -f "$target" ]]; then
      cat "$target" > "$out"
      printf '\n' >> "$out"
    fi
    cat "$blockfile" >> "$out"
  fi
}

# Canonical adapter target lists for executable tooling. Documentation may
# describe these paths, but install/status consume this source so supported
# targets do not drift between commands.
sentinel_validate_hosts() {
  local hosts=$1 host
  [[ -n "$hosts" && "$hosts" != ,* && "$hosts" != *, && "$hosts" != *,,* ]] || return 1
  local old_ifs=$IFS
  IFS=,
  for host in $hosts; do
    case "$host" in codex|claude|copilot|kiro) ;; *) IFS=$old_ifs; return 1 ;; esac
  done
  IFS=$old_ifs
}

sentinel_repo_adapter_targets() {
  local target_dir=$1 hosts=${2:-codex,claude,copilot,kiro}
  case ",$hosts," in *,codex,*|*,kiro,*) printf '%s\n' "$target_dir/AGENTS.md" ;; esac
  case ",$hosts," in *,claude,*) printf '%s\n' "$target_dir/CLAUDE.md" ;; esac
  case ",$hosts," in *,copilot,*) printf '%s\n' "$target_dir/.github/copilot-instructions.md" ;; esac
}

sentinel_global_adapter_targets() {
  local hosts=${1:-codex,claude,copilot,kiro}
  case ",$hosts," in *,codex,*) printf '%s\n' "${CODEX_HOME:-$HOME/.codex}/AGENTS.md" ;; esac
  case ",$hosts," in *,claude,*) printf '%s\n' "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/CLAUDE.md" ;; esac
  case ",$hosts," in *,copilot,*) printf '%s\n' "$HOME/.copilot/copilot-instructions.md" ;; esac
  case ",$hosts," in *,kiro,*) printf '%s\n' "$HOME/.kiro/steering/AGENTS.md" ;; esac
}

# Retired targets are only inspected or removed on explicit request.
sentinel_legacy_adapter_targets() {
  printf '%s\n' \
    "${XDG_CONFIG_HOME:-$HOME/.config}/opencode/AGENTS.md" \
    "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/AGENTS.md"
}

# Recompute sha256 sums for the core files and print "<sum>  <relpath>".
# sentinel_core_sha256 <core_dir>
sentinel_core_sha256() {
  local core_dir=$1 f rel
  local hasher=""
  if command -v sha256sum >/dev/null 2>&1; then
    hasher="sha256sum"
  elif command -v shasum >/dev/null 2>&1; then
    hasher="shasum -a 256"
  else
    echo "sentinel: no sha256 tool (sha256sum or shasum) available" >&2
    return 1
  fi
  while IFS= read -r f; do
    rel=${f#"$core_dir"/}
    $hasher "$f" | awk -v r="$rel" '{print $1 "  " r}'
  done < <(find "$core_dir" -type f | sort)
}

# Hash arbitrary content read from stdin; prints the bare sha256 hex digest.
# sentinel_sha256_stdin
sentinel_sha256_stdin() {
  local out digest
  if command -v sha256sum >/dev/null 2>&1; then
    out=$(sha256sum) || return 1
  elif command -v shasum >/dev/null 2>&1; then
    out=$(shasum -a 256) || return 1
  else
    echo "sentinel: no sha256 tool (sha256sum or shasum) available" >&2
    return 1
  fi
  digest=${out%%[[:space:]]*}
  [[ -n "$digest" ]] || return 1
  printf '%s\n' "$digest"
}
