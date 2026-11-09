# A quick reload brings pen strokes back in color 1 (#681)

**Finding: SudokuPad does it alone. No script changes the color.**

The fuzz rule `reload-changes-nothing` (#677) failed when the page was reloaded within about half a second of a pen
stroke: every stroke came back as `pencolor-1` (before: `pen-2 pencolor-4`, `pen-e pencolor-7`; after: the same
shapes, all `pencolor-1`). A 600 ms wait before the reload keeps the color (ticket comment, #679).

## Evidence (2026-11-09)

Replay: `npm run test:fuzz -- --seed 4 --path 40@:` (the "outside clues 9x9" puzzle: click r5c3, a pen drag in color 7,
a pen drag in color 4 with a right button down and up, reload). With a temporary env filter in `installAll`
(not committed), three runs each:

| Scripts installed | Result |
| --- | --- |
| all six | failed 3 of 4 runs, in 2 s |
| all but Pen Tool Extras | failed 3 of 3, the same colors |
| all but Color by Digit, Dark Page, Draw Tool, Auto Rules Resizer or UI Tweaks (one at a time) | failed 3 of 3 each |

Pen Tool Extras is the only script that touches pen strokes, and the failure is the same without it. It is
SudokuPad's own save and restore.

Before the reload SudokuPad has written no `progress_*` entry yet (a probe read `localStorage` right after the
strokes: only settings), so the save lands on unload or late. A slower reload, or a probe with
a pause before the reload, keeps the colors. Not found: which SudokuPad code writes the colors as 1.

## What changed

`reload-changes-nothing` skips the pen colors when every stroke after the reload is color 1; shapes and everything
else are still compared. A color other than 1 after a reload still fails it.
