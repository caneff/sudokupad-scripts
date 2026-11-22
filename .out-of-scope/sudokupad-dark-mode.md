# SudokuPad's own dark mode

SudokuPad's own dark mode (`.setting-darkmode`) is not supported, in any script, and no change is checked or styled for it
(Chris, 2026-11-06). A dark page means Dark Page.

## Why this is out of scope

Chris's ruling is the whole reason on record; no research note gives another. Dark Page (`dark-page.user.js`) is the script that
makes a page dark: it paints the page outside the board and darkens the controls, the two tool panels and the dialog's dimmed
background. What follows from it:

- No live test sets SudokuPad's dark mode. #703 removed the case, and `test/repo-conventions.test.mjs` fails on one.
- A change is judged against SudokuPad's light look, with or without Dark Page.

## Prior requests

- #703 — "Live tests: drop phone-size and SudokuPad dark-mode checks, cut duplicates, fix flaky and vacuous cases"
