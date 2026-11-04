# Pen Tool Extras

> [!WARNING]
> **This script can break at any time, and there are no guarantees.** It relies on SudokuPad's internals, which aren't a public API, so any SudokuPad update can break it without notice. See [If SudokuPad changes](#if-sudokupad-changes).

The full reference. For a quick look, see the [details page](https://caneff.github.io/sudokupad-scripts/pen-tool-extras.html).

Turn the pen tool on in SudokuPad's settings first.

Lines drawn with a page 2 or page 3 pen are invisible to anyone without this script. SudokuPad stores them and shares them in the replay, but without the script's CSS it draws them with no color.

## Colors

- With nothing saved, the nine pen colors are your current cell color page, darkened. Each pen takes the color on the same button number, and button 0 is not used. The darkest grey becomes black.
- A cell color that is transparent or unreadable leaves SudokuPad's own pen color on that button.
- Strokes already drawn and the color buttons change with the colors.
- The colors are read when the page loads, so changing cell colors later doesn't move the pen until the next load.
- Recoloring a pen changes it on every page.

Two ways to change them:

- **Settings dialog:** a 3 by 3 grid of pickers in the arrangement of the pen buttons. Save keeps your colors.
- **Hold a pen color button for a second**, with either mouse button: a picker appears over each button, as in the cell color tool. Click one to open it. The pen changes live and the set is saved. Hold again, or leave the pen tool, to close them.

## Sliders

Both sliders sit in the pen tool's panel, each with a small line icon, so you can change them during play. A move changes the marks live and saves at once. It adds nothing to undo or the replay, and gives the keyboard back to the puzzle.

| Slider | Range | Default | Changes | Saved under |
| --- | --- | --- | --- | --- |
| Thickness | 1 to 16 | 5 | Lines, cell circles and crosses, and edge and corner marks, by the same factor | `PenColor_thickness` |
| Opacity | 20 to 100%, in steps of 5 | 80 | How see-through every pen mark is | `PenColor_opacity` |

**Mark growth:** above thickness 5, edge and corner marks also get longer, evenly to 1.3 times at 16, staying centred with the same stroke width. Lines don't. It's a CSS scale, so marks already drawn grow too. Dark Page keeps the largest of them inside its rectangle.

**Opacity on the whole layer:** strokes that overlap don't darken at the joins. Where two colors cross, the later stroke covers the earlier one instead of blending with it. The drag and erase highlights keep SudokuPad's own look at every value.

**Slider options** are in the dialog's Sliders section:

- Show thickness slider and Show opacity slider, both on by default and saved under `PenColor_sliders`.
- The Thickness and Opacity sliders themselves, which are always there. A hidden slider's value still applies and can be changed in the dialog.
- A dialog slider takes effect on Save, and Cancel leaves it. It opens at the value in force, so it matches the panel.
- With one slider hidden, the other keeps its place. With both hidden, the panel's last row holds only the page button.

## Pen pages

There are three pages of nine pens, for 27, using the same nine colors.

| Page | Draws |
| --- | --- |
| 1 | SudokuPad's solid lines |
| 2 | Dotted lines, or dashes with the Dash length setting |
| 3 | A thin line with a run of chevrons, pointing the way you dragged |

Only lines change with the page. A cell circle, a cross and the edge and corner marks stay solid.

**Changing page**, the way the cell color tool does:

- Click the page button at the right end of the panel's last row. It shows the line the next page draws, with a dot for each page and the current one filled.
- Press Tab. Tab does nothing else in the pen tool with this script on, with or without No Tab Letters. Shift+Tab is left to SudokuPad.
- Turn the mouse wheel over the pen buttons: down for the next page, up for the previous.

The same pen number stays selected across pages. The selected pen is saved under `PenColor_pen` and comes back after a reload. SudokuPad's own `ToolPen_color` only ever holds the pen's number, so removing the script leaves stock SudokuPad working with that pen on its first page.

### Dash length (page 2)

A dialog slider from 0 to 8 line widths, saved under `PenColor_dash`.

- 0 is dots, and settings saved without it keep dots.
- A dash is that many line widths long, so it scales with Thickness. It also changes lines already drawn, and it shows on the page button. The page 2 swatches stay dots.
- Each cell's piece of a line starts and ends with half a gap, so dashes stay the same length across a cell boundary.
- A dash too long for a cell to hold a gap is shortened to leave one, so a page 2 line is never solid.

### Chevrons (page 3)

- Each cell's piece of a line is drawn with whole chevrons, about three to a cell at thickness 5, so a run reads as one across a cell boundary.
- Chevrons scale with Thickness from 5 up. Below 5 they keep their size at 5, so direction stays visible, and the thin line stops thinning at a minimum that still shows.
- They follow Opacity, and lines already drawn follow Thickness. They stay inside the rectangle Dark Page keeps at 16.
- A drag that turns stores the right direction per segment and is one undo step. The replay and a reload keep it.
- Dragging over a line erases it, whichever way either was drawn.
- A pen value has no direction, so each page 3 pen uses two color characters, one for each way, from `j` to `z` and `0`.

## Edge marks

Clicking a cell edge cycles through the marks ticked in the dialog, each shown with a small picture:

- SudokuPad's own X.
- Direction arrows: `>` and `<` on a vertical edge, `^` and `v` on a horizontal one.
- A circle, a small open ring. A dot saved by an earlier version draws as the circle.

## Corner marks

A click within 0.2 of a cell of a grid corner, inner or outer, cycles an X, then a circle, then empty.

- There are no arrows, since a corner has no edge direction.
- The dialog's two Corner marks boxes turn each on or off. With both off, a click near a corner is SudokuPad's own edge click again.
- A corner shared by four cells is one mark.
- They're half the Thickness slider, like edge marks, and are saved with the edge mark settings.

## Right click

A right click on an edge or a grid corner steps the same cycle backwards, from empty to the last ticked mark and from the X to empty. It keeps the browser's menu closed there. A right click anywhere else keeps the menu. Touch has no right click, so it only steps forward.

## Line mode

The dialog's Pen line mode (Center & Edge, Center only, Edge only) is SudokuPad's own setting, saved where its pulldown saved it. Save applies it. SudokuPad's pulldown is hidden from the panel, and the sliders take its row.

## Restore defaults

The dialog's Restore defaults goes back to the darkened cell color page. It also sets the dialog's Thickness, Opacity and Dash length sliders and the two Show boxes back to their defaults. All of it waits for Save, and Cancel leaves what was in force.

## If SudokuPad changes

| If an update changes | What happens |
| --- | --- |
| The pen tool or its renderer | Edge and corner marks are left off, and page 3 lines draw as plain lines with no chevrons |
| SudokuPad's line mode pulldown | The sliders and the page button don't appear. Saved thickness and opacity still apply, but can't be changed until the script is updated |
| Either of these | The colors still work |
