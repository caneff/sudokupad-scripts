# Clear all's live tests timing out under load (#1087)

Two tests in `live/text-anywhere/text-anywhere-erase.live.mjs` ("Clear all's Delete all removes every note…" and "with no notes Clear all asks nothing…") hit Playwright's 30 s limit when the box was at load about 50. Run alone, the file passed 25 of 25.

## What times out

Run on 2026-11-22 with the file as it was before #1088 (`16e913d^`) under ambient load of 20-28 plus 12 busy-loop processes, run 1 of 5 failed after 128 s with four red tests:

1. "closing the dialog by a button pressed over the board and released after a drag on it makes no note" failed first, at `p.locator(DIALOG).waitFor({ state: 'detached' })` (30 s, `.dialog` still visible). The press went to the point `buttonOverBoard('Cancel')` read, and the Clear all dialog stayed open.
2. The next three tests failed because that dialog was still open: its overlay intercepted every click on `.text-anywhere-clear` and `#control-textanywhere` (`<div class="dialog-overlay centeroverboard"> intercepts pointer events`, `page.click` 30 s each).

So the two tests the ticket names are victims of one earlier missed press, and the wait that times out is the `detached` wait after a press at a stale point. A press that lands on the dialog's own body rather than the overlay leaves the dialog open, so it times out at the wait and never reaches `settle(texts, [])`, which answers the ticket's doubt about the shape of the failure.

## Whether `stable` fixed it

`buttonOverBoard` now reads the button's point through `stable` (#1088). The same file, with it, passed 8 of 8 runs at ambient load about 22 plus 12 burners, and 5 of 5 at 12 burners on a quiet box. The pre-fix file passed 4 of 5 under the 20-28 load, so the evidence for the fix is one red in five against zero in thirteen: small, and it rests on the mechanism above more than on the count.

Not tried: load about 50 (a 24-burner run was refused by the permission classifier, and Chris ruled 12 burners).

## Left as is

One missed press leaves the dialog open and turns every later test in the file red for 30 s each, so a single miss reads as four failures. No change was made for that.
