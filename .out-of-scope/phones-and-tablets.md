# Phones and tablets

No script supports a phone or a tablet, in any script, and none ever will (Chris, 2026-11-07).

## Why this is out of scope

Chris's ruling is the whole reason on record; no research note gives another. What follows from it:

- No change is checked, styled, screenshotted or demonstrated at a phone or tablet size, and no ticket or PR asks for it.
- No live test sets a phone-size viewport. #703 removed the 390 px checks, and `test/repo-conventions.test.mjs` fails on one.
- A script may still say that touch is untested (Pen Tool Extras does): that is an honest limit, not a gap to close.

## Prior requests

- #703 — "Live tests: drop phone-size and SudokuPad dark-mode checks, cut duplicates, fix flaky and vacuous cases"
