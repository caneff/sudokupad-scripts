# What the fuzz catches: planted bugs (#678)

`npm run fuzz:plants` (`live/fuzz/plants-run.mjs`) injects one planted bug at a time, in place of the real script, and fuzzes it for 4 minutes (2 per puzzle,
recorded 9x9 first, then the 6x6 if it was not caught) with shrinks of up to 2 minutes. The 10 plants are in `live/fuzz/plants.mjs`; the shipped `*.user.js` never hold one.

First run, 2026-11-09, seed 678, rules as of #677:

| plant | script | kind | result | hunt time | shrunk to |
| --- | --- | --- | --- | --- | --- |
| `tab-turns-pad-to-letters` | UI Tweaks | rule | caught, 9x9 | 6 s | press Tab |
| `tab-handler-typo` | UI Tweaks | crash | caught, 9x9 | 6 s | press Tab |
| `digit-five-wrong-group` | Color by Digit | rule | caught, 9x9 | 4 s | enter 1; type 5 |
| `mode-not-saved` | Color by Digit | rule | caught, 9x9 | 12 s | press the Color by Digit button; reload |
| `note-dropped-on-load` | Text Anywhere | rule | caught, 9x9 | 3 s | note drag, Ctrl+Z, release; reload |
| `load-logs-console-error` | Text Anywhere | crash | caught, 9x9 | 1 s | (the last-action read: the load itself logs) |
| `dark-page-saves-light` | Dark Page | rule | caught, 9x9 | 91 s | Dark Page dialog: Save a dark color |
| `rules-always-fit` | Auto Rules Resizer | rule | caught, 9x9 | 5 s | (the last-action read of the rules pane) |
| `page-three-line-not-drawn` | Pen Tool Extras | rule | caught, 9x9 | 49 s | erase held; Tab; turn the pen page; pen drag with a page 3 pen |
| `redraw-typo` | Pen Tool Extras | crash | **missed**, 90 lists in 240 s on both puzzles | | |

9 of 10 caught. Every catch was on the 9x9, so the 6x6 was not exercised by this run; the plants do not depend on the puzzle, and a plant that only the 6x6 shows would
be a finding of its own.

## The miss: `redraw-typo`

The plant misspells `cell.renderContent` in `redrawCells` (`pen-tool-extras.user.js`). `redrawCells` runs at install, when the board holds no pen stroke, and from
`redrawArrowLines` when the pen thickness or the arrow spacing changes (`adoptThickness`, `adoptArrowSpacing`). Likely reason: **no action reaches it**. The fuzz never moves
those two sliders, and the settings dialog Save changes no value. A "board is too empty" reason is secondary: even at install the plant needs a stroke in a cell.
The next change this decides: an action that moves the pen panel's thickness slider and the arrow spacing, before more rules.

## Which change comes next

Only one plant was missed, and it points at an action gap, not at rules or timing. The catches were fast (all under 2 minutes, most under 15 s), so a quiet nightly of
30 minutes is evidence for these kinds of bug. Plants chosen by the same author as the rules favor what the rules look for; a plant from a bug the fuzz found by itself
(#668, #681) would be a fairer test.
