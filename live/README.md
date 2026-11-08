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

## Errors and skip lines

`openPage` (and `newPage`) collect into the returned `errors` every uncaught page error and every skip line a script logs
(`<script>: <feature> skipped because SudokuPad has no <internal>` or `... changed:`), of any console type. A suite seeds
nothing for that: a feature that turns itself off at runtime fails any suite that asserts `errors` is empty.
`captureConsoleErrors` (a `seed`) adds the page's `console.error` lines.

A suite that breaks a feature on purpose declares the skip lines it expects: `openPage(browser, { expectedSkips: [/^dark-page: /] })`
(patterns). Those lines stay out of `errors`, and the suite checks them itself; any other skip line fails it. Declare
as narrow a pattern as the break allows: a pattern for a whole script lets a second, unplanted skip line pass, unless the
suite also counts its warnings.
`live/skip-lines.live.mjs` plants a skip with no declaration and checks it lands in `errors`.

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
- A recording must hold fabric.js, which Test Markup loads only when it is on and Text Anywhere's live check needs. A
  fresh recording without it is not written and the run fails; an existing one without it is recorded again at once.
- A replayed request the recording lacks is aborted, and the process then exits 1 naming each such
  URL, with or without `LIVE_OFFLINE=1`. `LIVE_REFRESH=1` records again.

## The fuzz proof

`live/fuzz/` proves fast-check can drive SudokuPad (#592; `docs/research/ui-fuzz-tools.md` § Tried with Playwright). `fuzz.mjs` runs random
click / type / undo sequences, each on a page of its own, against a planted rule ("no more than 2 digits entered"); `fuzz.live.mjs` checks that it
is found, shrunk to the shortest sequence and replayed. A failure prints `node live/fuzz/run.mjs --seed ... --path ... --replay-path ...`, which
reproduces it. It takes about four and a half minutes, nearly all of it shrinking, so run it alone: `node --test live/fuzz/fuzz.live.mjs`.

## The daily watch

`npm run watch:live` (`live/watch.mjs`) is for a daily schedule, so a SudokuPad update that breaks a script shows
up as a bug and not when someone installs it. Its header comment is the full rule: a new version runs the suite
with `LIVE_REFRESH=1`, red files one `bug` issue, and a version already checked is a no-op until a week has passed. The last version
checked lives in `last-version`, beside the recording.

Two more rules close gaps in that:

- **A weekly forced run.** `?v=` may not move when SudokuPad's assets do, so a run also happens, recording again, when
  the last full run (the time in `last-full-run`, beside the recording) is seven days old or missing. A red weekly run
  files the `bug` issue and says it was the weekly run, unless an open issue already has that title.
- **A "did not run" issue.** A run that cannot reach the checks (no Chromium, a failed recording, a version that could
  not be read) files one issue titled "Watch did not run: the live suite could not be checked", remembers nothing, and
  exits 1, so the next night tries again. It files no second one while one is open. It does not claim SudokuPad broke. A
  workflow step before the watch that fails (`npm ci`, the Chromium install) files the same issue from the workflow.

It runs nightly on GitHub Actions (`.github/workflows/watch.yml`, 06:17 UTC; `workflow_dispatch` runs it by hand).
The recording, `last-version` and `last-full-run` persist between runs in the Actions cache, saved under a key ending in the run id and
attempt, and restored by prefix, because a cache entry cannot be overwritten. The recording never goes in the repo or an
artifact. A run on an unchanged version, inside its week, makes one request to SudokuPad and runs no suite.

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
  only when `package-lock.json`'s Playwright does. A red nightly run files one `bug` issue, and none while it is open.
- It does not cover the Chrome Web Store install, the browser's own prompts or Tampermonkey's scheduled update check.
