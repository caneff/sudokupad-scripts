# How SudokuPad's color tool turns its pages

Read from `tool-color.js` as sudokupad.app served it on 2026-11-04.

- **Page button:** a click on the palette button (`data-control="selectpalette"`, class `palettebutton`) calls `setPageNext`.
- **Mouse wheel:** a listener on that palette button only (`btnPalette.addEventListener('wheel', this.handleMousewheel)`), with no `preventDefault`. Wheel up goes to the previous page and wheel down to the next. The source carries the comment `// TODO: Consider if we should even have this`. The wheel anywhere else in the color tool's panel does nothing.
- **Tab:** `handleKeydown` answers Tab with `setPageNext` while the color tool is the current tool. While Tab is held, Shift goes to the previous page and a digit key N jumps to page N.
- **Alt (left):** held, it opens edit mode; released, it closes it.

So in stock SudokuPad, Tab turns pages only in the color tool, and the wheel turns them only over the page button. The pen tool has no pages and takes neither.

Pen Tool Extras v1.12.0 differs: its wheel listener turns the page anywhere over the pen panel (`.tool-pen .controls-input`, sliders excepted) and calls `preventDefault`.
