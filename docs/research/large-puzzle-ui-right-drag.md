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
  - `handleWheel` zooms by `-Math.sign(event.deltaY)` about the pointer. It reads no modifier key and not `isTrusted`, and does
    not call `preventDefault`. Its early return on `baseScale >= C.MaxBaseScale` never fires: `C.MaxBaseScale = 9999` (the
    line `C.MaxBaseScale = 0.8` is commented out). What limits zoom is `maxZoomLevel = Math.max(1, 2 - baseScale)`, where
    `baseScale` is the board's own CSS scale (`handleResize`): a puzzle drawn at full size or larger (`baseScale >= 1`) has a
    maximum zoom of 1, so the wheel does nothing visible; only a puzzle scaled down to fit zooms.
  - The right-button pan has the same dead guard (`handleStartPanCapture`) and no clamp, so a right-drag pans the board on
    every puzzle, one that fits included, even at zoom 1. The zoom state is on `Framework.features.largepuzzle` (`zoomLevel`,
    `baseScale`, `panPos`).
  - So Shift+wheel does not zoom on its own: Chrome on Windows turns a Shift+wheel into a sideways scroll (`deltaY` 0,
    `deltaX` set), and `Math.sign(0)` is no zoom. A script that wants zoom on Shift+wheel stops the event in a `window`
    capture listener (which runs before `#board`'s) and dispatches its own `WheelEvent` on `#board` with `deltaY` set.
  - `detachElem` calls `addHandler` for the wheel where it means `remHandler`, so turning the setting off leaves
    `handleWheel` attached.
  - Zoom has room only while the board is drawn smaller than natural size: `maxZoomLevel` is `max(1, 2 - baseScale)`, so at a `baseScale`
    of 1 or more a wheel does nothing. In the live harness the 1200x900 window gives 1.103 and an 800x520 one gives 0.735, where a wheel
    notch raises `Framework.features.largepuzzle.zoomLevel` by about 0.22. Its `reset()` sets `baseScale` to 1, which ends the room to zoom.
  - UI Tweaks' wheel option (#1153) is checked live with these (`live/ui-tweaks/ui-tweaks-wheel.live.mjs`, 2026-11-23): a plain wheel over
    the board never zooms, and Shift+wheel does, through the dispatched `WheelEvent`.

Consequence (Chris, 2026-11-07): no feature may rely on a right-button drag. A right click is still usable.

UI Tweaks' "Right-drag pans only when zoomed in" (#1154, on by default) wraps the feature's own `handleMousemove` and `handleZoomInOut`
(own properties, bound by `bindHandlers`, which `addHandler` and `remHandler` read off `this` at each pan, so a wrapper put there before a pan
starts is the one both see). The first returns at `zoomLevel <= 1`; the second sets `panPos` to `[0, 0]` after a zoom that ends at 1. Nothing
stops `mousedown`, `mouseup` or `contextmenu`, so a right click still reaches scripts. The feature's own `handleMousemove` is what stops every
right-button move (`preventDefault`, `stopPropagation`), so with the option on, at zoom 1 a right-drag's moves reach the page and every script;
the earlier bullet's "no script sees a right-drag's moves" holds only while zoomed in or with the option off. The option turned on at zoom 1 also puts a board
panned with it off back at the centre. `panPos` exists only after the setting has been turned
on once (`reset()` sets it), so a script cannot probe it at startup.

## It loads after `Framework.getApp` resolves (2026-11-26, #1179)

`feature-largepuzzle.js` is a separate file, so on a slow load `Framework.features.largepuzzle` is not there when `getApp`
resolves. The nightly Tampermonkey test caught UI Tweaks skipping its right drag limit once for it. The shared guard's `start`
waits a bounded time (`LATE_WAIT_MS` in `lib/sudokupad.js`) for the internals of a feature declared `late: true` before it probes.
