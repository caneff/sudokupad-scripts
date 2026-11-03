# SudokuPad's letter mode stays on between puzzles

Read 2026-11-03 from SudokuPad's served `tool-letter.js` and run on `/blank` in headless
Chromium. Not read from a real player's browser.

- The setting `toolletter` ("Enable Letter Tool") adds a toggle button before the delete button
  (`button[data-control="toggleletter"]`, title `/`).
- `setLetterMode` saves the mode with `Framework.setData('ToolLetter_letterMode', letterMode)`,
  which lands in `localStorage` as `svencodes_ToolLetter_letterMode`. A temporary switch from a
  held hotkey is not saved.
- `ToolLetter.keyHandlers` binds both `/` and `Tab` to the same toggle, so a stray Tab turns the
  mode on and saves it, and it is still on after a refresh (Chris hit this in play; read from
  source, the Tab press itself not run here).
- `ToolLetter.init` reads that key back, so the mode applies to every puzzle in that browser
  profile. It is not stored per puzzle.

Run live, with the tool enabled, reopening `/blank` after each step:

| Step | Saved | Number pad after reopening |
| --- | --- | --- |
| Tool on, toggle untouched | `null` | `1234567890` |
| Toggle clicked once | `true` | `ABCDEFGHIO` |
| Toggle clicked again | `false` | `1234567890` |

The Project 9x9 profiles `project9x9-8` and `project9x9-8r` also turn `toolletter` on, which
enables the tool but does not set the saved mode. No script in this repo mentions letters.
