# SudokuPad pen tool colors

Read from sudokupad.app source at v0.611.0 on 2026-11-03: `tool-pen.js`,
`tool-pen.css`, `script.js`, `feature-customcolors.js`. Nothing here was run on the
page.

- `tool-pen.css` defines nine CSS variables, `--puzzle-pencolor-1` to `-9`. The
  stroke rules (`.pencolor-N { stroke: var(--puzzle-pencolor-N) }`) and the tool's
  button swatches (`.tool-pen button[data-key="N"]:after`) both read them.
- A drawn stroke has class `cell-pen pen-<val> pencolor-<N>` (`script.js`). The state
  and `ToolPen_color` store the digit N, never an RGB value.
- So overriding the nine variables should recolor strokes, swatches and old strokes
  together, with no change to puzzle state or replays.
- The set is nine: colors are one character in the pen value, and the buttons are
  the digit keys. More than nine would need changes to SudokuPad's own code.
- The eraser stroke (`.pencolor-erase`) has its own fixed color and no variable.
- `feature-customcolors.js` mentions no pen color.

Search for an existing script: one Exa web search (six results; sudokucolors,
thatcomputerguy0101's extensions, mjaschen's palette gist, SudokuPad Extra Tools,
SudokuPad Tools on Greasy Fork). From the returned text only, none changes pen
colors. Greasy Fork and GitHub were not searched directly.

## How the color tool's hold-to-edit works, for a pen equivalent

Read 2026-11-03 from SudokuPad 0.611.0's `tool-color.js`. Nothing here was run live.

- `handlePadButtonDown` listens on `.controls-input` and starts a 1000 ms timer
  (`HoldToEditDelayMs`). The handler itself does not check which mouse button is down.
  `handlePadButtonUp`, on `window`, cancels the timer.
- The timer calls `toggleEditMode`. `enterEditMode` returns early unless the color tool is
  the current tool, so a hold on a pen button does nothing today.
- Edit mode adds the class `edit-colors` to `.controls-input` and puts a
  `<div class="colorpicker"><input type="color">` before every `.tool-colour button.digit`.
  So a hold shows pickers on all the buttons, and a further click on one opens the
  browser's native picker. A second hold, or changing color page, leaves edit mode.
- An `input` event on a picker calls `setColor` with the value, so the color changes live.
- `tool-pen.js` has no equivalent. Its buttons are `.tool-pen button[data-value="<color>"]`.
