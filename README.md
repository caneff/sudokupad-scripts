# sudokupad-scripts

Tampermonkey userscripts for [SudokuPad](https://sudokupad.app).

## Install

Install [Tampermonkey](https://www.tampermonkey.net/), then open a script's link below. Tampermonkey offers to install it.

- [Color by Digit](https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/color-by-digit.user.js): adds a button that colors every cell holding a digit, and every empty cell whose centre marks all belong to one group, using groups of palette colors set in a settings dialog.
- [Digit Color](https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/digit-color.user.js): colors the digits themselves, one color per digit, in entered digits, corner marks and centre marks. Starts from default colors; change them in a settings dialog. Givens keep their color; a conflicting mark keeps its digit color and gets a small red circle behind it.
- [Pen Color](https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/pen-color.user.js): changes the pen tool's nine colors in a settings dialog. Strokes already drawn and the tool's color buttons change with them. With nothing saved, the nine pen colors are your current cell color page, darkened, each pen on the same button number as its cell color (pen 1 takes the page's color on button 1, and so on; button 0 is not used), with the darkest grey turned black, so installing changes the pen colors straight away; a cell color that is transparent or unreadable leaves SudokuPad's own pen color on that button; edit and Save to keep your own, and Restore defaults goes back to the darkened page. Holding a pen color button for a second (with either mouse button) puts a color picker over each button, as the cell color tool does: click one to open the picker, and the pen changes live and the set is saved; hold again, or leave the pen tool, to close them. The colors are read when the page loads, so changing cell colors later does not move the pen until the next load. Turn the pen tool on in settings first.
- [Edge Marks](https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/edge-marks.user.js): adds direction arrows (`>` `<` on a vertical edge, `^` `v` on a horizontal one) and a dot to the pen tool's marks on a cell edge. Clicking an edge cycles through the marks ticked in a settings dialog; the pen tool's own X is one of them. It wraps SudokuPad's pen tool and renderer, which are internals, so a SudokuPad update can break it, and it then leaves the pen tool unchanged. Turn the pen tool on in settings first.
- [Dark Page](https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/dark-page.user.js): makes the page black around the puzzle, or another color you pick in a settings dialog (a color picker, and a Black button to go back); the choice is kept and applies without a reload, and the page's own text turns dark on a light color. A rectangle bounding everything the puzzle draws, and the cells you write in, stays as SudokuPad renders it. Not SudokuPad's dark mode.

Each script adds an entry to SudokuPad's settings, under the Experimental group (collapsed until you open it). The entry shows the script's name; its dialog shows the version in small text beside the heading, so you can tell which one is installed.

## License

[MIT](LICENSE)
