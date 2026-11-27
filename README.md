# sudokupad-scripts

> [!WARNING]
> **These scripts can break at any time, and there are no guarantees.** They rely on SudokuPad's internals, which aren't a public API, so any SudokuPad update can break them without notice. They aren't made or supported by SudokuPad.

Tampermonkey userscripts for [SudokuPad](https://sudokupad.app) and for other puzzle sites: the [Logic Masters](https://logic-masters.de/Raetselportal/) puzzle portal so far.

Browse them with pictures at <https://chinstrap45.github.io/sudokupad-scripts/>.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Open a script's install link below. Tampermonkey offers to install it.

| Script | What it does | Install |
| --- | --- | --- |
| Pen Tool Extras | Adds to SudokuPad's pen tool: customizable pen colors, dashed and arrow lines, and marks at cell centers, on cell edges and at grid corners. Turn the pen tool on in SudokuPad's settings first. [Details](https://chinstrap45.github.io/sudokupad-scripts/pen-tool-extras.html) | [Install](https://raw.githubusercontent.com/chinstrap45/sudokupad-scripts/main/pen-tool-extras.user.js) |
| Text Anywhere | Adds a Text Anywhere tool for typed notes on the board or beside it, such as cage sums, in colors of its own. Each puzzle keeps its own notes. [Details](https://chinstrap45.github.io/sudokupad-scripts/text-anywhere.html) | [Install](https://raw.githubusercontent.com/chinstrap45/sudokupad-scripts/main/text-anywhere.user.js) |
| Color by Digit | Colors cells, or the digits and marks in them, by digit, with colors you give to groups of digits, and keeps the colors in step as you solve. [Details](https://chinstrap45.github.io/sudokupad-scripts/color-by-digit.html) | [Install](https://raw.githubusercontent.com/chinstrap45/sudokupad-scripts/main/color-by-digit.user.js) |
| Dark Page | Makes the page black around the puzzle, or another color chosen in a settings dialog. The control buttons, the two tool panels and the dialog's dimmed background go dark too, and puzzle colors stay as intended, unlike SudokuPad's dark mode. | [Install](https://raw.githubusercontent.com/chinstrap45/sudokupad-scripts/main/dark-page.user.js) |
| Auto Rules Resizer | Fits SudokuPad's rules to the screen in landscape: the rules pane uses the room the page has to spare before it shrinks the text, and you can resize it by hand. | [Install](https://raw.githubusercontent.com/chinstrap45/sudokupad-scripts/main/auto-rules-resizer.user.js) |
| UI Tweaks | Small changes to SudokuPad, each chosen in a settings dialog. | [Install](https://raw.githubusercontent.com/chinstrap45/sudokupad-scripts/main/ui-tweaks.user.js) |
| Logic Masters Puzzle Preview | Show puzzle preview images inline on Logic Masters portal pages, cached between visits | [Install](https://raw.githubusercontent.com/chinstrap45/sudokupad-scripts/main/logic-masters-puzzle-preview.user.js) |

Logic Masters Puzzle Preview's first version is by juggler, published here with their permission.

## Settings

Each script adds an entry to SudokuPad's settings, under the Experimental group, which stays collapsed until you open it. A script's dialog shows its version beside the heading.

Settings live in the browser's own storage, so another browser profile or device starts with none. Each of those dialogs has **Copy settings** and **Paste settings**, two icons at the right end of the title row: Copy puts that script's settings, as they are now, on the clipboard as one line of JSON, and Paste, in the other browser, saves what the clipboard holds and applies it at once. Paste keeps only that script's own settings, skips any value the script would not accept and says how many, and tells you when the text is not settings. It needs the browser's clipboard permission, which the browser asks for on first use.

If a SudokuPad update changes something a script needs, that part logs a console warning and turns itself off, and a bar at the bottom of the page names it, with a link to report it and a × to dismiss it. The script's dialog lists the same part as off. Under every dialog, **Copy error log** puts the record of each part that has turned off on the clipboard, and **Clear** empties it.

## Questions, bugs and suggestions

Message me on Discord, [@ChinStrap](https://discord.com/users/184770560356646923), or [open an issue](https://github.com/chinstrap45/sudokupad-scripts/issues).

## Script notes

### Color by Digit

In Cell mode, every cell holding a digit, and every empty cell whose center marks all belong to one group, takes its group's color and keeps it in step as you solve. In Digit mode the digits themselves take it instead, in a darker shade, and Both does both. The button turns coloring on and off, and the Cell and Digit checkboxes at the top of its profile menu, and in the settings dialog, choose what it colors. You set the groups in the same dialog.

The full reference, with every profile, pulldown and mode, is [docs/color-by-digit.md](docs/color-by-digit.md).

### Dark Page

- Pick a color in the settings dialog, or use Restore defaults to go back to black. The choice is kept and applies without a reload.
- The page's own text turns dark on a light color.
- On a dark color, the control buttons go dark gray with light purple icons, and the two tool panels (Pen Tool Extras and Text Anywhere) and the dimmed background behind a dialog go dark too. On a light color, they stay as SudokuPad draws them.
- Puzzle colors stay as intended, unlike SudokuPad's dark mode.

### Auto Rules Resizer

Ported from the rules-pane fit of twitch-rules-scroller's stream script, which grew from Nell Gwyn's SudokuPad-ResizeRules.

- In landscape, the rules pane takes all the height the page has to spare (the controls column is lifted so it stays on the page, and keeps SudokuPad's scale) and keeps SudokuPad's width. Only when the rules would still scroll at SudokuPad's own font size does it widen, as far as it takes to stop the scroll at that size and no further than the window's right edge, less 8 px. Only when they would still scroll at the widest does the font shrink, to 70% of SudokuPad's size at the least; below that the rules scroll. Rules that fit take the largest font at which they still do, up to 150% of SudokuPad's size. It refits on a window resize and on each SudokuPad layout.
- In portrait it leaves SudokuPad as it is.
- f+ and f-, in the pane's top edge at its left corner, clear of the text even when the rules scroll, move the font a pixel at a time from the fitted size, between 70% and 150% of SudokuPad's own. f+ also widens the pane when the bigger font would scroll at the current width, only as far as it takes. The two buttons show only while the pointer is over the pane, a corner or the buttons.
- Two drag corners show while the pointer is over the pane, in its edge clear of the text, each taking a press over 24 px each way. The top right grows the pane right and up, moving the controls up; the bottom left grows it left and down. The pane never grows onto the board, the controls never go off the window, even after the window gets smaller, and a drag never shrinks the pane under 15 × 7 rem.
- An "Auto Rules Resizer" entry in SudokuPad's settings opens a dialog with a max auto width and a max auto height, in CSS px. An empty box means no limit, and both start empty. The least is 240 px wide and 112 px high: a smaller value is refused with a message, and Paste settings skips one and counts it, while one saved before the least was raised reads as the least. Restore defaults empties both boxes, for Save or Cancel to decide. The limits cap only the automatic fit, so a corner drag can still go past them, and the height limit caps the room the font is fitted to. They are saved in SudokuPad's own storage.
- A puzzle's text size and pane size, if you change them with f+, f- or the drag corners, are kept per puzzle, for the last 50 puzzles you resized or opened: you get them back when you return to one of them, and every other puzzle starts at the fitted default. Reset puzzle size in the Auto Rules Resizer dialog clears the current puzzle's at once.

### UI Tweaks

Its dialog has six options, each applied at once on Save and kept in the browser. Restore defaults sets the boxes back to how they start, as a draft that Cancel drops:

- **Tab never switches to letters** (on at first): SudokuPad binds both `/` and Tab to the letter toggle and saves the mode, so a stray Tab left the number pad on letters after a refresh. During play, Tab does what it did before, minus the toggle, and a held Tab is stopped too. The letter button and `/` still toggle, and Tab still moves focus in dialogs. It works whenever you turn the letter tool on in settings.
- **Hide the Select button** (off at first): hides SudokuPad's Select button in the bottom row, and the other buttons close up.
- **Wrap buttons** (off at first): the bottom row of tool buttons wraps onto a second line after five. Color by Digit already caps that row at five on its own, so with it installed this option changes nothing.
- **Right-drag pans only when zoomed in** (on at first): with SudokuPad's Test Large Puzzle UI setting on, its right-button drag pans the board on every puzzle, even one that fits the screen and cannot be zoomed. With this option on, a right-drag pans only while you are zoomed in (the wheel zooms a puzzle that was scaled down to fit), and zooming back out to 1 puts the board back at the centre. A right click with no movement still works. At zoom 1 the drag's moves are no longer taken by SudokuPad, so they reach the other scripts like any other moves. With Test Large Puzzle UI off, or this option off, nothing changes.
- **Digit pad size** (Normal at first): Smaller, Normal, Larger or Largest digit buttons. SudokuPad fits the whole controls column to the window, so the digits grow most on a large screen, and on a laptop the other buttons shrink to make room.
- **Mouse wheel changes mode** (off at first): over the board or the column of tool buttons, wheel down selects the next tool button and wheel up the previous one, in screen order, other scripts' tools (Text Anywhere's, Pen Tool Extras' pen) included, and past the end it wraps round. One step is one notch (100 pixels of wheel), so a trackpad steps once per 100 it sends. With SudokuPad's Large Puzzle UI on, a plain wheel over the board no longer zooms: Shift+wheel zooms instead. Pen Tool Extras' page button and SudokuPad's palette button keep their own wheel.

Hide the Select button and Wrap buttons are style rules only, so a SudokuPad update cannot turn them off.

## License

[MIT](LICENSE)
