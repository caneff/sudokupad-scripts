# sudokupad-scripts

Tampermonkey userscripts for [SudokuPad](https://sudokupad.app).

## Install

Install [Tampermonkey](https://www.tampermonkey.net/), then open a script's link below. Tampermonkey offers to install it.

- [Color by Digit](https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/color-by-digit.user.js): adds a button that colors every cell holding a digit, using groups of palette colors set in a settings dialog.
- [Digit Color](https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/digit-color.user.js): colors the digits themselves, one color per digit, in entered digits, corner marks and centre marks. Starts from default colors; change them in a settings dialog. Givens keep their color; a conflicting mark gets a red outline over its digit color.
- [Pen Color](https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/pen-color.user.js): changes the pen tool's nine colors in a settings dialog. Strokes already drawn and the tool's color buttons change with them. With nothing saved, the nine pen colors are your current cell color page, darkened, so installing changes the pen colors straight away; edit and Save to keep your own, and Restore defaults goes back to the darkened page. The colors are read when the page loads, so changing cell colors later does not move the pen until the next load. Turn the pen tool on in settings first.

## License

[MIT](LICENSE)
