# SudokuPad theme colors

Read from sudokupad.app source at v0.611.0 on 2026-11-03: `sudokupad-colors.css`,
`style.css`, `feature-uitheme.js`. Nothing here was run on the page.

- `sudokupad-colors.css` holds the theme as CSS variables on `:root`: `--body-bg`,
  `--color-white`, `--color-black`, `--button-bg`, the `--controls-button-*` set and the
  `--puzzle-*` digit colors.
- Built-in dark mode is `.setting-darkmode`, which overrides those variables and adds
  rules of its own. It special-cases black and white kropki dots by their `fill` value,
  because a puzzle's elements carry their own colors.
- `feature-uitheme.js` is the accent color setting: `.setting-uitheme-<name>` sets
  `--main-color` and `--controls-button-bg`.
- Variables will not reach everything: `style.css` has 25 lines using `var(--` and 128
  lines with a literal color. Which of those a theme would show was not checked.
- Digit Color's defaults were chosen for a white grid. Several, such as digit 7's
  `#3d2bb8`, would be hard to read on a dark one.

Search for an existing script: one Exa search (five results). None is a SudokuPad
theme. `Owyn/Universal_Dark_Theme` and the Stylus global dark mode are generic, and
per their own notes they flatten or invert colors, which would alter puzzle colors.

## Confirmed on the page (2026-11-03, v0.611.0, headless Chromium)

Run for Dark Page (`dark-page.user.js`, issue #14); the notes above were read from source.

- The board has no background of its own. `#svgrenderer`, `.grid` and `#board` compute to
  a transparent `background-color`, and the `underlay board-position` rect is
  `rgba(255, 255, 255, 0)`. The white is `body`'s `--body-bg`, shown through the board:
  with the page set to another color, the whole empty grid takes it.
- `#board` and `#svgrenderer` have the same box (671 x 671 px at 1200 x 900 on the sample
  puzzle). The svg is `overflow: hidden` and its `viewBox` is the grid plus a margin
  (`-16 -16 608 608` on a 9x9), so everything the puzzle draws, outside clues included,
  lies inside it. The box has fractional edges (`17.69`, width `670.62`), so a screenshot of
  it rounds outward to a 672 px square whose rim pixels are only partly the board.
- Painting the board's own elements changes pixels. A `background-color` on `#svgrenderer`
  changed antialiased line pixels by 1 level on the sample puzzle, and a dark page showed
  through the fractional rim. A white `div` behind an unpainted board changed none.
- `#svenpeek` (the mascot over the top of the grid) is a sibling of the svg, so it sits on
  the page, not on the board.
- A separate page that never loaded the script is a poor reference for pixels: after a
  selection, 13 vertical-line pixels per row from row 255 down differed from the same state
  on the page under test by 1 to 8 levels in some runs and not in others, a raster-history
  effect. The live check compares the page with the script's stylesheet switched off
  (`media="not all"`) against itself.
- `.cells .cell` is one `div` per puzzle cell, at the cell's box, outside-the-grid cells
  included. The selection highlight, a solver's digits, marks and colors all lie inside those
  boxes; the selection cage's stroke is 8 px wide and stays inside its cell.
- A pen mark reaches past its cell. On the outermost cells of the sample puzzle the edge X
  marks (`3`, `4`, `b`, `c`) reached 10.07 px past the cell union, stroke included, so the
  rectangle keeps 11 px around the cells from the start: the mark sits on white as it is drawn,
  and the rectangle does not move when it goes on. Line marks (`1`, `2`, ...) join cell centers
  and stay inside the grid in play. Without the reserve the rectangle grew 8 px outward on the
  next frame and back on undo.
- An arrowhead is drawn by a `marker` on the shaft's path, and the shaft's box leaves it out. The
  outside-arrow marker is `markerUnits="userSpaceOnUse"`, `markerWidth`/`markerHeight` 76.8,
  `refX` 34.56, `refY` 38.4, so the rectangle counts the farthest side of the marker box from its
  reference point (42.24 user units) around the shaft.
- Elements with no visible paint are in the DOM and in the svg's `getBoundingClientRect` sums:
  text with `fill: rgba(0, 0, 0, 0)` computes that fill, so the rectangle skips it.
- Per puzzle, how far the kept rectangle sits inside the `#svgrenderer` box on each side, and
  how far past the cells it stays:

  | Puzzle | Inside the svg box by | Past the cells by | Changed / clipped px |
  | --- | --- | --- | --- |
  | `live/puzzle-url.txt`, 9x9 | 5.3 px | 12.3 px (the reserve; the drawing alone is about 2 px) | 0 / 0 |
  | 6x6 with outside text | 23.4-24.4 px | 59.5-60.5 px (the text sets every edge) | 0 / 0 |
  | 16x16 with outside text | 9.2-10.2 px | 27-28 px (the text sets every edge) | 0 / 0 |
  | `sudokupad-art` `horse_pill` v2 | 2.2 px | 12.3 px | 0 / 0 |

  "Changed" is pixels inside the rectangle that differ with the script off; "clipped" is
  pixels the page draws outside the rectangle that are not the page's white. `horse_pill` was
  checked once by hand, not in `live/dark-page.live.mjs`, since its file lives in another repo.
- `body.setting-darkmode` changes `--body-bg`; the rectangle takes `var(--body-bg)`, so with
  SudokuPad's dark mode on it is dark and unchanged from SudokuPad's own rendering.
- With no `#svgrenderer` on the page the script leaves the page alone (its stylesheet is
  disabled), so a page of a matched site that is not a puzzle keeps its white.
- Screenshots at real size: `dark-page.png` (ChinStrap's Speed Stripes as it opens, retaken with
  `dark-page-screenshot.mjs`) and `dark-page-outside-text.png` (a 6x6 with clue text outside the grid).
