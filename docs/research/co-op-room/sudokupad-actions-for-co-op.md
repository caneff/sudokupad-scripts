# How SudokuPad applies an action, and what a remote action would break

Ticket #1160, for the co-op room map (#1159). Question: how does SudokuPad record and apply one action, and can an action that
arrived from another person be applied locally without breaking the local Undo and Redo, the replay, the timer or saved
progress?

**Everything here was read, nothing was run.** Source: SudokuPad **0.616.0** as the live harness recorded it
(`~/.cache/sudokupad-scripts/live/sudokupad.har`): `script.js` (classes `Puzzle`, `App`, `Replay`, `Timer`, `Cell`),
`app-settings.js`, `tool-pen.js`, `feature-streamtool.js`, `feature-solvedcounter.js`. Each claim names its file and function.
The earlier notes this builds on: `docs/research/sudokupad-replay-files.md` (replay files, run), `docs/research/sudokupad-replay-tool.md`
(the replay tool) and `docs/research/sudokupad-custom-tool.md` (Undo after Restart, the `act` event).

## The answer

1. An action is a short string such as `sl:r1c1r1c2`, `vl:5` or `pm:3`. Digits, marks, colors and pen act on **whatever cells
   are selected**: the action carries no cell. Selecting is itself an action.
2. `Puzzle.act` runs the action, and when it changed something, appends it to the replay (which is also the saved progress) and
   pushes it on the one undo stack, then fires `act`. Undo pops the stack and **rebuilds the grid** by re-running the stack
   from the last checkpoint.
3. A remote action applied through `act` works for the replay, saved progress, the timer and the solved check, but it lands
   on the local undo stack: local Undo then undoes **whoever acted last**, and every remote change clears the local Redo.
   Sent raw, it also moves the local selection to the other person's.
4. A remote change applied outside `act` (`Puzzle.exec` or `Cell.propSet`) is wiped by the next local Undo and is missing
   after a reload.
5. SudokuPad already relays actions: the experimental **Streaming Tools** setting's CloneView (`feature-streamtool.js`) sends
   each `act` string from one host to viewers over a WebSocket and applies it with `app.act`. It has one writer, so none of
   the problems above come up for it.

## An action and its string

- **Object form**: `{type, arg, time}`. `Puzzle.parseAction` turns a string into one; `Puzzle.actionToString` turns one back.
  `type` is a long name (`value`), `arg` a string, a list of `Cell`s (select and deselect) or a tool name (clear).
- **String form** (`Puzzle.actionToString`): `short[:arg][/dt]`. `short` comes from `Puzzle.ActionLongToShort`. A select or
  deselect `arg` is the cells' `r?c?` joined with nothing between (`sl:r1c1r1c2`, `Puzzle.cellsToString`). A clear's `arg` is
  the tool's index in `Puzzle.Tools` (`['normal','corner','centre','colour','pen']`), so `cl:0` clears digits. `dt` is the time
  since the previous logged action in 50 ms units (`Puzzle.logTimeResolutionMs`), added only in the replay
  (`Puzzle.logReplayAct`); the undo stack holds the string without it.
- **The replay** (`Puzzle.replayStack`) is the list of those strings. `Replay.encode` saves it as JSON
  `{puzzleId, type: 'clzw', rows, cols, version, data}`. `data` is the list compressed by `Replay.replayA2C`: each type
  becomes one letter (its index in `Replay.actA`) and each cell a hex cell number, then the result is LZ-compressed
  (`loadFPuzzle.compressPuzzle`). `Replay.decode` reverses it, with an older letter order for versions 0.78.0 to 0.81.2.

### Every action type

From `Puzzle.ActionLongToShort` and `Puzzle.exec`:

| short | long | `Puzzle.exec` does | counted as a selection |
| --- | --- | --- | --- |
| `sl` (`hl` is an old alias) | `select` / `highlight` | adds cells to `selectedCells` | yes |
| `ds` | `deselect` | removes the cells, or all with no arg; reports a change only if a cell was selected | yes |
| `vl` | `value` | `toggleGroup(selected, 'normal', arg)` | no |
| `pm` | `pencilmarks` | the same on `corner` | no |
| `cd` | `candidates` | the same on `centre` | no |
| `co` | `colour` | the same on `colour` | no |
| `pe` | `pen` | the same on `pen` | no |
| `pc` | `pencolor` | `tools.pen.setStateColor(arg)`, the pen color later `pe` values use | no |
| `cl` | `clear` | `clearCells`: clears the highest prop present in the selection, in the tool's order (`findHighestCellProp`) | no |
| `ud` / `rd` | `undo` / `redo` | handled in `Puzzle.act`, not `exec` | no |
| `gs` / `ge` | `groupstart` / `groupend` | sets `inGroup`; Undo treats the span as one step | no |
| `up` | `unpause` | nothing; logged by `App.handleTimerUnpause`, read by `Puzzle.replayLength` | yes |
| `wt` | `wait` | nothing; logged by `App.insertWait` (Restart "Keep Time") | no |

