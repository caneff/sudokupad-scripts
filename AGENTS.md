# sudokupad-scripts

Standalone Tampermonkey userscripts for SudokuPad, written to be shared, and one for the Logic Masters puzzle portal. Each
script is one `*.user.js` file with no build step for users. Shared code lives in `lib/<name>.js` and `node sync-lib.js` copies it into each
script between `// <lib:name>` and `// </lib:name>` markers, so an installed script is still one file.

- **Site and hosting**: before you change `site/`, a picture, a slideshow or the hosting: read `docs/agents/site.md`. `site/` is the static homepage and one details page per script that has one.
- **`docs/research/`**: research notes, chiefly what was read from SudokuPad's source, and also screenshots, the scripts that take them and frozen scratch.
  Each script's notes and pictures are in its own folder (`docs/research/<script name>/`), pictures of a whole site page in `docs/research/site/`,
  notes about the repo's own tooling (fuzz, Tampermonkey, shared code, hosting) in `docs/research/tooling/`, and notes about SudokuPad itself at the top.
  `docs/research/README.md` indexes every note, and `test/doc-paths.test.js` fails when a path named there or in this file is missing.
- **Tests**: unit tests are in `test/` (`test/<script name>.test.js`), each shared module's in `lib/<name>.test.js`, and live tests in
  `live/<script name>/`. Every `*.user.js` stays at the root: every installed copy checks that address for updates. Never edit `draw-tool.user.js`:
  it is Text Anywhere's handover, frozen at 0.45.1 (`GLOSSARY.md`), and a change to Text Anywhere never touches it; `test/text-anywhere.test.js` fails when its bytes change (Chris, 2026-11-10).
- **Module formats**: CommonJS at the root, in `lib/` and in `test/` (`require`, `.js`); ES modules in `live/` (`import`, `.mjs`), and a `test/` file that reads `live/` as one (`.mjs`).
- **The fuzz**: before you run or change the fuzz, read `live/README.md` § The fuzz run.
- **The PR fuzz** (`.github/workflows/fuzz-pr.yml`) is advisory, not a required check: read a red one, do not wait on it to merge; it comments the seed on the PR (`live/README.md` § The pull-request fuzz).
- **The daily watch**: `.github/workflows/watch.yml` runs `npm run watch:live`, the full live suite, every night at 06:17 UTC on GitHub Actions (and by hand through
  `workflow_dispatch`); `live/README.md` § The daily watch has the rule.
- **Logic Masters Puzzle Preview** (`logic-masters-puzzle-preview.user.js`): runs on logic-masters.de, not SudokuPad. Its first version is Juggler's, published here with their permission
  (Chris, 2026-11-21). `OTHER_SITE_SCRIPTS` in `sync-lib.js` keeps it out of every loop over SudokuPad's scripts (`scriptFiles()`), while the version checks still
  cover it (`publishedScriptFiles()`). It is off the homepage for now (Chris, 2026-11-21); the README still lists it. No test, check or screenshot requests logic-masters.de, which answered a few requests with a 503: `live/logic-masters-puzzle-preview/` serves synthetic pages.
  Debugging a bug by hand may query it, a few requests at a time and never in bulk (Chris, 2026-11-21): it answers 503 after a few dozen requests in a minute or two.
- **`GLOSSARY.md`**: the vocabulary.
- **A change to what a script shows** (its panel, buttons, dialog or what it draws) updates that script's text in `site/`, in Pen Tool Extras' reference page (`docs/pen-tool-extras.md`) and in the README's script notes, and retakes its pictures, in the same PR (Chris, 2026-11-06). The picture and slideshow commands are in `docs/agents/site.md`.
- **Shared code**: never edit inside a marked block; `lib/*.test.js` tests each module. After editing `lib/<name>.js`, run `node sync-lib.js`, as `node tag-pictures.js` is run after a picture: it rewrites each
  marked block in the `*.user.js` and raises the version of every script it changed. `test/sync-lib.test.js` fails until you do.
- **No feature relies on a right-button drag** (Chris, 2026-11-07): SudokuPad's Test Large Puzzle UI setting pans the board on it and no
  script sees the moves (`docs/research/large-puzzle-ui-right-drag.md`). A right click is fine; a right-drag may only be an extra on top of
  one, and the site teaches the right click.
