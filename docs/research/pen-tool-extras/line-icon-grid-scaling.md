# Line mode icon grid at 1.25x and 1.5x (2026-11-17)

Question (#955, AC 5): can the line mode icon's faint grid be made crisp at deviceScaleFactor 1.25 and 1.5? Not as the ticket proposed; 1.5x cannot be made crisp without breaking the icon's 34 px ink size.

Setup: headless Chromium, 1200 x 900, Pen Tool Extras injected, the icon's `svg` at 42.88 css px (rem 16.49), viewBox 25.059 units, so 1 unit = 1.711 css px. Read: a screenshot of the svg, one pixel row at y = 5 units, which crosses only the grid's three upright lines (x = 3, 12, 21). Pixel value 173 is a full-colour line pixel, 255 is the button face.

| Scale | Pixels per line (today) | Soft pixels (coverage 0.15 to 0.85) |
|---|---|---|
| 1.25x | 178, 173, 250 (0.94, 1.0, 0.06 coverage) | 0 per line: already crisp |
| 1.5x | 230, 173, 173, 198 (0.30, 1, 1, 0.60) | 2 per line, 6 in all |

Tried at 1.5x, none leaving fewer than 2 soft pixels per line:

- Grid stroke width 0.75, 0.8, 0.9, 1.0, 1.1, 1.134 and 1.2 units. At 1.25x the pixel values did not change with the width.
- viewBox origin shifted by up to 0.25 unit, and the grid path translated by up to 0.3 unit: the pixel values were identical (Chrome snaps where the svg paints), so the ticket's "fractional viewBox origin softens it" fix has no effect.
- `shape-rendering="crispEdges"` on the grid path and on the svg root: identical pixels; Chromium still anti-aliases.
- Stroke without `stroke-opacity` (opacity put in the colour): identical pixels.

Why it cannot be fixed by one edit: the three lines are 9 units * 1.711 * 1.5 = 23.1 device px apart, a non-whole number, so one alignment cannot serve all three, and the line width (2.57 device px at 1 unit) is not whole at either scale. Spacing is whole at both scales only when 1 unit = 16/9 css px (20 device px at 1.25x, 24 at 1.5x), which shrinks the viewBox width about 3.7% and makes the ink 35.3 px, outside the 0.5 px tolerance of the 34 px rule in `live/pen-tool-extras/pen-tool-extras-panel-layout.live.mjs`. It would also hold only at this rem, which follows the window size.

Left as is, by the controller's ruling on #955. Re-drawing the grid as non-scaling hairlines is a design choice for the owner.
