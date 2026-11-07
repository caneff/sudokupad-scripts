# Bottom row: a CSS-only second row (2026-11-07)

SudokuPad's own stylesheet already lets the bottom row wrap:

```
.controls-app, .controls-aux { display: flex; flex-flow: wrap; align-items: stretch; }
.controls-app button, .controls-aux button { flex: 1 1 45%; }
button { height: 4rem; margin: 0.15rem; ... }
```

The row is as wide as `.controls-buttons` (the whole controls column), so it rarely wraps. Buttons are sized in rem
and the whole `#controls` block is scaled by a `transform`, so a cap in rem holds the same number of buttons at every
window size. A cap in px does not (it held 6 at 1600x900 and 4 at 1280x720).

One rule gives 5 buttons a row, whichever script added which button and in whatever order:

```
.controls-aux { max-width: 21.6rem; }
```

Probe (`.scratch/probe-wrap.mjs`, not kept): Pen Tool Extras, Draw Tool and Color by Digit injected, #364's JS row
undone, two stand-ins for GDC's buttons appended, then the rule. At 1600x900 and 1280x720 the row wrapped 5 + 2, and
SudokuPad re-laid out the controls so nothing overlapped and the footer stayed on screen. Picture:
`bottom-row-css-wrap.png` (left 1600x900, right 1280x720). Desktop only; phones are not supported.
