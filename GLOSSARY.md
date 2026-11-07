# Glossary

- **group** — the digits that share one palette color. A digit is in at most one group, a color with no
  digits is no group, and groups are ordered by their lowest digit, with 0 counting after 9. The dialog has
  no group rows: a group exists because digits were painted with its color.
- **brush** — the palette color picked in the dialog's palette, shown selected. A click on a digit key paints the
  digit with it, or clears the digit when it already has that color. It starts as the color of the selected
  profile's lowest group, else the first visible color of the current page.
- **digit key** — one of the ten buttons in the dialog's pad (1 to 9, then 0 under 7). It is filled with its
  digit's group color, or blank when the digit is in no group.
- **pure cell** — a cell that belongs to exactly one group: its given or entered digit is in that
  group or, with no digit, all its centre marks are. Corner marks never count. A cell with no digit
  and no centre marks, or a digit in no group, is not pure.
- **profile** — a named list of groups in Color by Digit. Exactly one is active, the cell profile: cell
  coloring uses its groups, and so do the digits while the Digit pulldown says Same as cell. There are one to six of them; a fresh install has the five preloads, Low/5/High
  active. Groups saved before profiles existed become the active profile: the preload they equal, else a
  profile named Custom added first, with the five preloads beside it. An install with saved profiles gets
  Entropic and Modular added once, and Each digit once (see **preload**).
- **selected profile** — the profile the Color by Digit settings dialog is editing: its row is highlighted, its
  name is an editable field in its row and its groups are in the right column. The dialog opens on the cell
  profile, and a click on a row selects it. Selecting changes no color and is not saved; the dialog's **Cell** and
  **Digit** pulldowns do the picking, and the profile list is only for editing.
- **settings pulldowns** — the three drafts at the top of Color by Digit's settings dialog: **Mode** (Cell, Digit,
  Both, Off; only Cell and Off while Digit is None), **Cell** (the cell profile, by name) and **Digit** (Same as
  cell, a profile by name, or None). They apply at Save; Cancel drops them.
- **chips** — a profile's colors in Color by Digit, drawn as a run of joined square board cells: three at most,
  one outline with single dividers, no gaps or rounded corners, each cell with a digit. In Cell and Off one cell per
  group of the cell profile, with the group's **shown digit**; in Digit the same from the digit profile; in Both the
  digits that reach the most groups of the two profiles (see **Cell strip**). The button draws them in the **mode**'s look; the profile menu and the dialog's profile
  list draw them as Cell does.
- **Cell strip** — the chips the button shows in Cell: one cell per group of the cell profile, each with its shown digit.
  Both shows as many chips as the larger of the two profiles has groups (three at most), on the set of digits that
  scores most (the cell groups plus the digit groups its digits fall in); a tie goes to the set sharing most digits with
  the Cell strip, then to the lowest digits. The chips run in ascending digit order, except that Both with one profile
  on both shows the Cell strip itself.
- **shown digit** — the one digit that stands for a group on its cell of the Color by Digit **chips**, on
  the button, in the profile menu and in the dialog's profile list. Over the group's digits with 0 left out: the lowest if all
  are below 5, the highest if all are above 5, else the middle (the lower of the two middle ones on an even
  count). A group of only 0 shows 0; a group with no digits shows none.
- **profile menu** — the menu above the Color by Digit button, opened by its arrow box, a right click or a
  hold: one dense row per profile, its **chips** then its name, the active one highlighted, and Edit profiles…; with the
  Digit pulldown on a profile's name, each row instead ends in a Cell dot and a Digit dot, under the words Cell and
  Digit, each column with its own pick marked. Picking a row makes that profile
  active: in Cell and Both it recolors the cells (planSwitch), as one undo step, and in Digit and Both the
  digits take their new **digit colors** at once. With separate picks, a Cell dot does only the first and a Digit dot,
  which picks the digit profile, only the second.
- **mode** — Color by Digit's saved setting, Cell, Digit, Both or Off, shown by the button's **chips** (Cell: group
  colors with SudokuPad's blue digits; Digit: white with the darker shades; Both: group colors with the shades; Off:
  white, grey digits and a grey outline), named in the button's tooltip, and stepped by a short press on the button, Cell → Digit → Both →
  Off → Cell. Cell and Both color cells; Digit and Both color digits with their **digit color**. In Cell and Both, a cell's color keeps in step with
  its digit and centre marks as they change: a pure cell gets its group's color and loses any other
  group's, and a cell that is not pure loses every group's color. Colors in no group are left alone, except that with SudokuPad's Multi-color setting off, adding a group color replaces whatever color the cell held.
  Entering Cell or Both colors every cell with a digit or centre marks; leaving them for Digit or Off takes every group color of the
  active profile off every cell. With no mode saved it starts at Cell, or at Off when auto mode, the on/off
  setting it replaced, was saved off.
