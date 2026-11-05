# Darker edge pixels where centre-line segments join (2026-11-05)

Chris saw a small grey nub on both sides of a straight pen line through cell centres, at a cell middle, mostly
on thin lines. Ruled the same day: **left alone, too small to fix.**

## What was measured

Headless Chromium at device scale 1, which is Chris's setup: Windows 100%, Chrome 100%, 2560x1440 monitors. The
script was current `main`. Lines were straight centre lines across 5 cells, vertical and horizontal, at thickness 1
to 5 and three window sizes (cells 126, 96 and 75.3 px).

- The nub is a darker antialiased edge pixel on both sides of the line, at each join between two cells' segments.
  It is 1-6 rows tall, and darkest and narrowest at thickness 1-2.
- It appears only when the line's edges fall on fractional pixels. Which window sizes show it changes with
  thickness. With pixel-aligned edges there is none (for example, a 96 px cell at thickness 4).
- The cause is SudokuPad's own drawing. Each segment is its own path with a round cap, so at a join the two caps
  overlap and draw the part-covered edge pixel twice. Stock SudokuPad shows it too: at thickness 5 and 96 px cells,
  the edge darkens and so does the fill. The script's solid paths remove only the fill part.
- The white outline is not the cause. The same darkening shows with the outline off, and the outline pixels do not
  change at a join.

## Fixes considered, not built

- `shape-rendering: crispEdges` on the horizontal and vertical centre-line values. It is one CSS rule. A line's
  round end may then look stepped, and its width can be off by 1 px.
- Butt caps where segments meet, plus one dot per join. It is more code, and two flush butt ends can leave a light
  seam instead.
