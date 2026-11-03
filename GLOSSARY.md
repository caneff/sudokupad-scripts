# Glossary

- **group** — one palette color plus the digits that get it. A digit is in at
  most one group.
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
  **cell color page** (one of the color tool's pages of ten **cell colors**, the
  transparent ones left out), in order, each darkened in OKLCH. A saved set wins, and
  "Restore defaults" clears it.
- **edge mark** — a pen mark on a cell edge: SudokuPad's own X, or one of the
  marks this script adds (a direction arrow or a dot). Each one is a single
  character in the pen value of the cell that stores the edge.
- **edge cycle** — the order a click on an edge steps through its marks: X,
  first direction, second direction, dot, empty, skipping any type unticked in
  the settings dialog.
  strokes and the tool's color buttons both read. The eraser has no pen color.
- **kept rectangle** — the box Dark Page leaves as SudokuPad renders it: the tight box around everything
  the puzzle visibly draws, joined with every cell's box grown by a pen mark's reach, padded by 1px,
  rounded outward to whole pixels and limited to the `#svgrenderer` box. The page is black outside it.
