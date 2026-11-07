# SudokuPad's "Test Large Puzzle UI" takes the right-button drag (2026-11-07)

Read from `feature-largepuzzle.js?v=0.611.0` on sudokupad.app.

- It is an experimental setting: `Framework.addSetting({ group: 'experimental', name: 'largepuzzle', content: 'Test Large Puzzle UI' })`.
- When on, a `mousedown`/`touchstart` on the board (capture phase) adds window capture handlers for `mousemove`/`touchmove`,
  `mouseup`/`touchend` and `contextmenu`.
- Its `mousemove` handler returns early unless `event.buttons === 2`; with the right button held it calls
  `preventDefault()` and `stopPropagation()` and pans the board. So **no script sees a right-drag's moves**: a right-drag
  pans, it never reaches Draw Tool's or Pen Tool Extras' erase.
- The `mousedown` and `mouseup` themselves are not stopped, so a right **click** with no movement still reaches scripts.
  Its `contextmenu` handler only calls `preventDefault()`.
- The wheel zooms the board under this setting.

Consequence (Chris, 2026-11-07): no feature may rely on a right-button drag. A right click is still usable.
