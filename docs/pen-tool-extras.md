# Pen Tool Extras

> [!WARNING]
> **This script can break at any time, and there are no guarantees.** It relies on SudokuPad's internals, which aren't a public API, so any SudokuPad update can break it without notice. See [If SudokuPad changes](#if-sudokupad-changes).

The full reference. For a quick look, see the [details page](https://caneff.github.io/sudokupad-scripts/pen-tool-extras.html).

Turn the pen tool on in SudokuPad's settings first.

Lines drawn with a page 2 or page 3 pen are invisible to anyone without this script. SudokuPad stores them and shares them in the replay, but without the script's CSS it draws them with no color.

A replay played with SudokuPad's own pen tool setting off draws page 1 and page 2 marks in pen color 1, with or without the script: a page 2 dashed line comes out solid, and edge and corner marks lose their colors. Page 3 lines keep their colors and arrows. Turn the pen tool on before playing a replay. See `docs/research/sudokupad-replay-files.md`.

## The pen panel

With the pen tool on, its panel is the same size as SudokuPad's, laid out in three parts:

- **The colors**: the nine pen color buttons, three to a row, 2.5rem tall instead of 4rem.
- **The controls**: under the colors, one row of three full-size buttons on the same columns, in this order: the line mode button, the line type button (the page button) and the settings button. The settings button, an outline gear, opens the settings dialog.
- **The sliders**: Thickness and Opacity across the full width, in the row under the controls, on the same tray.

Keypad Flipped still swaps the first and third rows of colors. The controls and the sliders sit on a light purple tray with round corners. SudokuPad's own key 0 and Delete buttons stay hidden. Each of the three control icons is drawn at the same size and centred on its drawing. The settings icon is Lucide's `settings` (ISC licence).

## The settings dialog

Pen Tool Extras in SudokuPad's settings, or the settings button in the pen panel, opens one dialog. It is sized to its content and centred in the window. Under the title row a line runs across, and the sections sit in a two by two grid with a vertical line between the columns:

1. **Pen colors** (left), with the preset pulldown above a 3 by 3 grid of square color inputs.
2. **Line settings** (right, top): Thickness and Opacity, each with a "Slider in panel" box on a line under it. Under a divider, **Line styles**: a box before each of Dashed lines and Directional arrow lines, with a slider under it.
3. **Marks to cycle** (left, below): one table, rows Edge, Corner and Cell, columns X, circle, up and down arrow heads (Directions) and a filled dot.
4. **Other** (right, below): White outlines (with Outline width under it) and Right click erase.

The title row ends with two icon buttons, Copy settings (two overlapping squares) and Paste settings (a clipboard); their status message shows to their left. Under the grid, one row of buttons at the right, the same row in every script's dialog: Save (filled purple), Cancel, then Restore defaults, the last two plain. Every slider and box in it is a draft that takes effect on Save, and Cancel leaves what was in force. All five sliders start at the same x and are 96px long. On a screen too narrow for two columns, the sections stack in one column in the same order.

## Colors

The pen colors never change on their own. Only picking a preset and saving, or editing a color, changes them, with one exception: the install save.

- **Install save:** on the first load with no pen colors saved, the script saves cell color page 1, darkened, as the "Darker page 1" preset. This happens once. It also happens on the first load after updating from a version that saved nothing, even when another cell color page is current. The script waits for the color tool for as long as it takes; until then the pens show SudokuPad's own colors. With no color tool at all, it saves "SudokuPad colors" instead. A save made in the dialog before the install save wins.
- **Darker page:** each pen takes the cell color on the same button number, darkened, and button 0 is not used. The darkest grey becomes black. A cell color that is transparent or unreadable leaves SudokuPad's own pen color on that button, and the dialog says which.
- The saved colors are a snapshot. A later change to the cell colors or the current page doesn't touch them.
- Strokes already drawn and the color buttons change with the colors. Recoloring a pen changes it on every page.
- Colors saved by an older version are kept as they are and show as Custom.

Three ways to change them:

- **Preset pulldown**, at the top of the dialog's Pen colors section: "Darker page 1", "Darker page 2" and "Darker page 3" (one per page the current puzzle's palette has, up to 3), then "SudokuPad colors". Picking one fills the nine pickers, worked out at that moment from the palette in force. Save keeps the colors and the preset's name, and Cancel drops them. The pulldown then shows the last preset picked. When the colors in force are no preset it offers, it shows them first, greyed out so they can't be picked: "Custom" while the colors are your own, a darker page the current palette doesn't have, or "SudokuPad (unsaved)" before the install save.
- **Settings dialog pickers:** a 3 by 3 grid of square color inputs, 4px apart and without numbers, in the arrangement of the pen buttons. An edit turns the pulldown to Custom. Save keeps your colors.
- **Hold a pen color button for a second**, with either mouse button: a picker appears over each button, as in the cell color tool. Click one to open it. The pen changes live and the set is saved, as Custom. Hold again, or leave the pen tool, to close them.

The colors are saved under `PenColor_colors` as `{"1": "#rrggbb", …, "9": "#rrggbb", "preset": "page-1"}`. Older versions read the nine colors and ignore `preset`. The preset is `page-1`, `page-2`, `page-3` or `sudokupad`; a set with no `preset`, or one the script doesn't know, is Custom.

## Sliders

Both sliders sit in the pen tool's panel, across its full width under the three control buttons, so you can change them during play. The track says what a slider does: Thickness is a wedge widening to the right, Opacity fades from faint to solid purple, and the thumb is a white circle with a purple ring. Hover a slider for its name. A move changes the marks live and saves at once. It adds nothing to undo or the replay, and gives the keyboard back to the puzzle.

| Slider | Range | Default | Changes | Saved under |
| --- | --- | --- | --- | --- |
| Thickness | 1 to 16, in steps of 0.5 | 5 | Lines, cell circles, crosses and dots, and edge and corner marks, by the same factor | `PenColor_thickness` |
| Opacity | 20 to 100%, in steps of 5 | 80 | How see-through every pen mark is | `PenColor_opacity` |

**Mark growth:** above thickness 5, edge and corner marks and the cell dot also get larger, evenly to 1.6 times at 16, staying centred with the same stroke width, so the whole of an edge X clears a line of the same thickness. Lines don't. It's a CSS scale, so marks already drawn grow too. Dark Page keeps the largest of them inside its rectangle.

**Marks above lines:** every edge mark, corner mark and cell circle, cross and dot is drawn above every pen line, whichever cell holds it. SudokuPad draws strokes in cell order, which used to bury a mark under a line in a later cell. A mark in the same color as the line under it still doesn't stand out on a thick line; it shows only by its shape.

**Opacity on the whole layer:** strokes that overlap don't darken at the joins. Where two colors cross, the later stroke covers the earlier one instead of blending with it. The drag and erase highlights keep SudokuPad's own look at every value.

**Slider options** are in the dialog's Line settings section:

- A "Slider in panel" box on a line under the Thickness row and under the Opacity row, both ticked by default and saved under `PenColor_sliders`.
- The Thickness and Opacity sliders themselves, which are always in the dialog. A slider whose box is unticked is left out of the panel, but its value still applies and can be changed in the dialog.
- A dialog slider takes effect on Save, and Cancel leaves it. It opens at the value in force, so it matches the panel.
- With one slider hidden, the other keeps its place. With both hidden, the tray holds only the three control buttons.

## White outline

The dialog's Other section has a White outlines box, on by default and saved under `PenColor_outline`, and an Outline width line under it, indented, with a slider saved under `PenColor_outlinewidth`. Unticking the box hides the Outline width line in the dialog at once, and ticking it brings it back; the slider keeps its value. With the outline on as the default, the key stores an explicit `false` when it is off and is removed when it is on; the width key is removed when the width is the default.

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

Each pen color button shows a picture of its line in the pen's color: a solid line on page 1, dashes on page 2, two arrows on page 3. The lines are 3 wide on a 24 unit grid; the dashes keep a width 2 layout, each dash 1 shorter and each gap 1 longer, and the two arrows sit a quarter and three quarters along whatever the Arrow spacing. The color tool's buttons keep SudokuPad's own swatches.

Only lines change with the page. A cell circle, a cross, a dot and the edge and corner marks stay solid.

**Changing page**, the way the cell color tool does:

- Click the line type button (the page button), the middle one of the three controls. It shows the line the next page draws, with a dot for each page and the current one filled.
- Press Tab. Tab does nothing else in the pen tool with this script on, with or without No Tab Letters. Shift+Tab is left to SudokuPad.
- Turn the mouse wheel over the page button, as SudokuPad's color tool does over its own page button: down for the next page, up for the previous. Over the rest of the pen panel the wheel is left to SudokuPad.

**Picking a pen with a digit key**: with the pen tool on, a bare digit key 1 to 9 picks pen N on the page showing, as a click on that color button does: on page 2, key 3 picks page 2's pen 3. The key follows the button's number, so Keypad Flipped changes nothing. Key 0, a digit with Ctrl, Alt, Meta or Shift held, and a digit typed into a text field are left to SudokuPad and the browser.

Besides Tab and the wheel, which SudokuPad's color tool uses the same way (`docs/research/sudokupad-color-tool-paging.md`), the digit keys are the one input the script takes that SudokuPad's pen tool ignores.

The same pen number stays selected across pages. The selected pen is saved under `PenColor_pen` and comes back after a reload. SudokuPad's own `ToolPen_color` only ever holds the pen's number, so removing the script leaves stock SudokuPad working with that pen on its first page.

## Line styles

The dialog's Line styles section has a box before each of page 2 (Dashed lines) and page 3 (Directional arrow lines), both ticked by default and saved together under `PenColor_linestyles`, which is removed when both are ticked.

- An unticked style's page is skipped by the page button, Tab and the wheel, and has no dot on the page button.
- Saving with the page you are on unticked moves the selected pen to the same number on page 1. A saved pen on an unticked page does the same when the pen tool opens.
- With both unticked, the page button is hidden, and the script takes neither Tab nor the wheel.
- Lines already drawn in an unticked page's pens still draw, dashes and arrows as before. Only the choice of those pens goes.
- Unticking a style's box hides its slider row in the dialog at once, and ticking it brings it back; the slider keeps its value.

### Dash length (page 2)

A dialog slider from 0 to 8 line widths, under Dashed lines, saved under `PenColor_dash`.

- The default is 3. 0 is dots, and a saved 0 stays as saved.
- A dash is that many line widths long, so it scales with Thickness. It also changes lines already drawn, and the page button and the page 2 swatches show it.
- Each cell's piece of a line starts and ends with half a dash, with a whole number of dash-and-gap periods fitted to the piece, whether it runs along a cell's center, its edge or a diagonal. So a line is inked at its two ends, at every turn and at every join between cells, as a solid line would be, and two pieces meet in one whole dash. Dots follow the same rule, with a dot on each of those points.
- Every gap is at least one line width wide where it shows (two line widths between the dash patterns, since the round caps take one), on a straight and a diagonal piece alike. A dash too long for a cell to hold that gap is shortened to leave it, so a page 2 line is never solid.

### Arrow lines (page 3)

- **Arrow spacing**, a dialog slider under Directional arrow lines, from 3 to 12, scaling the distance from the middle of one arrow to the middle of the next (which also grows slowly with Thickness), saved under `PenColor_arrowspacing`. The default is 5. Like Dash length it is a draft until Save, then redraws the lines already drawn.
- Each cell's piece of a line is drawn with whole arrows, about two to a cell at thickness 5 and the default spacing, so a run reads as one across a cell boundary.
- Each arrow is a triangle filled in the pen's color, sitting on the line and pointing the way you dragged: out to each side of the line's middle and about 0.7 times as long as wide. The line under the arrows is as thick as a page 1 line at every Thickness. Arrows scale with Thickness, a little slower than the line, so they stick out past it at every value.
- They follow Opacity, and lines already drawn follow Thickness. They stay inside the rectangle Dark Page keeps at 16.
- A drag that turns stores the right direction per segment and is one undo step. The replay and a reload keep it.
- Dragging over a line erases it, whichever way either was drawn.
- A pen value has no direction, so each page 3 pen uses two color characters, one for each way, from `j` to `z` and `0`.

## Edge marks

Clicking a cell edge cycles through the marks ticked in the dialog's Marks to cycle table (the Edge row), in this order, then empty:

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

## Cell marks

A click in a cell's middle cycles SudokuPad's own circle, then its cross, then a dot, then empty.

- The dot is a filled disc in the pen's color, about a fifth of the cell across, stored as the pen value `z`. Without the script it is stored but draws as nothing.
- The Cell row of the Marks table has a Cell Cross, a Cell Circle and a Cell Dot box, in the X, circle and dot columns, all ticked by default. An unticked mark is skipped. With all three off, a click in a cell's middle does nothing, as an edge click does with the Edge row all off.
- Settings saved before the Cell row existed read as all three ticked.

## Right click

The dialog's Right click erase box is on by default and saved under `PenColor_middleerase` (the key is older than the right click and keeps its name so old saves read the same; removed when on, `false` when off). Off, the right button is left wholly to SudokuPad and the browser: no erase, no default prevented, and SudokuPad's own right click (which acts as a left click, so it steps a mark forward) and menu.

With the box on and the pen tool on, a right click over the grid erases what is under the pointer, as one undo step:

- On a line: the whole line, every piece joined to it where two pieces meet at a cell middle or a cell corner, and drawn with the same pen, so a branch or a crossing of that pen at such a point is included (two diagonals of one pen that cross mid-cell meet at no point and stay separate), but not a piece of another pen (on page 3, both direction characters of a pen count as one pen) and no mark.
- On an edge mark, a grid-corner mark or a cell's circle, cross or dot with no line under the pointer: that mark, whatever its shape. Lines win over marks when both are under the pointer.
- On nothing: nothing, and no mark is made.

A right-drag erases every line and mark it crosses, as one undo step, the way Draw's right-drag does. The browser's menu stays shut over the grid in the pen tool. Outside the pen tool, or off the grid, the right button and the menu are left to SudokuPad and the browser.

A left click steps an edge, corner or cell mark forward, and a right click does not step it. Touch is unchanged.

## Line mode

The pen panel's controls row holds a line mode button, the first of the three, the same size as the other two. A click steps SudokuPad's own setting through Center & Edge, Center only and Edge only, and back to Center & Edge, saved where SudokuPad's pulldown saved it, so it survives a reload. The icon is a faint 2x2 grid with the center line, the edge line, or both; hover it for the current mode's name. SudokuPad's own pulldown is hidden, and the settings dialog has no line mode choice.

## Restore defaults

The dialog's Restore defaults picks the Darker page 1 preset, or SudokuPad colors when the color tool has no page 1 to read. It also sets the dialog's Thickness, Opacity, Dash length (3) and Arrow spacing (5) sliders, the Slider in panel and line style boxes, the White outlines box (on), the Outline width slider (2) and the Right click erase box (on) back to their defaults. It leaves the mark boxes as they are. All of it waits for Save, and Cancel leaves what was in force.

## If SudokuPad changes

The script installs itself in steps, and each step checks at startup that the SudokuPad internals it needs are there. A step whose internals are gone is not installed, and the browser console says so once: `pen-tool-extras: marks, line erase skipped because SudokuPad has no getCell`. A step that throws later, in its own code, is skipped from then on: SudokuPad's own function answers in its place on that call and every later one, and the console says so once as `pen-tool-extras: <step> skipped because SudokuPad changed:` with the error. A throw in SudokuPad's own function is SudokuPad's, and skips nothing. A failure outside every step is logged as an error, `pen-tool-extras: startup failed:`. The other steps keep working, and a bar at the bottom of the page names what is off, with a Report link.

The settings dialog names the skipped steps in one line at its top, for example `Off because SudokuPad changed: arrow lines`, and shows nothing when all is well. Its controls stay; a control of a skipped step does nothing until the page loads with the step installed. Reload after updating the script.

| Step | Not installed when SudokuPad has no | What you see with it skipped |
| --- | --- | --- |
| colors | the cell color tool (`tools.colour`); also skipped when reading its page or opening the pickers fails | No darker page preset is offered or saved, and a hold on a pen color button opens no pickers. The dialog's pickers, SudokuPad colors and saved colors still work. With no color tool at all, the install save stores SudokuPad colors. A color tool that is merely slow or empty is waited for, with SudokuPad's own pen colors until it is ready |
| pen pages | the pen tool's `setSelectedColor`, `handleToolEnter` or `handleToolExit` | Only SudokuPad's nine pens. Tab, the mouse wheel, the digit keys and the page button do nothing, and a pen on page 2 or 3 that was selected is replaced by the same color on page 1. Lines already stored with a page 2 or page 3 pen keep their color |
| arrow lines | the renderer's `renderPen` or `renderPart`, the pen tool's `clickCell`, `actStart`, `actAdd`, `actSend` or `_actList`, or the app's `puzzle.cells` | Page 3 lines draw as plain lines of the pen's color, and a line dragged with a page 3 pen is stored in the pen's own character, with no direction |
| drag highlight | the pen tool's `drawLineHint` | The highlight of a line being dragged fades with the opacity setting and takes the white outline |
| marks | the pen tool's `clickCell`, `getInputRc`, `actStart`, `actAdd`, `actSend` or `_actList`, the renderer's `renderPen`, `rcToPathData` or `CellSize`, the grid's `getCell`, `rows` or `cols`, or the app's `puzzle.cells` | A click on an edge or a corner is SudokuPad's own edge click (its X), and a click in a cell's middle is SudokuPad's own circle and cross. The arrows, circles, corner marks and dots you drew stay stored in the puzzle and its replay, and draw as nothing |
| pen panel | the pen tool (`ToolPen.tool`), or the `.penlinemode` element in its panel (checked a second after the panel shows) | SudokuPad's own line mode pulldown stays in the panel, and the sliders, the tray and the three control buttons (line mode, line type and settings), which would take its rows, are left out. Tab still turns pages |
| line erase | the pen tool's `clickCell`, `getInputRc`, `actStart`, `actAdd`, `actSend` or `_actList`, the app's `xyToRCExact` or `puzzle.cells`, the grid's `getCell`, `rows` or `cols` | A right click is SudokuPad's own click, and the browser's menu opens |
| saved settings | Framework's `getData`, `setData` or `removeData` | The settings and pen colors start from their defaults, and nothing is kept |
| settings dialog | Framework's `addSetting`, `showDialog` or `closeDialog` | SudokuPad's settings menu has no Pen Tool Extras entry, and the pen panel's settings button does nothing |
| dialog overlay | Framework's `showDialog`; also off when installing its listener throws | A press on the dark area around the settings dialog closes it and also marks the grid cell under the pointer |
