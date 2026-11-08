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
- Screenshot of edit mode: `pen-tool-extras/pen-color-edit-mode.png`.


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
- Pictures of the panel: `pen-tool-extras/pen-tool-extras-panel.png`, `-moved.png`, `-letter.png` (the letter
  tool and Color by Digit on) and `-dialog.png`; `pen-tool-extras/pen-tool-extras-panel-screenshot.mjs` takes them.

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

## The second page of pens, built and run live 2026-11-04 (#71, SudokuPad 0.612.0, headless Chromium)

What `pen-tool-extras.user.js` 1.5.0 does, and what running it found. Live checks: `live/pen-tool-extras/pen-tool-extras-pages.live.mjs`
(paging by button, Tab and wheel, drawing, undo, replay, reload, at the three injection times, and with No Tab Letters
installed too) and `live/pen-tool-extras/pen-tool-extras-panel.live.mjs`.

- **Pages.** Page 1 is `1` to `9`, page 2 is the color characters `a` to `i`. Each color button keeps its `data-key`
  and takes the page's character as `data-value` and title, as `ToolColor.setButtonPad` does. Page 2 strokes draw
  and undo, and the replay draws them again. `Framework.app.getReplay()` returns a compressed `{"type":"clzw",...}`
  string, so the replay cannot be grepped for `pc:c`; the live test loads it back and reads the stored pen values.
- **`getData` parses what it reads.** A saved `'3'` comes back as the number 3, so `ToolPen_color` read at
  `handleToolEnter` is a number, and a saved digit pen under the script's own key reads back as a number too.
  `ToolPen.tool.setSelectedColor` therefore gets numbers from SudokuPad itself.
- **`ToolPen_color` never holds a letter.** `setSelectedColor` saves whatever it is given, so the script wraps it: it
  turns the pad to the pen's page first (stock throws when no button holds the value), calls the original, and puts
  the pen's color number back into `ToolPen_color` in the same step; the pen itself is saved under `PenColor_pen`. A
  fresh page without the script, with `ToolPen_color` 3 saved, opens the pen tool with no error (live, in the pages
  test). SudokuPad's own `handleToolEnter` selects the saved number through the wrapper, which overwrites
  `PenColor_pen`, so the saved pen is read before it runs.
- **The buttons are shared.** One `.controls-input` serves every tool, and the digit tool reads `data-value`, so the
  pen's `handleToolExit` is wrapped to put 1 to 9 back.
- **Tab.** `App.handleKeydown` runs every tool's `handleKeydown` first and returns when one answers true, before
  `keyHandlers` (where the letter tool binds Tab), so `ToolPen.tool.handleKeydown` can answer Tab (both with No Tab
  Letters installed and without, run live). Stock SudokuPad does not toggle letter mode on Tab in the pen tool at all
  (run live with the letter tool on: Tab sets `letterMode` on the normal tool and leaves it off with the pen tool
  current), so the page turn costs nothing there; the live test's letter-mode check cannot go red and checks only that. Shift+Tab is left alone: with Shift+Tab also
  turning the page, `ToolLetter_letterMode` read back as saved on in the live run. The cause was not isolated; the
  letter tool's own `handleKeydown` switches letter mode for a held Shift (setting `toolletter_mode`), which fits.
- **A press exactly on an existing stroke starts no drag** in stock SudokuPad (no script loaded: `penhint` stays
  absent), so an erase drag in a test starts a few pixels off the line.

### Dots and joins

Page 2 draws lines as dots: `stroke-dasharray: 0 <gap>` on the line values (`1 2 7 8 9 a d e f g`, not the cell circle
`5` or cross `6`) with the round cap `.cell-pen` already has. Each segment is its own `<path>`, so each starts its own
pattern on a dot. The gap is two line widths snapped so a cell side (64 units) holds a whole number of dots, and the
diagonal (64 * sqrt(2)) its own; the same is done at each thickness, so the dots stay even across a join. Picture:
`pen-tool-extras/pen-tool-extras-dots-joins.png` (center, edge and diagonal lines, one drag each with turns, at thickness 1, 5, 12;
`pen-tool-extras/pen-tool-extras-dots-joins-screenshot.mjs`).

- At 5 and 12 the dots are evenly spaced through every turn and at every join between a side and a diagonal.
- At 1 the dots are 1 unit across with 2 between, which reads as a faint line at the page's own zoom.
- With the gap exactly an even split, the last dot fell on the segment's end and the browser drew no zero-length
  dash there, so a line's far end had no dot; a spacing 0.01% short puts the last dot a hair before the end and every
  line ends on a dot.

