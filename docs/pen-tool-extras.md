# Pen Tool Extras

> [!WARNING]
> **This script can break at any time, and there are no guarantees.** It relies on SudokuPad's internals, which aren't a public API, so any SudokuPad update can break it without notice. See [If SudokuPad changes](#if-sudokupad-changes).

The full reference. For a quick look, see the [details page](https://caneff.github.io/sudokupad-scripts/pen-tool-extras.html).

Turn the pen tool on in SudokuPad's settings first.

Lines drawn with a page 2 or page 3 pen are invisible to anyone without this script. SudokuPad stores them and shares them in the replay, but without the script's CSS it draws them with no color.

A replay played with SudokuPad's own pen tool setting off draws page 1 and page 2 marks in pen color 1, with or without the script: a page 2 dashed line comes out solid, and edge and corner marks lose their colors. Page 3 lines keep their colors and arrows. Turn the pen tool on before playing a replay. See `docs/research/sudokupad-replay-files.md`.

## Colors

- With nothing saved, the nine pen colors are your current cell color page, darkened. Each pen takes the color on the same button number, and button 0 is not used. The darkest grey becomes black.
- A cell color that is transparent or unreadable leaves SudokuPad's own pen color on that button.
- Strokes already drawn and the color buttons change with the colors.
- The colors are read when the page loads, so changing cell colors later doesn't move the pen until the next load.
- Recoloring a pen changes it on every page.

Two ways to change them:

- **Settings dialog:** a 3 by 3 grid of pickers in the arrangement of the pen buttons. Save keeps your colors.
- **SudokuPad colors button**, beside the grid: sets the nine pickers to SudokuPad's own pen colors. Like the rest of the dialog it takes effect on Save, and Cancel leaves the colors as they were. Saving stores them as your colors, so they stop following the cell color page, and all three pages follow. Restore defaults is different: it goes back to colors derived from the cell color page.
- **Hold a pen color button for a second**, with either mouse button: a picker appears over each button, as in the cell color tool. Click one to open it. The pen changes live and the set is saved. Hold again, or leave the pen tool, to close them.

## Sliders

Both sliders sit in the pen tool's panel, each with a small line icon, so you can change them during play. A move changes the marks live and saves at once. It adds nothing to undo or the replay, and gives the keyboard back to the puzzle.

| Slider | Range | Default | Changes | Saved under |
| --- | --- | --- | --- | --- |
| Thickness | 1 to 16 | 5 | Lines, cell circles and crosses, and edge and corner marks, by the same factor | `PenColor_thickness` |
| Opacity | 20 to 100%, in steps of 5 | 80 | How see-through every pen mark is | `PenColor_opacity` |

**Mark growth:** above thickness 5, edge and corner marks also get longer, evenly to 1.6 times at 16, staying centred with the same stroke width, so the whole of an edge X clears a line of the same thickness. Lines don't. It's a CSS scale, so marks already drawn grow too. Dark Page keeps the largest of them inside its rectangle.

**Marks above lines:** every edge mark, corner mark and cell circle and cross is drawn above every pen line, whichever cell holds it. SudokuPad draws strokes in cell order, which used to bury a mark under a line in a later cell. A mark in the same color as the line under it still doesn't stand out on a thick line; it shows only by its shape.

**Opacity on the whole layer:** strokes that overlap don't darken at the joins. Where two colors cross, the later stroke covers the earlier one instead of blending with it. The drag and erase highlights keep SudokuPad's own look at every value.

**Slider options** are in the dialog's Sliders section:

- Show thickness slider and Show opacity slider, both on by default and saved under `PenColor_sliders`.
- The Thickness and Opacity sliders themselves, which are always there. A hidden slider's value still applies and can be changed in the dialog.
- A dialog slider takes effect on Save, and Cancel leaves it. It opens at the value in force, so it matches the panel.
- With one slider hidden, the other keeps its place. With both hidden, the panel's last row holds only the page button.

## White outline

The dialog's Outline section has a White outline box, off by default and saved under `PenColor_outline`, and an Outline width slider beside it, saved under `PenColor_outlinewidth`. Either key is removed when its value is the default, so settings saved before they existed load with the outline off and its width at 3.

| Setting | Range | Default | Changes | Saved under |
| --- | --- | --- | --- | --- |
| White outline | on or off | off | Whether every pen mark gets a white outline | `PenColor_outline` |
| Outline width | 1 to 8 units, in steps of 1 | 3 | How far the outline reaches past a mark's edge (a cell is 64 units, a default line 5 wide) | `PenColor_outlinewidth` |

- On, every pen mark on every page gets the outline, lines and marks already drawn included. The width doesn't scale with Thickness.
- The outline wraps the combined shape, so it doesn't cut across lines where they join or cross, and it follows the shape's curves with round corners. Its edge is a little soft: about 1 unit wide at width 3, wider at the top of the range.
- It follows Opacity: the outline is part of the pen layer, so at 40% the white fades with the marks.
- The drag and erase highlights are not outlined.
- With Dark Page, a mark stays inside the rectangle Dark Page keeps, but its outline can reach past it. Dark Page's rectangle also stops at the puzzle's own edge, which on a standard puzzle is a quarter of a cell (16 units) outside the grid, and nothing is drawn past that edge. At a cell width of about 70 px (measured on sudokupad.app) that edge is 17.6 px out, so the part of the white band past it is cut, whatever Dark Page's margin. Only on cells wider than 128 px does Dark Page's own 32 px margin set the cut instead.
- Nothing about it is stored in the puzzle, so replays don't change. Like the other dialog settings it takes effect on Save, Cancel leaves it, and Restore defaults sets the box off and the width to 3 in the dialog (Save keeps them).

## Pen pages

There are three pages of nine pens, for 27, using the same nine colors.

| Page | Draws |
| --- | --- |
| 1 | SudokuPad's solid lines |
| 2 | Dashed lines, or dots with a Dash length of 0 |
| 3 | A line with a run of arrows (filled triangles), pointing the way you dragged |

Only lines change with the page. A cell circle, a cross and the edge and corner marks stay solid.

**Changing page**, the way the cell color tool does:

- Click the page button at the right end of the panel's last row. It shows the line the next page draws, with a dot for each page and the current one filled.
- Press Tab. Tab does nothing else in the pen tool with this script on, with or without No Tab Letters. Shift+Tab is left to SudokuPad.
- Turn the mouse wheel over the pen buttons: down for the next page, up for the previous.

The same pen number stays selected across pages. The selected pen is saved under `PenColor_pen` and comes back after a reload. SudokuPad's own `ToolPen_color` only ever holds the pen's number, so removing the script leaves stock SudokuPad working with that pen on its first page.

### Dash length (page 2)

A dialog slider from 0 to 8 line widths, saved under `PenColor_dash`.

- The default is 3. 0 is dots, and a saved 0 stays as saved.
- A dash is that many line widths long, so it scales with Thickness. It also changes lines already drawn, and the page button and the page 2 swatches show it.
- Each cell's piece of a line starts and ends with half a dash, with a whole number of dash-and-gap periods fitted to the piece, whether it runs along a cell's center, its edge or a diagonal. So a line is inked at its two ends, at every turn and at every join between cells, as a solid line would be, and two pieces meet in one whole dash. Dots follow the same rule, with a dot on each of those points.
- Every gap is at least one line width wide where it shows (two line widths between the dash patterns, since the round caps take one), on a straight and a diagonal piece alike. A dash too long for a cell to hold that gap is shortened to leave it, so a page 2 line is never solid.

### Arrow lines (page 3)

- Each cell's piece of a line is drawn with whole arrows, about three to a cell at thickness 5, so a run reads as one across a cell boundary.
- Each arrow is a triangle filled in the pen's color, sitting on the line and pointing the way you dragged: 1.5 line widths out to each side of the line's middle and 2.25 line widths long. The line under the arrows is as thick as a page 1 line at every Thickness. Arrows scale with Thickness from 5 up, so they stick out past the line at every value. Below 5 they keep their size at 5, so direction stays visible.
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

## Middle click

With the pen tool on, a middle click on a line erases the whole line as one undo step: every piece joined to it where two pieces meet at a cell middle or a cell corner, and drawn with the same pen, so a branch or a crossing of that pen at such a point is included (two diagonals of one pen that cross mid-cell meet at no point and stay separate), but not a piece of another pen (on page 3, both direction characters of a pen count as one pen) and no mark; a middle click where there is no line does nothing and makes no mark. A middle click leaves the browser's autoscroll off over the grid in the pen tool, and outside the pen tool it is left alone.

## Line mode

The dialog's Pen line mode (Center & Edge, Center only, Edge only) is SudokuPad's own setting, saved where its pulldown saved it. Save applies it. SudokuPad's pulldown is hidden from the panel, and the sliders take its row.

## Restore defaults

The dialog's Restore defaults goes back to the darkened cell color page. It also sets the dialog's Thickness, Opacity and Dash length (3) sliders, the two Show boxes, the White outline box and the Outline width slider (3) back to their defaults. All of it waits for Save, and Cancel leaves what was in force.

## If SudokuPad changes

| If an update changes | What happens |
| --- | --- |
| The pen tool or its renderer | Edge and corner marks and the middle click line erase are left off, and page 3 lines draw as plain lines with no arrows |
| SudokuPad's line mode pulldown | The sliders and the page button don't appear. Saved thickness and opacity still apply, but can't be changed until the script is updated |
| Either of these | The colors still work |
