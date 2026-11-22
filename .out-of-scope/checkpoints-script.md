# A Checkpoints script

This repo has no script that saves a checkpoint before a guess and goes back to it in one step.

## Why this is out of scope

Chris ruled on 2026-11-15 not to build it. The idea was a new script: remember the depth of SudokuPad's undo stack
(`Framework.app.puzzle.undoStack`) before a guess, then call `Framework.app.undo()` that many times to undo digits, marks, colors
and pen since. `docs/research/pen-tool-extras/puzzle-ui-pen-tools.md` (the "Trial mode" row) names it as the cheap route to a
trial mode, and `docs/research/other-sudokupad-userscripts.md` found no checkpoint feature in SudokuPad 0.611.0.

It was never designed: how many checkpoints, a button or a key, whether going back can be redone, whether the replay keeps the
undone moves, and what a checkpoint does when the solver undoes past it by hand were all open when it was closed.

The research above stays, so a later request can start from it.

## Prior requests

- #267 — "New script: Checkpoints, to go back to the point before a guess"