### Opacity on the pen layer

All pen strokes sit in `g#cell-pen`, and SudokuPad gives each path `opacity: 0.8`, so overlapping segments darken (dark
dots at joins). Moving the opacity to the group (`:root:root .cell-pen { opacity: 1 }` and
`:root:root #cell-pen { opacity: <slider> }`) fades the layer as one picture, so overlaps show as the rest of the
stroke. Where two colors cross the later stroke covers the earlier one. Picture: `pen-tool-extras/pen-tool-extras-pages-layer-opacity.png`
(the first two panels are before and after; the last two are the pen panel on pages 1 and 2;
`pen-tool-extras/pen-tool-extras-pages-layer-opacity-screenshot.mjs`). This replaces the reading in `pen-tool-extras/pen-tool-extras-opacity.md`
that the slider sets `opacity` on `.cell-pen` and that overlaps darken at every value.

- The drag highlight (`.penhint`, opacity 0.6) and the erase highlight (`.pencolor-erase`, 0.5) are children of the same
  group (`penhint` is made with `renderPart({target: 'cell-pen'})`), so the layer's opacity would fade them. The script
  moves the hint element to its own `g#pen-tool-extras-hint` right after the pen layer as soon as `drawLineHint` makes
  it. Live: their effective opacity, the product over their ancestors, is 0.6 and 0.5 with the slider at 20 and at 100.

### The panel

`.penlinemode` is hidden with CSS, not removed, so SudokuPad's own handlers keep their element, and the choice moved
into this script's dialog (it sets `ToolPen.tool.lineMode` and saves `ToolPen_linemode`, as the pulldown did). The
freed last row holds the sliders and a square page button. The stock `.controls-input button` color and size outrank a
plain class, so the page button's rule is `.tool-pen .controls-input button.<class>`; with a lower specificity the
button was white on white.

## The third page, chevron lines, built and run live 2026-11-04 (#73, SudokuPad as served that day, headless Chromium)

What `pen-tool-extras.user.js` 1.7.0 does and what reading and running SudokuPad found. Live checks:
`live/pen-tool-extras-chevrons.live.mjs` (both drag directions, a drag with turns, center, edge and diagonal lines, undo and redo,
replay, reload, erasing either way, thickness, opacity, pen 9 with the characters `z` and `0`, at the three injection times).
Picture at thickness 1, 5 and 16, and the page 3 pen panel: `pen-tool-extras/pen-tool-extras-chevrons.png`
(`pen-tool-extras/pen-tool-extras-chevrons-screenshot.mjs`).

- **A pen action can carry its own color.** `Cell.togglePen` splits its argument into value and color (`1j` is value `1`, color
  `j`) and only reads the pen tool's state color when there is none. `propContains('pen', '1j')` is `pen.includes('1j')`, an exact
  match, while `togglePen` removes any entry with the same value whatever its color, so a line stored with one character is removed
  by an action naming the other. `Puzzle.toggleGroup` runs `propSet` or `propUnset` on every selected cell, and both end in `togglePen`.
- **Undo and replay need nothing special.** `execUndo` clears the puzzle and executes the remaining actions again, so an action with an
  explicit color replays exactly as it was queued. Run live: `1n`, `1o`, `2n` and `10` (a pen value with the color `0`) survive undo,
  redo, `loadReplay` and a page reload, with no page errors.
- **A drag queues one `select` and one `pen` action per value, over every cell that holds it.** `ToolPen.actSend` wraps them in a group
  (`groupstart`, `deselect`, a `pencolor` action only when the pen changed, the queued actions, `deselect`, `groupend`). Right along
  a row, down, then left along the next row queues one action for `1` over all four cells. In a drawing drag the cells are the ones
  that lack the value; in an erasing drag (the first segment already has the value, `getEraseMode`) they are the ones that hold it,
  and the action is the bare value, which removes the line whichever character it was stored with. So an erase drag in either
  direction works with no change.
- **Direction.** The tool's `currentPath` is still set when `actSend` runs, and each step of it is one segment, so the script rewrites the
  queued list there: it names each segment's value, cell and way from the path (`lineSegment`; the value on an edge shared by two
  cells is the right or bottom edge of the cell before it, and the left or top edge only on the grid's own border, which is what
  SudokuPad stores) and splits the one action into one per way, in the same group, so one undo takes the whole drag back.
