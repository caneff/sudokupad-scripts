# SudokuPad pen marks on cell edges

Read from sudokupad.app source at v0.611.0 on 2026-11-03: `script.js` (`renderPen`,
`Cell.togglePen`, `renderPropPen`) and `tool-pen.js` (`clickCell`). Nothing here was run
on the page.

- Each pen mark is one character on a cell, stored as value plus color, such as `31`.
  `renderPen` is a `switch` on the value: `3`, `4`, `b` and `c` are the edge X on the
  right, bottom, left and top; `5` and `6` are the cell circle and cross. The lines
  use `1`, `2`, `7`, `8`, `9`, `a`, `d`, `e`, `f` and `g`. `h` onward are unused.
- `togglePen` does not check the value, and only `0` is special (clear). So a new
  character should store, undo and replay like any other mark, through
  `app.act({type: 'pen', arg})`.
- `renderPen` has no `default` case, so an unknown value gets a path with no `d`. A
  player without the script should then see nothing, with no error. That reading is
  unconfirmed.
- A script would wrap `svgRenderer.renderPen` to draw the new values and
  `ToolPen.clickCell` to choose them. Both are SudokuPad internals, so an update can
  break the script, and SudokuPad could later assign the same characters.
- `clickCell` already cycles a cell mark: nothing, then circle, then cross, then nothing.
  An edge X only toggles.

Search for an existing script: one Exa search (five results), plus the sudokupad
scripts already seen in `docs/research/sudokupad-color-tool.md`. None describes extra
edge marks. Only the result text was read.
