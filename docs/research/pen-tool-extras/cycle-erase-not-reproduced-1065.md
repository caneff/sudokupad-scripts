# #1065: a last-shape click that leaves the mark shown, not reproduced (2026-11-21)

Tester report: a click on the last shape of the cell-centre cycle (the dot) sometimes leaves the mark on the board until a later click on another cell with no mark.
Run on sudokupad.app (headless Chromium, Pen Tool Extras injected after Start Puzzle, 9x9 puzzle). After every click the test compared the marks in the puzzle state
(`cell.pen` summed over all cells) with every `.cell-pen` element in the document, the pen layer and the marks layer both, and again after moving the mouse 150 px off.
A mismatch would have shown either a mark kept in state or a mark only still drawn. None did.

Cases that all stayed consistent (about 60):

- Cell centre, eight clicks (two full turns): all three types on; each of Cell Dot, Cell Cross and both Dot and Cross off; Circle alone; Dot alone.
  Each with the mouse still after the click and moved off.
- Cell centre, click styles: Playwright click, press with 2 px of jitter, press held 700 ms, `delay: 0`, double click (`clickCount: 2`); pen colors 1, 5 and 9.
- Cell centre, pen color changed between clicks; Undo and Redo between clicks; another cell selected with Ctrl first; several cells holding marks.
- Cell centre, every color 1 to 9 on each of the three pen pages (four clicks each, so the dot is reached and erased).
- Edge (right, bottom, left of column 1, top of row 1) and corner (inner, top left): seven clicks each, with all boxes ticked, Circle boxes off, Directions off,
  only X, X off, and circle only; mouse still, then moved off.

Read from the page: SudokuPad's own `handleInputup` calls `clickCell` only when `!didInputMove() && currentPath.length <= 1 && linePart === undefined`.
A press that moves a little, or that follows a drag that left `linePart` set, never reaches `clickCell`, so Pen Tool Extras never sees it and the mark stays as it was.
That would look like the report, but it is a guess: no case showed a click that never reached `clickCell`. No case slid the press past 6 px (the 2 px jitter is under the cut).

Not tried: a touch or pen-tablet pointer, a puzzle with a different grid size, a real Windows mouse, Tampermonkey.

## Reproduced: a press that slides 6 px (2026-11-23)

A second probe (`cycle-erase-1065-probe.mjs` beside this note, frozen scratch, run by hand with `node --test` from the repo root; `CFG=all`
loads all six scripts at `document-idle`) drove the cell-centre cycle on cell (4, 4) of the default puzzle, pen color 1, Pen Tool Extras alone. After each case it read the
saved value, every `.cell-pen` and `.penhint` drawn over the cell, and the cell's pixels against a blank screenshot.

- Three clean clicks (circle, cross, dot) and then a press that slides **6, 7 or 9 px** before release: the dot stays, saved (`z`) and drawn, and
  the pixels show it. Slid 2 to 5 px it erases. 6 px is SudokuPad's `App.DoubleInputDistance`: past it `didInputMove()` is true, `handleInputup`
  never calls `clickCell`, and Pen Tool Extras never sees a click. The 7 px case was red in both runs; 6 and 9 px ran once.
- On an empty cell, a 7 px press places nothing. Other steps of the cycle were not tried with a slide.
- Four clicks 0, 40, 120, 250 or 400 ms apart, clicks after a pen drag elsewhere, after a drag that ends on the cell and is undone, and from four
  points in the cell: all erase.
- After the stuck dot, a plain click on it erases it. A click on a different empty cell, (6, 6), does **not**: it leaves the dot saved and drawn.
  So the slide explains "it doesn't disappear", but not the tester's "unless I later click on a different cell without a mark". Either the tester's
  later click was back on the dot, or a second cause is still unfound.
- Not run, read from the code: stock SudokuPad drops the same press for its own circle and cross, since the cut is in its `handleInputup`, before
  `clickCell`. Pen Tool Extras inherits the miss; its cycle makes it visible, since the press was meant to erase.

## Fixed (2026-11-23)

Pen Tool Extras 1.32.58 counts a left press that moved 6 px or more, sent no line and began and ended on the same click target (every pointer move tested with `marksAtPoint`, after the release) as a click: it runs the wrapped `clickCell` with `getInputRc` put at the press point, once SudokuPad has handled the release.
`live/pen-tool-extras/pen-tool-extras-cycle-slide.live.mjs` checks the cell centre, an edge and a corner. A hit test during the drag itself was tried first and broke real line drags (SudokuPad's own `clickCell` run mid-drag disturbs the drag), so the moves are only recorded then.
The tester's "until I click a different cell" is still unexplained.
