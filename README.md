# sudokupad-scripts

> [!WARNING]
> **These scripts can break at any time, and there are no guarantees.** They rely on SudokuPad's internals, which aren't a public API, so any SudokuPad update can break them without notice. They aren't made or supported by SudokuPad.

Tampermonkey userscripts for [SudokuPad](https://sudokupad.app).

Browse them with pictures at <https://caneff.github.io/sudokupad-scripts/>.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Open a script's install link below. Tampermonkey offers to install it.

| Script | What it does | Install |
| --- | --- | --- |
| Color by Digit | Adds a button that colors cells by digit, using groups of palette colors you set. | [Install](https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/color-by-digit.user.js) |
| Digit Color | Colors the digits themselves, one color per digit. | [Install](https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/digit-color.user.js) |
| Pen Tool Extras | Adds pen colors, solid, dashed and chevron pens, sliders, and edge and corner marks. [Details](docs/pen-tool-extras.md) | [Install](https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/pen-tool-extras.user.js) |
| Dark Page | Makes the page black around the puzzle, or a color you pick. | [Install](https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/dark-page.user.js) |
| No Tab Letters | Stops Tab from toggling SudokuPad's letter mode. | [Install](https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/no-tab-letters.user.js) |

## Settings

Each script except No Tab Letters adds an entry to SudokuPad's settings, under the Experimental group, which stays collapsed until you open it. A script's dialog shows its version beside the heading.

## Script notes

### Color by Digit

The button colors every cell holding a digit, and every empty cell whose centre marks all belong to one group. You set the groups in a settings dialog.

### Digit Color

Colors entered digits, corner marks and centre marks. It starts from default colors, which you can change in a settings dialog. Givens keep their color. A conflicting mark keeps its digit color and gets a small red circle behind it.

### Dark Page

- Pick a color in the settings dialog, or use the Black button to go back. The choice is kept and applies without a reload.
- The page's own text turns dark on a light color.
- On a dark color, the control buttons go dark gray with light purple icons. On a light color, they stay as SudokuPad draws them.
- A rectangle around everything the puzzle draws, and the cells you write in, stays as SudokuPad renders it.
- It is not SudokuPad's dark mode.

### No Tab Letters

SudokuPad binds both `/` and Tab to the letter toggle and saves the mode, so a stray Tab left the number pad on letters after a refresh.

- During play, Tab does what it did before, minus the toggle.
- The letter button and `/` still toggle, and Tab still moves focus in dialogs.
- It works whenever you turn the letter tool on in settings, and it has no settings entry.
- If a SudokuPad update changes the letter tool or its Tab binding, it logs a console warning and changes nothing.

## License

[MIT](LICENSE)
