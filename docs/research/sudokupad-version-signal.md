# SudokuPad's version signal

Ticket #140. Question: what names the version of SudokuPad that `live/cache.mjs` recorded, readable with one plain request
instead of a full recording? Read on 2026-11-05 with `curl` against `https://sudokupad.app/`.

## Finding

The puzzle page's HTML names the version in the query string of every asset it loads: `/style.css?v=0.611.0`,
`/framework.js?v=0.611.0`, `/script.js?v=0.611.0`, and so on. On that day the document held 69 such references, all
`?v=0.611.0`. A plain `GET` of the puzzle URL (`live/puzzle-url.txt`) returns that document (21 KB, `content-type:
text/html`, `cache-control: no-cache`), so one request reads the version and no browser is needed.

The recording holds the same document under the same URL, so the recorded version is read from the recording with no
request at all.

Both sides are read by the first `?v=<digits and dots>` in the document (`pageVersion` in `live/cache.mjs`).

## What does not work

- The homepage `https://sudokupad.app/` carries no `?v=` at all: it is a different document (a puzzle list, 29 KB, with
  `cache-control: max-age=600`). Only a puzzle URL carries the version.
- The settings dialog shows a version too (`settings-versions.png`), but reading it needs a browser.

## Limits

- Not checked: that the version moves on every release, since only one version (0.611.0, then 0.612.0 in
  `sudokupad-replay-files.md`) was seen. A release that changed assets without changing `v=` would keep a recording
  that lacks them; `LIVE_REFRESH=1` records again, and a replayed request the recording lacks fails the run naming it.
- Not checked: whether the version moves a second time inside one day's rollout. The check runs once per 24 hours.
