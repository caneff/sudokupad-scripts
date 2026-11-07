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
| Color by Digit | Adds a button that colors cells, or the digits and marks in them, by digit, with colors you give to groups of digits, and keeps the colors in step as you solve. [Details](https://caneff.github.io/sudokupad-scripts/color-by-digit.html) | [Install](https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/color-by-digit.user.js) |
| Pen Tool Extras | Adds pen colors, solid, dashed and arrow pens, sliders, and edge and corner marks. [Details](docs/pen-tool-extras.md) | [Install](https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/pen-tool-extras.user.js) |
| Draw Tool | Adds a Draw tool for freehand lines and typed text, such as cage sums, in the pen colors. Each puzzle keeps its own drawing. [Details](https://caneff.github.io/sudokupad-scripts/draw-tool.html) | [Install](https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/draw-tool.user.js) |
| Dark Page | Makes the page black around the puzzle, or a color you pick. | [Install](https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/dark-page.user.js) |
| No Tab Letters | Stops Tab from toggling SudokuPad's letter mode. | [Install](https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/no-tab-letters.user.js) |
| Auto Rules Resizer | Fits the rules pane to the screen in landscape: the largest text that fits, widening the pane only when the rules need it. | [Install](https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/auto-rules-resizer.user.js) |

## Settings

Each script except No Tab Letters and Draw Tool adds an entry to SudokuPad's settings, under the Experimental group, which stays collapsed until you open it. A script's dialog shows its version beside the heading.

Settings live in the browser's own storage, so another browser profile or device starts with none. Each of those dialogs has a **Copy settings** and a **Paste settings** button (in Pen Tool Extras, two icons at the right end of the title row): Copy puts that script's settings, as they are now, on the clipboard as one line of JSON, and Paste, in the other browser, saves what the clipboard holds and applies it at once. Paste keeps only that script's own settings, skips any value the script would not accept and says how many, and tells you when the text is not settings. It needs the browser's clipboard permission, which the browser asks for on first use.

## Script notes

### Color by Digit

In Cell mode, every cell holding a digit, and every empty cell whose center marks all belong to one group, takes its group's color and keeps it in step as you solve. In Digit mode the digits themselves take it instead, in a darker shade, and Both does both. You set the groups in a settings dialog.

- **Profiles** are named lists of groups, one to six of them, with exactly one active. A fresh install has five preloads: Low/5/High (active), Odd/Even, Entropic (0-3, 4-6, 7-9), Modular (1/4/7, 2/5/8, 0/3/6/9) and Each digit (1 to 9 each on its own color, 0 in no group: 5 to 9 on their own keys of the first palette page, and 1 to 4 on purple, pink and brown from the second page and green from the third, so no digit's shade is black or grey like a given). An install with saved profiles gets Entropic and Modular added once, and Each digit once, each unless a profile already has the same groups or the six profiles are taken; delete one and it stays deleted. The button's icon shows the active profile: a cell per group color (the first four), each with the group's shown digit: with 0 left out, the lowest if every digit is below 5, the highest if every digit is above 5, else the middle (the lower middle on an even count), so Low/5/High shows 1, 5 and 9. A group of only 0 shows 0. Groups you saved before profiles existed become the active profile: the preload they match, else a new first profile named Custom, with the five preloads beside it.
- **The profile menu** opens from the arrow box on the button, a right click on it, or a hold on it. Pick a profile and it becomes active at once (with sync unticked, see below, the menu has a Cells section and a Digits section). In Cell and Both the old profile's group colors come off every cell and every cell that holds one group's digit (or has only that group's center marks) gets its new color, as one undo step; in Digit and Both the digits take their new shades. Edit profiles… opens the settings dialog, where you reorder profiles by dragging the handle, click a row to make it the active one, add one (a copy of the active profile), delete one, and edit its groups, picking each group's digits on a numpad and removing a group with the red × in its box's upper right corner. Save applies every change at once; Cancel drops them.
- **Sync digit profile with cell profile**, a checkbox in the settings dialog, is ticked on a fresh install and after an update: one active profile colors cells and digits. Untick it and there are two picks from the one list of profiles, a cell profile for Cell and Both and a digit profile for Digit and Both, and the profile menu shows them as two sections, Cells and Digits; a pick in Cells recolors only the cells (one undo step), and a pick in Digits only the digits. Unticking starts the digit profile on the cell profile, so nothing changes until you pick another; ticking it again makes the digits take the cell profile. The button's icon shows the cell profile in Cell, Both and Off, and the digit profile in Digit. Deleting the digit profile makes the digits follow the cell profile again.
- **Use digit colors**, a checkbox at the top of the settings dialog, is ticked on a fresh install and after an update. Untick it to drop digit coloring altogether: a press steps Cell ↔ Off, the dialog offers only Cell and Off, the sync checkbox and the menu's Digits section hide, and no digit is colored or circled. Unticking in Digit goes to Off, in Both to Cell. Tick it again and the four modes, the sync checkbox and both profile picks come back as they were. Copy settings and Paste settings carry both checkboxes and the digit profile; settings copied before them paste as ticked.
- **The mode** is Cell, Digit, Both or Off, named in the button's top strip: CELL, DIGIT and BOTH in bold purple, OFF in grey. A short press on the button steps it, Cell → Digit → Both → Off → Cell, and the settings dialog has the same choice at its top; Save applies a changed mode as a press would. A fresh install starts in Cell; an install that had the old auto mode keeps its look, Cell if auto mode was on and Off if it was off.
- In Cell and Both the cell colors follow the board: a cell that holds one group's digit, or has only center marks of one group, gets that group's color and loses any other group's; any other cell loses every group color. Corner marks are ignored, and colors in no group stay.
- A digit or center mark change and its color change are one undo step. Undo, redo and replays never trigger cell coloring.
- Entering Cell or Both, loading a puzzle in either, and a restart in either color the grid: every cell with a digit or center marks gets its colors, not only the givens, in one undo step. A cell with no digit and no center marks keeps whatever color it has. Saving changed groups in Cell or Both recolors the whole grid in one undo step.
- Leaving Cell or Both for Digit or Off takes every group color of the active profile off every cell, in one undo step; colors in no group stay. A group color you remove by hand in Cell stays off until that cell's digit or center marks change, or until entering Cell, a restart, or a reload in Cell recolors the cell.
- With the Multi-color setting off, SudokuPad replaces a cell's color when a group color is added, so a color in no group stays only with Multi-color on. For the same reason, with Multi-color off, undoing a profile switch or a mode change does not bring back a color that the group color replaced.
- In Digit and Both, entered digits, corner marks and center marks take a darker shade of their group's color, as the palette the puzzle shows has it, the way Pen Tool Extras darkens cell colors for its pens. Givens, and digits in no group, keep SudokuPad's own color. A mark that conflicts keeps its shade and gets a small red circle behind it, while SudokuPad shows conflicts. The shades are not part of the puzzle, so they are never an undo step; a profile switch or a mode change shows them at once.

### Dark Page

- Pick a color in the settings dialog, or use the Black button to go back. The choice is kept and applies without a reload.
- The page's own text turns dark on a light color.
- On a dark color, the control buttons go dark gray with light purple icons. On a light color, they stay as SudokuPad draws them.
- Puzzle colors stay as intended, unlike SudokuPad's dark mode.

### No Tab Letters

SudokuPad binds both `/` and Tab to the letter toggle and saves the mode, so a stray Tab left the number pad on letters after a refresh.

- During play, Tab does what it did before, minus the toggle.
- The letter button and `/` still toggle, and Tab still moves focus in dialogs.
- It works whenever you turn the letter tool on in settings, and it has no settings entry.
- If a SudokuPad update changes the letter tool or its Tab binding, it logs a console warning and changes nothing.

### Auto Rules Resizer

Ported from the rules-pane fit of twitch-rules-scroller's stream script, which grew from Nell Gwynn's resizing scripts.

- In landscape, the rules pane keeps SudokuPad's width and takes the largest font at which all the rules fit in the room SudokuPad gives the pane. Only when the rules would still scroll at SudokuPad's own font size does it widen, as far as it takes to stop the scroll at that size and no further than the window's right edge, less 8 px. The font never goes below SudokuPad's own, so rules too long still scroll. It refits on a window resize and on each SudokuPad layout.
- In portrait it leaves SudokuPad as it is.
- f+ and f-, above the pane's top-left corner, move the font a pixel at a time from the fitted size; f- may go below SudokuPad's own. f+ also widens the pane when the bigger font would scroll at the current width, only as far as it takes. The two buttons show only while the pointer is over the pane, a corner or the buttons.
- Two corners show while the pointer is over the pane. The top right grows the pane right and up, moving the controls up; the bottom left grows it left and down. The pane never grows onto the board, the controls never go off the window, even after the window gets smaller, and a drag never shrinks the pane under 15 × 7 rem.
- A "Rules Resizer" entry in SudokuPad's settings opens a dialog with a max auto width and a max auto height, in CSS px. An empty box means no limit, and both start empty. The limits cap only the automatic fit, so a corner drag can still go past them, and the height limit caps the room the font is fitted to. They are saved in SudokuPad's own storage.
- The font change and the drag are not saved: they last until a reload, and a new puzzle resets the drag.

## License

[MIT](LICENSE)