- **settings group** — one of SudokuPad's collapsible sections of its settings dialog. Every
  script's settings entry goes in the Experimental one, which starts collapsed.
- **digit color** — the darker shade of a digit's group color in the **digit profile**, which Color by Digit
  fills the digit with in entered digits, corner marks and centre marks while the mode is Digit or Both. It is
  the group's palette color as the page shows it, darkened as a Pen Tool Extras **derived color** is (its OKLCH
  lightness times 0.75), so a puzzle's own palette gets its own shades. Givens never take it, and a digit in no
  group, or in a group whose color cannot be read, keeps SudokuPad's own color. A mark in the `conflict` state
  keeps it and gets a conflict circle; a mark of a digit on SudokuPad's own color stays SudokuPad's red and gets
  the circle too. It is a stylesheet, not SudokuPad state, so it is never an undo step.
- **digit profile** — the profile whose groups give the **digit colors**. While the Digit pulldown says Same as
  cell (the default) it is the active profile; on a profile's name, it is a second pick from the same list,
  saved as `digitActive`, picked too by the profile menu's Digit dots. Deleting it makes the digits follow the
  active profile again (Same as cell). The button's chips come from it in Digit, from the active profile in Cell and Off, and from both in Both.
- **Use digit colors** — whether Color by Digit colors digits at all, saved as `useDigitColors` (on by default) and
  set by the Digit pulldown: None is off, Same as cell and a profile's name are on. Off, the **mode** is only Cell or
  Off (Digit falls back to Off, Both to Cell), the profile menu drops its Cell and Digit dots, and nothing is drawn
  for digits. The **digit profile** pick is kept.
- **conflict circle** — the small pale red circle Color by Digit draws behind a corner or centre mark
  in the `conflict` state, in Digit and Both, only while SudokuPad shows conflicts.
- **preload** — one of the five ready-made profiles a fresh install starts with: Low/5/High, Odd/Even,
  Entropic ({0,1,2,3}, {4,5,6}, {7,8,9}), Modular ({1,4,7}, {2,5,8}, {0,3,6,9}) and Each digit (each of 1 to 9
  alone, 0 in no group: 5 to 9 on palette keys 5 to 9, and 1 to 4 on keys j, e, h and m of pages 2 and 3, so no
  digit color is black or grey). Entropic and Modular, and then Each digit, are appended once,
  on load, to an install that already has profiles, each skipped when a profile with equal groups exists or
  six are taken; a saved flag for each records it, so a deleted one stays deleted. A migrated profile is named after the preload its groups equal.
