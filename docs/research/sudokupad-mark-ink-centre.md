# Where a SudokuPad mark's digit actually sits

Measured 2026-11-03 on sudokupad.app in headless Chromium (font fallback
`Tahoma, Roboto, Arial, sans-serif`; the machine's Tahoma is not the page's).

- A corner mark's `text` has `dominant-baseline: middle`, `y` = 99.8. Its baseline,
  read as the extent's `y` plus the canvas `fontBoundingBoxAscent`, is 4.66 units
  below `y`. That is about half the x-height (10 / 2 = 5), so `y` is the middle of
  a lowercase letter, not of a digit.
- The digit stands 13 units tall (`actualBoundingBoxAscent`), so its ink middle is
  6.5 above the baseline: about 1.8 units above `y`. That is the "digit sits high"
  of #19; the circle, drawn at `y`, sat low on the digit.
- Horizontally the extent is the advance box. The ink is narrower and offset inside
  it, by under 1 unit for the digits 1-9.
- The fix reads the baseline off the extent, then the ink's reach off a canvas
  `measureText` in the mark's computed font, so no per-font ratio is guessed.
  A narrow digit such as 1 centres on its own ink, not on the box a wider digit
  would fill.
- Checked from pixels: with every mark hidden, one screenshot with a mark and one
  without give the mark's ink box by difference (grid lines cancel). The circle's
  centre was within 0.75 px of the ink centre for all 18 corner and centre marks
  of digits 1-9; the unfixed code was 1.87 px off on corner 1.

Not covered: a real Tampermonkey install, `crackingthecryptic.com`, and Windows
Tahoma, whose metrics differ from the fallback font above.

Pictures: `digit-color-centred-circles.png` (board at real size) and
`digit-color-centred-circles-zoom.png` (4x crop of corner and centre marks, after the fix) and
`digit-color-centred-circles-before-zoom.png` (the same crop and marks with `main`'s script, digits sitting high in their circles).
