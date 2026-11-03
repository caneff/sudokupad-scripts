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
enables the tool but does not set the saved mode. Only No Tab Letters mentions letters.

## How the Tab binding is registered

Read 2026-11-03 from `tool-letter.js` and `script.js` of v0.611.0, and run live.

- `ToolLetter` is a top-level `const` of `tool-letter.js`, so a userscript reaches it by its bare
  name (not `window.ToolLetter`). Its `tool` is one object, made when the file loads.
- `P.keyHandlers` is an array on the tool's prototype, `{ key, handler }` entries: `/` and `Tab`
  both with `handleToggleKey`, then a catch-all (`key: () => true`) that types letters.
- `script.js` `App.handleToolKeyHandlers` reads `tool.keyHandlers` of every tool in `app.tools` at
  each keydown, so a list set on the tool object takes effect at once.
- The "Enable Letter Tool" setting calls `Framework.makeToolToggler(ToolLetter)`, which adds and
  removes that same `ToolLetter.tool` object. A list set on it holds across switching the tool off
  and on, and across a reload of the setting.
- `handleToggleKey` calls `preventDefault` on the keydown, which is why a Tab that toggles also does
  not move focus. With the Tab entry gone, nothing in the letter tool touches a Tab keydown.
- `Framework.getApp()` resolves after `tool-letter.js` has loaded, so `ToolLetter` exists by then at
  each of the three injection times.

`no-tab-letters.user.js` sets `ToolLetter.tool.keyHandlers` to the list without the Tab entry.
