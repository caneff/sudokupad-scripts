# Text Anywhere on Penpa+: a userscript, or built into the penpa-edit fork

Question (#1057, Chris 2026-11-19): can Text Anywhere come to Penpa+, as a userscript like the SudokuPad one or as support built
into his penpa-edit fork? Read 2026-11-23.

## Verdict

**Build it into the fork, as a Note tool of the ChinStrap solve page. Do not write a userscript.** A first version is about
1,200 to 1,600 lines of new code and tests in the fork, split over four or five tickets (§ 5). The note layer itself carries over
well, since it is an HTML layer over the drawing surface and Penpa+ draws on one canvas. What does not carry over is the
SudokuPad tool, keypad and dialog it hangs on; the fork's solve page has its own place for each.

Why the fork and not a script, in one line each:

- No tool registry for a script to join was found in Penpa+'s source, and the fork's solve page is rebuilt as its own UI (ADR 0001), so a script
  would bolt a second UI onto the first.
- A script reads `window.engine`, which the fork's own notes say is the MVP bridge and is "reworked into the engine API" at the
  split (`adr/0001-split-engine-from-ui.md` § Sequencing), and `pu`, whose home `class_p.js` is cut in two. Each step of the split
  can break an installed script, and no test of the fork would say so.
- The fork already owns what a note layer must follow: board zoom, scroll in the card, Change size, the per-puzzle key. A
  built-in note layer calls the same engine API as the board coordinates do.

## Sources

- Penpa+ fork, `caneff/penpa-edit` at `91c567dc` (2026-11-23, `~/src/penpa-edit`, upstream `34e3fe97`): `AGENTS.md`,
  `adr/0001-split-engine-from-ui.md`, `research/bridge-inventory.md`, `research/penpa-modes-and-script-ideas.md`,
  `research/penpa-solve-mode-text.md`, `docs/js/engine_bridge.js`, `docs/js/progress.js`, `docs/js/progress_autosave.js`,
  `docs/js/penpa_layer.js`, `docs/ui/desk.js`, `userscript/penpa-redirect.user.js`.
- This repo at `c5db8fd`: `text-anywhere.user.js` 0.46.60, `lib/*.js`, `docs/text-anywhere.md`, `AGENTS.md`.
- One run (below, marked RUN): headless Chromium on the live fork page `solve.html` with the first gallery puzzle. Everything
  else is READ from source. Nothing was tried with a real overlay or a real note on Penpa+'s page.
- The fork's tracker, searched for note, text, annotation and userscript (100 issues): no open or closed ticket asks for
  free-text notes.

## 1. Does Penpa+ give a note layer what it needs?

Text Anywhere needs five things from its host. Each is answered for Penpa+ as the fork serves it.

| Need | Penpa+ and the fork | Verdict |
|---|---|---|
| The board's drawing surface, and a map from a cell to a screen point | One `<canvas id="canvas">`, drawn by `pu.redraw()`; no SVG. RUN: the canvas is 680 CSS px wide with a 1700 px bitmap (`pu.resol` 2.5), `pu.size` 68, and `pu.point[id].x/.y` are CSS px from the canvas's top left (the first cell reads 68.5, 68.5). The bridge already maps a cell to the page that way: `origin.left + pu.point[id].x` (`getGridAxes`, `engine_bridge.js:1413`), and the board coordinates layer sits over the canvas in the Board card (`docs/ui/desk.js:1206`). | Yes. An HTML layer over the canvas works; it is the pattern the fork already uses. |
| Add a note and redraw | Nothing to call: a note is HTML of ours, not canvas content, so Penpa+ never draws it. Penpa+ has no change event, but `engine.on('change', ...)` (one call a frame, `engine_bridge.js:1025`) fires after a redraw, a zoom or a Change size, and `engine.ignoreChangesIn(node)` keeps our own writes from waking it. | Yes. |
| Undo and redo | Penpa+ keeps two `Stack`s (`pu.pu_a.command_undo`, `command_redo`) and feeds the replay log and the saved link from them. **Not needed:** Text Anywhere's notes stay off Undo and Redo by ruling (`AGENTS.md`, Chris 2026-11-10), so the question has no Penpa+ half. Restart (`reset_board`) is the one hook worth a probe, since Text Anywhere clears notes on SudokuPad's Restart and brings them back on the Undo after it (`undoRestart`). | Not required. |
| Per-puzzle saved state | Penpa+ saves progress with `localforage` under `penpa_<md5 of pu.url>` and the saved text is the duplicate link (`progress.js` `save`). RUN: `PenpaProgress.getHash(pu.url)` gave `penpa_4caffaf1...`. Notes must not go in that text or any link: "fork-only state never goes in a link" (ADR 0001 § The split, charted), and links are upstream's format in both directions. The fork already has the key notes need: `engine.getOriginalPuzzleId()`, "the id the puzzle had before any Change size: this browser keys everything it keeps per puzzle on it" (`engine_bridge.js:1552`). | Yes, in a store of its own beside Penpa+'s save, keyed by that id. Cost: Penpa+'s own "clear this puzzle's saved progress" would not clear the notes unless the fork wires it. |
| A way to take board presses and keys before Penpa+ | Penpa+'s handlers sit on `document` and the canvas; the bridge's own Tab, Escape and key shield use one capture-phase `window` listener (`bridge-inventory.md` Note 3), the technique Text Anywhere already uses (`window.addEventListener(..., { capture: true })`, `text-anywhere.user.js:4506-4545`). Penpa+'s key handler skips only `input` text/number fields and seven listed ids, so a typed `contenteditable` or `textarea` key reaches the board unless a shield stops it (`bridge-inventory.md`, "Keep keys from the board while a UI dialog is open"). | Yes, with the key shield. Text Anywhere's `keepBoxKeys` is the same job. |

What this means for a note placed "on the board": Text Anywhere pins an on-board note in board units under SudokuPad's SVG
transform (`boardMap`, `getScreenCTM`). Penpa+ has no transform to ask; the note must store a point in cell units (px divided by
`pu.size`, from the grid's first cell) and map it back through the canvas's box. **Not determined:** how that holds under
`rotate_grid` and the reflect flips (`pu.theta`, `pu.reflect`), under Change size (which moves point ids;
`engine.getSizeChanges` reports it) and on the non-square grids (hex, triangle, pyramid), where `pu.size` is a cell's width "on some grid types
only" (`getGridArea` comment). A first version should pin on square grids and fix everywhere else, and a probe ticket should
settle the rest before notes pin on any other grid.

A note beside the board (Text Anywhere's "fixed" notes, in screen px) needs the card layout, not the canvas: in the fork's desk
the board is a movable card inside a scrolling box, so "beside the board" means inside the Board card or on the desk, and the
note must scroll with whichever it is in. This is a design decision for the ticket, not a blocker.

### What Penpa+ already has, so the note tool is not a duplicate

Number mode's Long sub-mode (`sub_number8`) holds up to 1000 characters in a cell and is available in solve mode
(`research/penpa-solve-mode-text.md` in the fork). It is one entry per cell, takes the place of the cell's digit, has one size, no
free position and no formatting, and is part of the solve state and its undo. It is a different feature, not a substitute.

## 2. What of `text-anywhere.user.js` carries over

The script is 4,555 lines: 1,503 inside the marked `lib/` blocks and 3,040 its own. Only 36 of its own lines name the host
(`Framework`, `app`, the SVG, the keypad) beyond the `lib/sudokupad.js` block.

**Carries over as it is** (pure functions, no host name; the module's own tests move with it):

- The note model and its text: the markdown parser and the line kinds (bullets, checklists, headers, code), the `->` to `→`
  symbols, the note's box, size and hit-test geometry, the move, resize and erase arithmetic (script lines about 274-760; 1,000 to 1,400 lines of
  its own code in all, a rough count of the function list, not measured).
- `lib/store.js` (65 lines, the versioned envelope and unreadable-slot rules), `lib/settings-table.js`, `lib/color-math.js`,
  `lib/color-picker.js`, `lib/color-set.js`, `lib/plain.js`, `lib/slider-keys.js`, `lib/write-style.js`, `lib/pointer-session.js`,
  `lib/wrap-index.js`. These are generic by their contents.
- The look: halo, box colors, opacity, the nine note colors as a setting.

**Tied to SudokuPad and rebuilt:**

| Tied to | Where | In Penpa+ |
|---|---|---|
| `Framework.addTool` and `Framework.app.tool`, the keypad `.controls-input` panel (`PANEL`, `showPanel`) | the Text tool and its color, size and opacity controls | A Note tool in the fork's Mode card and Pinned chips, with its controls in a card. The fork's UI already makes tools, pins and cards; this is the largest rebuild. |
| `Framework.app.tools.colour.palette` (`lib/palette.js`, 125 lines) | the nine colors follow SudokuPad's color tool | Penpa+ has no such palette; the nine colors come from the fork's own theme or a fixed table. |
| `Framework.getData/setData/removeData`, `Framework.app.puzzle.puzzleId` | per-puzzle saves | A store keyed by `engine.getOriginalPuzzleId()` over `localStorage`; `lib/store.js` does not change. |
| `Framework.addSetting`, `showDialog`, `closeDialog` (`lib/settings-dialog.js`, 329 lines) | the settings dialog | The fork's Settings card or dialog; its own `confirmDialog` and settings code replace the module. |
| `lib/sudokupad.js` (396 lines): the guard, the probe of SudokuPad internals, the notice bar, the error log | "this script can break at any time" | Not needed in the fork, which tests its own UI; the guard's idea (name the internals a feature needs, turn the feature off with a notice if they are gone) is what a *userscript* would keep. |
| `svgRenderer.getElem()`, `getScreenCTM`, `app.puzzle.on('loaded')`, `app.on('restarted')`, `app.puzzle.rows/cols` | `boardMap`, `gridSize`, load and restart | `engine.on('change')`, `getGridAxes`, `getGridArea`, `getSizeChanges`; Restart through the engine's `restart`. |
| `ABOVE_NOTES`, `CONTROLS`, `overControl` (SudokuPad's `.topbar`, `#appmenu`, `#controls`) | which presses a note ignores | The fork's own classes (`ui-root`, cards). |
| 50 live test files (`live/text-anywhere/`) | behavior against sudokupad.app | Rewritten against the fork's pages; the fork's live harness is Playwright over `file://` like this repo's. |

The carry-over is by copy: this repo's `sync-lib.js` copies `lib/` into SudokuPad userscripts, and the fork has no such step and
no dependency on this repo. After a copy the two drift; Text Anywhere on SudokuPad is still changing (0.46.60). If drift costs
more than the copy saves, the later option is a shared package, not now.

## 3. Userscript against a change in the fork

**A userscript** (Tampermonkey, `@match https://chinstrap45.github.io/penpa-edit/*`):

- *Cost:* the carried-over modules go in by this repo's `sync-lib.js` unchanged, so the first version is the cheapest to ship, about
  the same lines as in the fork but with no card, tool or Settings work, only a button of its own. About 800 to 1,200 lines.
- *Who maintains it:* this repo, at SudokuPad's release pace.
- *Penpa+ updates:* the weak point. RUN: `pu` is a `window` property, but `Puzzle` and `UserSettings` are not (a class and a
  `const`), so a page-context script reaches them by bare name only, and `window.engine` is the MVP bridge, which
  only `solve.html` loads (READ; not run on `index.html`). The fork's AGENTS says the nightly upstream merge reports each upstream commit that touches an
  owned file, and the split moves `class_p.js` into engine and UI files "step by step". No fork test names a script, and the
  existing redirect script reads only the URL. A script that reads `engine` or `pu` breaks on a fork release and is found by a
  solver, or by a nightly run of ours that loads the live page (as `watch.yml` does for SudokuPad).
- *Reach:* a script also runs on the fork's old `index.html` and on upstream's Penpa+ (`swaroopg92.github.io`), but the Redirect
  script already sends every upstream link to the fork, so that reach is mostly unused. A solver who has not installed Text
  Anywhere sees no notes; one who has gets the same page as before.
- *Collision:* a second script's UI would sit over the fork's desk layout and its key routing (the fork's capture-phase front
  door, `bridge-inventory.md` Note 3), so the script would have to learn those rules, and the fork would have to keep them.

**Built into the fork:**

- *Cost:* more up front (the tool, a card, settings, tests in the fork's seam) and a copy of the pure modules; no install step
  for solvers; shown in the fork's tour and Mode card like any tool.
- *Who maintains it:* the fork, with its CI: lint, the UI-boundary test (`test/ui-boundary.test.mjs`: no file under `docs/ui/`
  names Penpa's internals, so notes would use only the bridge and later the engine API), the safety net and the nightly UI fuzz.
- *Penpa+ updates:* a bridge rename fails the fork's own tests in the PR that makes it, and the split moves the notes' calls with
  the bridge, which is how every other UI feature moves.
- *The ruled constraint it must keep:* the fork's phone and tablet rule (nothing is checked at a phone size) and this repo's
  (`AGENTS.md`): both say the same, so neither blocks a note tool. No feature relies on a right-button drag (this repo's ruling,
  Chris 2026-11-07); Text Anywhere's erase is a right click, which is fine.

## 4. Recommendation

**Take the fork.** The userscript is cheaper by a few hundred lines and loses it back on the first fork release that renames a
bridge call or moves a global. The fork owns the layout, zoom, per-puzzle key and key routing that a note layer lives in, and
notes are exactly a feature of "the solve page"; the split's own plan says the UI is rebuilt against the engine API, and a
userscript sits outside that plan. The userscript's one real advantage, reaching upstream Penpa+, is already given up by the
Redirect script.

Not taken: a shared package for the pure modules (see § 2), and any change to upstream's files (the fork's rule: nothing goes
back upstream, and notes need no edit to an upstream file, only new files under `docs/ui/` and a call or two in `solve.html`).

## 5. A rough size for the first version

Counts are estimates from the size of the SudokuPad script's own parts, not measured on Penpa+.

First version, on square grids only:

1. **Probe** (small): a headless run that places an overlay on `solve.html`, reads the cell-unit mapping under zoom, scroll,
   Change size, `rotate_grid` and reflect, and saves and reloads a note under `getOriginalPuzzleId()`. Settles what § 1 marks
   "not determined".
2. **The layer and store** (about 350 lines): the note layer over the canvas, follow `engine.on('change')`, the store, pin and
   fix, hide all, clear.
3. **Note editing** (about 400 lines): the Note tool, typing in place, the markdown subset (bold, italic, bullets, checklists),
   move, resize, erase, the key shield.
4. **Look and controls** (about 250 lines): nine colors, size, opacity, a card for them, Settings entries.
5. **Tests and pictures** (about 300 lines): unit tests of the copied modules, live tests on the fork, a tour stop, a screenshot.

Total about 1,300 lines (range 1,200 to 1,600), four or five tickets, in the fork's tracker. Left out of the first version: the
full settings dialog (outline, frame, font, box colors), headers and code blocks, nudge and snap, and every non-square grid.
Text Anywhere's own history says what the rest costs: its 0.46.60 is the result of about fifty live-test files of polish.

## Decisions for Chris

None this note cannot make by its recommendation. If he takes it, the next step is `/grill-me` in `caneff/penpa-edit` on three
open points: where a note beside the board lives in the desk (card or desk), whether a note carries into Penpa+'s Replay or
Share, and whether the notes' colors are the surface colors or their own nine.
