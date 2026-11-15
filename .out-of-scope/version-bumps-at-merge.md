# Raising script versions at merge time

This repo raises a script's `@version` when the change is built, not when it merges. `node sync-lib.js` raises the version of
every script whose copy of a `lib/` module it rewrote, and the PR carries that raise.

## Why this is out of scope

Two PRs that both change `lib/` therefore conflict on the scripts' version lines, and the second one merges main again and keeps
the higher version. That happened at least five times (#549/#551, #555/#557, #556 twice, #551/#559, and spec #832's merge of
#829 on 2026-11-14). Chris ruled on 2026-11-15 to keep it:

- The conflict is one version line per script, quick to settle by hand.
- Spec runs already build `lib/` changes one at a time (every slice that names `lib/` holds the directory), and drain merges one
  bundle at a time, so two lib-changing PRs in flight together are rare.
- Raising versions at merge time would change the merge steps shared by every repo (the agent-skills `implement` merge), for a
  conflict that costs seconds.

The cost accepted: now and then a worker merges main again to settle a version line.

## Prior requests

- #716 — "sync-lib version bumps clash between lib-changing PRs"