- **pen color** — one of the pen tool's nine colors, numbered 1 to 9. It is a
  `#rrggbb` value kept in SudokuPad's `--puzzle-pencolor-N` variable, which
  strokes and the tool's color buttons both read. The eraser has no pen color. With
  colors saved, the **install save** stores darker **cell color page** 1 once (one of the
  color tool's pages of ten **cell colors**), or SudokuPad's own with no color tool; after
  that the colors change only by a **pen color preset** picked and saved, or an edit.
  The **derived colors** of a page: pen color N is the page's color at index N, darkened
  in OKLCH, so each pen sits on the same button number as its cell color and index 0 is
  never used. A transparent or unreadable entry keeps SudokuPad's own pen color there.
  The darkest derived color with low chroma becomes black. Saved under `PenColor_colors`
  as a snapshot: a later palette change does not touch it.
- **edit mode** — Pen Tool Extras' state after a hold on a pen color button: a color picker sits over
  each of the nine pen buttons. A second hold, or leaving the pen tool, ends it. SudokuPad's color
  tool has the same state for its cell color buttons.
- **edge mark** — a pen mark on a cell edge: SudokuPad's own X, or one of the
  marks Pen Tool Extras adds (a direction arrow or the edge circle). Each one is a single
  character in the pen value of the cell that stores the edge.
- **edge cycle** — the order a left click on an edge steps through its marks: X,
  circle, first direction, second direction, empty, skipping any type unticked in
  the settings dialog.
- **grid-corner mark** — a pen mark Pen Tool Extras draws centred on a corner of the grid, inner or outer: an
  X or a circle, the same shapes as the edge marks. The dialog's Marks table has a Corner row for them; SudokuPad's own
  "corner marks" are the small digits in a cell's corners, which this is not. Stored as one character in the pen
  value of one cell: a corner with a cell up and left of it is the bottom right of that cell, so a shared corner
  is stored once; the rest are stored on the top left of the cell they touch, except the grid's top right and
  bottom left corners.
- **corner zone** — the part of a cell within 0.2 of a cell (by distance) of a grid corner. A click there is a
  grid-corner mark click, decided before SudokuPad's own edge-or-cell test; with both boxes of the Marks table's Corner row unticked
  there is no corner zone.
- **corner cycle** — the order a left click in a corner zone steps through: X, circle, empty, skipping an unticked
  type.
- **pen erase** — Pen Tool Extras' right click or drag in the pen tool: the whole line under the pointer and the edge and corner marks it crosses, as one undo step. Draw's **erase** is a different feature. The install step that does it is `line erase`.
- **thickness** — the setting, with a slider in the pen tool's panel and one in the settings dialog, setting the stroke width of the pen's free lines, the cell circle and
  cross (pen values 5 and 6) and every edge mark and grid-corner mark, from 1 to 16 in half steps (31 positions, shown as `2.5`), saved at once, on every move, under `PenColor_thickness`.
  SudokuPad's own is 5, which is the default; an edge mark (the edge X, an arrow, the edge circle) and a grid-corner mark
  is always half of it, so every width scales by one factor. Above 5 an edge or grid-corner mark also grows in length (the **mark growth**: a CSS scale about its own middle, 1 at 5 and 1.6 at 16, its stroke width divided by the scale so it stays as thick); lines never grow.
- **pen panel sliders** — Thickness and Opacity, drawn in the pen tool's panel across its full width in the row under the **controls row**. SudokuPad gives its
  line mode pulldown (`.penlinemode`) the panel's last row, which the script hides. They sit with the controls row on a **tray**. They exist only while the pen tool is on, and have no Save or Cancel. The settings
  dialog also holds both sliders (drafts, applied on Save), each in a row of Line settings with a **slider box** on a sub-line under it,
  labelled "Slider in panel", saved under `PenColor_sliders`: a hidden slider is left out of the panel but its value still applies;
  its row stays as an empty row of the same height, and with both hidden the block is not drawn. Its Restore defaults
  sets both dialog sliders back to their defaults for Save, like the colors.
- **marks layer** — the group (`#pen-tool-extras-marks`) that is the last child of the pen layer and holds every edge mark, grid-corner mark and the cell circle and cross, so a mark is drawn over every pen line whichever cell holds it. SudokuPad adds a cell's strokes to its pen layer in cell order, so without it a line in a later cell covers a mark in an earlier one. It is inside the pen layer, so the pen layer's opacity fades it with the lines as one picture.
- **opacity** — the setting, with a slider in the pen tool's panel and one in the settings dialog, setting how see-through the pen layer is (lines, cell circles and
  crosses, edge marks, grid-corner marks), in percent from 20 to 100 in steps of 5, saved at once, on every move, under
  `PenColor_opacity`. SudokuPad's own is 80, set on each stroke (`.cell-pen { opacity: 0.8 }`); the script sets it on the
  whole pen layer (`#cell-pen`) instead, so overlapping strokes do not darken. 80 is the default; 100 is solid.
- **white outline** — the dialog's White outlines box (on by default; saved under `PenColor_outline` only as `false`, since on is the default) and the
  Outline width line under it (a slider, 1 to 8 units, default 2, saved under `PenColor_outlinewidth`, hidden in the dialog while the box is unticked). On, a filter on the pen layer (`#cell-pen`) draws a white band of that width round the layer's combined shape, so lines and marks
  already drawn get it, it fades with the opacity, and the drag highlight, which sits in its own group beside the layer, is left out. Nothing is stored in the puzzle.
- **pen page** — one of the lists of nine pens in `PEN_PAGES`. Page 1 is SudokuPad's own pens 1 to 9; page 2 is the same
  nine colors drawn as dashed lines (dots at a **dash length** of 0); page 3 is the same nine as **arrow lines**. The pen on color button N has the same color on every page, so recoloring it changes
  it on all of them. A page 2 or 3 whose **line style** is not enabled is out of the rotation.
- **line style** — one of the two kinds of line the extra pen pages draw: dashed lines (page 2) and directional arrow lines (page 3). Each has an
  box in the dialog's Line styles section, before its label, both ticked by default, saved together under `PenColor_linestyles`. An unticked style's page is out of the
  rotation: the page button, Tab and the wheel skip it, saving with its pen selected moves the selection to the same number on page 1, and with both unticked the
  page button is hidden and the script takes neither Tab nor the wheel. Lines already drawn in its pens still draw. Its slider row (Dash length, Arrow spacing) is hidden
  in the dialog while the box is unticked.
