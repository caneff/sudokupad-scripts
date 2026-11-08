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

## The predefined attacks

`live/sudokupad-attacks.live.mjs` (attacks 49-56, things a player does to SudokuPad) and `live/script-clash-attacks.live.mjs`
(attacks 57-61, scripts set against each other) are the fixed "try to break it" tests of #590: all six scripts on one page
(`live/attacks.mjs`), each test named for its attack number, checking the crash signals (a skip line, a page error, a console
error, the notice bar) and what a player expects to see. The ones for one script's own gestures are in `live/<script name>/`.

- A test that finds a bug on main is marked `{ todo: '#<bug>' }` with a filed `bug` ticket, so the suite stays green; the fix
  PR removes the mark.
- Headless Chromium has no zoom keys, so attack 54 sets the page's CSS size and pixel ratio, which is what zoom changes.
- Attack 56 makes every key the six scripts save under throw and leaves SudokuPad's own keys alone: SudokuPad's own saves throw
  uncaught errors on a page whose whole localStorage is blocked, with no script loaded.

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

## Puzzles other than the recorded one

`live/puzzles.mjs` builds a puzzle as data (`puzzleData`: any grid size, boxes, givens, `overlays`, `foglight`, `metadata.bgimage`), turns it into
an id with the page's own compression (`puzzleIdFor`) and opens it by that id in the same tab (`openPuzzleId`); the page document is
served from the recording whatever the path, so no new recording is needed. Give every built puzzle its own `id`: an inline `scl` puzzle has none
and SudokuPad then saves its progress under `progress_undefined`, shared by every such puzzle. `installAll` runs all six scripts at
`DOMContentLoaded` of every load, as a userscript manager does, and answers the requests the recording lacks for the solved dialog (two icons) and for Tag
Manager with empty files. A history move (Back, Forward) or a second puzzle leaves the pen and replay tools off again, which `startWithTools` and
`resumeAfterHistory` turn on.

## The fuzz run

`npm run test:fuzz` (#593, from #590) tries to break the six scripts with random sequences of what a user does, on real SudokuPad
(`live/fuzz/`): fast-check generates a list of actions, each list runs on a page of its own with every script installed the way a userscript
manager does, and the run fails on a crash signal. It runs for 2 minutes. It is not in `npm test`, `npm run test:live` or `land.testcmd`.

```
npm run test:fuzz -- [--seed <n>] [--minutes <m>] [--runs <k>] [--path <printed path>] [--shrink-minutes <m>]
```

- **The seed picks the puzzle**: an even seed the recorded 9x9 (`live/puzzle-url.txt`), an odd one a 6x6 with 2x3 boxes (`PUZZLES` in `fuzz.mjs`).
  Without `--seed` one is drawn and printed. `--runs` ends the run after that many action lists, whichever of it and `--minutes` comes first.
- **The actions** (`actions.mjs`) are weighted so ordinary use is the bulk: ordinary use of every script and of SudokuPad (click, digit, undo,
  redo, a tool key, Tab, pen lines and erase, the pen page, notes placed and moved, the Color by Digit button); interruptions in the middle of a
  gesture (a pen drag, a held right-click erase or a note drag, each cut by Escape, Delete, a tool key, Ctrl+Z, a window resize, a second button,
  a blur, or the pointer leaving the window); and page events (blur and focus, a reload, a window resize, the Dark Page dialog saved or cancelled
  with a dark color: Dark Page has no off switch). Every action leaves the mouse up, so a shrunk list is plain steps and replays from numbers alone.
- **A crash signal** (`signals.mjs`) after every action, and once more 200 ms after the last (fast-check issue #462, so a late error still fails and
  still shrinks): an uncaught page error, a `console.error`, a skip line, or a row in the notice bar. Each action also waits 40 ms before it is read, so
  a late error is blamed on the action that caused it: fast-check never removes the last action of a list while shrinking.
- **A failure** is shrunk (for 10 minutes at most) and printed with the seed, the shortest list that still fails as numbered steps, the one command that
  replays it (`npm run test:fuzz -- --seed <n> --path <path>`, which runs that one list and does not shrink) and the newest records of the shared error log
  (kept in the page's `localStorage` by the scripts' guard) when the page has any. The exit is 1.
- **A page is never reused between lists**: Restart empties the board but leaves the earlier digits behind Undo (`docs/research/ui-fuzz-tools.md`).
- **The tests**: `actions.test.mjs`, `signals.test.mjs` and `engine.test.mjs` are unit tests on a fake page (`fake-target.mjs`) and run in `npm test`: a
  seed gives the same actions, every kind is generated and runs, and a planted page error is caught, shrunk to one step and replayed.
  `npm run test:fuzz:smoke` (`fuzz.smoke.mjs`, about 6 minutes, nearly all of it shrinking) is the live test: short fixed-seed runs pass on both
  puzzles, and a page error planted on Escape during a drag (`--plant-escape-error` plants the same one by hand) is caught, shrunk to the one
  interrupted step and replayed from the command it prints.

Each failure the run finds is fixed in a ticket of its own, whose PR adds the shrunk list as a named fixed live test.

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
