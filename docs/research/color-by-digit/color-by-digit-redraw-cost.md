# Color by Digit: what a redraw costs per event (#432)

Measured 2026-11-07 on a 9x9 (the live harness's puzzle, 51 empty cells) in headless Chromium, on `main` 2105b37 with color-by-digit 0.22.2
(before) and 0.22.3 (after). Taken by `color-by-digit-redraw-cost.mjs` in this folder, which prints every number below as JSON.

## How it was taken

`live/redraw-probe.mjs` wraps `MutationObserver`, `requestAnimationFrame` and `addEventListener` before the page loads. A callback
registered from the script (found by a `sourceURL` tag on the injected code) is timed with `performance.now()`. A native observer on
`document` counts every node added or removed, by the nearest ancestor with an id. One event is one entry, with two frames before and
after it, so the board's own redraw has settled. Headless Chromium clamps `performance.now()` to 0.1 ms, so a single call reads 0 or
0.1 ms; the totals over 51 events are the figures to trust.

"Handler ms" is the script's own callbacks (the board watcher's observer and its frame). "Act ms" is the whole `app.act` call, SudokuPad's
work included. `baseline` is no script; `off` is the script saved Off.

## Before (0.22.2)

| Scenario, 51 events | Handler ms per event | Worst event | `app.act` mean / max | Nodes added / removed per event |
|---|---|---|---|---|
| baseline: a digit in every empty cell | 0 | 0 | 0.79 / 1.4 ms | 40.9 / 37.5 |
| Off | 0.004 | 0.1 | 0.82 / 1.4 ms | 40.9 / 37.5 |
| Cell (the fill: each entry colors its cell) | 0.004 | 0.1 | 2.01 / 3.3 ms | 121.4 / 117.0 |
| Digit | 0.131 | 0.3 | 0.82 / 1.5 ms | 40.9 / 37.5 |
| Both | 0.139 | 0.3 | 2.06 / 3.2 ms | 121.4 / 117.0 |
| baseline: a conflicting corner mark in every empty cell | 0 | 0 | | 2.1 / 0.1 |
| Digit: the same marks | 0.482 | 1.2 | | 29.8 / 26.8 |

- Every handler is far under one frame (16 ms). The most one event spent in the script was 1.2 ms.
- In Cell and Both the extra 80 nodes per event are SudokuPad's own color layer and highlights, not the script's.
- The marks rows are the one place the script rebuilt nodes that had not changed. `syncCircles` replaced the whole circles group
  on each board change, so with k circles drawn an event removed k - 1 and added k. Over the 51 marks that was 2,775 circle nodes
  (up to 177 for one event) to draw 51 circles.
- SudokuPad's clock changes text every second, which also reached `syncCircles`: with 51 circles up, a quiet board rebuilt 51 every second.

## After (0.22.3)

`syncCircles` keeps each conflicting mark's circle (a `WeakMap` from the mark) and sets an attribute only when its value differs.

| Scenario, 51 events | Handler ms per event | Worst event | Nodes added / removed per event |
|---|---|---|---|
| Digit | 0.149 | 0.4 | 40.9 / 37.5 |
| Both | 0.131 | 0.4 | 121.4 / 117.0 |
| Digit: conflicting corner marks | 0.529 | 1.2 | 3.1 / 0.1 |

Circle nodes touched: 51 in total, one per event (was 2,775). The marks row's time is unchanged: it is the cost of measuring each mark's ink
(`getExtentOfChar`, `measureText`, `getCTM`), which still runs for every conflicting mark on each change. That is 0.5 ms with 51 circles, and
the ticket's bar is 16 ms, so it stays.

The test that fails if the circles go back to being rebuilt: `live/color-by-digit/color-by-digit-digits.live.mjs`, "a new conflicting mark
adds its own circle and keeps the circles already drawn, those nodes untouched".
