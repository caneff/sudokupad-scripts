# What the fuzz catches: planted bugs (#678)

`npm run fuzz:plants` (`live/fuzz/plants-run.mjs`) injects one planted bug at a time, in place of the real script, and fuzzes it. The plants are in `live/fuzz/plants.mjs`;
the shipped `*.user.js` never hold one. The first run fuzzed each of the 10 plants of the time for 4 minutes (2 per puzzle, recorded 9x9 first, then the 6x6 if it was not
caught) with shrinks of up to 2 minutes; each later run says how it ran, and since the third (#727) the command runs each plant on K seeds with a short budget each
(`live/README.md` § Measuring the fuzz: planted bugs).

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

## Second run: the slider and box-color actions (#713)

Added to `live/fuzz/actions.mjs`: slider drags and key presses on the pen panel's Thickness and Opacity and on Text Anywhere's Size and Transparency; Pen Tool Extras'
settings dialog saved with a changed arrow spacing, dash length and thickness; Text Anywhere's settings dialog with a Box color picked (a preset or an Own color), the
Background button, a note placed with a box, and a line drawn with an arrow pen (page 3), and the weight of the existing `pen page` action went from 1 to 2. The ticket named only the slider, dialog and Box color actions; the note with a box and the arrow line were added after the first two runs missed, because each plant needed a state two actions deep. New rule `note-box-color`; new plant `box-color-stale` (Text Anywhere saves a changed
box color and keeps drawing boxes in the old one, found in `setLook`). Only the two plants below were run (4 minutes each over the whole puzzle set), so the other nine are
not re-measured here.

| seed | actions | `redraw-typo` | `box-color-stale` |
| --- | --- | --- | --- |
| 713 | sliders, dialog values, box color, Background | missed, 85 lists in 240 s | missed, 86 lists in 240 s |
| 714 | the same, weights of those actions raised | missed, 81 lists in 240 s | missed, 81 lists in 240 s |
| 715 | plus `boxed note` and `arrow line` | **caught**, recorded 9x9, 111 s | **caught**, cages 9x9, 91 s |

- **`redraw-typo` is now caught**, shrunk to 2 steps: `arrow line r1c3 -> r1c4 color 1`, then `drag the pen thickness slider from 0% to 0%`. The slider and dialog actions
  alone did not do it: the redraw only runs when a page 3 line is on the board, and a list that reached page 3, drew on it and then changed the thickness was rare (not measured).
  The signal is the script's own skip line (`console.warn: pen-tool-extras: arrow lines skipped because SudokuPad changed: TypeError: cell.renderContents is not a function`).
- **`box-color-stale` is caught**, shrunk to 2 steps: `note "15" with a box at r1c2`, then `Text Anywhere box color Tint Save`. Likewise the Box color dialog alone did not do it:
  a boxed note needs the Background button on first, and a list held a boxed note and a Save of Yellow, Tint or Own in about 1 list in 100 (measured on 2000 generated lists).
  The rule does not see a White pick, which looks the same as Page on a white page.
- **The lesson for the next plant** is the arithmetic in `fuzz-hit-rate.md`: a bug behind a state two actions deep needs an action that builds that state in one step.
  Each of the two plants was one weighted action away from being reachable, and a single seed per plant is a single sample of about 90 lists, so the three seeds above are not a rate.

## Third run: several seeds per plant, and the varied wait and the busy start (#725, #726, #727)

`npm run fuzz:plants` now runs each plant on K seeds with a short budget and prints, per plant, how many seeds caught it and the median time to catch (a miss counts as
over the budget), with a total; two or more `--config` names run on the same seeds side by side (`live/fuzz/configs.mjs`). Each catch is replayed from its own printed path
and the ones that do not repeat are counted. New plant `quick-digit-not-colored` (#725's first step): a race, Color by Digit leaving a digit's cell uncolored when it is
entered within 30 ms of the one before, which only a wait of 0 ms between actions can reach.

Run on 2026-11-10 (`--seeds 5 --budget 60 --seed 200 --shrink-minutes 0.3`, 12 plants, 3 configurations, 180 hunts over the whole puzzle set, 2 h 08 min on one box while a
drain worker ran beside it). Each cell is seeds caught of 5 and the median time to catch:

| plant | kind | current | varied-wait | busy-start |
| --- | --- | --- | --- | --- |
| tab-turns-pad-to-letters | rule | 2/5 > 60 s | 2/5 > 60 s | 2/5 > 60 s |
| tab-handler-typo | crash | 3/5 55.1 s | 4/5 29.6 s | 2/5 > 60 s |
| digit-five-wrong-group | rule | 4/5 20.5 s | 4/5 40 s | 5/5 40.6 s |
| mode-not-saved | rule | 1/5 > 60 s | 2/5 > 60 s | 1/5 > 60 s |
| note-dropped-on-load | rule | 4/5 37 s | 3/5 21 s | 3/5 18.5 s |
| load-logs-console-error | crash | 5/5 1 s | 5/5 1.1 s | 5/5 0.9 s |
| box-color-stale | rule | 3/5 46 s | 0/5 > 60 s | 4/5 18.9 s |
| dark-page-saves-light | rule | 2/5 > 60 s | 3/5 47.9 s | 4/5 7.6 s |
| rules-always-fit | rule | 5/5 5.1 s | 5/5 5.1 s | 5/5 5 s |
| page-three-line-not-drawn | rule | 5/5 8.1 s | 5/5 12.8 s | 5/5 2.2 s |
| quick-digit-not-colored | rule | 0/5 > 60 s | 2/5 > 60 s | 0/5 > 60 s |
| redraw-typo | crash | 3/5 27 s | 4/5 38.7 s | 5/5 20.4 s |
| **total** | | **37/60, 39 s** | **39/60, 26.2 s** | **41/60, 21 s** |

Every catch replayed from its path (0 of 37, 0 of 39 and 0 of 41 did not).

- **The race plant is caught only with the varied wait** (2 of 5 seeds, none under the fixed 40 ms), which is the evidence #725's first step asked for.
  The per-action wait that `fuzz-hit-rate.md` (row 5, section 5) proposes is left out, because the wait drawn per list already reaches the race and a list that waits 0 ms
  after every action puts two fast inputs in a row more often than a wait drawn anew for each action.
- **The busy start catches the most and the fastest** (41 of 60, median 21 s against 39 s and 26.2 s), and it alone took `dark-page-saves-light` and `box-color-stale` to 4 of 5:
  both need saved state that an empty board reaches only after several actions.
- **The varied wait cost `box-color-stale` all its catches** (0 of 5 against 3); five seeds per cell is a small sample, so one cell's swing of 3 is not yet a rate.
- **The combined configuration is no better than either alone.** `varied-wait+busy-start` on the same seeds and flags (2026-11-10, 60 hunts, 45 min, on the branch
  before its review fixes) caught 38 of 60, median 26.8 s, with every catch replaying; it caught the race plant on 1 of 5 seeds and `box-color-stale` and `dark-page-saves-light`
  on 5 of 5, but lost `tab-turns-pad-to-letters` and `mode-not-saved` (0 of 5) and `note-dropped-on-load` (2 of 5).
- **So the nightly hunts with `busy-start`** (`NIGHTLY_CONFIG` in `live/fuzz/nightly.mjs`), the most catches and the fastest. The cost: no nightly reaches the race plant,
  which only the varied wait does; `--config varied-wait` stays a command away. The default of `npm run test:fuzz` stays `current`, so a replay command printed before
  this change, which names no configuration, still replays the same lists.
