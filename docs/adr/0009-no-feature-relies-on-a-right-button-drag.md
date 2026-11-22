# No feature relies on a right-button drag

Status: accepted, 2026-11-07 (Chris, 2026-11-07)

No script feature depends on the right button being dragged. A right click is fine; a right-drag may only be an extra on top of one,
and the site teaches the right click.

Why (`docs/research/large-puzzle-ui-right-drag.md`, read from `feature-largepuzzle.js?v=0.611.0`): SudokuPad's experimental
setting Test Large Puzzle UI takes the right-button drag. With it on, its capture-phase `mousemove` handler pans the board when
`event.buttons === 2`, calls `preventDefault()` and `stopPropagation()`, so no script sees a right-drag's moves. The `mousedown` and
`mouseup` are not stopped, so a right click with no movement still reaches scripts.

Pen Tool Extras' pen erase and Text Anywhere's erase are each started by a right click; a drag past it is only an extra.
