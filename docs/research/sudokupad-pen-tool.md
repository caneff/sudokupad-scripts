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

## What the hold-to-edit build found, run live 2026-11-03 (SudokuPad 0.611.0, headless Chromium)

- SudokuPad keeps one `.controls-main` element and swaps its class (`tool-pen`, `tool-colour`),
  rebuilding the buttons inside it. A picker `div` inserted into it survives leaving the tool and
  comes back when the pen tool returns, so a script's edit mode has to end itself when the
  element stops being `.tool-pen`. `pen-color.user.js` watches the class.
- The color tool binds `mousedown`/`touchstart`; the script uses `pointerdown`, which both a
  mouse button (left or right) and a finger raise.
- A right-click hold on Windows opens the context menu on release, over the picker that
  appeared under the pointer during the hold, so the menu is suppressed over the pickers too.
- `input.showPicker()` called from the 1000 ms timer raises no error, since the `pointerdown`
  that started the hold still counts as user activation. Headless Chromium draws no popup, so
  whether the native picker would stay open through the release is not checked, and the script
  keeps SudokuPad's extra click.
- Screenshot of edit mode: `pen-color-edit-mode.png`.


## The panel's line mode box and a slider drag (read 2026-11-04, #60)

- `ToolPen.handleToolEnter` builds `.penlinemode` (a `select` with `both`, `centeronly` and
  `edgeonly`) inside `.tool-pen .button-row:last-child`, and `handleToolExit` removes it, so
  it exists only while the pen tool is on. Its CSS is `position: absolute; left: 0; right: 0;
  top: 13rem; height: 4rem` inside `.tool-pen .controls-input`, so the box fills the row on its
  own and the row's two buttons are not shown. Its `change` listener reads
  `event.target.value`, so a slider placed inside it would overwrite the mode: the script puts
  its sliders beside it, not in it.
- SudokuPad calls `preventDefault` on every `mousemove` on the page (the move default is
  what drags a range input's thumb in Chromium). A bare `<input type=range>` appended to the
  page cannot be dragged with the mouse there, though a click on its track sets the value; the
  same input on an empty page drags. A `mousemove` that is stopped from propagating before
  SudokuPad's handler sees it drags normally. `pointermove` is not cancelled.
- A digit key does nothing in the pen tool (no pen color change), and arrow keys are handled by
  SudokuPad, so neither shows whether a slider holds the focus; `document.activeElement` does.
- Dragging a line over an existing line in the same cells erases it.
- Pictures of the panel: `pen-tool-extras-panel.png`, `-moved.png`, `-letter.png` (the letter
  tool and Color by Digit on) and `-dialog.png`; `pen-tool-extras-panel-screenshot.mjs` takes them.
