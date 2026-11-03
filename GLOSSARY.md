# Glossary

- **group** — one palette color plus the digits that get it. A digit is in at
  most one group.
- **settings group** — one of SudokuPad's collapsible sections of its settings dialog. Every
  script's settings entry goes in the Experimental one, which starts collapsed.
- **digit color** — the fill of one digit, in entered digits, corner marks and
  centre marks. It is a `#rrggbb` value, or SudokuPad's own color. Givens never take it. A mark in the
  `conflict` state keeps it and gets a conflict circle; for a digit on SudokuPad's own color the
  mark stays SudokuPad's red and gets the circle too.
- **conflict circle** — the small pale red circle the script draws behind a corner or centre mark
  in the `conflict` state, only while SudokuPad shows conflicts.
- **default colors** — the digit color of each digit on a fresh install, and
  after the dialog's "Restore defaults".
- **preload** — a settings button that overwrites the list of groups with a
  ready-made set. It saves nothing of its own.
- **pen color** — one of the pen tool's nine colors, numbered 1 to 9. It is a
  `#rrggbb` value kept in SudokuPad's `--puzzle-pencolor-N` variable, which
  strokes and the tool's color buttons both read. The eraser has no pen color. With
  nothing saved, the nine are the **derived colors**: the colors of the current
  **cell color page** (one of the color tool's pages of ten **cell colors**): pen
  color N is the page's color at index N, darkened in OKLCH, so each pen sits on the
  same button number as its cell color and index 0 is never used. A transparent or
  unreadable entry keeps SudokuPad's own pen color there. The darkest derived color
  with low chroma becomes black. A saved set wins, and "Restore defaults" clears it.
- **edit mode** — Pen Tool Extras' state after a hold on a pen color button: a color picker sits over
  each of the nine pen buttons. A second hold, or leaving the pen tool, ends it. SudokuPad's color
  tool has the same state for its cell color buttons.
- **edge mark** — a pen mark on a cell edge: SudokuPad's own X, or one of the
  marks Pen Tool Extras adds (a direction arrow or the edge circle). Each one is a single
  character in the pen value of the cell that stores the edge.
- **edge cycle** — the order a left click on an edge steps through its marks: X,
  first direction, second direction, circle, empty, skipping any type unticked in
  the settings dialog. A right click steps the same cycle backwards.
- **thickness** — the one slider setting the stroke width of the pen's free lines, the cell circle and
  cross (pen values 5 and 6) and every edge mark, from 1 to 12, saved under `PenColor_thickness`.
  SudokuPad's own is 5, which is the default; an edge mark (the edge X, an arrow, the edge circle)
  is always half of it, so every width scales by one factor.
- **page color** — the color Dark Page paints the page outside the kept rectangle: black until a solver picks
  another in the Dark page dialog, saved under `DarkPage_color`. The page's own text is light or dark, whichever contrasts more
  with the color.
- **kept rectangle** — the box Dark Page leaves as SudokuPad renders it: the tight box around everything
  the puzzle visibly draws, joined with every cell's box grown by a pen mark's reach, padded by 1px,
  rounded outward to whole pixels and limited to the `#svgrenderer` box. The page is the chosen page color (black by default) outside it.
- **swatch** — one square button in the Color by Digit dialog showing one palette color, grouped by cell color page and laid out by index. An index with no visible color is an empty space of the same size.
- **letter tool** — SudokuPad's tool, switched on by its "Enable Letter Tool" setting, that adds a toggle
  button before the delete button and lets the number pad type letters.
- **letter mode** — whether the number pad types letters (`ABCDEFGHIO`) or digits. SudokuPad saves it per
  browser under `ToolLetter_letterMode`. The button and `/` toggle it; No Tab Letters makes Tab do nothing in play instead.
