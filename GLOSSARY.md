# Glossary

- **group** — one palette color plus the digits that get it. A digit is in at
  most one group.
- **digit color** — the fill of one digit, in entered digits, corner marks and
  centre marks. It is a `#rrggbb` value, or SudokuPad's own color. Givens never take it. A mark in the
  `conflict` state keeps it and gets a red outline; for a digit on SudokuPad's own color the mark
  stays SudokuPad's red and gets the outline too.
- **default colors** — the digit color of each digit on a fresh install, and
  after the dialog's "Restore defaults".
- **preload** — a settings button that overwrites the list of groups with a
  ready-made set. It saves nothing of its own.
- **pen color** — one of the pen tool's nine colors, numbered 1 to 9. It is a
  `#rrggbb` value kept in SudokuPad's `--puzzle-pencolor-N` variable, which
  strokes and the tool's color buttons both read. The eraser has no pen color. With
  nothing saved, the nine are the **derived colors**: the visible colors of the color
  tool's current page (its **cell colors**), in order, each darkened in OKLCH. A saved
  set wins, and "Restore defaults" clears it.