Selection is `Puzzle.reIsSelection` = `sl|ds|hl|select|deselect|highlight|up|unpause`. Any other type reaches
`exec`'s default, logs `Puzzle.act: unkown action type` and changes nothing, so a script cannot add its own action type.

**Toggle, not set.** `Puzzle.toggleGroup` sets the value in every selected cell unless *all* of them already hold it, in
which case it removes it from all. `vl:5` therefore means "toggle 5 here", and its effect depends on the grid it lands on.
`cl` depends on what the cells hold too.

## What `Puzzle.act` does, step by step

`Puzzle.act(action)` in `script.js`:

1. `parseAction` then `actionToString`. A parse error logs and returns, with no event.
2. **`undo`**: `execUndo()`; if it undid something, `logReplayAct('ud')`. **`redo`**: `execRedo()`, then `logReplayAct('rd')`.
   Neither string goes on the undo stack.
3. **Anything else**: `exec(action)`. Only if `exec` reports a change:
   - `logReplayAct(act)`: append `act/dt` to `replayStack` and set `lastActTime`; for a non-selection action, `saveProgress()`.
   - Redo stack: a selection while the redo stack is not empty only counts up `undoSelection` (so selecting does not lose Redo);
     any other action **empties the redo stack**.
   - `logUndoAct(act)`: push on `undoStack`; outside a group, when the stack reaches the next multiple of
     `Puzzle.ActionsPerState` (100) push a checkpoint on `stateStack` (`createState`).
4. `this.trigger('act', act, action)`, **always**, also when `exec` changed nothing.

`App.act(action)` wraps it: when errors are shown it clears them (`Puzzle.clearErrors`) and returns early for an Undo after a
non-conflict check; then it calls `puzzle.act` and fires the app's own `act` event with `action`. Keys, buttons and tools use
`App.act`; **selection does not**: `App.select` and `App.deselect` call `Puzzle.select`/`Puzzle.deselect`, which call
`Puzzle.act` directly (and `Puzzle.select` acts only for cells not already selected).

**Groups.** The pen tool sends each stroke as `gs, ds, [pc], sl, pe…, ds, ge` (`ToolPen.actSend`, the `sl`/`pe` pairs from
`actAdd`), so a pen stroke clears the selection. Restart (`App.restartPuzzle`) is one group of selects, clears and deselects.
Color by Digit uses the same pattern from a script (`inOneUndoStep` and `runColorOps` in `color-by-digit.user.js`: save the
selection, deselect, select the target cells, act, then restore the selection).

### Checkpoints

`Puzzle.createState` holds `{id, time, actions: undoStack.length, cells}`, where each cell is `Cell.serialize` over
`Cell.StateKeys` = value, centre, corner, colour, **`hl` (selected)** and pen; tools add their own (`handleCreatestate`; the
pen tool adds its `pencolor`). Checkpoints live only in memory: `App.getReplay` leaves them out (the line that would add them is
commented out), so a reload rebuilds from the replay alone.

### Undo and Redo

`Puzzle.execUndo`:

1. Pop from `undoStack` onto `redoStack` while inside a group or while the popped action is a selection, so one Undo takes a
   whole group plus the selections before it. A `ds` popped first stops at once ("undo most recent deselect separately").
2. `clearPuzzle()`: clear the selection, every cell's entered values and the errors.
3. Drop checkpoints newer than the shortened stack, apply the latest remaining one (`applyState`), then **re-run every
   action after it** with `exec`, and render.

So Undo is a rebuild of the grid from the undo stack. Anything on the grid that is not on the stack (or in a checkpoint)
disappears on Undo. With an empty stack after a Restart, it restores the progress saved before the Restart
(`preRestartSavedProgress`; `docs/research/sudokupad-custom-tool.md` has that case). `execRedo` pops from `redoStack`, `exec`s
and re-pushes with `logUndoAct`, again through groups and selections; it does not clear the grid first.

The replay is never shortened by Undo: it holds `ud` and `rd` as entries, and replaying re-runs them. `Puzzle.resetPuzzle`
(Restart, `replayPlay` without `skipRestart`) empties the replay, both stacks and the checkpoints, and sets the timer's start
to now.

