# Script code that CSS could replace (2026-11-07)

Asked by Chris after the bottom-row switch (#376). Read of every `*.user.js` (no-tab-letters skipped); candidate 1's
premise checked in a browser: SudokuPad's `.controls-tool` is `display: grid`, so `order` applies.

| # | Where | Now | CSS | Verdict |
|---|---|---|---|---|
| 1 | draw-tool `keepButtonLast` | MutationObserver on `.controls-tool` re-appends the Draw button whenever another tool button lands after it | `.controls-tool #control-draw { order: 1 }` | Win: drops an observer and its reorder race. Done (#380) |
| 2 | pen-tool-extras dialog `showRows` | Slider rows hidden by inline `display:none`, recomputed from the draft | `:has(input[data-box=...]:checked)` selectors | Small win: less code |
| 3 | color-by-digit and pen-tool-extras, class stamped on SudokuPad's `.dialog` after open | Script adds a class so styles can target the dialog | `.dialog:has(#<editor id>)` | Small win: no unstyled first frame |
| 4 | dark-page `updateRect` | Measured rectangle round board and text, body-wide observer | `body:has(#svgrenderer)` page color, `#svgrenderer { background-color: var(--body-bg) }` | Win: drops the observer, the measuring and the resize listeners. Done (#444); the white is the whole board box, 12-20 px wider past outside clues on a 6x6 |
| 5 | auto-rules-resizer `place` | Font bar and corners placed by measurement, clamped to the window | none without losing the clamp | Needs JS |

Also needs JS: auto-rules-resizer `fitPage` (largest font that fits), color-by-digit `openMenu` (viewport clamp; CSS
anchor positioning would be a bet), color-by-digit conflict circles (computed geometry), draw-tool `markColor` (state
lives in the script), draw-tool text input overlay (measured per item).
