# The live suite runs from a recording outside the repo

Status: accepted, 2026-11-05 (spec #129; the daily watch #245, #436)

The live tests do not load sudokupad.app on every page load. `live/cache.mjs` serves SudokuPad's own code from a **recording** (a HAR),
aborts the trackers (consent, analytics, the solve counter) and aborts any request the recording lacks. The process then exits 1
naming each missing URL, so a recording with gaps cannot pass.

- **Outside the repo.** The recording is SudokuPad's own code, not ours, so it lives in `${XDG_CACHE_HOME:-~/.cache}/sudokupad-scripts/live/`,
  shared by every worktree. It is never committed, never an artifact and never in the Actions cache.
- **Re-recorded when SudokuPad changes, not on a clock.** #129 replaced re-recording on a fixed age. A recording older than a day is
  checked with one plain request that reads SudokuPad's version (`?v=` on its assets,
  `docs/research/sudokupad-version-signal.md`); the same version keeps it and restamps it, a new version records. A failed check
  replays the recording and warns.
- **Two switches.** `LIVE_REFRESH=1` records again now; `LIVE_OFFLINE=1` never touches the network and fails with no recording.
- **The watch records fresh.** The nightly watch and the fuzz workflows start with no recording and record one, since `?v=` may not
  move when SudokuPad's assets do. So a SudokuPad change can fail a pull request's fuzz with no change of the pull request's own
  (`live/README.md` § The daily watch).

`live/README.md` § The recording has the operating rule.