- **arrow spacing** — the dialog's slider under Directional arrow lines, 3 to 12, scaling the distance from one arrow's middle to the next's (which also grows slowly with the thickness), saved under
  `PenColor_arrowspacing`, default 5. A draft until Save; it redraws the arrow lines already drawn. Each cell's segment fits whole arrows to it.
- **dash length** — the dialog's slider, 0 to 8 line widths, saved under `PenColor_dash`, giving how long each dash of a dashed
  page's lines is. 3 is the default and 0 is dots; a dash scales with the thickness and changes lines already drawn. A dash too long for a cell's line to hold a gap
  (at least one line width wide where it shows) is shortened to leave one, so a page 2 line is never solid; each cell's segment starts and ends with half a dash, so a line is
  inked at its ends, its turns and every join between cells, and two segments meet in one whole dash.
- **pen color preset** — a named set the settings dialog's pulldown, at the top of Pen colors, fills the nine pickers with as a draft: "Darker page 1" to "Darker page 3" (the derived colors of that page, one per page the palette has, up to 3) or "SudokuPad colors" (`SUDOKUPAD_PEN_COLORS`).
  Save stores the colors with the preset's id (`page-1` to `page-3`, `sudokupad`) under `preset`; Cancel drops it. An edit, in the dialog or by hold, makes
  the set **Custom**, saved with no `preset`, and so are colors an older version saved. A set in force that the pulldown does not offer (Custom, a page the palette
  no longer has, or "SudokuPad (unsaved)" before the install save) shows first and cannot be picked. Restore defaults picks Darker page 1, or
  SudokuPad colors with no page 1 to read.
