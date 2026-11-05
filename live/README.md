# Live tests

`npm run test:live` runs every `live/*.live.mjs` on sudokupad.app in headless Chromium, with the
script under test injected. `AGENTS.md` § End-to-end seam says when to run it; this file is what
you need to write or debug one.

## Injection time

A script is injected after Start Puzzle by default. A case about the injection time itself runs at
all three times: at `DOMContentLoaded`, after load before Start Puzzle, after Start Puzzle.

- `live/startup.live.mjs` checks each script's startup that way: it loads with no page error, its
  control appears, one action works.
- The two "auto mode saved on" groups of `live/color-by-digit-auto.live.mjs` do too.
- Dark Page's page color dialog group injects at `DOMContentLoaded` only.

## The recording

SudokuPad is served from a recording, not from sudokupad.app on every page load. `live/cache.mjs`
owns it; its header comment is the full rule.

- The recording is SudokuPad's own code, so it lives outside the repo, shared by every worktree:
  `${XDG_CACHE_HOME:-~/.cache}/sudokupad-scripts/live/`.
- A recording older than a day is checked against SudokuPad's version with one plain request, and
  re-recorded only when the version changed. A recording of the same version is kept and its time
  restamped. A failed check replays the recording and warns.
- `LIVE_REFRESH=1` records again at once, whatever the version. It needs the network.
- `LIVE_OFFLINE=1` never touches the network: it replays what is there and fails when there is no
  recording. It fails naming any request the recording lacks.
- With neither set, a run replays the recording and touches the network only for the version check.
