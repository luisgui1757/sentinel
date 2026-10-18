#!/usr/bin/env bash
# Transactionally applies Sentinel's GitHub repository policy.
set -Eeuo pipefail
export LC_ALL=C

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/.." && pwd -P)
MODE=apply
SNAPSHOT=""
REPO=""
OWNER_ID=""
APPLY_STARTED=0
ROLLBACK_ACTIVE=0

usage() {
  cat <<'EOF'
apply-repo-safeguards.sh [--preflight-only] [owner/repo]
apply-repo-safeguards.sh --restore SNAPSHOT [owner/repo]

Applies the canonical Sentinel repository policy from an exact, clean `main`:
  - unbypassable integrity rules (strict `ci`, CodeQL, no force/delete)
  - PR-only owner bypass for review and branch-update rules
  - rulesets as the only branch-policy source (no classic overlap)
  - selected GitHub-owned Actions pinned to full commit SHAs
  - read-only workflow defaults and immutable future releases
  - secret scanning, push protection, GitHub security updates, and private
    vulnerability reporting

Before the first write, the script records a private recovery snapshot under
the repository's git common directory. Any failed apply triggers automatic
rollback. --restore replays a named snapshot explicitly.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --preflight-only) MODE=preflight ;;
    --restore) shift; SNAPSHOT=${1:?--restore needs a snapshot path}; MODE=restore ;;
    --restore=*) SNAPSHOT=${1#--restore=}; MODE=restore ;;
    -h|--help) usage; exit 0 ;;
    -*) echo "apply-repo-safeguards: unknown argument: $1" >&2; exit 2 ;;
    *) [[ -z "$REPO" ]] || { echo "apply-repo-safeguards: repository supplied twice" >&2; exit 2; }; REPO=$1 ;;
  esac
  shift
done

fail() {
  echo "apply-repo-safeguards: FAIL: $*" >&2
  exit 1
}

for tool in gh git jq; do
  command -v "$tool" >/dev/null 2>&1 || fail "$tool is required"
done
gh auth status >/dev/null 2>&1 || fail "GitHub CLI is not authenticated"

if [[ -z "$REPO" ]]; then
  REPO=$(cd "$REPO_ROOT" && gh repo view --json nameWithOwner --jq '.nameWithOwner')
