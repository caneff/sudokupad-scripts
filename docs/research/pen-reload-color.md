# A quick reload brings pen strokes back in color 1 (#681)

**Finding: SudokuPad does it alone. No script changes the color.**

The fuzz rule `reload-changes-nothing` (#677) failed when the page was reloaded within about half a second of a pen
stroke: every stroke came back as `pencolor-1` (before: `pen-2 pencolor-4`, `pen-e pencolor-7`; after: the same
shapes, all `pencolor-1`). A 600 ms wait before the reload keeps the color (ticket comment, #679).

## Evidence (2026-11-09)

Replay: `npm run test:fuzz -- --seed 4 --path 40@:` (the "outside clues 9x9" puzzle: click r5c3, a pen drag in color 7,
a pen drag in color 4 with a right button down and up, reload). With a temporary env filter in `installAll`
(not committed), up to four runs each:

| Scripts installed | Result |
| --- | --- |
| all six | failed 3 of 4 runs, in 2 s |
| all but Pen Tool Extras | failed 3 of 3, the same colors |
| all but Color by Digit, Dark Page, Text Anywhere, Auto Rules Resizer or UI Tweaks (one at a time) | failed 3 of 3 each |

Not done: a replay with every script off. The fuzz's page setup waits for the scripts' controls, so the replay cannot start without them. A
scripts-off probe (a stroke in color 7 and one in color 4, then an immediate reload, on the same puzzle) kept the colors, so it did not
reach the timing; the leave-one-out runs above are the evidence. They show no single script is needed; the argument that Pen Tool
Extras is the only script touching strokes is an inference. Only the outside-clues puzzle is recorded here (the ticket's comments say the
6x6 shows it too).

Pen Tool Extras is the only script that touches pen strokes, and the failure is the same without it. It is
SudokuPad's own save and restore.

Before the reload SudokuPad has written no `progress_*` entry yet (a probe read `localStorage` right after the
strokes: only settings), so the save lands on unload or late. A slower reload, or a probe with
a pause before the reload, keeps the colors. Not found: which SudokuPad code writes the colors as 1.

The ticket's comments also show it through `undo-redo-restores` (seed 3, 6x6): a stroke in color 7, a reload (color 1), an undo, a redo
(color 7 again). So the saved state keeps color 7 and the color 1 comes from the restore. SudokuPad's serialized cells hold the pen color
too (a probe read `/////27` for pen `2`, color `7`, in r1c2), so the cells compare in Digit and Off mode shows the same change.

## What changed

`reload-changes-nothing` leaves the pen colors out (in `penState`, `penDrawn` and the pen part of the serialized cells) when the
reload follows a pen action and every stroke after it is color 1. `undo-redo-restores` does the same after reload, undo, redo when the
reload left every stroke in color 1. Shapes, marks and every other color still fail.
