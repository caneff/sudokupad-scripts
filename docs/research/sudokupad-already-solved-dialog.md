# SudokuPad's "already solved" dialog after a reload (#1212)

Found 2026-11-26 from the nightly fuzz failure of seed 1693052955 (replay: `npm run test:fuzz -- --seed 1693052955 --path
70:2:1:0:0:1:11@: --config busy-start`).

- A reload of a puzzle whose saved progress is solved shows a dialog, "Yey! You've already solved this puzzle", with Save
  Replay, View Solution and Restart.
  It shows **in place of** the intro dialog: no Start Puzzle, Continue or Resume button exists, and the timer runs behind it.
  The board and controls (`#control-undo`) are already there, so only the dialog covers them.
- A player presses the overlay beside the dialog to dismiss it, as for the Congrats dialog (#1062). The fuzz's `reload`
  (`live/fuzz/fuzz.mjs`) does the same, at the page's corner.
- Not a script's doing: the failing list's scripts only changed settings and drew; the board held the solution (both free cells
  of the nearly solved 9x9 filled).
- The page at the 30 s timeout: `docs/research/sudokupad-already-solved-dialog.png`.
- Regression test: the `#1212` case of `live/fuzz/fuzz.smoke.mjs`.
