# A custom tool in SudokuPad: Draw Tool's findings (#269)

SudokuPad v0.611.0, `framework.js`, `script.js` and `tool-pen.js`, read from the live recording, and run on the page in
`live/text-anywhere/text-anywhere.live.mjs` (2026-11-06).

## Registering

- `Framework.addTool({button, tool})` adds the button to `.controls-tool` (id `control-<name>`), calls
  `app.addTool(tool)` and `refreshControls()`. A tool needs `name` and `isTool: true`; `changeTool` then puts
  `tool-<name>` on `.controls-main`.
- A saved current tool (`Framework.getData('tool')`) that names a tool not yet added falls back to the first tool at
  startup, so a reload with Draw current starts on Digit.
- SudokuPad v0.616.0 (`script.js`, read from the live recording, 2026-11-09) saves the current tool on every `changeTool`
  that is not a temporary one (`Framework.setData('tool', this.tool)`) and reads it once, in `App.init`, which the page
  runs during its own startup, before a userscript can add a tool. `changeTool` checks `hasTool` and turns an unknown
  name into the first tool. So the saved tool never restores a script's tool, and renaming a tool's name (Text Anywhere's
  `draw` to `textanywhere`, #709) loses nothing: a saved `draw` reads as Digit, as it already did.

## The button's place (#298)

- `Framework.addToolButton(opts)` is `addControlButton` with `parent: '.controls-tool'`, which creates the `<button>`
  and appends it; `addTool` calls it first. So a tool button's place is its arrival time. The pen tool's button
  arrives when its setting turns on (`makeToolToggler` calls `addTool`), a moment after Start Puzzle on a saved
  setting, so a script injected earlier has its button before the pen's.
- The ▶▶ button (Chris calls it the replay button) is not SudokuPad's own: the recording's v0.611.0 scripts hold no such glyph, and a stock page has only
  Digit, Corner, Centre, Color and, with the setting on, pen in `.controls-tool`. No script in this repo adds one. It
  is another userscript's (no `replay` control or `addToolButton` call is in `framework.js` or the other scripts), which can only have joined the bar through `addToolButton` or `addControlButton` with that
  parent, both of which append. Which script it is was not found (Chris's page was not read); the live check adds a
  button both ways.
- Draw Tool keeps its button last with one rule in its stylesheet, `.controls-tool #control-draw { order: 1 }` (`#control-textanywhere` in Text Anywhere, #709): the bar is a
  `display: grid` (filled column by column) and the stock buttons have order 0, so the button is drawn last whenever another lands
  after it. The button stays where it was added in the page, so Tab reaches it before a later button. `app.tools` keeps its order, so
  the tool keys are unchanged (§ Tool keys). Run in `live/text-anywhere/text-anywhere-order.live.mjs`, which reads the drawn order: the pen
  tool on at startup (script injected at DOMContentLoaded, which gave Draw before pen in the page), the pen turned
  off and on, a later `addTool` and a later `addToolButton`, Draw still selectable, and Z X C V B on the same tools.

## Tool keys

- `App.toolHotkeys` is `['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM']`, and `handleKeydown` gives key *i* to
  `getToolNames()[i]`. `getToolNames()` is the insertion order of `app.tools`, filtered by `isTool`.
- On the page the tools are `normal, corner, centre, colour`, plus `pen` when its setting is on (the letter tool is
  not an `isTool` tool). So Draw, added after them, gets **B**, or **N** with the pen tool on. Worse, a pen tool turned
  on after Draw comes after it and moves from B to N.
- Draw Tool's fix: it wraps the app's `getToolNames` so that while a keydown is being dispatched (`app.currentEvent`
  is a keydown whose `eventPhase` is not 0) the list leaves Draw out. No key lands on Draw, and every other tool keeps
  the key it has without the script, the late pen tool's B included. Checked live.
- Side effect: Space, Shift+Space, PageUp and PageDown, which step through the tools in the same keydown, skip Draw.
  From Draw they step to the first tool.

## Input

- `App.handleInputdown` (mousedown and touchstart on `window`) calls the current tool's `handleInputdown` first; true
  returns before the double/long-press timers and `handleDragStart`, so no cell is selected.
- Moves call `handleDragMove` (inert when no drag started) and then the tool's `handleInputMove`, capital M.
- `App.handleInputup` calls the tool's `handleInputup`; true skips `handleDragEnd`.
- Shift keydown switches to Corner for as long as it is held (Corner's `tempKey`). `handleKeydown` first calls every
  tool's `handleKeydown` (`handleToolEventForwarding`), and true ends the keydown, so Draw returns true for Shift while
  it is current and Shift+drag reaches it.
- A digit key or keypad button runs the current tool's `handleToolButton`; without one it would act with
  `Puzzle.ToolToAction['draw']`, which is undefined.

## The board

- The board SVG is `#svgrenderer`, viewBox `-16 -16 608 608` for a 9x9: a cell is 64 board units from (0, 0). Its
  children run `background … cell-givens, cell-pen, cell-pencilmarks, cell-candidates, cell-values`; a group appended
  last draws above the digits and scales with the board on a resize.
- `--puzzle-pencolor-1` is set on the root element (`rgb(31, 128, 32)` by default); a stroke styled
  `stroke: var(--puzzle-pencolor-1)` follows it.

## For Restart (#270)

`App.restartPuzzle` acts `{type: 'clear', arg: <tool>}` for every key of `app.tools`, Draw included, inside a group,
when the replay is not empty. `Puzzle.act` logs an action into the replay only when `exec` reports a change, and a
`clear` for `draw` changes nothing, so no `cl:-1` is written.

Run on the live page (2026-11-06, `live/` recording, v0.611.0 scripts), with and without Draw Tool injected after Start
Puzzle: a digit, a corner mark, a centre mark and a colour entered, then the confirm dialog's Restart. Both runs gave
the same actions, in `getReplay()` (empty) and in `app.preRestartSavedProgress` (what Undo right after Restart brings
back): the entries, then `gs/6`, `sl:r1c3r1c4/0`, `cl:0/0`, `cl:1/0`, `cl:2/0`, `ds:r1c5r1c3r1c4/0`, `ge/0`. No
`cl:-1`, and no `Cell.clear > Invalid tool: draw` on the console or as a page error. With nothing entered, Restart
acts nothing and both replays stay empty.

## Saving the notes (#270)

Read in `script.js`, `framework.js` and `portableevents.js` of v0.611.0, and run in `live/text-anywhere/text-anywhere-saved.live.mjs`
(2026-11-06).

- **Restart**: `App.restartPuzzle` ends with `this.trigger('restarted')`, after `Puzzle.restartPuzzle`, whichever of the
  confirm dialog's Restart and Keep Time was picked, and whether or not anything was entered. Draw Tool listens with
  `app.on('restarted', …)` (the app mixes in `PortableEvents`). The confirm dialog runs first, so the script asks
  nothing itself. Checked live through the dialog's Restart button.
- **Undo after Restart (#489)**: `App.restartPuzzle` keeps `this.puzzle.getProgress()` in `app.preRestartSavedProgress`, but only
  when the replay is not empty, and `Puzzle.resetPuzzle` empties the undo stack. `Puzzle.execUndo` with an empty undo stack loads that
  progress (`loadProgress`, then `progressloaded`), clears it, and returns false, so the Undo is not logged. Nothing is triggered for it
  but the `act` that `Puzzle.act` triggers after every action, `(act, action)` with `action.type === 'undo'`, and the stack is still
  empty then, as it is after an ordinary Undo of the last action. So Text Anywhere reads whether the undo stack was empty before an Undo
  off the last `act`, `reset` or `progressloaded` of the puzzle, and brings the notes back on an Undo that found it empty. The kept
  progress lives in memory only, so a reload ends it, and Text Anywhere drops its kept notes on every load to match. The kept
  progress ends in the Restart's own clears, so that Undo shows no digit: the next Undo takes the clears back (checked live,
  2026-11-07: digit, Restart, Undo gives an empty cell and an undo stack of 6; a second Undo gives the digit). With only notes entered
  the replay is empty, nothing is kept, and SudokuPad's Undo does nothing. An Undo while errors are shown only clears them
  (`App.act` returns before `Puzzle.act`), so no `act` is triggered.
- **Loading a puzzle**: `Puzzle.createPuzzle` calls `svgRenderer.clearAllLayers()`, which removes every child of the
  board SVG that is not one of SudokuPad's layers, Draw Tool's layer included. `Puzzle.loadPuzzle` then triggers
  `loaded` on the puzzle, before the saved progress loads. Draw Tool redraws from storage on `puzzle.on('loaded', …)`,
  and at its own startup when `app.puzzle.currentPuzzle` is already set. Restart triggers `start` but not `loaded`.
- **The key**: `app.puzzle.puzzleId` is undefined for the live suite's `scl…` URL puzzle. `convertPuzzle` sets it only
  from a puzzle's `id`, and `loadRemoteCTCPuzzle` from the id it fetched by, so such a puzzle is keyed by the page URL.
- **`Framework.getData`** runs `JSON.parse` and on a parse error hands back the raw text, so a broken entry reads as a
  string, never as an error. Draw Tool reads anything but a list of strokes as unreadable.
- **The replay**: drawing acts nothing, so `getReplay()` is the same before and after a stroke. Checked live.

## The Draw panel (#271)

Read in `script.js`, `tool-pen.js`, `tool-pen.css` and `tool-color.js` of v0.611.0, and run in
`live/text-anywhere/text-anywhere-panel.live.mjs` (2026-11-06).

- **One keypad for every tool.** `.controls-input` holds rows of `button.digit` with `data-key` 1 to 9 and 0, and a
  last row of 0 and `data-control="delete"`. A tool's look is CSS on `.controls-main.tool-<name>`: `tool-pen.css`
  hides each digit (`text-indent: -999em`, transparent text on `--body-bg`) and paints a 60% swatch in `:after` from
  `--puzzle-pencolor-<key>`, and leaves the `.current` button its normal purple. Draw Tool's own `<style>` repeats those
  rules under `.tool-draw .controls-input` (`.tool-textanywhere` in Text Anywhere, #709), so a changed pen color variable shows on the swatches with no script.
- **Digit keys and buttons.** A keypad press (`handleButton`, `control === 'value'`) and a digit key
  (`handleKeydown` → `eventToDigit` → the button with that `data-key`) both call `doPressDigit(<data-value>)`, which
  runs the current tool's `handleToolButton` first and stops on true. The color tool's pages rewrite `data-value` and
  put `1`-`9` back in its `handleToolExit`, so with Draw current the value is the key. Draw picks the color from it.
- **Enter and exit.** `changeTool` swaps the class, then runs the old tool's `handleToolExit` while `app.tool` still
  names it, then the new tool's `handleToolEnter`. The pen tool's exit does not take `.current` off its button; Draw's
  enter clears every `.current` digit before marking its own, and its exit clears them again.
- **The panel box** (the widths, the text sizes and Clear all) sits where the pen tool's `.penlinemode` does (`position: absolute; top: 13rem; height: 4rem` in
  the last row), over 0 and delete, which Draw's CSS also hides. Its buttons are not SudokuPad's, so a plain `click`
  listener handles them; SudokuPad's window `mousedown` reaches Draw's `handleInputdown`, which ignores a press off
  the board.
- A saved `DrawTool_color` or `DrawTool_width` that is not one of the choices reads as pen color 1 or the middle
  width. Checked live with a planted `"purple"` and `7`.

## The right button, erasing and Clear all (#272)

SudokuPad v0.612.0 (`framework.js`, `script.js`, `utilities.js`), run on the page in `live/text-anywhere/text-anywhere-erase.live.mjs`
in headless Chromium on Linux.

- `addDownEventHandler` listens for `mousedown touchstart`, whatever the button, so a right press reaches the current
  tool's `handleInputdown` as a `mousedown` with `button` 2, and the moves of a right-drag reach `handleInputMove`.
  Checked live through `App.toolExecHandler`'s `tool-handleInputdown` event. Draw takes a right press on the board as
  an erase: every stroke the drag passes within 4 board units of the drawn line's edge goes, whole. The hit test runs
  against the curves `strokePath` draws, not the stored corner points, which a sharp turn leaves far outside the line.
- No stock code calls `Framework.disableContextMenu`, so the browser's menu opens on a right click anywhere. Draw
  prevents the `contextmenu` event over the board while it is current, and leaves it alone under every other tool.
  On Linux the event follows the press; on Windows it follows the release. Not run on Windows: a right-drag that ends
  off the board there would still open the menu where it ends.
- Clear all is `Framework.showDialog` with `centerOverBoard`, so its buttons sit over the board. A dialog button's
  handler (`F.handleButton`) and the overlay's (`F.handleDialogCancel`) both run on `mousedown` and stop its
  propagation, so `App.handleInputdown` never sees the press; the release reaches Draw's `handleInputup` with no stroke
  begun, and Draw starts a stroke only on its own press. So the release-without-press mark the pen tool makes (#63,
  #66, `sudokupad-pen-edge-marks.md`) cannot happen in Draw, and it needs no release swallow of its own. Checked live
  for a press on Cancel, on OK and on the overlay over r1c1, each dragged across the board before the release.
- `Framework.closeDialog` does nothing while `window.dialogJustShown` is set, which `showDialog` clears in a
  `setTimeout(0)`. On a page still busy after a reload, a scripted press came before it and the dialog stayed open; a
  live test waits for it to clear.

## Typed text (#273)

SudokuPad v0.611.0 (`script.js`, `framework.js`, `feature-*.js` in the live recording), run on the page in
`live/text-anywhere/text-anywhere-text.live.mjs` and `live/text-anywhere/text-anywhere-erase.live.mjs` (2026-11-06).

- **Where the keys go.** `App` listens for `keydown` on `document` in the capture phase, as do `feature-cellpaste.js`
  and `feature-compactmarks.js`; `feature-markup.js` listens on `window` in the bubble phase, and `framework.js` on
  `document`. `App.handleKeydown` does not look at the event's target, so a key typed in an `<input>` still reaches it,
  and a listener on the input itself runs too late to stop it. A listener on `window` in the capture phase runs before
  every one of them, whatever order they were added in.
- **The text box** is an HTML `<input>` over the board at the text's point, sized from the board's scale, in the pen
  color with a dashed outline. Draw's window capture listener takes only the keys whose target is that input, with
  `stopImmediatePropagation` and no `preventDefault` but for Enter (finish) and Escape (drop), so no digit reaches a
  cell, no tool key (Z X C V B N M) switches the tool and Shift does not switch to Corner, while the input types,
  moves its caret, deletes, pastes and composes as any input does, and F5 and Tab keep their browser action (Tab moves
  focus out, and the input's blur finishes it). Checked live with `15`, `Zx C`, Shift+Z, Home, Delete and ArrowRight.
- **A press outside the box.** `App.handleButton` (the keypad, the tool buttons, settings) stops its `mousedown`, so
  Draw's `handleInputdown` never sees it. Draw finishes the box from a window capture `pointerdown` listener, which
  runs before any `mousedown`; the same press then does nothing else on the board. Checked live with a click on a
  keypad color and on the settings button: the box finishes, and a key typed after reaches no drawing.
- **A gesture cut short.** A tool key pressed mid-drag switches the tool, and the release then goes to the new tool.
  Draw ends a stroke or an erase in progress when it is left, when the window loses focus, and on a move with the
  gesture's button no longer held (`event.buttons`), as a release would: a stroke is kept and an erase is saved.
  Checked live with Z pressed mid right-drag.
- **A failed save** (an unreadable index, or `localStorage` full) and an unreadable saved drawing are shown once a page
  in `Framework.showDialog`, at the first save they stop. `showDialog` does nothing while another dialog is open.
- **A click is a press and release within 2 board units.** Draw tells a click from a stroke at the release of its own
  press, so a text box never opens on a release or a click alone. Clear all's dialog buttons and its overlay stop
  their `mousedown` (§ The right button), so closing the dialog by a plain click over the board opens no box. Checked
  live for a click on Cancel and on the overlay over r1c1.
- **The text** is an SVG `text` in Draw's layer, anchored at its middle (`text-anchor: middle`,
  `dominant-baseline: central`), so its point is the click point. Its hit box for a click and for erasing is estimated
  at 0.6 of the text size per character, not measured, so the pure functions can test it.

## Test Markup

SudokuPad v0.611.0 (`feature-markup.js`), run on the page in `live/text-anywhere/text-anywhere.live.mjs` (2026-11-07) with the Experimental
setting "Test Markup (Press: "M")" on (`Framework.setSetting('markup', true)`). It loads `fabric-5.3.1.min.js` only once
turned on, so the live recording turns it on too.

- Draw and Test Markup do not clash. With it on, Draw draws a stroke and a right-drag erases it. Holding M with Draw
  current (no text box open) draws on Test Markup's canvas and not in Draw's layer: while M is held its `.fabcan` layer
  covers the page and stops the `mousedown`, so Draw never sees the press; the release of M ends it, and Draw is still
  current. An M typed in an open text box goes into the text, since Draw keeps the box's keys from every SudokuPad
  listener, `feature-markup.js`'s window one included. No page error.

## Held keys (#498)

SudokuPad v0.611.0 (`script.js`, the live recording), read 2026-11-07.

- `App.handleKeydown` begins with `if(event.repeat) return`, before `handleToolEventForwarding('Keydown', ...)`. A tool's
  `handleKeydown` sees the first keydown of a held key and never the OS repeats, so a held key does nothing more unless the
  tool times it. Text Anywhere starts its own interval on the press and stops it on the key's keyup, a blur, or the
  selection ending.
- `handleKeyup` is forwarded without such a check, and `App.handleBlur` forwards `Blur` to tools after clearing its own keys.

## Ctrl+C under Text Anywhere (#636)

SudokuPad v0.611.0 (`feature-cellpaste.js`, `script.js`), read from the live recording 2026-11-08; the live check is attack 71 in `live/attacks-input.live.mjs`.

- **The throw.** `feature-cellpaste.js` listens for `keydown` on `document` in the capture phase and runs `handleCopy` on Ctrl/Cmd+C, which reads `SmartSelectToolOrder[prevTool || tool]`. That table has no `draw` (nor `pen`) entry, so the call throws with Text Anywhere current, with or without a note selected. Ctrl+V's `handlePaste` does not read the table.
- **Ctrl switches the tool first.** `App.handleKeydown` switches to Centre (its tempKey) when Ctrl or Cmd goes down, so by the C the tool is `centre` and `prevTool` is `draw`; that is why the read is `prevTool || tool`. A window capture `keydown` listener runs before the document's, so one that calls `stopImmediatePropagation` on Ctrl/Cmd+C when `prevTool || tool` is Text Anywhere keeps the copy from running and leaves the Ctrl switch alone. It leaves the key's default alone, so a copy inside an open note stays the browser's.
- **Not done.** A Text Anywhere copy and paste of whole notes was built and dropped on Chris's ruling (2026-11-08): copy and paste work only inside an open note.
