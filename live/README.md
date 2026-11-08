# Live tests

`npm run test:live` runs every `live/**/*.live.mjs` on sudokupad.app in headless Chromium, with the
script under test injected. `AGENTS.md` § End-to-end seam says when to run it; this file is what
you need to write or debug one.

## Injection time

A script is injected after Start Puzzle by default. A case about the injection time itself runs at
all three times: at `DOMContentLoaded`, after load before Start Puzzle, after Start Puzzle.

- `live/startup.live.mjs` checks each script's startup that way: it loads with no page error, its
  control appears, one action works.
- The two "auto mode saved on and no mode saved" groups of `live/color-by-digit/color-by-digit-mode.live.mjs` do too.
- Dark Page's page color dialog group injects at `DOMContentLoaded` only.

## The recording

SudokuPad is served from a recording, not from sudokupad.app on every page load. `live/cache.mjs`
owns it; its header comment is the full rule.

- The recording is SudokuPad's own code, so it lives outside the repo, shared by every worktree:
  `${XDG_CACHE_HOME:-~/.cache}/sudokupad-scripts/live/`.
- With no recording, a run records one from sudokupad.app, once per run, under a lock.
- A recording older than a day is checked against SudokuPad's version with one plain request, and
  re-recorded only when the version changed. A recording of the same version is kept and its time
  restamped. A failed check replays the recording and warns.
- `LIVE_REFRESH=1` records again at once, whatever the version. It needs the network.
- `LIVE_OFFLINE=1` never touches the network: it replays what is there and fails when there is no
  recording.
- A replayed request the recording lacks is aborted, and the process then exits 1 naming each such
  URL, with or without `LIVE_OFFLINE=1`. `LIVE_REFRESH=1` records again.

## The daily watch

`npm run watch:live` (`live/watch.mjs`) is for a daily schedule, so a SudokuPad update that breaks a script shows
up as a bug and not when someone installs it. Its header comment is the full rule: a new version runs the suite
with `LIVE_REFRESH=1`, red files one `bug` issue, and a version already checked is a no-op. The last version
checked lives in `last-version`, beside the recording.

It runs nightly on GitHub Actions (`.github/workflows/watch.yml`, 06:17 UTC; `workflow_dispatch` runs it by hand).
The recording and `last-version` persist between runs in the Actions cache, saved under a key ending in the run id and
attempt, and restored by prefix, because a cache entry cannot be overwritten. The recording never goes in the repo or an
artifact. A run on an unchanged version makes one request to SudokuPad and runs no suite.

GitHub turns off a public repository's scheduled workflows after 60 days with no repository activity. To turn it
back on, open the Actions tab, pick "Watch SudokuPad" and press "Enable workflow" (or run
`gh workflow enable watch.yml`).

## The Tampermonkey test

`npm run test:tampermonkey` (`live/tampermonkey/install.tampermonkey.mjs`) installs every `*.user.js` into a real
Tampermonkey in Playwright's Chromium, the way a user does: open the script's URL, click Install. Each script's copy on
main goes in first, from `raw.githubusercontent.com`, then the checkout's copy, served from `127.0.0.1`, over it.
Tampermonkey must offer the second as an update and its dashboard must list each script once, at the checkout's
`@version`, which is what a changed `@name` or `@namespace` breaks. Then each script must start on the puzzle page,
served from the recording, and its representative action from `live/scripts.mjs` must work. The recipe and its caveats are `docs/research/tampermonkey-in-playwright.md`.

- Tampermonkey is closed-source freeware: its CRX is fetched at run time from Google's update endpoint into
  `tampermonkey/` beside the recording, again once it is a day old, and never committed.
- It needs `tampermonkey.net`, `raw.githubusercontent.com` and Google's CRX endpoint (`clients2.google.com`), so it
  stays out of `npm test` and `npm run test:live`.
- It runs when a change touches any line of a `// ==UserScript==` header, at the controller's merge check for such a PR,
  and every night in the daily watch, after `watch:live`, so a new Tampermonkey shows up within a day. Chromium changes
  only when `package-lock.json`'s Playwright does.
- It does not cover the Chrome Web Store install, the browser's own prompts or Tampermonkey's scheduled update check.
