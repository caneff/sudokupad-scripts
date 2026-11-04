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
  not move focus in play. A Tab with the entry dropped would move focus to the app menu button; the
  script keeps the entry and swaps its handler for one that only calls `preventDefault`. In a dialog Tab moved
  focus with the script off (live run), so the toggle does not act there and the swap leaves it alone.
- `Framework.getApp()` resolves after `tool-letter.js` has loaded, so `ToolLetter` exists by then at
  each of the three injection times.

`no-tab-letters.user.js` sets `ToolLetter.tool.keyHandlers` to the list with the Tab entry's handler
replaced by one that only calls `preventDefault`.

## Holding Alt for letters is SudokuPad's own setting (read 2026-11-04 from `tool-letter.js`; not run)

- The setting `toolletter_mode`, shown as "Letter Tool Hotkey" in the `advanced` settings group, defaults to `altletter`,
  "1. ALT for letters (SHIFT for corner marks)". In that mode, `canTempSwitch` makes holding Alt switch to letters for as
  long as it's held. A temporary switch isn't saved.
- Only `altletter` switches on Alt. `shiftletter` switches on Shift. `althotkey`, `shifthotkey` and `nohotkey` ("5. Toggle
  ("/") for letters") don't switch on either.
- `handleKey` gates letter entry only for `althotkey` and `shifthotkey`, so `nohotkey` enters letters the same way as
  `altletter` once letter mode is on.
- The setting also moves the corner mark modifier (`getAltShift`): Shift in `altletter` and `althotkey`, Alt in `shiftletter`
  and `shifthotkey`, and either in `nohotkey`. So in `nohotkey`, holding Alt gives temporary corner marks.
