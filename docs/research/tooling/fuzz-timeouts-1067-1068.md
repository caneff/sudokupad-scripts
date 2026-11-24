# Two nightly fuzz timeouts that no replay repeats (#1067, #1068)

2026-11-23. Both were a Playwright locator timeout in the nightly fuzz, split out of #1015.

| Ticket | Seed, puzzle | What timed out | Nightly commit |
| --- | --- | --- | --- |
| #1067 | 479320616, 12x12 | `#auto-rules-resizer-drag-dl` stayed hidden for 2 s after a Restart | `f677b42` |
| #1068 | 1589090111, recorded 9x9 | `#pen-tool-extras-editor` never showed (30 s) after a press on the pen panel's settings button | `f677b42` |

## What was run

- The ticket's replay command, once for each ticket, on `8e677b8` (main when the work started), and once for #1067 on `f677b42` too (a
  worktree at the failing commit): all three pass. The "3 more runs" of the tickets' done-means were not made, since a pass at `f677b42`
  already shows that no commit fixed #1067; #1068 was not replayed at `f677b42`. A replay cannot tell a fixed bug from a flaky one.
- The shrunk steps written out as a scripted list (`scriptedList`) and run on a fresh page each time: #1067's 23 steps 6 of 6
  passed, a bare Restart then the corner drag 8 of 8; #1068's 17 steps 4 of 4. Both lists match the shrink step for step, bar two
  `type` steps of #1067's start that cannot run with no cell selected.
- Nothing on the script side hides the corners after a Restart: the controls stay `shown`, the pane stays in the document. A Restart
  does empty the rules the fuzz injected with `showMetaInfoUI` and the pane then shrinks (from 468 x 453 to 337 x 31 on the 12x12,
  251 x 23 with three notes on it), and its width settles about 300 ms later.

## Cause: not found

What fits both messages is a target that moved between the harness's read of its box and its press, on a slow CI box:

- the hover goes to the old pane's centre, which is outside the shrunk pane, and a corner shows only while the pane is hovered
  (`SHOW_WHEN`), so `waitFor(visible)` sees `display: none` for the full 2 s;
- a press on the pen panel's settings button lands where the button was, and no dialog follows.

Neither was seen on a real page. #1068's failure message was reproduced word for word (30 s waiting for the editor) by moving the
button on the first mouse move. #1067's was not: a pane moved or shrunk the same way still showed its corners, because the page
works out what is under a still pointer late, so no live test pins that hover.

## The change

`live/fuzz/act-where-it-is.mjs`: a hover or a press whose result does not show is made again where the target is now, but only
when its box changed since the act's read. A target that stayed put and showed nothing gets the full wait it had before (2 s for a
rules-pane corner or f+ button, 30 s for the pen dialog), so a real bug in a script still fails the run. Used for the rules-box
corner drag, the f+ and f- presses and the pen panel's settings button.

Its rule is unit-tested in `act-where-it-is.test.mjs`, and `fuzz.smoke.mjs` has the pen button case on a real page. The rules-pane
hover rests on the unit test alone.

If the nightly hits either message again, this note's hypothesis is wrong: reopen with that run's seed.
