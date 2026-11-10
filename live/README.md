# Live tests

`npm run test:live` runs every `live/**/*.live.mjs` on sudokupad.app in headless Chromium, with the
script under test injected. `AGENTS.md` § End-to-end seam says when to run it; this file is what
you need to write or debug one.
`npm run test:live` and `npm run test:live:files -- <files>` (a run of some files) give every test a time limit (`--test-timeout` in `package.json`):
a test that hangs on a promise that never settles fails there, and the watch reports it as a failed check. The limit is per test, so a hang that holds the
process open (a timer, a hook that never returns) still needs a kill. Run live files through these scripts, never `node --test` directly.
The suite is run locally and never in `npm test` or the CI workflow; only the daily watch runs it on GitHub Actions.

## The merge rerun

The controller's merge check reruns the full suite, unless the worker's "PR up" names a full run at the head being merged and `origin/main` is already in that head.
Then it reruns, with `npm run test:live:files`, the files this change touches against `origin/main`:

- `live/<script name>/` for each script whose `*.user.js` or `live/<script name>/` folder changed;
- every `live/*.live.mjs` at the top of `live/`, since they load every script (`startup`, `settings*`, `attacks-*`, `script-clash-attacks`, `error-log`, `site-slideshow`).

A change to a `live/*.mjs` helper, `package.json`, `site/` or `.github/` reruns the full suite (#717).

## Opening SudokuPad

A suite launches no Chromium of its own: `const browser = useBrowser()` at the top of the file (`live/session.mjs`) launches one
before its tests and closes it after them. Its hooks run with the file's other top-level hooks, not before them, so a suite reads
`browser()` in a `describe`'s hooks or tests, never in a `before` at the top of the file. `openWith(browser(), scripts, { mode })` opens the puzzle in a context of its own and
gets it past Start Puzzle with `scripts` injected at `mode`; a script is a file name from `SCRIPT_FILES` or `{ code }`, text of
the test's own such as a script with a break planted (`scriptSource(file)` reads a script). `addPage` opens another page in the
same context and `reloadWith` reloads one. A script's own fixtures wrap them with what shows the script is up, as Text Anywhere's
and Pen Tool Extras' (`live/pen-tool-extras/pen-tool-extras-fixtures.mjs`, which also turns the pen tool on and opens it) `open` and `reload` do. `live/board.mjs` holds what every suite does to the board: where a cell is, a click and a drag there,
Undo back to the start, Restart, and a Text Anywhere note typed (`typeText`) or placed with the tool picked first (`placeNote`).
The settings dialogs' selectors, buttons and keys are `live/settings.mjs`'s (`STATUS`, `actButton`, `SETTINGS_SCRIPTS`), and each
script's editor is its fixtures'.

## Injection time

`live/session.mjs` injects every script a suite runs on SudokuPad, at one of three times: at `DOMContentLoaded` (`document-idle`),
after load before Start Puzzle (`before-start`), or after Start Puzzle (`after-start`, the default). `openWith`, `addPage` and
`reloadWith` take the time as `mode`. Two exports cover a suite that sets the page up itself:

- `addScripts(p, scripts)` injects into a page already past Start Puzzle, as `after-start` does, for a suite that reads the page
  without the script first: Auto Rules Resizer measures SudokuPad's own rules pane, then adds the script.
- `installAtIdle(p, scripts)` registers the scripts at `document-idle` for every later load of the page, as a userscript manager
  runs them, for a suite that opens puzzles in the tab itself: `installAll` (`live/puzzles.mjs`) for the puzzle attacks and the fuzz run.

A case about the injection time itself runs at all three times:

- `live/startup.live.mjs` checks each script's startup that way: it loads with no page error, its
  control appears, one action works.
- The two "auto mode saved on and no mode saved" groups of `live/color-by-digit/color-by-digit-mode.live.mjs` do too.
- Dark Page's page color dialog group injects at `DOMContentLoaded` only.

Three checks load a script another way, each because no time `live/session.mjs` offers is the one under test:

- Dark Page's `at document-start` group (`live/dark-page/dark-page.live.mjs`) runs it as an init script, before the page's own
  scripts and before Framework exists: the time its `@run-at document-start` asks a manager for, which no other script uses.
- Its `a page with no puzzle` case adds it to a blank page that never loads SudokuPad.
- `npm run test:tampermonkey` (`live/tampermonkey/install.tampermonkey.mjs`) lets a real Tampermonkey inject each script.

## Errors and skip lines

`openWith`, `addPage` and `newPage` (`live/page.mjs`) collect into the returned `errors` every uncaught page error and every skip line a script logs
(`<script>: <feature> skipped because SudokuPad has no <internal>` or `... changed:`), of any console type. A suite seeds
nothing for that: a feature that turns itself off at runtime fails any suite that asserts `errors` is empty.
`captureConsoleErrors` (a `seed`) adds the page's `console.error` lines.

A suite that breaks a feature on purpose declares the skip lines it expects: `openWith(browser, scripts, { expectedSkips: [/^dark-page: /] })`
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
npm run test:fuzz -- [--seed <n>] [--minutes <m>] [--runs <k>] [--path <printed path>] [--shrink-minutes <m>] [--focus <script> ...]
```

- **`--focus <script>`** (#724) raises the weight of the actions that exercise that script, by `FOCUS_FACTOR` (4), so a run spends its time where a change is. It takes a script's name
  without `.user.js` (`pen-tool-extras`); another name stops the run before the browser starts and repeats for several. Every other action keeps its weight, so every action still comes up. Which script an action exercises is
  `KIND_SCRIPTS` of `live/fuzz/actions.mjs`; a new action kind needs an entry, which `actions.test.mjs` checks. The weights change the lists a seed gives, so a failure's printed replay
  command carries the same `--focus`, and a `--path` replays only with it.

- **Each action list names its puzzle** (#679), drawn first from the set in `puzzle-set.mjs`, so one run covers them all and a printed `--path` replays on the
  puzzle that failed. The set is the recorded 9x9 (`live/puzzle-url.txt`) and puzzles built in code with `puzzleData` and opened by
  their id, which cost no request to sudokupad.app: a 6x6 with 2x3 boxes, a 4x4 (no rules text), a 9x9 with killer cages, an arrow and thermometers, a jigsaw 9x9, an empty 9x9,
  a 9x9 with sandwich-style numbers outside the grid, a 12x12 and a 16x16 (digits past 9), a non-square 6x8, a nearly solved 9x9 with its solution (so the solved message can
  show), and the cages puzzle again with the long rules. A puzzle says its free cells, the digit keys its pad takes (1 up to the size, 9 at most, and 0 past 9),
  and its rules text: the long text (twenty paragraphs, which Auto Rules Resizer has to shrink), a short one, or none. A puzzle with clues outside the grid also
  has targets out there, the cells just beyond each edge, where notes and pen lines go; a target SudokuPad's own links cover is clicked at the nearest cell of the
  grid instead. Each page opened is checked against the set's free cells. A rule that cannot hold on some puzzle skips it in its own check, with a comment saying
  why: `rules-fit-pane` has nothing to fit on a puzzle with no rules text. Without `--seed` one is drawn and printed. `--runs` ends the run after that many action lists, whichever of it and `--minutes` comes first.
  A pass prints how many lists each puzzle ran. A path printed before #679 replays a different list now, since the puzzle is drawn first; a regression that must stay
  pinned is written as a scripted list (`scriptedList` of `actions.mjs`, run by `fuzzScripted` of `fuzz.mjs`: `[kind, arg]` steps on a named puzzle, each of which must be
  able to run) in `fuzz.smoke.mjs`, as the #668 test is.
- **The actions** (`actions.mjs`) are weighted so ordinary use is the bulk: ordinary use of every script and of SudokuPad (click, digit, undo,
  redo, undo back to the start, a digit entered, a tool key, Tab, pen lines and erase, the pen page, notes placed and moved, the Color by Digit button, Pen Tool Extras' settings dialog saved or cancelled, alone or with a changed arrow spacing, dash length and thickness (#713); the pen panel's Thickness and Opacity sliders and Text Anywhere's Size and Opacity sliders, dragged along the track or keyed; a line drawn with an arrow pen (page 3); a note with a box; Text Anywhere's Background button; and its settings dialog with a Box color picked, a preset or an Own color, then saved or cancelled); interruptions in the middle of a
  gesture (a pen drag, a held right-click erase or a note drag, each cut by Escape, Delete, a tool key, Ctrl+Z, a window resize, a second button,
  a blur, or the pointer leaving the window); and page events (blur and focus, a reload, a window resize, the Dark Page dialog saved or cancelled
  with a dark color: Dark Page has no off switch). Every action leaves the mouse up, so a shrunk list is plain steps and replays from numbers alone.
- **A crash signal** (`signals.mjs`) after every action, and once more 200 ms after the last (fast-check issue #462, so a late error still fails and
  still shrinks): an uncaught page error, a `console.error`, a skip line, or a row in the notice bar. Each action also waits before it is read, so
  a late error is blamed on the action that caused it: fast-check never removes the last action of a list while shrinking. The wait is 40 ms by default and, under
  `--config varied-wait` (#725), drawn per list from 40, 0 and 300 ms, so a bug that shows only when two inputs come close together or after a pause can appear; the wait is part of the
  list, so a replay and a shrink keep it (a shrink that does not need it ends on 40 ms). A 0 ms list that finds fault reads the page again after 40 ms before it blames the action.
  `--config busy-start` (#726) gives some lists a start of up to 30 steps (digits, marks, colors, pen lines, notes, saved settings), printed `(start) ...` ahead of the actions and dropped by a
  shrink that does not need it; it is built from the same actions, so the rules, undo-to-start included, hold unchanged. `--config` names one of `live/fuzz/configs.mjs`; a path replays
  only under the configuration it was found with, and the replay command names it.
- **The rules** (`rules.mjs`, #594) say what "working" means for each script, as pure functions over a snapshot of the page (`page-state.mjs` reads it) checked after
  every action, and once more after the last. They are: after undoing back to the start (an empty undo stack, which a new action `undo back to the start`
  reaches) SudokuPad's state holds nothing; Pen Tool Extras: every pen entry in the state is drawn and nothing else is; Text Anywhere: the saved notes are the
  drawn ones, and a reload keeps them; Color by Digit: in Cell or Both mode a cell whose digit just changed (every cell when the mode just changed) has its
  group's color; Dark Page: the page color stays dark; Auto Rules Resizer: the rules fit their pane, unless the text is already at 70% of SudokuPad's font; UI
  Tweaks: Tab never turns the number pad to letters; Text Anywhere (`note-box-color`, #713): every note with a box is filled with the box color the script has saved (`boxFill` of the stored value and the note's own color, resolved by the page). Each fuzz page therefore has the letter tool on, and a puzzle with rules text shows it (the long text on most puzzles). A broken rule fails the run like a
  crash signal, named `rule broken after "<step>": <rule>: <what>`. The resizer and Tab rules are read from the scripts, not from the ticket's wording: the resizer
  promises a fit down to its smallest font, not for any length, and Tab can reach letters only while the letter tool is on.
- **Three rules check the scripts against themselves** (#677), knowing nothing of what a script should draw; each was written from what the scripts keep, and
  each leaves out what they do not:
  - `undo-redo-restores`: a redo straight after an undo gives back the whole snapshot from before the undo (the step before is passed to a rule as `earlier`).
    Read only when the undo took steps off the stack and the redo put the same number back. Leaves out an undo on an empty stack, which does nothing and leaves
    the redo stack for the next redo; an undo that also drops SudokuPad's selection entry, which a redo does not bring back; the rules pane (layout); the order
    strokes sit in on the page; and a redo after anything but an undo (`undo back to the start` included).
  - `reload-changes-nothing`: a reload keeps the pen strokes (state and drawn, as a set), the page color, Color by Digit's mode, groups and digits, and, in Digit
    and Off mode, the cells and their colors. Leaves out, in Cell and Both mode, every cell's colors and the serialized cells, which hold them with the pencil marks:
    Color by Digit colors the entered cells every time the page opens, so a coloring undone before the reload returns by design, and the colors and the marks
    sit in one serialized string that the rule does not parse. Also leaves out the notes' position and look (`notes-survive-reload` counts their text), the undo
    stack depth and the letter pad, which a reload does not promise to keep, and the rules pane. It found #681: SudokuPad alone brings a stroke back in color 1
    after a reload within about half a second of the stroke (`docs/research/pen-reload-color.md`), so the rule leaves the pen colors out when a stroke was drawn or erased since the last
    reload (a key press between the two does not matter, #743) and every stroke after it is color 1, and so does `undo-redo-restores` after reload, undo, redo.
  - `undo-to-start` also checks that no pen stroke is drawn and no cell is colored. Text Anywhere's notes ride no undo step, so they stay.
- **A failure** is shrunk (for 10 minutes at most) and printed with the seed, the shortest list that still fails as numbered steps, the one command that
  replays it (`npm run test:fuzz -- --seed <n> --path <path>`, which runs that one list and does not shrink) and the newest records of the shared error log
  (kept in the page's `localStorage` by the scripts' guard), or a line saying the log could not be read. The exit is 1.
- **A page is never reused between lists**: Restart empties the board but leaves the earlier digits behind Undo (`docs/research/ui-fuzz-tools.md`).
- **The tests**: `actions.test.mjs`, `signals.test.mjs`, `rules.test.mjs` (hand-built snapshots) and `engine.test.mjs` are unit tests on a fake page (`fake-target.mjs`) and run in `npm test`: a
  seed gives the same actions, every kind is generated and runs, and a planted page error is caught, shrunk to one step and replayed.
  `puzzle-set.test.mjs` tests the puzzle set, and `actions.test.mjs` and `engine.test.mjs` that every puzzle is generated and a list's puzzle replays from its path.
  `npm run test:fuzz:smoke` (`fuzz.smoke.mjs`, about 3 minutes) is the live test: every puzzle opens once and takes a click, a digit key and an undo, short fixed-seed runs pass, and a page error planted on Escape during a drag (`--plant-escape-error` plants the same one by hand) is caught, shrunk to the one
  interrupted step and replayed from the command it prints; a bug planted in a script (`tab-turns-pad-to-letters`) is injected, caught, shrunk to the Tab and printed with its `--plant`.

Each failure the run finds is fixed in a ticket of its own, whose PR adds the shrunk list as a named fixed live test.

## Measuring the fuzz: planted bugs

`npm run fuzz:plants` (`live/fuzz/plants-run.mjs`, #678, #727) answers "can the fuzz catch a bug at all, and does a change catch more". It injects one planted bug at a time in place of the real script and
fuzzes it on K seeds with a short budget each, and prints per plant the fraction of seeds that caught it and the median time to catch (a miss counts as slower than any catch, so a median that is a
miss prints `> <budget> s`), with a total. It is not in `npm test`; the baseline is in `docs/research/fuzz-planted-bugs.md`.

```
npm run fuzz:plants -- [--seeds <k>] [--budget <seconds per hunt>] [--seed <first seed>] [--seed-list <a,b,c>] [--shrink-minutes <m>] [--plant <id> ...] [--config <name> ...] [--no-replay-check]
```

- **Compare**: `--config` twice or more runs each plant on the same seeds under each configuration (`live/fuzz/configs.mjs`: `current`, `varied-wait`, `busy-start`, `varied-wait+busy-start`) and prints them side by side.
- **Replay check**: each catch is run again from its own path, and the table says how many did not fail again. A failure that depends on timing may not repeat.
- **One line per run** prints as it finishes, so a killed run keeps what it found; run it under `job-run`.
- **The plants** (`plants.mjs`) are 12 one-line bugs, each `{ id, file, kind, bug, find, replace, expect }` (`bug` says it in words): `find` and `replace` are applied to the text of the script read
  from disk and injected by `installAll`, so the root `*.user.js` never hold a bug. A `find` that matches anywhere but once fails the run before any page opens
  (`plants.test.mjs` checks every plant against the shipped scripts in `npm test`). `kind` is `rule` or `crash`; `expect` matches the failure message that counts as a catch (a crash plant names its own error text), so a
  failure the real scripts already have (it prints as "other failure") is not scored.
- **The budget** is 60 seconds a plant on each of 5 seeds, each hunt over the whole puzzle set (#679), plus a short shrink of each catch for the replay check. A hunt ends at its first failure, so the
  12 plants take about 25 minutes per configuration on one core and one Chromium.
- **A miss** is read for its likely reason: no rule sees it, no action reaches it, the board is too empty, or timing. Add a plant by adding an entry to `plants.mjs`.
- **Replaying a catch**: `npm run test:fuzz -- --seed <n> --path <path> --plant <id> [--config <name>]` replays one list with the plant in; the sweep's per-run line gives the seed and the path of each catch.

## The nightly fuzz

`npm run fuzz:nightly` (`live/fuzz/nightly.mjs`, #595) runs `live/fuzz/run.mjs` with a fresh random seed and files what it finds, on GitHub Actions
in its own workflow (`.github/workflows/fuzz.yml`, 07:47 UTC, after the watch; `workflow_dispatch` runs it by hand). It is a workflow of its own, not a job of
`watch.yml`, so 30 minutes of fuzzing never holds up the watch and the two keep separate concurrency groups.

- **One issue per distinct failure.** A failure files one `bug` and `needs-info` issue (a finding can be the fuzz's own rule bug, and is diagnosed before an agent builds it, #805) titled by what failed: `Fuzz: rule broken: <rule names>` for a broken rule, or
  `Fuzz: crash: <first signal>` (numbers folded to `N`) for a crash signal. The body has the seed, the puzzle, the shrunk steps, the replay command, the shared
  error log and the run's link, then a `## Blocked by` section reading `None`, as the watch's issues do. When an open issue already has that title, the run comments on it with the same details and files nothing. Closing the issue
  is what makes the next occurrence file a new one.
- **The hunt goes on after a failure** (#676). `run.mjs` stops at its first failure, so after a failure is filed or commented on, the night starts `run.mjs` again on a
  new seed with the minutes left of the 30, until they are used (less than one minute left is not worth a page start). A failure's title is filed or
  commented on at most once a night, so a failure that keeps coming cannot bury a different one. A night with no failure is one 30-minute run and passes. The 50-minute timeout (`FUZZ_TIMEOUT_MS`)
  bounds the whole night, shrinks included, not each run.
- **A "did not run" issue.** A run that ends with neither verdict (no Chromium, a crash before the first list, the process not starting, a hang killed 50 minutes into the night, a pass that ran no action list) files
  "Fuzz did not run: the nightly fuzz could not be checked", once while it is open, and ends the night. A workflow step before the fuzz that fails (`npm ci`, the Chromium
  install) files the same issue from the workflow.
- **Shared code.** Filing is `fileIssue` of `live/watch.mjs` (its `comment` option makes a duplicate a comment). `live/fuzz/nightly.test.mjs` tests it in
  `npm test` with `gh` faked, the same seam as `live/watch.test.mjs`.
- The exit is 1 on a failure in any run of the night or a run that did not run, so the Actions run is red either way.

## The pull-request fuzz

`.github/workflows/fuzz-pr.yml` (#724) fuzzes a pull request for 5 minutes (`npm run test:fuzz -- --minutes 5 --shrink-minutes 3`), so a bug a change adds fails its check and
not the nightly the morning after. It runs on a `pull_request` whose paths are one of the six `*.user.js` (not `draw-tool.user.js`), `lib/` or `live/fuzz/`.

- **`--focus` is set from the diff**: each script the pull request changes against its base is a `--focus`, read from the diff, so a new script needs no edit there beyond `paths:`. A change to `lib/` or to the fuzz alone has none, so the actions are as
  they are in the nightly.
- **A failure fails the check** and prints the seed, the shrunk steps and the replay command into the job summary (the fuzz's own output, the same as `npm run test:fuzz` prints). It files no issue:
  the pull request is where it is seen. Replay it on your machine with the command in the summary, which carries the `--focus`.
- **It runs neither the Tampermonkey test nor the live suite.** A push to the pull request cancels the run on the old head.
- **A failure may not be the pull request's.** The fuzz is random, and a bug already on `main` can fail the check; check whether the nightly has filed the same failure, or replay it on `main` (the replay command with `git checkout main` first).

## The daily watch

`npm run watch:live` (`live/watch.mjs`) is for a daily schedule, so a SudokuPad update that breaks a script shows
up as a bug and not when someone installs it. Its header comment is the full rule: a new version runs the suite
with `LIVE_REFRESH=1`, red files one `bug` and `needs-info` issue, and a version already checked is a no-op until a week has passed. The last version
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
- In a Tampermonkey of its own, it follows Text Anywhere's move (#711): the last copy main served from `draw-tool.user.js`,
  fetched at its commit, installs; two clicks on the dashboard's "Check for updates" take it to the handover and then to
  the checkout's `text-anywhere.user.js`. Each copy is served from `127.0.0.1` with its raw GitHub addresses pointed
  there, so the updates fetch the checkout's files; `test/text-anywhere.test.js` holds the handover's real addresses.
- It does not cover the Chrome Web Store install, the browser's own prompts or Tampermonkey's scheduled update check.
