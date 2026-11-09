#!/usr/bin/env bash
# Shell and `gh` only: this runs when `npm ci` failed, so it cannot share live/watch.mjs's fileIssue.
# A failed list stops the script: filing blind could duplicate.
set -euo pipefail
open=$(gh issue list --repo "$GITHUB_REPOSITORY" --state open --limit 200 --json title --jq '.[].title')
if printf '%s\n' "$open" | grep -qxF "$TITLE"; then exit 0; fi
gh issue create --repo "$GITHUB_REPOSITORY" --label bug --title "$TITLE" --body "$BODY"
