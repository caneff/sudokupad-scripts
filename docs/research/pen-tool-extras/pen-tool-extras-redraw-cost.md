# Pen Tool Extras: what a pen drag costs (#432)

Measured 2026-11-07 on a 9x9 (the live harness's puzzle) in headless Chromium, on `main` 2105b37 with pen-tool-extras 1.27.3. Nothing in
the script was changed: nothing measured slow. Taken by `pen-tool-extras-redraw-cost.mjs` in this folder, which prints every number below as JSON.

## How it was taken

Same probe as `docs/research/color-by-digit/color-by-digit-redraw-cost.md` (`live/redraw-probe.mjs`): the script's `MutationObserver`,
`requestAnimationFrame` and event-listener callbacks are timed, and a native observer counts nodes added and removed. A snake of 400 real
mouse moves with the pen button down covers all nine rows of the board (62 `renderPen` calls, 59 strokes). `renderPen` is also timed
from outside, around whatever the script wrapped. The baseline is the same drag with no script. Page 3 (arrow lines) exists only with
the script, so it is compared with the baseline's page 1. `performance.now()` is clamped to 0.1 ms in headless Chromium, so totals count.

## Numbers (400 moves)

| Drag | Script handler ms per move | Worst call | `renderPen` per call / max | Nodes added / removed per move |
|---|---|---|---|---|
| baseline, pen 1 | 0 | 0 | 0.015 / 0.2 ms | 0.38 / 0.24 |
| Pen Tool Extras, page 1 pen 1 | 0.019 | 0.1 | 0.013 / 0.2 ms | 0.54 / 0.39 |
| Pen Tool Extras, page 3 arrow line | 0.018 | 0.1 | 0.026 / 0.3 ms | 0.85 / 0.39 |

Where the script's time goes over a whole drag (page 1): `pointermove` 401 calls, 2.4 ms; `mousemove` 401 calls, 2.5 ms; the
`watchControls` observer 31 calls, 2.7 ms. Each call is at most 0.1 ms.

## Nodes the script touches

- Each new stroke comes with one `g` removed and added in `#cell-pen`: `keepMarksAbove` moves the marks layer back to be the last child.
  It is one node moved, not rebuilt, and the cell's strokes are untouched. That is the 0.15 nodes per move above the baseline.
- Page 3 draws two paths (the line and its arrows) in a group per stroke, which is the arrow line's own shape.
- `#pen-tool-extras-hint` takes the 375 attribute changes of the drag hint that SudokuPad made on the same element before; the script only reparents it.
- `redrawCells`, which does re-render cells, runs on startup and on a settings change, never per event.

Not measured: the middle-click and right-click erase, which a drag with the right button feeds
(`docs/research/large-puzzle-ui-right-drag.md`: no feature relies on a right-drag).

## Result

Every handler is under 0.1 ms a call, and no event rebuilds a node that did not change. No code changed.