- **A chevron line is one element.** `Cell.renderPropPen` keeps what `renderPen` returns in `childElems` under the stroke's class and
  removes it from there, so the wrapped `renderPen` returns a `<g class="cell-pen pen-1 pencolor-j">` holding two paths: a thin line
  and the chevrons. The color, the layer's opacity and the eraser all act on the group, and the paths inherit the stroke color.
  Chevron size and spacing are fixed when drawn, so a thickness change draws the cells that hold a chevron line again
  (`cell.renderContent(true)`).
- **Dark Page.** A chevron reaches half its width plus half its stroke off its line: 15.6 units at thickness 16. Dark Page paints the
  whole `#svgrenderer` box white, and the svg clips what lies outside it, so the reach no longer matters to it (#444).
- Not run: a touch screen, Windows, Tampermonkey.

## Holding a modifier leaves the pen tool (run on the page 2026-11-04, SudokuPad 0.611.0, headless Chromium, no script loaded)

`Framework.app.tool` while a key is held in the pen tool, and back to `pen` on release in every case:

| Letter tool | Letter Tool Hotkey | Alt | Ctrl | Shift |
| --- | --- | --- | --- | --- |
| off | n/a | `corner` | `centre` | `corner` |
| on | `altletter` | `pen` | `centre` | `corner` |
| on | `nohotkey` | `corner` | `centre` | `corner` |

So a click with a modifier held doesn't reach the pen tool unless the script stops the temporary switch (`App.changeTool` with
`tempChange`, found through each tool's `tempKey`). Only the key press was run, not a click with it held.

## Middle click (run on the page 2026-11-04, SudokuPad 0.612.0, headless Chromium, `live/pen-tool-extras/pen-tool-extras-erase.live.mjs`)

- A real middle press raises `pointerdown`, `pointerup` and `auxclick` with button 1 and, when `pointerdown` is not prevented, `mousedown`
  and `mouseup`, which end in `clickCell` as for a left click.
- `preventDefault` on `pointerdown` stops `mousedown`, `mouseup` and so `clickCell` altogether: with the script's handler a middle press
  shows only `pointerdown` and `auxclick`, and the pen tool starts no drag. The script erases from the `pointerdown` itself, at the pointer
  position `getInputRc()` holds (the last one SudokuPad saw on a move).
- A middle press just off the grid is not over `#svgrenderer`, so it is not prevented, and its release reached `clickCell` and stored an edge
  mark (`0,2:c3` for a press above the top edge). The script's `clickCell` ignores a release whose button was the middle one.
- Erasing is a `select` of the cells holding a value and a bare `pen` action for it, per value, in one group; one undo brings the whole line back
  (the undo stack holds one entry per action, so its length is not a count of undo steps).
- Not run: a real middle button on Windows, where autoscroll shows; headless Chromium cannot show it, so the test reads `defaultPrevented`.
- SudokuPad stops updating its cached pointer position (`inputPos`, what `getInputRc()` reads) while a dialog is open. A pointer moved during a
  dialog and a middle press right after it closes would hit the old position, so the erase hit-tests the press's own `clientX`/`clientY` through
  `app.xyToRCExact`, which gives the same cell units (checked live: the point 2 cells right and 3 down of cell (0,0)'s middle gave 3.5, 2.5).

## A button a script adds after startup leaks its press to the board (#521)

Traced in the page on 2026-11-07, SudokuPad 0.611.0.

- `App.attachButtonHandlers` binds `handleButton` to every `<button>` present when it runs. `handleButton` calls `stopPropagation()` on `mousedown` and `touchstart`, so a press on SudokuPad's own button never reaches `App.handleInputdown`, which listens on `window`.
- A button a script inserts later never gets `handleButton`. Its `mousedown` bubbles to `window`, then `handleInputup`, then the pen tool's `clickCell` with `getInputRc()` near the pointer.
- SudokuPad's edge hit test finds an edge for a press up to one cell beyond the grid. A button within that distance of the grid draws an edge X: Pen Tool Extras' line mode, page and settings buttons (c = 9.8 to 10.7), and Auto Rules Resizer's font bar on a 1920x1080 window.
- The fix is a `mousedown` `stopPropagation()` on the added control. Color by Digit and Text Anywhere (`draw-tool.user.js`) already stop `mousedown` on their controls. Their dialog buttons and banners were not probed. At a 1200x1000 window Pen Tool Extras' page and settings buttons sit more than a cell beyond the grid, so a leaked press on them marks nothing; the test checks that no `mousedown` reaches `window`.
