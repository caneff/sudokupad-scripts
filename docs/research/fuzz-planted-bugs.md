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

## Fourth run: swarm lists and longer lists (#728, #730)

Four more configurations (`live/fuzz/configs.mjs`), each on the same seeds and flags as the third run (`--seeds 5 --budget 60 --seed 200 --shrink-minutes 0.3`, 12 plants):

- `swarm` (#728): each list first draws a random non-empty subset of the action kinds and generates its actions only from it. The subset does not shrink, so a swarm failure's path replays.
- `long-40` and `long-50` (#730): up to 40 or 50 actions a list instead of 20, and never an empty list.
- `busy-start+long-40`: the busy start of the third run with lists of up to 40.

`long-40` and `long-50` ran on 2026-11-10 side by side; `swarm` and `busy-start+long-40` on 2026-11-13, one after the other, while a drain worker ran beside them. The third run's
`current` and `busy-start` columns are repeated for comparison.

| plant | kind | current | busy-start | swarm | long-40 | long-50 | busy-start+long-40 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| tab-turns-pad-to-letters | rule | 2/5 > 60 s | 2/5 > 60 s | 0/5 > 60 s | 2/5 > 60 s | 1/5 > 60 s | 0/5 > 60 s |
| tab-handler-typo | crash | 3/5 55.1 s | 2/5 > 60 s | 0/5 > 60 s | 5/5 9.1 s | 4/5 33.9 s | 1/5 > 60 s |
| digit-five-wrong-group | rule | 4/5 20.5 s | 5/5 40.6 s | 3/5 54.5 s | 3/5 43.4 s | 3/5 8.2 s | 5/5 10.6 s |
| mode-not-saved | rule | 1/5 > 60 s | 1/5 > 60 s | 0/5 > 60 s | 2/5 > 60 s | 3/5 52.1 s | 3/5 54.6 s |
| note-dropped-on-load | rule | 4/5 37 s | 3/5 18.5 s | 1/5 > 60 s | 5/5 13.6 s | 5/5 19.4 s | 5/5 20.5 s |
| load-logs-console-error | crash | 5/5 1 s | 5/5 0.9 s | 5/5 0.9 s | 5/5 1.1 s | 5/5 1.1 s | 5/5 1.1 s |
| box-color-stale | rule | 3/5 46 s | 4/5 18.9 s | 1/5 > 60 s | 3/5 40.6 s | 5/5 21.8 s | 5/5 5.4 s |
| dark-page-saves-light | rule | 2/5 > 60 s | 4/5 7.6 s | 3/5 48.5 s | 2/5 > 60 s | 2/5 > 60 s | 3/5 40.3 s |
| rules-always-fit | rule | 5/5 5.1 s | 5/5 5 s | 5/5 5.1 s | 5/5 5.1 s | 5/5 5.1 s | 5/5 5.3 s |
| page-three-line-not-drawn | rule | 5/5 8.1 s | 5/5 2.2 s | 5/5 5.2 s | 5/5 8 s | 5/5 13.5 s | 5/5 4.7 s |
| quick-digit-not-colored | rule | 0/5 > 60 s | 0/5 > 60 s | 0/5 > 60 s | 0/5 > 60 s | 0/5 > 60 s | 0/5 > 60 s |
| redraw-typo | crash | 3/5 27 s | 5/5 20.4 s | 3/5 26.9 s | 5/5 18.9 s | 5/5 24.2 s | 4/5 25.1 s |
| **total** | | **37/60, 39 s** | **41/60, 21 s** | **26/60, > 60 s** | **42/60, 18.8 s** | **43/60, 23 s** | **41/60, 25 s** |

Every catch replayed from its path (0 of 26, 42, 43 and 41 did not).

- **Swarm is the worst configuration measured** (26 of 60, against 37 for `current`). It lost most on the plants that need two kinds in one list: `tab-handler-typo` and
  `mode-not-saved` (0 of 5), `note-dropped-on-load` and `box-color-stale` (1 of 5). Groce et al. measured swarm on compilers, where a test is cheap and a missing feature
  removes a whole class of input; here a list is a few seconds of a real page, and leaving out a kind mostly removes the action a plant needs. `fuzz-hit-rate.md` ranked it the
  cheapest gain from outside evidence; this run does not bear that out.
- **Longer lists match the busy start** (42 and 43 of 60 against 41), but catch different plants: long lists take `tab-handler-typo` to 5 of 5, the busy start takes
  `dark-page-saves-light` to 4 of 5. One or two catches out of 60 is within what 5 seeds a plant can tell apart.
- **Both together are no better than either** (41 of 60, median 25 s): `busy-start+long-40` lost `tab-turns-pad-to-letters` and most of `tab-handler-typo`. The same
  happened when the varied wait was combined with the busy start (third run).
- **So the nightly stays on `busy-start`.** The default of `npm run test:fuzz` stays `current` (20 actions, empty lists possible), not raised as #730 asked, because a replay
  command printed before this change names no configuration and must still replay the same lists. `long-40`, `long-50` and `swarm` are a `--config` away.

## Coverage and mutants (#729, #723)

### Does the sourceURL tag and the coverage change what the fuzz catches? (#729)

`--coverage` tags every injected script and turns on V8 coverage (`live/fuzz/coverage.mjs`). The plant harness took the same seeds with and without it (2026-11-10, `--seeds 3 --seed 300 --budget 30 --config busy-start
--no-replay-check`, six plants, two runs one after the other; `--coverage` of `plants-run.mjs` is the only difference, so this is `--config`'s compare run done as two runs):

| plant | kind | without coverage | with coverage |
| --- | --- | --- | --- |
| tab-turns-pad-to-letters | rule | 1/3 > 30 s | 1/3 > 30 s |
| digit-five-wrong-group | rule | 1/3 > 30 s | 1/3 > 30 s |
| note-dropped-on-load | rule | 1/3 > 30 s | 1/3 > 30 s |
| dark-page-saves-light | rule | 2/3 17.4 s | 2/3 18.1 s |
| rules-always-fit | rule | 3/3 5.2 s | 3/3 5.2 s |
| redraw-typo | crash | 2/3 6.9 s | 2/3 6.7 s |
| **total** | | **10/18, 19 s** | **10/18, 19.4 s** |

The same 10 of 18 runs caught, on the same seeds (every run's own line matches: the catch seconds differ by under a second). So the tag changes no catch. The never-run count (the harness measure of #729) is in
`fuzz-hit-rate.md` § The first never-run list; the cost, 35 lists in 4 minutes without coverage against 43 with, is there too. This ran on the first version of the coverage code; the review fixes changed how pages
merge, not what a page runs.

### Mutants: what the fuzz catches among bugs nobody chose (#723)

`npm run fuzz:mutants` (`live/README.md` § Measuring the fuzz: mutants) was run on 2026-11-10, on commit f91cf57, as two runs side by side on one box (both started 17:09 UTC):

```
node live/fuzz/mutants-run.mjs --file ui-tweaks --file dark-page --file auto-rules-resizer --seed 1000 --config busy-start
node live/fuzz/mutants-run.mjs --file color-by-digit --file pen-tool-extras --file text-anywhere --seed 2000 --config busy-start
```

The rest are the defaults: a coverage hunt of 40 action lists with sample seed 723, 30 mutants per script, 2 seeds per mutant (1000 and 1001, then 2000 and 2001), 30 s per hunt,
shrinks of 0.1 minutes. The first run took 73 minutes, the second 90. Both coverage hunts printed the same never-run counts (the same seed and lists), and each script had far more
mutants than the sample:

| script | mutants | in code the coverage hunt ran | sampled |
| --- | --- | --- | --- |
| `ui-tweaks.user.js` | 335 | 81 | 30 |
| `dark-page.user.js` | 365 | 134 | 30 |
| `auto-rules-resizer.user.js` | 595 | 209 | 30 |
| `color-by-digit.user.js` | 1347 | 430 | 30 |
| `pen-tool-extras.user.js` | 1165 | 772 | 30 |
| `text-anywhere.user.js` | 2092 | 1216 | 30 |

The tables as printed. "seeds caught" counts only the mutants fuzzed to a verdict (caught or missed), 2 hunts each; the median counts a miss as slower than the 30 s budget.

```
ui-tweaks.user.js
family       mutants  caught  missed  unreachable  load-error  seeds caught  median
-----------  -------  ------  ------  -----------  ----------  ------------  ------
relational   10       0       4       0            6           0/8           > 30 s
conditional  10       0       4       1            5           0/8           > 30 s
deletion     10       0       9       1            0           0/18          > 30 s
total        30       0       17      2            11          0/34          > 30 s

dark-page.user.js
family       mutants  caught  missed  unreachable  load-error  seeds caught  median
-----------  -------  ------  ------  -----------  ----------  ------------  ------
relational   10       1       5       0            4           2/12          > 30 s
conditional  10       0       6       1            3           0/12          > 30 s
deletion     10       1       8       0            1           2/18          > 30 s
total        30       2       19      1            8           4/42          > 30 s

auto-rules-resizer.user.js
family       mutants  caught  missed  unreachable  load-error  seeds caught  median
-----------  -------  ------  ------  -----------  ----------  ------------  ------
relational   10       1       8       0            1           2/18          > 30 s
conditional  10       1       3       5            1           2/8           > 30 s
deletion     10       0       7       1            2           0/14          > 30 s
total        30       2       18      6            4           4/40          > 30 s

color-by-digit.user.js
family       mutants  caught  missed  unreachable  load-error  seeds caught  median
-----------  -------  ------  ------  -----------  ----------  ------------  ------
relational   10       3       5       1            1           6/16          > 30 s
conditional  10       5       3       2            0           8/16          > 30 s
deletion     10       1       9       0            0           1/20          > 30 s
total        30       9       17      3            1           15/52         > 30 s

pen-tool-extras.user.js
family       mutants  caught  missed  unreachable  load-error  seeds caught  median
-----------  -------  ------  ------  -----------  ----------  ------------  ------
relational   10       3       7       0            0           6/20          > 30 s
conditional  10       2       6       0            2           4/16          > 30 s
deletion     10       1       7       2            0           2/16          > 30 s
total        30       6       20      2            2           12/52         > 30 s

text-anywhere.user.js
family       mutants  caught  missed  unreachable  load-error  seeds caught  median
-----------  -------  ------  ------  -----------  ----------  ------------  ------
relational   10       2       7       0            1           4/18          > 30 s
conditional  10       0       7       2            1           0/14          > 30 s
deletion     10       1       8       1            0           2/18          > 30 s
total        30       3       22      3            2           6/50          > 30 s
```

Every catch replayed from its path: the first run printed "0 of 8 catches did not replay from their path", the second "0 of 33".

**Totals** (summed from the six tables): of 180 mutants, 22 caught, 113 missed, 17 unreachable, 28 load errors. So 22 of the 135 mutants fuzzed to a verdict were caught (16%),
on 41 of 270 hunts. By family: relational 10 caught, 36 missed, 1 unreachable, 13 load errors; conditional 8, 29, 11, 12; deletion 4, 48, 5, 3.
Catches were fast when they came: 32 of the 41 catching hunts took under 10 s, and the slowest took 27.6 s.

**What the mutants say.** Read from each mutant's lines in the progress files:

- **Caught: a flipped test in code that draws or colors the board.** 10 of the 22 are `===` and `!==` swapped, 6 a negated condition, 2 an `&&` and `||` swap, 4 a deleted
  statement. Most are in Color by Digit's coloring and Pen Tool Extras' drawing, where a wrong result shows on the board and a rule reads it. Color by Digit (9 of 30) and Pen
  Tool Extras (6) give the most; UI Tweaks gives none.
- **Missed: no boundary flip was caught.** All 8 sampled `<` to `<=`, `>` to `>=` (and back) were missed.
- **Missed: what no rule looks at.** Most of the 48 missed deletions drop an attribute or a detail (`link.rel = 'noopener'`, `aria-label`, `style.id`, `tray.className`,
  `button.dataset.role`), a listener (`pointermove`, `pagehide`, a settings `click`), or a save (`savedData.setData(PEN_KEY, pen)`). Their effect shows only after a later
  action, a reload, or not on the page at all.
- **Load errors are mostly startup checks working.** 18 of the 28 are a script's own "skipped because SudokuPad changed" line or its notice bar, 9 an uncaught error or a
  "startup failed" line, and 1 (Color by Digit, line 280) a button that never appeared within 30 s. A mutant that breaks startup is loud in every run, so these are not counted
  as catches or misses.
- **The small scripts are mostly startup.** Of UI Tweaks' 30, 11 broke loading and none was caught; Dark Page's misses are mostly its settings dialog, whose code ran in one seed's
  hunts and not the other's.

**A flaw in the unreachable count.** 10 of the 17 unreachable mutants are `&&` and `||` swaps (10 of the 16 such swaps sampled). The generator places such a mutant at the
operator, and V8 counts the operator as part of the right-hand side: a probe in Node (`a || g(b)` called with `a` true) gave the range of `|| g(b)` a count of 0. So "reached" for a
swap asks whether the right-hand side ran, and a swap changes exactly that. Those 10 are likely misses read as unreachable. The fix is to check the start of the whole
expression for this family.

*Fixed (#926).* Each mutant now carries `reachAt`, the start of the whole `LogicalExpression` for a swap and its own `start` for every other family, and both reach checks in
`mutants-run.mjs` ask it through `mutantReached`. A check run, `npm run fuzz:mutants -- --file color-by-digit --per-script 10` (2 seeds, 30 s, box load about 31 of 32 cores): 1,356 mutants, 761 in code the
coverage hunt ran, 10 sampled, of which 2 were swaps (line 522 and line 1952). Of the 4 seed runs the swaps got, 1 (line 1952, seed 567671813) was reached and not caught and
3 reported "its code never ran" in that run's own 30 s hunt. The run does not show the fix at work: it did not record what the old offset gave for either swap, or whether their
left sides ran in the 3 unreached runs. What shows it is the unit test of `reachAt` and the Node probe above. The 10-mutant table: 1 caught, 5 missed, 3 unreachable, 1 load error. The full mutant run was not repeated, and a sample of 2 swaps says nothing about
the rate.

**What the sample shows, and what it does not.**

- It shows that the fuzz with 30 s per seed catches about 1 in 6 of the mutants it reaches, almost all through a wrong board, and none of the boundary flips.
- It shows every catch repeats from its path, as the hand plants did.
- It does not give a rate per script or per family: each cell is 10 mutants and 2 seeds, and Color by Digit's 9 is most of the total. The mutants are a sample of 180 out of
  the 2,842 in reached code.
- It does not compare with the hand plants. Those were run for 60 s per seed (§ Third run: 41 of 60 hunts under `busy-start`), these for 30 s, and the hand plants were written
  to be seen by a rule. A miss here may need a longer hunt, not a new rule; the run did not test that.
- Some missed mutants may change nothing a user would see (a deleted `link.rel` or `style.id`); the run cannot tell such a mutant from a real miss.
- The two runs shared one box, so the time to catch may be slower than on an idle one.

### Why the missed mutants are missed (#927)

Question: do the deleted saves and boundary flips of the #723 run need a longer hunt, a reload drawn more often, or a new rule? Measured on 2026-11-16 on commit 4d1aef6. The scratch is in `docs/research/fuzz-missed-mutants/`
(`measure.mjs`, the two samples, the four `runs-*.jsonl` files of one line per hunt).

**Method.** The mutants were drawn fresh from `mutantsOf` on the scripts as they are, among those the 40-list coverage hunt (seed 723) ran: 52 `setData` statement deletions of which 25 were reached, and
242 `<` `<=` `>` `>=` flips of which 154 were reached. Sampled with seed 927: 10 flips, 10 deletions, and then 11 more deletions, because the first filter (any deletion whose text holds a `setData`) also took statements that only
hold one (a `dismiss.addEventListener('click', ...)`, a `steps.pages.wrap(...)`), so the `direct` mode drew the 16 reached deletions of a bare `x.setData(...)` statement (11 not yet sampled). That is 21 save deletions and 10 flips.
Each was fuzzed on seeds 1000, 1001, 1002 at 30 s and at 300 s per hunt, 63 + 30 hunts at each budget. Per hunt, V8 coverage read one page load at a time says how many action lists ran
the mutated code, and how many of those had a page load after the one that ran it (a reload).

**Deviation: the hunts ran under `--config current`, not `busy-start`.** The ticket asked for `busy-start`; `measure.mjs` was run without `--config`, so it used the default. Every number below is under `current`. The #723
numbers were under `busy-start`. The jobs were not rerun.

**Results.**

| group | mutants | caught at 30 s (mutants / hunts) | caught at 300 s (mutants / hunts) |
| --- | --- | --- | --- |
| save deletion | 21 | 3 / 5 of 63 | 4 / 11 of 63 |
| boundary flip | 10 | 0 / 0 of 30 | 0 / 0 of 30 |

The 300 s hunts ran 5,340 action lists on the uncaught hunts, 310 of them (5.8%) with a reload.

| mutant | what | 30 s hunts caught | 300 s hunts caught | lists (300 s) that ran it / then a reload | verdict |
| --- | --- | --- | --- | --- | --- |
| `color-by-digit:2499` | `setData(MODE_KEY, next)` | 0/3 | 0/3 | 44 / 0 | reload too rare |
| `pen-tool-extras:1789` | `setData('ToolPen_color', ...)` | 0/3 | 0/3 | 177 / 10 | needs a rule (rule-blind; SudokuPad also saves this key, so maybe not visible) |
| `text-anywhere:1316` | `setData(INDEX_KEY, index.filter(...))` | 0/3 | 0/3 | 27 / 0 | reload too rare (effect on a player unclear) |
| `pen-tool-extras:1782` | `steps.pages.wrap(tool, 'setSelectedColor', ...)` (not a save: a wrap that holds saves) | 0/3 | 3/3 | n/a (caught) | caught: breaks the pen pad, a crash just past 30 s |
| `dark-page:763` | dismiss `click` listener holding a save | 0/3 | 0/3 | 212 / 13 | not reachable: the fuzz never clicks it |
| `auto-rules-resizer:992` | dismiss `click` listener holding a save | 0/3 | 0/3 | 197 / 11 | not reachable: the fuzz never clicks it |
| `text-anywhere:1855` | dismiss `click` listener holding a save | 0/3 | 0/3 | 197 / 11 | not reachable: the fuzz never clicks it |
| `pen-tool-extras:341` | dismiss `click` listener holding a save | 0/3 | 0/3 | 196 / 11 | not reachable: the fuzz never clicks it |
| `auto-rules-resizer:130` | lib `save`: `store.setData(key, envelope)` | 1/3 | 2/3 | n/a (caught) | more time |
| `pen-tool-extras:2852` | `setData(LINE_MODE_KEY, lineMode)` | 0/3 | 0/3 | 33 / 0 | reload too rare (#936); the reload view reads it since #935, but only while the pen tool is current |
| `color-by-digit:327` | lib `save`: `store.setData(key, envelope)` | 0/3 | 0/3 | 0 / 0 | unclassified: reach read is an artifact (see below) |
| `color-by-digit:2263` | `setData(key, true)` (one-time preload flag) | 0/3 | 0/3 | 0 / 0 | unclassified: reach read is an artifact (see below) |
| `pen-tool-extras:105` | lib `saveRow`: `store.setData(row.key, value)` | 0/3 | 0/3 | 0 / 0 | unclassified: reach read is an artifact (see below) |
| `pen-tool-extras:1557` | `setData(COLORS_KEY, ...)` | 0/3 | 0/3 | 197 / 12 | the rule was added in #935, measured in `fuzz-missed-mutants/reload-settings-935.md` |
| `pen-tool-extras:1790` | `setData(PEN_KEY, pen)` | 0/3 | 0/3 | 164 / 10 | the rule was added in #935, measured in `fuzz-missed-mutants/reload-settings-935.md` |
| `text-anywhere:799` | lib `save`: `store.setData(key, envelope)` | 3/3 | 3/3 | n/a (caught) | caught at 30 s |
| `text-anywhere:1303` | `setData(INDEX_KEY, touched.index)` | 0/3 | 0/3 | 133 / 8 | rule-blind or not visible: the index only lists puzzles with notes (not read further) |
| `text-anywhere:2535` | `setData(COLOR_KEY, color)` | 0/3 | 0/3 | 17 / 1 | reload too rare (#936); the reload view reads it since #935 |
| `text-anywhere:2574` | `setData(COLORS_KEY, ...)` | 0/3 | 0/3 | 151 / 9 | the rule was added in #935, measured in `fuzz-missed-mutants/reload-settings-935.md` |
| `text-anywhere:2586` | `setData(row.key, value)` | 1/3 | 3/3 | n/a (caught) | more time |
| `text-anywhere:2738` | `setData(BACKGROUND_KEY, on)` | 0/3 | 0/3 | 53 / 2 | reload too rare (#936); the reload view reads it since #935 |
| `ui-tweaks:357` | `off.length > 0` to `>=` | 0/3 | 0/3 | 29 / 1 | needs a rule (#937) |
| `pen-tool-extras:1295` | `x >= -GAMUT_EDGE` to `>` | 0/3 | 0/3 | 43 / 0 | not visible: needs a float exactly at the gamut edge |
| `text-anywhere:1254` | `value > 0` to `>= 0` (stored size) | 0/3 | 0/3 | 14 / 1 | not visible: the script never saves a size of 0 |
| `text-anywhere:3280` | `deltaY < 0` to `<= 0` | 0/3 | 0/3 | 8 / 0 | needs a wheel of exactly 0: not drawn |
| `text-anywhere:4216` | `selected.length > 0` to `>= 0` | 0/3 | 0/3 | 148 / 7 | not classified (handler on an empty selection not read) |
| `color-by-digit:2351` | `done.length > 0 \|\| ...` to `>=` | 0/3 | 0/3 | 18 / 0 | not visible: a restart record nothing reads |
| `color-by-digit:190` | `g.digits.length > 0` to `>=` | 0/3 | 0/3 | 25 / 1 | not visible: a group with no digits is not built |
| `text-anywhere:3420` | `i < Math.min(index, shown.length)` to `<=` | 0/3 | 0/3 | 12 / 0 | not classified (loop bound not read) |
| `text-anywhere:1258` | `item.text.length > 0` to `>= 0` | 0/3 | 0/3 | 14 / 1 | not visible: the script never saves an empty text |
| `color-by-digit:1917` | `profiles.length <= 1` to `< 1` | 0/3 | 0/3 | 9 / 0 | needs exactly one profile: the fuzz rarely drives the profile editor (#931) |

"Lists that ran it" counts lists with a page load whose coverage ran the mutated code; it is a read of the code having run, not of the saved value being used. For a caught mutant the count is not shown: a failed list's
coverage is not added, and the probe read 0 for the three caught lib mutants.

**Verdict per group.** Read from the table; the "not visible" and "needs a rule" calls come from reading the mutated line and `reloadView`, not from a test of each.

- **More time: a small part.** 2 of the 21 deletions (`auto-rules-resizer:130`, `text-anywhere:2586`) went from 1 of 3 hunts at 30 s to 2 and 3 of 3 at 300 s; `pen-tool-extras:1782` is
  not a save and crashes the pen pad just past 30 s, and `text-anywhere:799` was caught at 30 s. 10x the time moves the catch from 3 mutants to 4. No change is called for: it is the budget the nightly can spend, not a defect.
- **Reload too rare: 5 deletions** (`color-by-digit:2499`, `text-anywhere:1316`, `pen-tool-extras:2852`, `text-anywhere:2535`, `text-anywhere:2738`). Their code ran in 17 to 53 lists each and a reload followed it in 0 to 2. Only 5.8% of lists have a
  reload. Ticket #936.
- **Needs a rule: 4 deletions and 1 flip.** `pen-tool-extras:1789`, `1790`, `1557` and `text-anywhere:2574` ran in 151 to 197 lists with a reload after the code in 9 to 12, and were not caught in any of 3 hunts. `reloadView` then read
  strokes, page color, Color by Digit's mode, groups and digits only: not the selected pen, the pen color set or the text note's color set. Ticket #935 added them (`fuzz-missed-mutants/reload-settings-935.md` has what it caught); `ui-tweaks:357` (a flip that leaves an empty
  "Off because SudokuPad changed:" in the dialog, visible, read by no rule) is ticket #937. `text-anywhere:1303` (the notes index; it ran in 133 lists, 8 with a reload after) is rule-blind or not visible, and is in neither count: the visibility was not read further.
- **Not reachable by the fuzz: 4 deletions.** The `dismiss` click listeners (dark-page, auto-rules-resizer, text-anywhere, pen-tool-extras) were "reached" because the listener is installed, but nothing in `live/fuzz/` clicks a
  dismiss button (`rg dismiss live/fuzz` finds none) and the notice they dismiss shows only on a page the script skipped. No ticket: that is not what the fuzz is for.
- **Unclassified: the reach read is an artifact, 3 deletions** (`color-by-digit:327`, `color-by-digit:2263`, `pen-tool-extras:105`). They read 0 lists that ran them in about 198 lists each. The per-page read asks V8 coverage of the
  *mutated* script, where the deleted statement is a bare `;`, and V8 gives that `;` the count of the range beside it, so it reads "never ran" when the code ran after an early `return`, after a false `if (c) x()`, or as a taken `else`. The
  review's probe (headless Chromium, `createCoverage`) read true on the original and false on the mutated page in each shape. These three, and the caught `auto-rules-resizer:130` and `text-anywhere:799` (all five the shared `save` or `saveRow` shapes), read 0
  for that reason. `measure.mjs` also records `ran` as `=== true`, so a page whose script was not heard (`ranAt` null) counts as "did not run". So the run does not say whether their save was reached or followed by a reload, and they get no verdict. The fix is to read reach at the original script's offsets; not done, and no ticket, as it moves 3 of 21 mutants.
- **Boundary flips: not visible or not drawn, not time or reload.** None of the 10 was caught at 300 s, and the reload is no cause for any: a flip at `=` changes the result only for an operand exactly at the edge. 5 are not
  visible (`pen-tool-extras:1295` a float exactly at the gamut edge; `text-anywhere:1254` and `1258` a stored size 0 or empty text that the script never saves; `color-by-digit:2351` and `190` state nothing reads); `text-anywhere:3280` needs a
  wheel of exactly 0; `color-by-digit:1917` needs exactly one profile (ticket #931's profile editor actions draw it). `text-anywhere:4216` and `3420` were not read far enough to classify. So a longer hunt does not catch these.

**What it does not show.** The runs are `current`, not `busy-start`, and that matters for the "reload too rare" verdict: `busy-start` draws up to 30 start steps first, among them the settings the scripts save (`startArbitrary` in `live/fuzz/actions.mjs`), and the nightly runs it (`live/fuzz/nightly.mjs`), so the rate of a reload after a save there is unmeasured and ticket #936 rests on the `current` rate. A visibility call is missing for `text-anywhere:4216`, `3420`, `1303` and `1316`, and none was made for the 3 unclassified deletions; the ticket asked for it on each miss. Three seeds per mutant; 21 and 10 mutants out of 2,842 in reached code. The "visible to a player" calls rest on one line of code each. The reach read per
page is not trusted for caught mutants or for the 3 unreached ones.
