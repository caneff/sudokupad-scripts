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
That would look like the report, but it is a guess: no case showed a click that never reached `clickCell`. The test checked state against drawing, not that each click stepped the cycle.

Not tried: a touch or pen-tablet pointer, a puzzle with a different grid size, a real Windows mouse, Tampermonkey.
