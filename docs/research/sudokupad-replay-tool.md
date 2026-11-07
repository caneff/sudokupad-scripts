# SudokuPad's replay tool: how it is turned on, its button, its key and how it plays

Ticket #313. Read from `tool-replay.js`, `framework.js` and `script.js` as the live test's recording holds them (SudokuPad 0.611.0). `live/replay-playback.live.mjs`
runs on the page: the setting, the `#control-replay` button, the tool key (`N`), buttons 1 and 2, and Play's end state. Read from the source and **not run**: buttons
3, 4, 6, 7 and 9, the pace between actions, the `--tool-text` readout, and that a tool past the seventh has no key. `docs/research/sudokupad-replay-files.md` (#98) covers replay *files* and the Replay Save/Load
dialog; this note covers the tool.

## Turned on

- The tool is off until the **Show Replay Tool** toggle in the settings dialog's Experimental group is on. Its setting name is `toolreplay`:
  `Framework.setSetting('toolreplay', true)`. The toggle is `Framework.makeToolToggler(ToolReplay)`, which calls `Framework.addTool(ToolReplay)` on
  and `Framework.removeTool` off.
- The pen tool has the same kind of toggle (`toolpen`, "Enable Pen Tool"). A test that wants the pen and replay tools sets both.

## Button

- `addTool` adds a tool button, `#control-replay`, titled Replay. Clicking it makes `replay` the current tool (`Framework.app.tool === 'replay'`).
- Like any button added after Start Puzzle, a click in the first moments can be dead until SudokuPad binds it, so the test clicks until the tool shows.

## Key

- A tool's key is **its place in `getToolNames()`**: `App.toolHotkeys = ['KeyZ','KeyX','KeyC','KeyV','KeyB','KeyN','KeyM']`, and
  `handleKeydown` picks `getToolNames().find((tool, idx) => isKey(toolHotkeys[idx], event))`. `getToolNames()` is the `tools` entries with
  `isTool`, in the order they were added. With the pen and replay tools on and no other, the order is normal, corner, centre, colour, pen, replay, so the
  replay tool is on `N` (Draw Tool leaves the list while a keydown is handled, `toolNamesFor`, so it takes no key and moves none: #298).
- A tool past the seventh has no key.

## Buttons inside the tool

The number pad's buttons are the tool's (`handleToolButton`, by `data-key`):

| key | does |
| --- | --- |
| 1 | `jumpTo(0)`, the start |
| 2 | `playPause(-1, 10)`: play to the end at speed 10, or pause when playing |
| 3 | `jumpTo(total)`, the end |
| 4 / 6 | back / forward 5 s |
| 7 / 9 | back / forward 30 s |

## How playback is driven

- `handleToolEnter` calls `getReplay()`: it decodes `Framework.app.getReplay()` into `tool.replay`, and sets `replayTotalTime` and
  `replayCurrentTime` to the **end**. So Play pressed on entering has nothing left to play; the start button (1) comes first.
- `play(playToTime, speed)` calls `Puzzle.replayPlay(replay, {speed, playFromTime, playToTime, onCompleted})`. `replayPlay` **resets the puzzle**
  (`resetPuzzle`, unless `skipRestart`) and plays the actions again from the first, so the board is rebuilt by the replay alone. Each action goes
  through `puzzle.act`, not `app.act`. With `speed` -1 it plays at once with rendering off (`jumpTo` and `loadReplay`); with a speed it waits
  `min(5000, step time) / speed` between actions.
- The tool's state is a class on `body`: `replay-playing` while it plays, `replay-paused` when `onCompleted` fires or after `jumpTo`/`pause`.
  `--tool-text` on the root holds the readout (`Time: … / …`, `Actions: n / total`).
- Because the replay resets the puzzle and plays only recorded actions, what is not an action is not rebuilt: **the Draw drawing** (saved
  by Draw Tool per puzzle, outside the replay) stays as it was, and **Color by Digit** colors only what an `app.act` entry colors, so playback
  adds nothing of its own.