### Saved progress

`Puzzle.saveProgress` does nothing while `replayPlaying`; otherwise it calls a throttle (1 s, 10 s) of `handleSaveProgress`,
which writes `localStorage['progress_<puzzleId>']` = `getProgress()` = `{puzzleId, time, replay, shortid?}` when the replay has
more than one action, removes it otherwise, and fires `progresssaved`. `Puzzle.loadProgress` decodes it, trims trailing
`up`/`sl`/`ds` (`Replay.fixReplay`), plays it at speed -1 (`App.loadReplay` → `Puzzle.replayPlay`, which re-runs every action
through `Puzzle.act`), then sets the timer to `Puzzle.replayLength`. **Saved progress is the replay**: what is not in
`replayStack` does not survive a reload.

### Timer

No action starts or stops the timer. `Timer` measures wall time from `startTime`. It stops when the page is hidden
(`App.handleVisibilityChange`), while the settings dialog is open (`framework.js`, the settings dialog), on a solve and on the
pause dialog; `Timer.resume` fires `unpause`, and `App.handleTimerUnpause` logs `up:<duration>` into the replay only, which
`Puzzle.replayLength` subtracts. The replay's `dt` values are local wall time between this page's logged actions, whoever made
them. `App.loadReplay` on its own leaves the timer counting from the load (its `resetPuzzle` calls `setStartTime()`); only
`loadProgress` puts the elapsed time back.

### Solved check

"Check on Finish" (`autocheck`, on by default) is `handlToggleAutoCheck` in `app-settings.js`: a `puzzle.on('act')` handler that
skips while a replay plays, looks only at `value`, `clear`, `undo` and `redo`, and when `isCompleted()` turns true stops the
timer and shows `App.showPuzzleNoErrorsDialog`, which fires `dialognoerrors`; `feature-solvedcounter.js` counts the solve on that
event (`handleDialogSolved`). The conflict checker also runs on `puzzle.on('act')`.

## Hooks a script can listen to

- **`Framework.app.puzzle.on('act', (act, action) => …)`**: after every `Puzzle.act`, selection, Undo and Redo included, also
  when nothing changed, and during replay playback (check `puzzle.replayPlaying`). Seven scripts in this repo already listen to it
  (`grep "puzzle.on('act'" *.user.js`). `act` is the string without `dt`. It cannot tell who made the action: a relay that applies a remote action
  must set its own flag, or turn its handler off around the call as CloneView does.
- `Framework.app.on('act', action => …)`: only actions sent through `App.act`, so no selection.
- Others on `puzzle`: `reset`, `start`, `loaded`, `progressloaded`, `progresssaved`, `replaystep`, `replaydone`; on `app`:
  `restarted`, `dialognoerrors`. `PortableEvents` gives each an `off` and an `await`.

## SudokuPad's own relay: CloneView

`feature-streamtool.js` (`FeatureStreamTool`), behind the Experimental **Streaming Tools** toggle and only on `sudokucon/`
puzzle ids (`attachElem`), opens a WebSocket to the page's own origin (`getWsUrl`). A page with a `hostkey` query parameter is the
host: `handleHostAct`, on `puzzle.on('act')`, sends `{cmd: 'act', seq, act}` for every action, selection included, except
while a replay plays; mouse moves go as `pointer` messages and draw a named, colored pointer (`createHostPointer`). A guest applies
each with `app.act(msg.act)` (`handleMsgAct`). A guest that falls behind gets a `sync`: the whole replay through
`app.loadReplay(..., {speed: -1})` and then any missing acts through `puzzle.act` (`unthrottledHandleMsgSync`). The host ignores a
message with a lower `seq` and answers with a sync. It is one-writer mirroring: the guest's stacks become copies of the host's, so
its Undo, selection and replay are the host's.

## Applying a remote action through `act`

What happens when a script calls `app.act` (or `puzzle.act`) for another person's action:

- **The selection.** The action needs the remote person's cells selected. Applied raw, the remote `sl`/`ds` replace the local
  person's selection mid-solve. The Color by Digit pattern avoids that: wrap each remote change as
  `gs, ds, sl:<remote cells>, <action>, ds, sl:<local cells>, ge`. Those selection steps go into the replay and the undo stack too,
  and a pen stroke already ends in `ds`.
- **The undo stack.** It lands there (`logUndoAct`). The next local Undo undoes the most recent step, which may be the other
  person's; inside `gs`/`ge` it undoes the whole remote change in one step. Every remote non-selection action empties the local
  redo stack, so Redo stops working whenever someone else acts. A relayed `ud` or `rd` string is meaningless: it undoes the top
  of the *receiver's* stack, which is not the sender's.
