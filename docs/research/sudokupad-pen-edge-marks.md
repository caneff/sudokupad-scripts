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

## Grid-corner marks, 2026-11-03 (v0.611.0, `tool-pen.js`, `script.js`; run on the page in `live/pen-tool-extras-marks.live.mjs`)

- `clickCell` has no corner case. It floors `getInputRc()` (the pointer in cell units from the
  grid's top left) to a cell, picks the nearer side by `|dx| >= |dy|`, and takes an edge mark when the
  distance to that side's midpoint is under 0.75 of the distance to the cell middle and at most 1.0.
  At a corner the first is 0.5 against 0.707 × 0.75 = 0.53, so a click exactly on a corner is an edge
  mark, and the edge zone reaches 0.57 along a side from the midpoint, past the corner.
- Pen values are lowercased on undo and replay: `propSet` and `propUnset` do `val.toLowerCase()`, and
  `Replay.actC2A` lowercases the whole action. So an added value has to be a lowercase letter or digit;
  uppercase would come back as another value. SudokuPad's own stop at `g`, the edge marks use `h` to `s`,
  and `0` clears, which leaves `t` to `z`: seven values.
- A mark on one of the grid's 100 corners (9 x 9) is stored on one cell. Four kinds of cell position would
  need eight values, so three kinds are used, two characters each (X, circle): `u`/`x` the bottom right
  of a cell (every corner with a cell up and left of it, so inner corners and the right and bottom outer
  corners are stored once), `t`/`w` the top left (the top row and left column), and `v`/`y` for the two
  corners left, the top right (on the cell in the top row's last column) and the bottom left (on the cell in
  the bottom row's first column). `z` is unused.
- Corner zone: 0.2 of a cell by distance, checked before SudokuPad's test. Edge midpoints (0.5 away) and
  cell middles (0.71) are outside it; an edge click 0.3 or more from a corner is still the edge mark.
  A point just outside the grid counts too, so the outer corners can be clicked.
- Run on the page: clicks at the pixel of each inner and outer corner cycle X, circle, empty and back, one
  undo per click; `getReplay()` holds `pe:u/0` and a replay loads them again; a reload of the page keeps
  them; the mark's centre is within 1 px of the corner.
- Dark Page's kept rectangle: an X centred on an outer corner reaches 8 units (plus half the stroke) past the
  cell box on two sides, the same as an edge X reaches past an outer edge, so it is inside `SOLVER_REACH`
  (checked on all four outer corners at the default thickness).
- Pictures: `pen-tool-extras-corners-grid.png`, `pen-tool-extras-corners-dialog.png`
  (`pen-tool-extras-corners-screenshot.mjs`).

## A dialog button over the grid leaves a pen mark, 2026-11-03 (v0.611.0, #63; run on the page in `live/pen-tool-extras-marks.live.mjs`)

- `wrapClickCell` is not the cause: stock SudokuPad does it, with no script loaded. A dialog from `Framework.showDialog({ centerOverBoard: true })`
  whose button handler calls `Framework.closeDialog()` removes the dialog on the press. Event order of one real
  click: `pointerdown` and `mousedown` on the button, then `pointerup` and `mouseup` on the grid's `svg`.
  `ToolPen.handleInputup` (`tool-pen.js`) runs from `mouseup`, calls `clickCell`, and `clickCell` marks whatever
  the pointer is over: a cell circle in a cell's middle, an edge mark near an edge. Held for 150 ms or not, the
  mark is the same. The grid never saw the press, so this is a release with no press.
- A point that is neither near enough to a cell middle nor an edge makes no mark, so the mark shows only on some
  button positions. The stock settings buttons that open another dialog (Screenshot, Create Short URL) open it on
  the press, so the new dialog's overlay catches the release and no mark appears.
- Pen Tool Extras' own dialog did it on Save and Cancel (an edge mark under Save in the live run), and its
  settings entry did it on an instant click: the entry closed the settings dialog and opened its own in a
  `setTimeout`, and a click whose release came first landed on the grid. A click held for 100 ms did not.
- The fix is the script's own, for its own buttons only: `closeDialogKeepingGrid` closes the dialog and, when a
  pointer is pressed, swallows the events that end the press (`pointerup`, `pointercancel`, `mouseup`, `touchend`)
  at `window` in the capture phase until the next `pointerdown`, which also ends it when the close came from
  the keyboard and no release follows. Stock dialogs and every other script's dialog are unchanged.
- Not run: a touch screen (the `touchend` swallow is by reading, not by a run), Windows, Tampermonkey.
