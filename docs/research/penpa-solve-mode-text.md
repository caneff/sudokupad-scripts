# Penpa+ solve mode: free text

Read from the Penpa+ source, `swaroopg92/penpa-edit` at 34e3fe9 (2026-06-02), for the question
"does Penpa's solve mode have free text, like Text Anywhere?" (Chris, 2026-11-08).

## What exists

- **Number mode, Long sub-mode** (`sub_number8`) is available in solve mode. `set_solvemode()` in
  `docs/js/general.js` hides only the Arrow, Tapa and Killer sub-modes (`sub_number2_lb`, `sub_number4_lb`,
  `sub_number11_lb`).
- Long holds up to 1000 characters (`const limit = (submode[0] === "8") ? 1000 : 10` in `docs/js/class_p.js`).
  The README calls it "Long sentence. It is possible to create a list such as seekers."
- It draws multi-line text (`split('\n')`), left-aligned from 0.2 cell left of the cell centre, at half a
  cell high, one line per half cell (`case "8": //long` in `docs/js/class_square.js`). A style with a white
  background draws a box behind each line.
- The Number panel's Text tab (`#inputtext`, "Insert") pastes a typed sentence or Unicode symbols into it.
- The answer check skips it: `make_solution()` reads only sub-modes 1, 5, 6, 10 and candidates (7).

## Its limits, against Text Anywhere

- **One entry per cell.** It is stored in the cell's `number[k]` slot, the same slot as the digit.
  A note in a cell takes the place of that cell's answer. Notes go only in cells you do not fill, or in
  margin cells the setter added.
- **Anchored to a cell.** No free position, no drag to move, no resize, no wrap width.
- **One size**: half a cell. No font choice, no formatting, no checklists.
- No hide-all and no per-note colour beyond the Number style palette.
- It is part of the solve state, so it shares undo with the solve and is saved with it.
