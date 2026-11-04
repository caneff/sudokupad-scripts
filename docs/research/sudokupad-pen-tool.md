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
- SudokuPad's own set is nine, on the digit keys. A color is one character in the pen
  value. More than nine does not need changes to SudokuPad's code: see "Pen colors past
  nine" below, which corrects an earlier reading here.
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

## Pen colors past nine (run on the page 2026-11-04, SudokuPad 0.611.0, headless Chromium, no script loaded)

A throwaway probe set `ToolPen.tool.selectedColor` to `a` and `z`, added a `.pencolor-a, .pencolor-z` stroke rule, and
drew real mouse drags.

- The strokes store as `1a` and `1z`, and draw with class `pencolor-a` and the rule's stroke.
- `getReplay()` holds `pc:a` and `pc:z`. Undo removes the last stroke, and `loadReplay` draws both again. No page errors.
- The color character is separate from the mark character, so colors do not use up the scarce mark values in
  `sudokupad-pen-edge-marks.md`. Replays lowercase their actions, so a color has to be a lowercase letter: 26 more. Only
  `a` and `z` were run.
- `ToolPen_color` saved as `a` throws `TypeError: Cannot read properties of null (reading 'classList')` when the pen
  tool opens, because `setSelectedColor` looks for a `.tool-pen button[data-value="a"]`. A script needs that button to
  exist by then, or has to save a digit instead.
- A page without the rule loads the replay with no error and stores the marks, but draws them with `stroke: none`, so
  they are invisible to anyone without the script.
- Not run: a page reload, custom buttons in the panel, Windows, Tampermonkey.

### Color character `0` (run on the page 2026-11-04, same setup)

- `0` works as a color. A stroke stores as `10` and draws with class `pencolor-0`. `getReplay()` holds `pc:0`, and undo, redo,
  `loadReplay` and a page reload all keep it. Only a mark value of `0` clears a cell, so a color of `0` doesn't. No page errors.
- Repeated drags over one spot in one run gave the same results for colors `1`, `a` and `0`: drawn, unchanged, erased, nothing. So
  the no-op drags in that run aren't caused by `0`, and why they happen wasn't looked into.
- That makes 36 color characters, 1 to 9, `a` to `z` and `0`: enough for nine solid, nine dotted and nine directional pens at two
  characters each.
