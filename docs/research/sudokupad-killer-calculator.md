# SudokuPad's Killer Calculator, for a script that hooks into it

Read 2026-11-03 from SudokuPad 0.611.0's served `tool-calculator.js`. The items
under "Run live" were run on a `/blank` grid in headless Chromium. Nothing here
was run under a real Tampermonkey install or on `crackingthecryptic.com`.

## How a script reaches it

`tool-calculator.js` declares two top-level consts: `KillerCalculator` (the class)
and `killerCalculator` (the one instance). They are global lexical bindings, the
same kind as `Framework`, so a `@grant none` script reaches them by bare name.
`window.KillerCalculator` is `undefined`. None of this is a documented API, so a
SudokuPad update can change it.

## What it offers

Static functions, which need no selection or panel:

- `KillerCalculator.getKillerCombinations({size, sum, minSum, maxSum, minSize, maxSize, maxVal})`
  returns the digit sets. It stops at 200 combinations (`MaxCombCount`), logging a
  warning. `minVal` is accepted, but a TODO in the source says it is not fully
  respected.
- `KillerCalculator.filterCombinations(combs, {incVals, excVals, excCombs, incSums, excSums})`
  keeps the sets that contain every `incVals` digit and no `excVals` digit.
- `KillerCalculator.getPuzzleCages()` returns `{allCages, killerCages, puzzle}`.
  A killer cage has `style === 'killer'` and is not `hidden`.
- `combSum`, `calcCombSums`, `sortCombsSum`, `triangularNumber`.

The instance:

- `killerCalculator.getCages()` returns the above plus `selectedCage`, the one cage
  the selection lies in.
- `killerCalculator.getCageSum(cage)` reads `sum` or the cage's value text.
- `killerCalculator.getCageInfo(cageId)` returns the player's panel marks:
  `{inc, exc, cageVals, excCombs, incSums, excSums}`. `cageId` is the index in
  `killerCages`. Reading an unknown id creates its empty entry. The marks live in
  memory only, and `handleStart` clears them when the replay stack is empty.
- `killerCalculator.update()` redraws the panel. `handleAct` and
  `handleClickDetails` call `this.update()`, so wrapping the instance's `update`
  should catch every redraw. That wrap has not been run.
- `killerCalculator.solverTool` has `init(cells)` and `solveMinMax()`, which give
  the minimum and maximum sum of any cells. It reads placed digits and centre
  marks, respects cells that see each other, and gives up after 100 ms.

The panel, when the `toolcalculator` setting is on:

- `#controls .killercalc-onscreen`, holding `.summary` and `.details`.
- Each row is `.combs > li` with `data-set`, `data-cage` and `data-comb`, and the
  class `invalid` when filtered out. `update` replaces this HTML on every redraw.

`showCage` filters on placed digits and the player's panel marks only. It does not
read a cage's centre or corner marks. A script that wants the sets narrowed by
pencil marks has to pass them to `filterCombinations` itself.

## Run live

- `typeof KillerCalculator` is `function`, `typeof killerCalculator` is `object`.
- `getKillerCombinations({size: 3, sum: 10})` returned 127, 136, 145, 235.
  Filtering with `incVals: [1], excVals: [4]` left 127 and 136.
- With a killer cage summing to 10 on r1c1, r1c2 and r1c3 selected, the panel read
  `sum: 10 (4/4)` with those four rows.
- `update()` added nothing to the replay stack. Selecting the cells added one entry.
- `solverTool` on those three cells, in an otherwise empty grid, returned `[6, 24]`.

The cage was pushed straight onto `Framework.app.puzzle.currentPuzzle.cages` after a
`loadCTCPuzzle`. The minimal hand-built puzzle object lost its killer cage in that
load, so loading a real killer puzzle through this path has not been shown. The
panel was attached by calling `handleSettingToggle(true)`, not through the setting.
