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

## Run on the page, 2026-11-03 (v0.611.0, `live/edge-marks.live.mjs`)

- `renderPen` is a method on `SvgRenderer`'s prototype, reached as
  `Framework.app.svgRenderer`; `ToolPen.tool` is the same object as `app.tools.pen`.
  `renderPen` copies every option onto the path, so passing `d` is enough to draw a
  new value.
- `clickCell` queues its actions on the tool (`actAdd`) and `actSend` wraps them in one
  group. An edge click queues one `select` and one `pen` with `3`, `4`, `b` or `c`.
- Confirmed: a replay holding `h` to `s` loads in a page without the script with no page
  error; the values are stored and drawn as paths with no `d`.
- `.cell-pen` sets the stroke width to 5 and loads after a script's own style, so a
  width rule needs `.cell-pen.pen-X`. A bare `.pen-X` lost to it.
- Screenshot of every mark in nine colors: `edge-marks-all-colors.png`.

## Right click, run on the page, 2026-11-03 (v0.611.0, Linux headless Chromium)

- `tool-pen.js` and `script.js` have no `contextmenu` or `event.button` handling, yet a
  real right click on an edge does reach `clickCell`, and it does what a left click does
  (a right click at the right edge of cell (4,4) adds the X). `clickCell` takes no
  argument: it reads `Framework.app.inputPos` and hit-tests that point itself.
- Event order for one right click: `pointerdown`, `mousedown`, `contextmenu` (on press,
  on Linux), `pointerup`, `mouseup`, then `clickCell`, then `auxclick`. So `clickCell` runs
  after the release, and the button has to be read from the pointer events before it.
- `Framework.app.tool` is `'pen'` while the pen tool is on and `'normal'` after the
  `#control-normal` button; the grid is drawn in `#svgrenderer`.
- Not run: Windows, where `contextmenu` follows the release (after `clickCell`). The same
  `inputPos` is still the point hit-tested, so the code should hold there.
