# SudokuPad's pen line mode: what it does to a drag

Probed 2026-11-06 on sudokupad.app in headless Chromium, with the script injected (real mouse drags, one per case, on
untouched cells).

The mode does not refuse a drag. It decides where the ends snap, so every drag stores a line, and the mode picks which
kind:

| Mode (`ToolPen.tool.lineMode`) | A drag over cell middles stores | A drag along cell edges / over corners stores |
|---|---|---|
| `both` | a center line (`1`, `2`, `d`, `e`) | an edge line (`7`, `8`, `9`, `a`, `f`, `g`) |
| `centeronly` | a center line | a center line (snapped to the middles) |
| `edgeonly` | an edge line (snapped to the corners) | an edge line |

The values are the `LINE_PATHS` keys in `pen-tool-extras.user.js`. A drag from an edge midpoint to another edge midpoint
stored nothing in any mode. `live/pen-tool-extras/pen-tool-extras-panel.live.mjs` checks the table through the line mode button.

SudokuPad cancels the touch events on its panel buttons, so a tap gives no `click` (see `color-by-digit-profiles-notes.md`).
The line mode button therefore steps the mode at `touchstart` as well as at `click`.
