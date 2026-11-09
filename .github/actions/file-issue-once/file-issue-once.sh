#!/usr/bin/env bash
# Files a `bug` issue titled $TITLE with body $BODY, unless an open issue already has exactly that title.
# A failed list stops the script: filing blind could duplicate.
set -euo pipefail
open=$(gh issue list --repo "$GITHUB_REPOSITORY" --state open --limit 200 --json title --jq '.[].title')
if printf '%s\n' "$open" | grep -qxF "$TITLE"; then exit 0; fi
gh issue create --repo "$GITHUB_REPOSITORY" --label bug --title "$TITLE" --body "$BODY"
