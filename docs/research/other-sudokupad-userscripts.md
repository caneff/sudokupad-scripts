# Other SudokuPad userscripts, and SudokuPad's own features, before choosing a new script

Read on 2026-11-06, to keep new script ideas from repeating one that exists. Three web searches ("SudokuPad userscript
Tampermonkey greasyfork", "github sudokupad userscript sudokupad.app user.js", "SudokuPad browser extension features").
Only the search result text was read for the scripts below; none was installed or run.

## Userscripts and extensions found

| Name | Where | What it does (from its page) |
|---|---|---|
| SudokuPad Sven Magic Modified | https://greasyfork.org/en/scripts/574957-sudokupad-sven-magic-modified | A button (or Q) that makes basic deductions: naked and hidden candidates, and some variant clues guessed from their look and the rules |
| SudokuPad Tools | https://greasyfork.org/en/scripts/566830-sudokupad-tools | AUTO, PEN, HINT and CLR buttons: auto singles, auto candidates, hints, clear candidates; classic 9x9 only |
| SudokuPad_Extensions | https://github.com/thatcomputerguy0101/sudokupad_extensions | Grid copy and paste, double and triple click to select every cell with a digit or mark, restore given pencil marks, Cmd/Ctrl+Shift+Z for redo |
| Sudokupad copy cells | https://greasyfork.org/en/scripts/507342-sudokupad-copy-cells | A button that copies one row's or column's digits, for solution codes |
| SudokuPad Color Picker | https://sudokucolors.netlify.app/user-script/ | Recolors the puzzle's own elements (lines and so on) and makes a new link with the colors |
| SudokuPad Extra Tools | https://github.com/mj6robinson/SudokuPad-Extra-Tools | Fill candidates, auto erase marks, double click a keypad digit to select it, odd/even and high/low auto coloring |
| Sudoku Launchpad | https://sudokulaunchpad.com/ | A Chrome extension and site that sync solves and replays |

So deduction, auto candidates, grid copy and paste, solution codes, puzzle recoloring and solve sync are taken.
SudokuPad Extra Tools' auto coloring overlaps Color by Digit; whether it has profiles or follows centre marks was not read.

## SudokuPad 0.611.0's own features in the same space

Read from the live tests' recording of sudokupad.app (`~/.cache/sudokupad-scripts/live/sudokupad.har`), the
`addSetting` calls and `content:` labels in `app-settings.js` and `feature-*.js`.

- Settings toggles: Large Digits, Selection Style, Keypad Flipped, Multi-color Mode, Hide Colours, Hide Timer, Dashed
  Grid, Outlines on Digits, Outlines on Arrows/Lines, Draw Arrows Above Lines, Smart Cornermarks, Alternate
  Pencilmarks, Check Pencilmarks, Conflict Checker, Calculate Cell Sums, the Killer Calculator, Enable Letter Tool,
  Enable Pen Tool, Show Replay Tool, Dark Mode Alpha.
- Features: Mark Solved Digits (On, Gradual, Count), Show Seen Cells, Compact Pencilmarks, Cell Copy/Paste, Copy
  Cells Button, Show Row/Col Labels, UI Theme, Layout (controls left, right, top or bottom), Background Image,
  Screenshot, Replay GIF, Create Short URL, Streaming Tools, Constraint Alert.
- Hold-to-repeat undo exists: `script.js` reads `repeatundodelay` and `repeatundointerval` settings.
- **Export Settings / Import Settings** (`feature-settingssave.js`) write and read `Framework.getSettings()` only,
  the toggles. The scripts save with `Framework.setData`, a separate key per value, so their data is not in that file.
  Each script's own Copy settings and Paste settings are still the only way to move it.
- The pen tool binds `0`-`9` with a handler that only returns whether the pen tool is current (`tool-pen.js`
  `keyHandlers`), so a digit key does nothing there (also in `puzzle-ui-pen-tools.md`).
- Screenshot builds its SVG's styles from the page's stylesheets, keeping a rule only when an element matches it and
  its text matches `PuzzleTools.reSvgCssRule` (`.pencolor-…`, `:root…`, `#svgrenderer…` and others) or starts with a
  board layer's id (`puzzletools.js` `getSvgCSS`). Pen Tool Extras' page and outline rules start with `.pencolor-` or
  `:root:root`, so they should pass. Not run.

Not found in the settings list: a way to fade every digit but one, per-puzzle notes, and an undo checkpoint.