- **The replay and saved progress.** Both take it, with the local `dt`: the replay becomes the merged history in arrival order,
  and a reload restores the shared grid. Playing that replay later shows everyone's moves.
- **The timer.** Unaffected (no action touches it).
- **The solved check.** A remote final digit fires the local solve dialog and the solve counter on every page.
- **Errors.** `App.act` clears shown errors; `Puzzle.act` does not.
- **Toggles diverge.** A remote `vl:5` toggles against the local grid. If both people type 5 in the same cell at about the same
  time, each page receives the other's toggle and removes the 5. `cl` clears whatever the local cells hold. A relay should send
  the resulting state of each changed cell and act only where the local cell differs, as Color by Digit's `colorSteps` only ever
  adds a key to cells that all lack it.
- **Pen color is page state.** `Cell.togglePen` takes the pen tool's `stateColor` when the value has no color character, and a
  remote `pc` changes the local `stateColor` (also what the local pen tool compares against in `actSend`). Sending the color in
  the value (`pe:<value><color>`, the two-character form Pen Tool Extras sends, `docs/research/sudokupad-replay-files.md`) avoids `pc`.
- **Other scripts.** Every `puzzle.on('act')` listener (Text Anywhere's Undo follower, Color by Digit, the conflict checker) sees
  remote actions as local ones.

## Applying remote changes outside the undo stack

- **`Puzzle.exec(action)` or `Cell.propSet`/`propUnset`** change the grid and render (`Cell.propSet` ends in `renderContent`)
  with no replay entry, no undo entry, no save and no `act` event. But the next local Undo rebuilds the grid from the undo stack
  (`execUndo`) and the remote change is gone, unless a checkpoint taken after it holds it, which is worse: then it survives some
  Undos and not others. A reload loses it, since saved progress is the replay. A script would have to keep its own record of
  remote changes and re-apply it after every Undo, Redo, `reset` and `progressloaded`, and save it itself, the way Text Anywhere
  keeps its notes off SudokuPad's stacks.
- **`Puzzle.replayPlay(remoteActs, {speed: -1, skipRestart: true})`** runs the actions through `Puzzle.act` without resetting,
  with `replayPlaying` set, so no progress save, no autocheck and no CloneView echo fire while it runs (each listener checks the
  flag). It is still on the undo stack and in the replay; it only quietens the side effects.
- **Rebuild from a shared log**: keep one ordered log for the room and replay it whole on each change (CloneView's `sync`). The
  undo stack becomes the shared history, the local selection becomes whatever the log leaves, and the timer restarts unless
  set back as `loadProgress` does. It costs a full replay per change.
- **A per-person Undo** does not exist in SudokuPad: there is one stack. A script that wants "my Undo undoes my last change"
  must catch Undo itself and apply the inverse of the person's own last change as a new forward action.

## Undo against another person's later action on the same cell

With all actions on one stack (applied through `act`), Undo takes the newest step, so it undoes the other person's later action,
not one's own. If a script instead removed one's own earlier step from the middle of `undoStack` and rebuilt, every later action
would be re-run against a different grid and, being a toggle, could mean the opposite: A puts corner 3 in r1c1, B toggles corner
3 there (removing it); drop A's step and B's re-run *adds* the 3. A `vl` re-run replaces the digit (`setValue`), so the later
digit stays. With remote changes kept off the stack, Undo erases them (above). In each case the outcome is decided by
`execUndo`'s rebuild, never by who made the action.

## Not determined

- **Nothing was run.** Every claim is read from 0.616.0's source. The worktree had no installed dependencies, so no live check
  was made; the prototype ticket should confirm at least: a wrapped remote group and one local Undo, a remote `exec` wiped by
  Undo, and the double-toggle race.
- CloneView's server: what it relays, who may connect, whether a script on a non-`sudokucon/` puzzle could use it. Only the
  client is in the recording.
- `execUndo` calls `disableRendering` and ends in `renderCells`; where rendering is turned back on was not traced.
- Fog puzzles (`feature-fog.js` listens on `act`) and the other features with `act` listeners (`feature-puzzleevents.js`,
  `feature-gridrules.js`, `feature-marksolveddigits.js`, `tool-calculator.js`) were not read for how they treat actions they did not
  expect.
- How fast a full replay rebuild is on a long solve.
- Whether the action strings stay stable across SudokuPad versions beyond the one shim in `Replay.decode`.