- **arrow line** — a line drawn with a page 3 pen: a line, as wide as a page 1 line, with a run of filled triangles (its arrows, in the pen's color) along it, pointing the way the line was
  dragged. Only lines are arrow lines; a cell circle, cross, edge mark or corner mark in a page 3 pen is solid. Not a **direction arrow**, the `>` `<` `^` `v` mark a click on a cell edge cycles through. Its arrows' size and
  spacing scale with the thickness from the default up (the heads shrink a little slower than the line below 5 and grow slower above it, while the line under them is always the thickness itself), and it follows the opacity. Each cell's segment fits whole arrows, half a space in from
  each end, so a run reads as one across a cell boundary.
- **direction character** — a page 3 pen is two color characters, since a pen value has no direction: the one on its button
  (`j`, `l`, `n`, `p`, `r`, `t`, `v`, `x`, `z`) for a line dragged the way SudokuPad draws the value (right, down, up and right for `d`,
  down and left for `f`), and the **reverse character** (`k`, `m`, `o`, `q`, `s`, `u`, `w`, `y`, `0`) for the other way. The pen action
  of a line carries it (`1k` is the line `1` in pen 1's reverse character), so each segment of one drag stores its own way.
  Only the first is ever selected.
- **color character** — the one character a stroke stores for its pen color, and the replay holds as `pc:<character>`: `1`
  to `9` on page 1, `a` to `i` on page 2, `j` to `z` and `0` on page 3 (two to a pen, see **direction character**). The **pen color** number (1 to 9) is the button the character is on, and the
  only part SudokuPad's own `ToolPen_color` ever holds; the selected character is saved under `PenColor_pen`.
- **controls row** — the pen panel's row of three 4rem square buttons under the nine color buttons, on the color columns: the **line mode button**, the **page button** (the line type button) and the **settings button**, in that order. A panel with no page to turn to has two. They sit with the **pen panel sliders** on the **tray**, a light purple rounded box behind the last two rows.
- **line mode button** — the first button of the **controls row** (the 4rem square button). A click or a touch tap steps **line mode** Center & Edge, Center only, Edge only and round, through SudokuPad's own setting. Its icon is a faint 2x2 cell grid with the center line, the edge line, or both; its hover label (`title`) names the current mode with SudokuPad's labels.
- **page button** — the second button of the **controls row**, also called the line type button. It shows the line the next enabled page draws,
  with a dot for each enabled page and the current one filled; Tab turns the page too, and so does the mouse wheel over the button only (as SudokuPad's color tool's
  wheel works over its own page button, not over the rest of its panel).
- **install step** — one of the parts Pen Tool Extras installs at startup, each run in its own guard: colors, pen pages, arrow
  lines, drag highlight, marks, line erase, pen panel. A step is **skipped** when SudokuPad lacks an internal it
  needs or its own code throws: one console warning names it, the settings dialog's "Off because SudokuPad changed" line lists it,
  and the pad works as stock SudokuPad there until the page reloads. Not an undo step, a cycle step or a page step.
- **settings button** — the third button of the **controls row**, an outline gear. A click or tap opens
  Pen Tool Extras' settings dialog and leaves the selected tool and pen color alone.
- **line mode** — SudokuPad's pen setting for where a dragged line snaps: center and edge, center only, or edge only. It is
  saved by SudokuPad under `ToolPen_linemode`. The pen panel's **line mode button** steps it: a click goes Center & Edge, Center only, Edge only, and round.
- **page color** — the color Dark Page paints the page outside the kept rectangle: black until a solver picks
  another in the Dark Page dialog, saved under `DarkPage_color`. The page's own text is light or dark, whichever contrasts more
  with the color.
- **kept rectangle** — the box Dark Page leaves as SudokuPad renders it: the tight box around everything
  the puzzle visibly draws, joined with every cell's box grown by a pen mark's reach, padded by 1px,
  rounded outward to whole pixels and limited to the `#svgrenderer` box. The page is the chosen page color (black by default) outside it.
- **swatch** — also, in Pen Tool Extras, the picture on a pen color button: page 1 a solid line, page 2 a dashed line, page 3 a line and its arrows, cut out of the button's square so a recolor follows. In Color by Digit: one square button in its dialog showing one palette color, shown one cell color page at a time and laid out by index, beside the digit keys in one grid; a click sets the **brush**. An index with no visible color is an empty space of the same size.
- **letter tool** — SudokuPad's tool, switched on by its "Enable Letter Tool" setting, that adds a toggle
  button before the delete button and lets the number pad type letters.
- **letter mode** — whether the number pad types letters (`ABCDEFGHIO`) or digits. SudokuPad saves it per
  browser under `ToolLetter_letterMode`. The button and `/` toggle it; No Tab Letters makes Tab do nothing in play instead.
- **Draw Tool** — the script `draw-tool.user.js`, and the tool it adds to SudokuPad's tool buttons as Draw. It takes no
  tool key.
- **drawing** — everything Draw Tool has put on one puzzle: its strokes, texts and shapes, oldest first. Saved per puzzle (keyed by
  the puzzle id, or the page URL for a puzzle with none) for the 50 puzzles drawn on last; it is not in the replay, Undo
  does not touch it, and Restart and Clear all empty it.
- **draw color** — one of Draw's nine colors, numbered 1 to 9, saved under `DrawTool_colors`. With none saved, Draw copies the
  pen colors once, when it is first made current; after that they no longer follow the pen colors. A saved value it cannot
  read is never copied over: each color it lacks shows SudokuPad's own pen color. A hold of a second on a
  color button puts a color picker over each button, and a picked color recolors every item already drawn in that number,
  since an item saves the number. The digit keys 1 to 9 pick one.
- **stroke** — one freehand line of a drawing, or a straight one drawn with Shift, in a draw color, with its own width
  (1 to 16) and opacity. The homepage, the script's description and its buttons call it a line, for the solver; code and tests say
  stroke. Not a pen tool line, which SudokuPad stores in the cells.
- **text** — a short string typed into a drawing, in a draw color, with its own size (2 x the width + 8) and opacity, centred on the
  point clicked. It is typed in the **text box**, an input over the board that a click on the board opens, and a click on
  a text reopens.
- **shape** — a rectangle or an ellipse in a drawing, drawn as an outline by a drag in Shape mode, in a draw color, with its own
  width and opacity. Its box is exactly the drag's own box. Saved as an item of kind `shape`, which a Draw Tool before 0.11.0 reads as an unreadable drawing.
- **Shape mode** — what a left-drag with Draw draws: free lines (Off), rectangles or ellipses. The **Shape button**, between
  Clear all and the gear, steps Off, Rectangle, Ellipse and draws the mode a press turns to, with a dot per mode filled for the one in force; the color buttons' swatches draw the one in force. It is saved under `DrawTool_shape`. A click
  still opens the text box in every mode.
- **Size slider** and **Opacity slider** — Draw's two sliders on a light purple tray. Size sets the next stroke's width
  (1 to 16, step 0.5, default 6) and the next text's size; Opacity (20 to 100%, step 5, default 100) sets the next item's.
  Neither changes an item already drawn; both are saved under `DrawTool_width` and `DrawTool_opacity`.
- **erase** — Draw's right click, or right-drag as an extra: every stroke and text the pointer passes near, and every shape whose outline it passes near, is removed whole. Clear all erases the whole
  drawing, after asking.
