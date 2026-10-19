# Releasing Sentinel

Consumers pin a version and bundle hash. Release only a reproducible, reviewed
revision with the required checks and approvals.

1. Prepare the release through a PR. Move `CHANGELOG.md`'s Unreleased items under
   `## [x.y.z]`, bump `VERSION`, and record the `bundle-sha256`. Recompute it with
   `bash -c 'source tools/sentinel-lib.sh; sentinel_bundle_sha256 core MANIFEST.json'`.
2. Run `make install` to regenerate adapters, then `make gate`.
3. From a clean worktree, run `make release-check`. It rejects staged or untracked
   files, existing local or remote version tags, uncheckable remote tag state,
   mismatched changelog hashes and failed checks. It prints the certified commit.
4. Land the PR through normal review. Its exact head needs green `ci` and CodeQL;
   integrity has no owner bypass. Update a clean local `main`, confirm its HEAD
   equals GitHub's `main`, then rerun `make release-check`. A feature-branch result
   or an earlier revision is not release evidence.
5. Confirm `gh api repos/luisgui1757/sentinel/immutable-releases --jq .enabled`
   returns `true`. Create and push an annotated tag. Sign it when a key is available:

   ```bash
   git tag -s "vx.y.z" -m "Sentinel vx.y.z"  # use -a when no signing key is available
   git push origin "vx.y.z"
   ```

6. Create and verify a draft release. Include `bundle-sha256`. If distributing
   assets, include `SHA256SUMS` and verify downloaded assets through the consumer
   path. Publish only after that proof; immutable releases cannot be corrected
   by replacing a tag or asset.

A consumer pins the tag and verifies its vendored rules:

```bash
tools/verify-vendor <vendor-dir> <bundle-sha256>
```

Use `--structure-only` only for an explicit structural audit. Normal verification
requires the expected hash. Optional skills use their installed ownership registry
and `tools/skills.mjs --check`; the rule hash alone does not certify skill copies.
