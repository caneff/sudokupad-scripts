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
| Color by Digit | Adds a button that colors cells by digit, using groups of palette colors you set in profiles. | [Install](https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/color-by-digit.user.js) |
| Digit Color | Colors the digits themselves, one color per digit. | [Install](https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/digit-color.user.js) |
| Pen Tool Extras | Adds pen colors, solid, dashed and arrow pens, sliders, and edge and corner marks. [Details](docs/pen-tool-extras.md) | [Install](https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/pen-tool-extras.user.js) |
| Dark Page | Makes the page black around the puzzle, or a color you pick. | [Install](https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/dark-page.user.js) |
| No Tab Letters | Stops Tab from toggling SudokuPad's letter mode. | [Install](https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/no-tab-letters.user.js) |
| Auto Rules Resizer | Fits the rules pane to the screen in landscape: wider, with the largest text that fits. | [Install](https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/auto-rules-resizer.user.js) |

## Settings

Each script except No Tab Letters and Auto Rules Resizer adds an entry to SudokuPad's settings, under the Experimental group, which stays collapsed until you open it. A script's dialog shows its version beside the heading.

## Script notes

### Color by Digit

The button colors every cell holding a digit, and every empty cell whose centre marks all belong to one group. You set the groups in a settings dialog.

- **Profiles** are named lists of groups, one to four of them, with exactly one active. A fresh install has Low/5/High (active) and Odd/Even. The button's icon shows the active profile: a cell per group color (the first four), each with the group's shown digit: with 0 left out, the lowest if every digit is below 5, the highest if every digit is above 5, else the middle (the lower middle on an even count), so Low/5/High shows 1, 5 and 9. A group of only 0 shows 0. Groups you saved before profiles existed become the active profile: Low/5/High or Odd/Even if they match one, else a new first profile named Custom, with both preloads beside it.
- **The profile menu** opens from the arrow box on the button, a right click on it, or a hold on it. Pick a profile and it becomes active at once: the old profile's group colors come off every cell and every cell that holds one group's digit (or has only that group's centre marks) gets its new color, as one undo step, whether or not auto mode is on. Edit profiles… opens the settings dialog, where you reorder profiles by dragging the handle, click a row to make it the active one, add one (a copy of the active profile), delete one, and edit its groups, picking each group's digits on a numpad and removing a group with the red × in its box's upper right corner. Save applies every change at once; Cancel drops them. A short press on the button still colors the grid and only adds colors.
- **Auto mode** is the AUTO box on the button, off by default (an X in the box and bold purple when on). Tick it, or tick the box in the settings dialog and Save, and the colors follow the board: a cell that holds one group's digit, or has only centre marks of one group, gets that group's color and loses any other group's; any other cell loses every group color. Corner marks are ignored, and colors in no group stay.
- A digit or centre mark change and its color change are one undo step. Undo, redo and replays never trigger auto mode.
- Turning auto mode on, loading a puzzle with it on, and a restart color the givens. Saving changed groups recolors the whole grid in one undo step.
- A short press on the button still only adds colors. Turning auto mode off leaves every color in place. A group color you remove by hand stays off until that cell's digit or centre marks change.
- With the Multi-color setting off, SudokuPad replaces a cell's color when a group color is added, so a color in no group stays only with Multi-color on. For the same reason, with Multi-color off, undoing a profile switch or an auto mode change does not bring back a color that the group color replaced.

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

### Auto Rules Resizer

Ported from the rules-pane fit of twitch-rules-scroller's stream script, which grew from Nell Gwynn's resizing scripts.

- In landscape, the rules pane widens to the window's right edge, less 8 px, and takes the largest font at which all the rules fit in the room SudokuPad gives the pane. The font never goes below SudokuPad's own, so long rules still scroll. It refits on a window resize and on each SudokuPad layout.
- In portrait it leaves SudokuPad as it is.
- f+ and f-, on the pane's top-right corner, move the font a pixel at a time from the fitted size; f- may go below SudokuPad's own.
- Two corners show while the pointer is over the pane. The top right grows the pane right and up, moving the controls up; the bottom left grows it left and down. The pane never grows onto the board, the controls never go off the window, even after the window gets smaller, and a drag never shrinks the pane under 15 × 7 rem.
- Nothing is saved: the font change and the drag last until a reload, and a new puzzle resets the drag.
- On a page where twitch-rules-scroller's stream script runs, it does nothing, so the two never set the pane's font against each other.

## License

[MIT](LICENSE)
