# #1063: the Delete key erases the pen layer, on stock SudokuPad too (2026-11-23)

Chris reported that Delete erases pen marks in highlighted cells. His ruling on the ticket (2026-11-23): match stock SudokuPad. Record what stock Delete erases; whatever it
erases stays erased with Pen Tool Extras installed; only what Delete erases solely because the script is installed is a bug; and if stock erases everything Chris saw
erased, the ticket closes with this note and no code change.

**Result: stock SudokuPad erases everything Chris saw. No code change.**

Run on sudokupad.app (headless Chromium, 9x9 puzzle), `delete-key-1063-probe.mjs` beside this note. Two empty cells highlighted (the second added with the multi-select
call), then a real `Delete` or `Backspace` keypress, with each of the five tools active. Both cells held one corner mark and every pen value below, stored with
`app.act({type: 'pen', arg})`: SudokuPad's own lines `11` and `21`, its edge X `31`, its cell circle `51` and cross `61`, and the values Pen Tool Extras adds (`h1`,
`j1`, `k1`: edge arrows and circle). The same twenty cases ran on stock SudokuPad (no script) and with Pen Tool Extras injected.

| Active tool | Pen layer (lines, edge X, circle, cross, Pen Tool Extras' values) | Corner and centre marks, digits, colors |
| --- | --- | --- |
| Pen | all erased | kept |
| Normal, Corner, Centre, Color | kept | erased |

- **Delete and Backspace act the same**, in every tool.
- **Stock and with Pen Tool Extras give identical results** in all twenty cases. The script has no Delete or Backspace handler, so it neither adds nor removes anything.
- **The pen tool's Delete clears the whole pen layer of each highlighted cell**, whatever the value: stock erases the unknown values `h1`, `j1` and `k1` too, so Pen
  Tool Extras' edge, corner and cell marks go for the same reason SudokuPad's own `31`, `51` and `61` do. Nothing here is "stock keeps, extras erases".
- **Undo and redo are whole**: in all twenty cases Undo restored the exact state from before the key and Redo the state after it.
- Not run: a cell holding a digit or a color (the probe's cells held a corner mark only), and cells highlighted by dragging. The pen layer's result does not depend on either.

What Chris saw, then, is SudokuPad's own pen-tool behaviour: with the Pen tool active, Delete clears the pen layer of the highlighted cells. Under his ruling nothing is
left to fix here. A change that spared the pen layer from Delete would depart from stock; it needs a new ruling and a ticket of its own.
