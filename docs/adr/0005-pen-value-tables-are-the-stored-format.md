# The pen value tables are the stored format

Status: accepted, 2026-11-04 (audit sweep run-20261104-144940)

Pen Tool Extras keeps its pen values in parallel tables (`EDGES`, `ADDED_ORDER`, `ADDED_MARKS` and the tables beside them in
`pen-tool-extras.user.js`) and does not fold them into one pen-value module or one mark table.

Each mark is one character on a cell, stored in SudokuPad's own puzzle state as a value plus a color (`docs/research/sudokupad-pen-edge-marks.md`).
SudokuPad's own pen values stop at `g`; the edge marks use `h` to `s` and the grid-corner marks `t` to `y`, each by its fixed position in a
table. A saved puzzle, a replay and an undo step all hold those characters, so a value's place in the tables is part of every
solver's saved data. Reordering a table, or deriving the values from one structure that can change, would draw a different mark for a
value already stored, and the "reorder and it draws wrong" risk is the one a single table would add. It cannot happen without
breaking saved data first.

So the tables stay as they are, and a large rewrite of tested core code with no defect behind it is declined (the audit
sweep's ruling; improve-codebase-architecture and thermo-nuclear-code-quality-review). The order of a table changes only with a
migration of saved values.

Values are lowercase because SudokuPad lowercases a pen value on undo and replay. More characters than `z` work (any that lowercase to
themselves): pen values are not scarce (`docs/research/sudokupad-pen-edge-marks.md` § Pen values past `z`, #721).
