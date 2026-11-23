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
- The wheel zooms the board under this setting. Read from `feature-largepuzzle.js?v=0.616.0` (2026-11-23):
  - `attachElem` adds `handleWheel` on `#board` in the capture phase; it is the only wheel listener the feature adds.
  - `handleWheel` returns early when `baseScale >= C.MaxBaseScale` (the puzzle already fits), else zooms by
    `-Math.sign(event.deltaY)` about the pointer. It reads no modifier key and not `isTrusted`, and does not call `preventDefault`.
  - So Shift+wheel does not zoom on its own: Chrome on Windows turns a Shift+wheel into a sideways scroll (`deltaY` 0,
    `deltaX` set), and `Math.sign(0)` is no zoom. A script that wants zoom on Shift+wheel stops the event in a `window`
    capture listener (which runs before `#board`'s) and dispatches its own `WheelEvent` on `#board` with `deltaY` set.
  - `detachElem` calls `addHandler` for the wheel where it means `remHandler`, so turning the setting off leaves
    `handleWheel` attached; it still zooms only while `baseScale < C.MaxBaseScale`.
  - Zoom has room only while the board is drawn smaller than natural size: `maxZoomLevel` is `max(1, 2 - baseScale)`, so at a `baseScale`
    of 1 or more a wheel does nothing. In the live harness the 1200x900 window gives 1.103 and an 800x520 one gives 0.735, where a wheel
    notch raises `Framework.features.largepuzzle.zoomLevel` by about 0.22. Its `reset()` sets `baseScale` to 1, which ends the room to zoom.
  - UI Tweaks' wheel option (#1153) is checked live with these (`live/ui-tweaks/ui-tweaks-wheel.live.mjs`, 2026-11-23): a plain wheel over
    the board never zooms, and Shift+wheel does, through the dispatched `WheelEvent`.

Consequence (Chris, 2026-11-07): no feature may rely on a right-button drag. A right click is still usable.
