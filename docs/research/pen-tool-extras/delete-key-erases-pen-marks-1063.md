# #1063: the Delete key erases the pen layer, on stock SudokuPad too (2026-11-23)

Chris reported that Delete erases pen marks in highlighted cells. His ruling on the ticket (Chris, 2026-11-23): match stock SudokuPad. Record what stock Delete
erases. Whatever it erases stays erased with Pen Tool Extras installed. Only what Delete erases solely because the script is installed is a bug. If stock erases
everything Chris saw erased, the ticket closes with this note and no code change.

**Result: stock SudokuPad erases everything Chris saw, in every tool. No code change.**

Run on sudokupad.app (headless Chromium, 9x9 puzzle) with `delete-key-1063-probe.mjs` beside this note: 80 cases, all passing, identical between stock and with the script.
Two empty cells highlighted (the second added with the multi-select call). Both held ten pen values stored with `app.act({type: 'pen', arg})`: SudokuPad's own
lines `11` and `21`, edge X `31`, cell circle `51` and cross `61`, and Pen Tool Extras' own: edge arrows and circle `h1`, `j1`, `k1`, a grid-corner mark `t1` and the
cell dot `z1`. Four setups: the pen layer alone, and the pen layer with a corner mark, a centre mark or a digit. For each setup, each of the five tools (picked with its
real button), and each of `Delete` and `Backspace`: two real keypresses, the cells read after each, then Undo and Redo as many steps as the presses made.

**Delete clears one layer of the highlighted cells per press**, and the layers go in this order:

| Active tool | First press | Second press |
| --- | --- | --- |
| Normal, Corner, Centre, Color | the digit, or the centre and corner marks | the whole pen layer |
| Pen | the whole pen layer | the digit, or the centre and corner marks |

- **A cell holding only pen marks loses them all on the first press, in any tool.** That is the likeliest thing Chris saw: Delete with no digit or marks in the cell.
- **Delete and Backspace act the same**, in every tool and every setup.
- **Stock and with Pen Tool Extras are identical** in all 80 cases. The script has no Delete or Backspace handler, so it neither adds nor removes anything.
- **The pen layer goes whole, whatever the value.** Stock clears the script's own edge marks, corner mark and cell dot (`h1`, `j1`, `k1`, `t1`, `z1`) exactly as it
  clears its own `31`, `51` and `61`, since it clears the cell's pen list without reading the values. Nothing erased here is something stock keeps.
- **Undo and redo are whole**: in all 80 cases Undo restored the exact state from before the presses and Redo the state after them. A press that finds nothing left
  to clear adds no undo step.
- Not run: a cell with a color (the third layer SudokuPad's cell holds), cells highlighted by dragging, and a puzzle with given digits among the highlighted cells.

What Chris saw is SudokuPad's own behavior: Delete clears the pen layer of the highlighted cells, in the Pen tool first and in the other tools after the digit and marks.
Under his ruling nothing is left to fix here. A change that spared the pen layer from Delete would depart from stock; it needs a new ruling and a ticket of its own.
