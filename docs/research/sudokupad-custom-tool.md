# A custom tool in SudokuPad: Draw Tool's findings (#269)

SudokuPad v0.611.0, `framework.js`, `script.js` and `tool-pen.js`, read from the live recording, and run on the page in
`live/draw-tool.live.mjs` (2026-11-06).

## Registering

- `Framework.addTool({button, tool})` adds the button to `.controls-tool` (id `control-<name>`), calls
  `app.addTool(tool)` and `refreshControls()`. A tool needs `name` and `isTool: true`; `changeTool` then puts
  `tool-<name>` on `.controls-main`.
- A saved current tool (`Framework.getData('tool')`) that names a tool not yet added falls back to the first tool at
  startup, so a reload with Draw current starts on Digit.

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

## Saving the drawing (#270)

Read in `script.js`, `framework.js` and `portableevents.js` of v0.611.0, and run in `live/draw-tool-saved.live.mjs`
(2026-11-06).

- **Restart**: `App.restartPuzzle` ends with `this.trigger('restarted')`, after `Puzzle.restartPuzzle`, whichever of the
  confirm dialog's Restart and Keep Time was picked, and whether or not anything was entered. Draw Tool listens with
  `app.on('restarted', …)` (the app mixes in `PortableEvents`). The confirm dialog runs first, so the script asks
  nothing itself. Checked live through the dialog's Restart button.
- **Loading a puzzle**: `Puzzle.createPuzzle` calls `svgRenderer.clearAllLayers()`, which removes every child of the
  board SVG that is not one of SudokuPad's layers, Draw Tool's layer included. `Puzzle.loadPuzzle` then triggers
  `loaded` on the puzzle, before the saved progress loads. Draw Tool redraws from storage on `puzzle.on('loaded', …)`,
  and at its own startup when `app.puzzle.currentPuzzle` is already set. Restart triggers `start` but not `loaded`.
- **The key**: `app.puzzle.puzzleId` is undefined for the live suite's `scl…` URL puzzle. `convertPuzzle` sets it only
  from a puzzle's `id`, and `loadRemoteCTCPuzzle` from the id it fetched by, so such a puzzle is keyed by the page URL.
- **`Framework.getData`** runs `JSON.parse` and on a parse error hands back the raw text, so a broken entry reads as a
  string, never as an error. Draw Tool reads anything but a list of strokes as unreadable.
- **The replay**: drawing acts nothing, so `getReplay()` is the same before and after a stroke. Checked live.
