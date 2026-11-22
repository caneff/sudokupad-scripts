# Clear all's live tests timing out under load (#1087)

Two tests in `live/text-anywhere/text-anywhere-erase.live.mjs` ("Clear all's Delete all removes every note…" and "with no notes Clear all asks nothing…") hit Playwright's 30 s limit when the machine was at load about 50 (#1036's merge check). Run alone, the file passed 25 of 25.

## What times out

Run on 2026-11-22 with the file as it was before #1088 (`16e913d^`, the commit that made `buttonOverBoard` read through `stable`), the machine's own load at 20-28 plus 12 busy-loop processes (the "load processes" below, started by a shell script; load average read 25-28 during the runs). Run 1 of 5 failed after 128 s with four red tests:

1. "closing the dialog by a button pressed over the board and released after a drag on it makes no note" failed first, at `p.locator(DIALOG).waitFor({ state: 'detached' })` (30 s, `.dialog` still visible). That press goes to the point `buttonOverBoard('Cancel')` read, and the Clear all dialog stayed open.
2. The next three tests failed because that dialog was still open: its overlay intercepted every click on `.text-anywhere-clear` and `#control-textanywhere` (`<div class="dialog-overlay centeroverboard"> intercepts pointer events`, `page.click` 30 s each).

So the wait that times out is the `detached` wait after a press at the point `buttonOverBoard` read, and one missed press turns every later test red. In this run the first miss was the Cancel press, and "Delete all" and "with no notes" were two of its victims. The ticket's own record (#1031, #1036's merge check) has only those two red, so there the first miss was probably "Delete all"'s own press and "with no notes" its one victim: the same mechanism, a different first test.

Where the missed press landed was not recorded. The likely cause is a press on the dialog's body rather than the overlay: a press on the overlay closes the dialog, so the test would have failed at `settle(texts, [])` after the wait, not at the wait. That is inferred from the dialog staying open, not read from `elementFromPoint`.

## Whether `stable` fixed it

The same file with `buttonOverBoard` reading through `stable` (the file on main) passed 8 of 8 runs at the machine's load about 22 plus the 12 load processes, and 5 of 5 with the 12 load processes on a quiet machine. The pre-fix file passed 4 of 5 under the 20-28 load. That is one red in five before against none in thirteen after: if the failure rate had stayed at 1 in 5, thirteen clean runs would still happen about 5% of the time. The count is weak, and the case for the fix rests on the mechanism above (a press at a stale point misses the button) more than on it.

Not tried: load about 50 (a run with 24 load processes was refused by the permission classifier, and Chris limited the run to 12). Neither the failure nor the fix has been checked at the ticket's load.

## Left as is

One missed press leaves the dialog open and turns every later test in the file red for 30 s each, so a single miss reads as four failures. No change was made for that.
