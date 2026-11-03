# sudokupad-scripts

Tampermonkey userscripts for [SudokuPad](https://sudokupad.app).

## Install

Install [Tampermonkey](https://www.tampermonkey.net/), then open a script's link below. Tampermonkey offers to install it.

- [Color by Digit](https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/color-by-digit.user.js): adds a button that colors every cell holding a digit, using groups of palette colors set in a settings dialog.
- [Digit Color](https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/digit-color.user.js): colors the digits themselves, one color per digit, in entered digits, corner marks and centre marks. Starts from default colors; change them in a settings dialog. Givens keep their color; a conflicting mark keeps its digit color and gets a small red circle behind it.
- [Pen Color](https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/pen-color.user.js): changes the pen tool's nine colors in a settings dialog. Strokes already drawn and the tool's color buttons change with them. Starts from SudokuPad's own colors, so installing changes nothing until you edit one. Turn the pen tool on in settings first.

## License

[MIT](LICENSE)