- **Phones and tablets are not supported**, in any script, and never will be (Chris, 2026-11-07): `.out-of-scope/phones-and-tablets.md`.
- **Text Anywhere's notes stay off Undo and Redo** (Chris, 2026-11-10): putting them on SudokuPad's undo stack would put them in the
  replay, and a history interleaved with SudokuPad's must catch every Undo first, which risks digit Undo for a small gain. No ticket proposes either.
- **SudokuPad's own dark mode** is not supported, in any script (Chris, 2026-11-06): `.out-of-scope/sudokupad-dark-mode.md`. A dark page means Dark Page.
- **Keys**: before you propose, add or change a keyboard shortcut: read `docs/agents/keys.md`. A key SudokuPad's own pen tool acts on is never a script's shortcut.
- **Pen values are not scarce** (#721): Pen Tool Extras is not running out. Before you say it is, read `docs/research/sudokupad-pen-edge-marks.md`
  § Pen values past `z` (which characters work as a pen value).

## Agent skills

- Before you dispatch workers or after a drain run: read `docs/agents/dispatch.md` (the dispatch cap and the consistency survey).

### Issue tracker

GitHub issues at `caneff/sudokupad-scripts`, through `gh`. See `docs/agents/issue-tracker.md`.

### Triage labels

The six default roles, each label string equal to its role: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `backlog`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: a root `GLOSSARY.md` and `docs/adr/`. See `docs/agents/domain.md`.

## Coding standards

Before you write or review code: read `CODING_STANDARDS.md`.

## End-to-end seam

- **Seam**: `npm test` (`node --test`), against each script's pure functions (`test/`), each shared module's (`lib/*.test.js`), the live harness's helper tests
  (`live/**/*.test.mjs`) and every page in `site/` (`test/site.test.js`: every script has an install link on the homepage)
- **Blind to**: real SudokuPad: the `Framework` calls, rendering, undo. `npm run test:live` (every `live/**/*.live.mjs`)
  covers them on sudokupad.app in headless Chromium, with the script injected after Start Puzzle by default.
- Before you write or debug a live test: read `live/README.md`.
- **Concurrency**: `npm test` and `npm run test:live:files` (so `npm run test:live` too) run at most 4 test files at once (`node-test.js`, #1090), not one per core.
  `TESTS_JOBS=<k>` sets the width instead; a worker sets it only after recording the parallel job (`implement/SKILL.md` § Control). A value that is not a whole number of 1 or more stops the run with exit 2.
- Before you run `npm run test:live` or `npm run test:tampermonkey`: read `live/README.md` (§ The Tampermonkey test for the second); neither is in `npm test` or `land.testcmd`.
- **The full live suite is no gate** (Chris, 2026-11-18, #1026): the nightly watch runs all of it on GitHub and files a bug when it is red. Extra run: every change also runs `npm run test:live:changed`, the live files its diff touches
  (a path it cannot place widens it, and its last line says so; nothing touched runs nothing): before "PR up" and again at the merge. The merge skip rule never skips it. `live/README.md` § The live gate has what it selects.
- Extra run: a change to `live/fuzz/` or to any other path `.github/workflows/fuzz-pr.yml` lists under `live/` or as a single file (the modules the fuzz loads) also runs
  `npm run test:fuzz:smoke`, before "PR up" and again at the merge: no live file loads the fuzz, so `npm run test:live:changed` never covers it.
- When your change alters behavior on purpose, first change the live tests that check the old behavior, then run them: a
  wrong expectation waits out its time limit.
- Extra run: a change to any line of a `// ==UserScript==` header also runs `npm run test:tampermonkey`; the controller's merge check runs it then too.
- A PR names as owed only what `live/README.md` § The Tampermonkey test says the test does not cover. `crackingthecryptic.com` only redirects to
  SudokuPad now, so no PR, ticket or report names it as owed (Chris, 2026-11-07).

`npm run lint` (StandardJS, excluding `docs/research/`) runs after the tests in `land.testcmd` and in CI: run it before you hand off a change.
