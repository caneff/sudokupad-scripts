# Digit pad size: how SudokuPad lays out the controls (2026-11-18)

Read from SudokuPad's `Framework.app.resize` on sudokupad.app (#1045), and measured with every script installed.

- `#controls` is placed in a box beside the board: `(window width - board size)` wide and `board size` tall, less a margin. On each `resize`, `app.resize` clears
  the column's transform, measures its natural size, and sets `transform: translate(...) scale(s)` with `s` the largest scale that fits the box, capped at 1.3.
- The refit runs only on a window `resize`. A stylesheet change alone leaves the old scale on a column that now overflows, so UI Tweaks dispatches a `resize` after it writes its style.
- Every `.controls button` is `4rem` square (`flex: 0 0 4rem`), a digit's font is `2rem` (`1.4rem` in the corner and centre tools). The rows are `1 2 3`, `4 5 6`, `7 8 9`, `0` + Delete.
- Text Anywhere and the pen tool restyle `.digit` for their own tools (Text Anywhere: `4rem x 2.5rem !important`). The size rule has less specificity than Text Anywhere's, so it keeps its own buttons.

So any growth of the column, digits only or the whole column, is shrunk back by the refit when the fit is the limit (1280x720 and 1366x768: the column fills the box's height). Sizing the whole column in rem cancels
out entirely there. Sizing the digits only does not: the digits take a larger share of the column and the other buttons shrink with the refit. Measured digit width, px, at 80% / 100% / 150%:

| window | 80% | 100% | 150% |
|---|---|---|---|
| 1280x720 | 50.8 | 63.6 | 76.3 (1.20x) |
| 1366x768 | 54.4 | 68.0 | 81.7 (1.20x) |
| 1920x1080 | 66.5 | 83.2 | 116.7 (1.40x) |

At 1920x1080 the column starts at the 1.3 cap, so there is room to grow. At every size the column ends inside its box with nothing overlapping, because SudokuPad does the fitting. The choice: size the digits
only, in rem, and let SudokuPad refit. The setting is a size relative to the column, not an absolute size. A CSS `scale` past the box (Nell Gwyn's approach) would give 1.5x, but pushes the column off the page unless hand-tuned margins move it.