fi
[[ "$REPO" == */* ]] || fail "repository must be owner/repo, got: $REPO"
OWNER_ID=$(gh api "repos/$REPO" --jq '.owner.id')
[[ "$OWNER_ID" =~ ^[0-9]+$ ]] || fail "could not resolve the repository owner id"

api_json() {
  local method=$1 path=$2
  echo "+ gh api -X $method $path --input -" >&2
  gh api -X "$method" "$path" --input -
}

ruleset_id_by_name() {
  local name=$1
  gh api "repos/$REPO/rulesets?includes_parents=false" \
    | jq -r --arg name "$name" '[.[] | select(.name == $name) | .id] | first // empty'
}

ruleset_count_by_name() {
  local name=$1
  gh api "repos/$REPO/rulesets?includes_parents=false" \
    | jq -r --arg name "$name" '[.[] | select(.name == $name)] | length'
}

accepted_ruleset_payload() {
  jq '{name, target, enforcement, bypass_actors, conditions, rules}'
}

desired_ruleset_payload() {
  local file=$1
  jq --argjson owner_id "$OWNER_ID" '
    {name, target, enforcement, bypass_actors, conditions, rules}
    | .bypass_actors |= map(if .actor_type == "User" then .actor_id = $owner_id else . end)
  ' "$file"
}

upsert_ruleset() {
  local name=$1 file=$2 id payload
  id=$(ruleset_id_by_name "$name")
  payload=$(desired_ruleset_payload "$file")
  if [[ -n "$id" ]]; then
    printf '%s\n' "$payload" | api_json PUT "repos/$REPO/rulesets/$id" >/dev/null
  else
    printf '%s\n' "$payload" | api_json POST "repos/$REPO/rulesets" >/dev/null
  fi
}

api_or_null_on_404() {
  local path=$1 value
  if value=$(gh api "$path" 2>/dev/null); then
    printf '%s\n' "$value"
  elif [[ $(jq -r '.status // empty' <<<"$value") == 404 ]]; then
    printf 'null\n'
  else
    fail "could not read $path"
  fi
}

delete_classic_if_present() {
  local value
  if value=$(gh api "repos/$REPO/branches/main/protection" 2>/dev/null); then
    gh api -X DELETE "repos/$REPO/branches/main/protection" >/dev/null
  elif [[ $(jq -r '.status // empty' <<<"$value") != 404 ]]; then
    fail "could not determine classic branch-protection state"
  fi
}

classic_restore_payload() {
  jq '
    if . == null then null else {
      required_status_checks: (
        if .required_status_checks == null then null else {
          strict: .required_status_checks.strict,
          checks: [.required_status_checks.checks[] | {context, app_id}]
        } end
      ),
      enforce_admins: .enforce_admins.enabled,
      required_pull_request_reviews: (
        if .required_pull_request_reviews == null then null else {
          dismissal_restrictions: {
            users: [.required_pull_request_reviews.dismissal_restrictions.users[].login],
            teams: [.required_pull_request_reviews.dismissal_restrictions.teams[].slug],
            apps: [.required_pull_request_reviews.dismissal_restrictions.apps[].slug]
          },
          dismiss_stale_reviews: .required_pull_request_reviews.dismiss_stale_reviews,
          require_code_owner_reviews: .required_pull_request_reviews.require_code_owner_reviews,
          required_approving_review_count: .required_pull_request_reviews.required_approving_review_count,
          require_last_push_approval: .required_pull_request_reviews.require_last_push_approval
        } end
      ),
      restrictions: (
        if .restrictions == null then null else {
          users: [.restrictions.users[].login],
          teams: [.restrictions.teams[].slug],
          apps: [.restrictions.apps[].slug]
        } end
      ),
      required_linear_history: .required_linear_history.enabled,
      allow_force_pushes: .allow_force_pushes.enabled,
      allow_deletions: .allow_deletions.enabled,
      block_creations: .block_creations.enabled,
      required_conversation_resolution: .required_conversation_resolution.enabled,
      lock_branch: .lock_branch.enabled,
      allow_fork_syncing: .allow_fork_syncing.enabled
    } end
  '
}

capture_snapshot() {
  local snapshot_dir stamp temp_dir repo_json actions_json selected_json workflow_json
  local immutable_json private_reporting_json automated_json classic_json vulnerability_alerts
  snapshot_dir=$(cd "$REPO_ROOT" && git rev-parse --git-common-dir)/sentinel-safeguards
  [[ "$snapshot_dir" == /* ]] || snapshot_dir="$REPO_ROOT/$snapshot_dir"
  mkdir -p "$snapshot_dir"
  chmod 700 "$snapshot_dir"
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  SNAPSHOT="$snapshot_dir/${stamp}-$(git -C "$REPO_ROOT" rev-parse --short=12 HEAD).json"
  temp_dir=$(mktemp -d)

  repo_json=$(gh api "repos/$REPO")
  actions_json=$(gh api "repos/$REPO/actions/permissions")
  if [[ $(jq -r '.allowed_actions' <<<"$actions_json") == selected ]]; then
    selected_json=$(gh api "repos/$REPO/actions/permissions/selected-actions")
  else
    selected_json=null
  fi
  workflow_json=$(gh api "repos/$REPO/actions/permissions/workflow")
  immutable_json=$(gh api "repos/$REPO/immutable-releases")
  private_reporting_json=$(gh api "repos/$REPO/private-vulnerability-reporting")
  automated_json=$(gh api "repos/$REPO/automated-security-fixes")
  if [[ $(api_or_null_on_404 "repos/$REPO/vulnerability-alerts") == null ]]; then
    vulnerability_alerts=false
  else
    vulnerability_alerts=true
  fi
  classic_json=$(api_or_null_on_404 "repos/$REPO/branches/main/protection")

  : > "$temp_dir/rulesets.jsonl"
  while IFS='|' read -r name _file; do
    local count id payload
    count=$(ruleset_count_by_name "$name")
    [[ "$count" -le 1 ]] || fail "ruleset name is duplicated: $name"
    if [[ "$count" -eq 1 ]]; then
      id=$(ruleset_id_by_name "$name")
      payload=$(gh api "repos/$REPO/rulesets/$id" | accepted_ruleset_payload)
      jq -cn --arg name "$name" --argjson id "$id" --argjson payload "$payload" \
        '{name:$name,id:$id,payload:$payload}' >> "$temp_dir/rulesets.jsonl"
    else
      jq -cn --arg name "$name" '{name:$name,id:null,payload:null}' >> "$temp_dir/rulesets.jsonl"
    fi
  done <<'EOF'
Protect main: integrity|main-integrity.json
Protect main: review|main-review.json
Protect main: owner updates|main-owner-updates.json
EOF

  jq -n \
    --arg repository "$REPO" \
    --arg head "$(git -C "$REPO_ROOT" rev-parse HEAD)" \
    --arg captured_at "$stamp" \
    --argjson repository_state "$repo_json" \
    --argjson actions "$actions_json" \
    --argjson selected_actions "$selected_json" \
    --argjson workflow "$workflow_json" \
    --argjson immutable "$immutable_json" \
    --argjson private_reporting "$private_reporting_json" \
    --argjson automated_fixes "$automated_json" \
    --argjson vulnerability_alerts "$vulnerability_alerts" \
    --argjson classic "$classic_json" \
    --slurpfile rulesets "$temp_dir/rulesets.jsonl" \
    '{schema_version:1,repository:$repository,head:$head,captured_at:$captured_at,
      repository_state:$repository_state,actions:$actions,selected_actions:$selected_actions,
      workflow:$workflow,immutable:$immutable,private_reporting:$private_reporting,
      automated_fixes:$automated_fixes,vulnerability_alerts:$vulnerability_alerts,
      classic:$classic,rulesets:$rulesets}' > "$SNAPSHOT"
  chmod 600 "$SNAPSHOT"
  rm -rf "$temp_dir"
  echo "Recovery snapshot: $SNAPSHOT"
}

restore_snapshot() {
  local snapshot=$1 snapshot_repo current_id entry name payload old_actions old_selected old_enabled
  [[ -f "$snapshot" ]] || fail "snapshot not found: $snapshot"
  jq -e '.schema_version == 1' "$snapshot" >/dev/null || fail "unsupported snapshot schema"
  snapshot_repo=$(jq -r '.repository' "$snapshot")
  [[ "$snapshot_repo" == "$REPO" ]] || fail "snapshot is for $snapshot_repo, not $REPO"
  ROLLBACK_ACTIVE=1
  echo "Restoring repository policy from $snapshot" >&2

  jq '.repository_state | {
    allow_merge_commit, allow_squash_merge, allow_rebase_merge,
    allow_auto_merge, delete_branch_on_merge,
    security_and_analysis: {
      secret_scanning: {status: .security_and_analysis.secret_scanning.status},
      secret_scanning_push_protection: {status: .security_and_analysis.secret_scanning_push_protection.status}
    }
  }' "$snapshot" | api_json PATCH "repos/$REPO" >/dev/null

  old_actions=$(jq -c '.actions | {enabled,allowed_actions,sha_pinning_required}' "$snapshot")
  old_selected=$(jq -c '.selected_actions' "$snapshot")
  if [[ "$old_selected" != null ]]; then
    printf '%s\n' '{"enabled":true,"allowed_actions":"selected","sha_pinning_required":false}' \
      | api_json PUT "repos/$REPO/actions/permissions" >/dev/null
    printf '%s\n' "$old_selected" | api_json PUT "repos/$REPO/actions/permissions/selected-actions" >/dev/null
  fi
  printf '%s\n' "$old_actions" | api_json PUT "repos/$REPO/actions/permissions" >/dev/null
  jq '.workflow' "$snapshot" | api_json PUT "repos/$REPO/actions/permissions/workflow" >/dev/null

  old_enabled=$(jq -r '.immutable.enabled' "$snapshot")
  if [[ "$old_enabled" == true ]]; then
    gh api -X PUT "repos/$REPO/immutable-releases" >/dev/null
  else
    gh api -X DELETE "repos/$REPO/immutable-releases" >/dev/null
  fi
  old_enabled=$(jq -r '.private_reporting.enabled' "$snapshot")
  if [[ "$old_enabled" == true ]]; then
    gh api -X PUT "repos/$REPO/private-vulnerability-reporting" >/dev/null
  else
    gh api -X DELETE "repos/$REPO/private-vulnerability-reporting" >/dev/null
  fi
  old_enabled=$(jq -r '.vulnerability_alerts' "$snapshot")
  gh api -X "$([[ "$old_enabled" == true ]] && echo PUT || echo DELETE)" \
    "repos/$REPO/vulnerability-alerts" >/dev/null
  old_enabled=$(jq -r '.automated_fixes.enabled' "$snapshot")
  gh api -X "$([[ "$old_enabled" == true ]] && echo PUT || echo DELETE)" \
    "repos/$REPO/automated-security-fixes" >/dev/null

  while IFS= read -r entry; do
    name=$(jq -r '.name' <<<"$entry")
    payload=$(jq -c '.payload' <<<"$entry")
    current_id=$(ruleset_id_by_name "$name")
    if [[ "$payload" == null ]]; then
      [[ -z "$current_id" ]] || gh api -X DELETE "repos/$REPO/rulesets/$current_id" >/dev/null
    elif [[ -n "$current_id" ]]; then
      printf '%s\n' "$payload" | api_json PUT "repos/$REPO/rulesets/$current_id" >/dev/null
    else
      printf '%s\n' "$payload" | api_json POST "repos/$REPO/rulesets" >/dev/null
    fi
  done < <(jq -c '.rulesets[]' "$snapshot")

  if jq -e '.classic == null' "$snapshot" >/dev/null; then
    gh api -X DELETE "repos/$REPO/branches/main/protection" >/dev/null 2>&1 || true
  else
    jq '.classic' "$snapshot" | classic_restore_payload \
      | api_json PUT "repos/$REPO/branches/main/protection" >/dev/null
    if jq -e '.classic.required_signatures.enabled == true' "$snapshot" >/dev/null; then
      gh api -X POST "repos/$REPO/branches/main/protection/required_signatures" >/dev/null
    fi
  fi
  APPLY_STARTED=0
  ROLLBACK_ACTIVE=0
  echo "Repository policy restored from $snapshot" >&2
}

on_error() {
  local status=$?
  trap - ERR
  set +e
  if [[ "$APPLY_STARTED" -eq 1 && "$ROLLBACK_ACTIVE" -eq 0 && -n "$SNAPSHOT" ]]; then
    echo "Apply failed; starting automatic rollback." >&2
    if ! ( set -e; restore_snapshot "$SNAPSHOT" ); then
      echo "ROLLBACK FAILED; recover manually with: $0 --restore '$SNAPSHOT' '$REPO'" >&2
    fi
  fi
  exit "$status"
}
trap on_error ERR

preflight() {
  local branch local_head live_head resolved_repo analyses checks
  branch=$(git -C "$REPO_ROOT" branch --show-current)
  [[ "$branch" == main ]] || fail "run from main, not $branch"
  [[ -z $(git -C "$REPO_ROOT" status --short) ]] || fail "worktree must be clean"
  resolved_repo=$(cd "$REPO_ROOT" && gh repo view --json nameWithOwner --jq '.nameWithOwner')
  [[ "$resolved_repo" == "$REPO" ]] || fail "origin resolves to $resolved_repo, not $REPO"
  local_head=$(git -C "$REPO_ROOT" rev-parse HEAD)
  live_head=$(gh api "repos/$REPO/commits/main" --jq '.sha')
  [[ "$local_head" == "$live_head" ]] || fail "local main $local_head is not live main $live_head"
  bash "$REPO_ROOT/tools/ruleset-check" --owner-id "$OWNER_ID"
  bash "$REPO_ROOT/tools/repository-policy-check"
  checks=$(gh api "repos/$REPO/commits/$live_head/check-runs?per_page=100")
  jq -e 'any(.check_runs[]; .name == "ci" and .app.slug == "github-actions" and .conclusion == "success")' \
    <<<"$checks" >/dev/null || fail "exact main $live_head has no successful GitHub Actions ci check"
  analyses=$(gh api "repos/$REPO/code-scanning/analyses?ref=refs/heads/main&tool_name=CodeQL&per_page=100")
  jq -e --arg head "$live_head" 'any(.[]; .commit_sha == $head and .error == "")' \
    <<<"$analyses" >/dev/null || fail "CodeQL has no successful analysis for exact main $live_head"
  while IFS= read -r name; do
    [[ $(ruleset_count_by_name "$name") -le 1 ]] || fail "ruleset name is duplicated: $name"
  done <<'EOF'
Protect main: integrity
Protect main: review
Protect main: owner updates
EOF
  echo "Preflight passed for exact live main $live_head."
}

apply_policy() {
  local live_head
  live_head=$(gh api "repos/$REPO/commits/main" --jq '.sha')
  [[ "$live_head" == "$(git -C "$REPO_ROOT" rev-parse HEAD)" ]] \
    || fail "main moved after preflight; refusing to write"
  APPLY_STARTED=1

  jq -n '{allow_merge_commit:false,allow_squash_merge:true,allow_rebase_merge:false,
    allow_auto_merge:false,delete_branch_on_merge:true,
    security_and_analysis:{secret_scanning:{status:"enabled"},
      secret_scanning_push_protection:{status:"enabled"}}}' \
    | api_json PATCH "repos/$REPO" >/dev/null
  printf '%s\n' '{"enabled":true,"allowed_actions":"selected","sha_pinning_required":true}' \
    | api_json PUT "repos/$REPO/actions/permissions" >/dev/null
  printf '%s\n' '{"github_owned_allowed":true,"verified_allowed":false,"patterns_allowed":[]}' \
    | api_json PUT "repos/$REPO/actions/permissions/selected-actions" >/dev/null
  printf '%s\n' '{"default_workflow_permissions":"read","can_approve_pull_request_reviews":true}' \
    | api_json PUT "repos/$REPO/actions/permissions/workflow" >/dev/null
  gh api -X PUT "repos/$REPO/immutable-releases" >/dev/null
  gh api -X PUT "repos/$REPO/vulnerability-alerts" >/dev/null
  gh api -X PUT "repos/$REPO/automated-security-fixes" >/dev/null
  gh api -X PUT "repos/$REPO/private-vulnerability-reporting" >/dev/null

  upsert_ruleset "Protect main: integrity" "$REPO_ROOT/.github/rulesets/main-integrity.json"
  upsert_ruleset "Protect main: review" "$REPO_ROOT/.github/rulesets/main-review.json"
  upsert_ruleset "Protect main: owner updates" "$REPO_ROOT/.github/rulesets/main-owner-updates.json"
  delete_classic_if_present

  bash "$REPO_ROOT/tools/ruleset-check" --repo "$REPO" --owner-id "$OWNER_ID"
  APPLY_STARTED=0
  echo "Repository safeguards applied and verified for exact main $live_head."
  echo "Recovery snapshot retained at $SNAPSHOT"
}

if [[ "$MODE" == restore ]]; then
  restore_snapshot "$SNAPSHOT"
  exit 0
fi

preflight
[[ "$MODE" == preflight ]] && exit 0
capture_snapshot
apply_policy
