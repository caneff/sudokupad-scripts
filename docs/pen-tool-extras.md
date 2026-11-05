# Pen Tool Extras

> [!WARNING]
> **This script can break at any time, and there are no guarantees.** It relies on SudokuPad's internals, which aren't a public API, so any SudokuPad update can break it without notice. See [If SudokuPad changes](#if-sudokupad-changes).

The full reference. For a quick look, see the [details page](https://caneff.github.io/sudokupad-scripts/pen-tool-extras.html).

Turn the pen tool on in SudokuPad's settings first.

Lines drawn with a page 2 or page 3 pen are invisible to anyone without this script. SudokuPad stores them and shares them in the replay, but without the script's CSS it draws them with no color.

A replay played with SudokuPad's own pen tool setting off draws page 1 and page 2 marks in pen color 1, with or without the script: a page 2 dashed line comes out solid, and edge and corner marks lose their colors. Page 3 lines keep their colors and arrows. Turn the pen tool on before playing a replay. See `docs/research/sudokupad-replay-files.md`.

## The settings gear

A small white box with a purple gear sits in the upper right corner of the pen tool button, whichever tool is selected. Click or tap it to open the settings dialog; the selected tool stays as it was. A click anywhere else on the button selects the pen tool as before.

## The settings dialog

Pen tool extras in SudokuPad's settings, or the small gear in the upper right corner of the pen tool button, opens one dialog, top to bottom, each section under a thin divider:

1. **Pen colors**, with the SudokuPad colors button.
2. **Line settings**: Thickness and Opacity, each with a Slider in panel box.
3. **Line styles**: Dashed lines and Directional arrow lines, each with an Enable box and a slider under it.
4. **Marks a click cycles through**: one table, edge and corner.
5. **Other**: White outline (with Outline width under it) and Middle click erases a whole line.
6. **Pen line mode**.

Under all of it, one row of buttons: Restore defaults as small underlined text at the left, Cancel and Save at the right. Every slider and box in it is a draft that takes effect on Save, and Cancel leaves what was in force. The slider rows share their columns, so the sliders of Line settings, Line styles and the outline line up. On a narrow screen the rows shrink and wrap.

## Colors

- With nothing saved, the nine pen colors are your current cell color page, darkened. Each pen takes the color on the same button number, and button 0 is not used. The darkest grey becomes black.
- A cell color that is transparent or unreadable leaves SudokuPad's own pen color on that button.
- Strokes already drawn and the color buttons change with the colors.
- The colors are read when the page loads, so changing cell colors later doesn't move the pen until the next load.
- Recoloring a pen changes it on every page.

Two ways to change them:

- **Settings dialog:** a 3 by 3 grid of pickers in the arrangement of the pen buttons. Save keeps your colors.
- **SudokuPad colors button**, beside the grid (below it on a narrow screen): sets the nine pickers to SudokuPad's own pen colors. Like the rest of the dialog it takes effect on Save, and Cancel leaves the colors as they were. Saving stores them as your colors, so they stop following the cell color page, and all three pages follow. Restore defaults is different: it goes back to colors derived from the cell color page.
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

**Slider options** are in the dialog's Line settings section:

- A Slider in panel box at the right end of the Thickness row and of the Opacity row, both ticked by default and saved under `PenColor_sliders`.
- The Thickness and Opacity sliders themselves, which are always in the dialog. A slider whose box is unticked is left out of the panel, but its value still applies and can be changed in the dialog.
- A dialog slider takes effect on Save, and Cancel leaves it. It opens at the value in force, so it matches the panel.
- With one slider hidden, the other keeps its place. With both hidden, the panel's last row holds only the page button.

## White outline

The dialog's Other section has a White outline on lines and marks box, on by default and saved under `PenColor_outline`, and an Outline width line under it, indented, with a slider saved under `PenColor_outlinewidth`. Unticking the box hides the Outline width line in the dialog at once, and ticking it brings it back; the slider keeps its value. With the outline on as the default, the key stores an explicit `false` when it is off and is removed when it is on; the width key is removed when the width is the default.

| Setting | Range | Default | Changes | Saved under |
| --- | --- | --- | --- | --- |
| White outline | on or off | on | Whether every pen mark gets a white outline | `PenColor_outline` (only `false`) |
| Outline width | 1 to 8 units, in steps of 1 | 2 | How far the outline reaches past a mark's edge (a cell is 64 units, a default line 5 wide) | `PenColor_outlinewidth` |

- On, every pen mark on every page gets the outline, lines and marks already drawn included. The width doesn't scale with Thickness.
- The outline wraps the combined shape, so it doesn't cut across lines where they join or cross, and it follows the shape's curves with round corners. Its edge is a little soft: about 1 unit wide at width 2, wider at the top of the range.
- It follows Opacity: the outline is part of the pen layer, so at 40% the white fades with the marks.
- The drag and erase highlights are not outlined.
- With Dark Page, a mark stays inside the rectangle Dark Page keeps, but its outline can reach past it. Dark Page's rectangle also stops at the puzzle's own edge, which on a standard puzzle is a quarter of a cell (16 units) outside the grid, and nothing is drawn past that edge. At a cell width of about 70 px (measured on sudokupad.app) that edge is 17.6 px out, so the part of the white band past it is cut, whatever Dark Page's margin. Only on cells wider than 128 px does Dark Page's own 32 px margin set the cut instead.
- Nothing about it is stored in the puzzle, so replays don't change. Settings saved before the outline was on by default, with no value saved, load with it on at width 2. Restore defaults sets the box on and the width to 2 in the dialog (Save keeps them).

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
- Turn the mouse wheel over the page button, as SudokuPad's color tool does over its own page button: down for the next page, up for the previous. Over the rest of the pen panel the wheel is left to SudokuPad.

The script takes no input SudokuPad doesn't itself use that way: Tab turns the page because the color tool does, and the wheel only over the page button for the same reason (`docs/research/sudokupad-color-tool-paging.md`).

The same pen number stays selected across pages. The selected pen is saved under `PenColor_pen` and comes back after a reload. SudokuPad's own `ToolPen_color` only ever holds the pen's number, so removing the script leaves stock SudokuPad working with that pen on its first page.

## Line styles

The dialog's Line styles section has an Enable box for each of page 2 (Dashed lines) and page 3 (Directional arrow lines), both ticked by default and saved together under `PenColor_linestyles`, which is removed when both are ticked.

- An unticked style's page is skipped by the page button, Tab and the wheel, and has no dot on the page button.
- Saving with the page you are on unticked moves the selected pen to the same number on page 1. A saved pen on an unticked page does the same when the pen tool opens.
- With both unticked, the page button is hidden, and the script takes neither Tab nor the wheel.
- Lines already drawn in an unticked page's pens still draw, dashes and arrows as before. Only the choice of those pens goes.
- Unticking a style's Enable hides its slider row in the dialog at once, and ticking it brings it back; the slider keeps its value.

### Dash length (page 2)

A dialog slider from 0 to 8 line widths, under Dashed lines, saved under `PenColor_dash`.

- The default is 3. 0 is dots, and a saved 0 stays as saved.
- A dash is that many line widths long, so it scales with Thickness. It also changes lines already drawn, and the page button and the page 2 swatches show it.
- Each cell's piece of a line starts and ends with half a dash, with a whole number of dash-and-gap periods fitted to the piece, whether it runs along a cell's center, its edge or a diagonal. So a line is inked at its two ends, at every turn and at every join between cells, as a solid line would be, and two pieces meet in one whole dash. Dots follow the same rule, with a dot on each of those points.
- Every gap is at least one line width wide where it shows (two line widths between the dash patterns, since the round caps take one), on a straight and a diagonal piece alike. A dash too long for a cell to hold that gap is shortened to leave it, so a page 2 line is never solid.

### Arrow lines (page 3)

- **Arrow spacing**, a dialog slider under Directional arrow lines, from 3 to 12 line widths from the middle of one arrow to the middle of the next, saved under `PenColor_arrowspacing`. The default is 5. Like Dash length it is a draft until Save, then redraws the lines already drawn.
- Each cell's piece of a line is drawn with whole arrows, about three to a cell at thickness 5 and the default spacing, so a run reads as one across a cell boundary.
- Each arrow is a triangle filled in the pen's color, sitting on the line and pointing the way you dragged: 1.5 line widths out to each side of the line's middle and 2.25 line widths long. The line under the arrows is as thick as a page 1 line at every Thickness. Arrows scale with Thickness from 5 up, so they stick out past the line at every value. Below 5 they keep their size at 5, so direction stays visible.
- They follow Opacity, and lines already drawn follow Thickness. They stay inside the rectangle Dark Page keeps at 16.
- A drag that turns stores the right direction per segment and is one undo step. The replay and a reload keep it.
- Dragging over a line erases it, whichever way either was drawn.
- A pen value has no direction, so each page 3 pen uses two color characters, one for each way, from `j` to `z` and `0`.

## Edge marks

Clicking a cell edge cycles through the marks ticked in the dialog's Marks table (the Edge row), in this order, then empty:

- SudokuPad's own X.
- A circle, a small open ring. A dot saved by an earlier version draws as the circle.
- The first direction, then the second: `>` and `<` on a vertical edge, `^` and `v` on a horizontal one.

The table's columns are X Mark, Circle and Directions (one box for both directions). Each box shows only its picture, and the mark's name (Edge X Mark, Corner Circle and so on) is its accessible name and hover title. The order changed in 1.13.0 from X, directions, circle: the stored values are the same, only the clicks step differently.

## Corner marks

A click within 0.2 of a cell of a grid corner, inner or outer, cycles an X, then a circle, then empty.

- There are no arrows, since a corner has no edge direction.
- The Corner row of the Marks table has an X Mark and a Circle box, which turn each on or off. With both off, a click near a corner is SudokuPad's own edge click again.
- A corner shared by four cells is one mark.
- They're half the Thickness slider, like edge marks, and are saved with the edge mark settings.

## Right click

A right click on an edge or a grid corner steps the same cycle backwards, from empty to the last ticked mark and from the X to empty. It keeps the browser's menu closed there. A right click anywhere else keeps the menu. Touch has no right click, so it only steps forward.

## Middle click

The dialog's Middle click erases a whole line box is on by default and saved under `PenColor_middleerase` (removed when on, `false` when off). Off, a middle click is left wholly to SudokuPad and the browser: no erase, no default prevented, and the autoscroll as stock.

With the box on and the pen tool on, a middle click on a line erases the whole line as one undo step: every piece joined to it where two pieces meet at a cell middle or a cell corner, and drawn with the same pen, so a branch or a crossing of that pen at such a point is included (two diagonals of one pen that cross mid-cell meet at no point and stay separate), but not a piece of another pen (on page 3, both direction characters of a pen count as one pen) and no mark; a middle click where there is no line does nothing and makes no mark. A middle click leaves the browser's autoscroll off over the grid in the pen tool, and outside the pen tool it is left alone.

## Line mode

The dialog's Pen line mode (Center & Edge, Center only, Edge only) is SudokuPad's own setting, saved where its pulldown saved it. Save applies it. SudokuPad's pulldown is hidden from the panel, and the sliders take its row.

## Restore defaults

The dialog's Restore defaults goes back to the darkened cell color page. It also sets the dialog's Thickness, Opacity, Dash length (3) and Arrow spacing (5) sliders, the Slider in panel and Enable boxes, the White outline box (on), the Outline width slider (2) and the Middle click box (on) back to their defaults. All of it waits for Save, and Cancel leaves what was in force.

## If SudokuPad changes

The script installs itself in steps, and each step checks at startup that the SudokuPad internals it needs are there. A step whose internals are gone is not installed, and the browser console says so once: `pen-tool-extras: marks, line erase skipped because SudokuPad has no getCell`. A step that throws later, in its own code, is skipped from then on: SudokuPad's own function answers in its place on that call and every later one, and the console says so once as `pen-tool-extras: <step> skipped because SudokuPad changed:` with the error. A throw in SudokuPad's own function is SudokuPad's, and skips nothing. The other steps keep working.

The settings dialog names the skipped steps in one line at its top, for example `Off because SudokuPad changed: arrow lines`, and shows nothing when all is well. Its controls stay; a control of a skipped step does nothing until the page loads with the step installed. Reload after updating the script.

| Step | Not installed when SudokuPad has no | What you see with it skipped |
| --- | --- | --- |
| colors | the cell color tool (`tools.colour`); also skipped when reading its page or opening the pickers fails | The pen colors are not derived from the cell color page, and a hold on a pen color button opens no pickers. The dialog's pickers and saved colors still work. A color tool that is merely slow or empty leaves SudokuPad's own pen colors, with a warning of its own |
| pen pages | the pen tool's `setSelectedColor`, `handleToolEnter` or `handleToolExit` | Only SudokuPad's nine pens. Tab, the mouse wheel and the page button do nothing, and a pen on page 2 or 3 that was selected is replaced by the same color on page 1. Lines already stored with a page 2 or page 3 pen keep their color |
| arrow lines | the renderer's `renderPen` or `renderPart`, the pen tool's `clickCell`, `actStart`, `actAdd`, `actSend` or `_actList`, or the app's `puzzle.cells` | Page 3 lines draw as plain lines of the pen's color, and a line dragged with a page 3 pen is stored in the pen's own character, with no direction |
| drag highlight | the pen tool's `drawLineHint` | The highlight of a line being dragged fades with the opacity setting and takes the white outline |
| marks | the pen tool's `clickCell`, `getInputRc`, `actStart`, `actAdd`, `actSend` or `_actList`, the renderer's `renderPen`, `rcToPathData` or `CellSize`, the grid's `getCell`, `rows` or `cols`, or the app's `puzzle.cells` | A click on an edge or a corner is SudokuPad's own edge click (its X), and a right click no longer steps backwards or keeps the browser's menu shut. The arrows, circles and corner marks you drew stay stored in the puzzle and its replay, and draw as nothing |
| pen panel | the pen tool (`ToolPen.tool`), or the `.penlinemode` element in its panel (checked a second after the panel shows) | SudokuPad's own line mode pulldown stays in the panel, and the sliders and the page button, which would take its row, are left out. Tab still turns pages. The dialog has no Pen line mode |
| line erase | the pen tool's `clickCell`, `actStart`, `actAdd`, `actSend` or `_actList`, the app's `xyToRCExact` or `puzzle.cells`, the grid's `getCell` | A middle click is SudokuPad's own click |
| settings gear | nothing; skipped when adding the gear to the pen tool button (`#control-pen`) fails | No gear on the button; the entry in SudokuPad's settings still opens the dialog. A page with no pen tool button just shows no gear |
