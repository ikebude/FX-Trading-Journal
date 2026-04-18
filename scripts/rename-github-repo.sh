#!/usr/bin/env bash
#
# rename-github-repo.sh — DOCUMENTED PLAYBOOK, NOT AUTO-EXECUTED
#
# Task: T1.2 (v1.1 FXLedger rename).
# Decision reference: docs/superpowers/plans/2026-04-19-v1.1-implementation.md
# (Section 0 "Decisions locked", row 2 — product name "FXLedger").
#
# This script documents the exact `gh` commands required to rename the
# GitHub repository from `ikebude/FX-Trading-Journal` to a new slug that
# matches the FXLedger brand. It is INTENTIONALLY guarded behind an
# environment variable so that sourcing or running it by accident cannot
# mutate the remote.
#
# Run only after:
#   1. The controller has reviewed and merged the T1.2 branch to main.
#   2. A final decision has been made on the repo slug. The two candidate
#      slugs are:
#        a) fxledger                — short, matches npm name
#        b) FXLedger                — camel-cased marketing form
#      GitHub slugs are case-insensitive for lookup but case-preserving for
#      display, so pick the form that should show in the URL.
#   3. You have `gh auth status` green for the `ikebude` account and the
#      repo-admin scope.
#
# After renaming, GitHub automatically serves redirects from the old slug
# for git clone, git fetch, git push, and HTTPS browser URLs — but a manual
# `git remote set-url origin ...` on every developer machine is strongly
# recommended. The electron-updater feed URL is configured via
# `package.json -> build.publish.{owner,repo}` and MUST be updated in a
# follow-up commit; otherwise existing v1.0.x installs will fail to detect
# future releases (the feed URL is fetched at runtime, not cached).
#
# Rollback:
#   gh repo rename --repo "$NEW_OWNER/$NEW_NAME" "$OLD_NAME"
#   (GitHub will re-establish redirects in the reverse direction.)
#
# Usage:
#   FXLEDGER_RENAME_CONFIRM=1 bash scripts/rename-github-repo.sh
#
# The script prints the commands without env var set, executes with it set.

set -euo pipefail

OLD_OWNER="ikebude"
OLD_NAME="FX-Trading-Journal"
# Pick one of these for NEW_NAME before running:
NEW_NAME="${FXLEDGER_NEW_NAME:-fxledger}"

echo "=== GitHub repo rename playbook ==="
echo ""
echo "Current repo:   ${OLD_OWNER}/${OLD_NAME}"
echo "Proposed slug:  ${OLD_OWNER}/${NEW_NAME}"
echo ""
echo "Commands that WILL run (if FXLEDGER_RENAME_CONFIRM=1):"
echo ""
echo "  # 1. Verify we own the repo and are authenticated"
echo "  gh auth status"
echo "  gh repo view ${OLD_OWNER}/${OLD_NAME} --json name,owner,description"
echo ""
echo "  # 2. Rename the remote (requires repo-admin scope)"
echo "  gh repo rename --repo ${OLD_OWNER}/${OLD_NAME} ${NEW_NAME}"
echo ""
echo "  # 3. Update the local git remote to match (per-developer, per-clone)"
echo "  git remote set-url origin https://github.com/${OLD_OWNER}/${NEW_NAME}.git"
echo "  git remote -v"
echo ""
echo "  # 4. Verify redirects work from the old URL"
echo "  gh repo view ${OLD_OWNER}/${OLD_NAME}   # should still resolve"
echo "  gh repo view ${OLD_OWNER}/${NEW_NAME}   # should be the new canonical"
echo ""

if [[ "${FXLEDGER_RENAME_CONFIRM:-0}" != "1" ]]; then
  echo "FXLEDGER_RENAME_CONFIRM is not set. Dry-run only — exiting without changes."
  echo ""
  echo "Manual post-rename steps the controller MUST complete afterwards:"
  echo "  - Update package.json 'repository.url', 'bugs.url', 'homepage'."
  echo "  - Update package.json 'build.publish.repo'."
  echo "  - Update README badge URLs and release-download links."
  echo "  - Open an issue on the (redirected) old URL announcing the move so"
  echo "    external consumers can update their bookmarks and forks."
  echo "  - Leave GitHub's redirect in place for at least 90 days."
  exit 0
fi

echo "FXLEDGER_RENAME_CONFIRM=1 detected — executing the rename."
echo ""

gh auth status
gh repo view "${OLD_OWNER}/${OLD_NAME}" --json name,owner,description
gh repo rename --repo "${OLD_OWNER}/${OLD_NAME}" "${NEW_NAME}"
git remote set-url origin "https://github.com/${OLD_OWNER}/${NEW_NAME}.git"
git remote -v

echo ""
echo "=== Rename complete. Don't forget the package.json URL fix-up commit. ==="
