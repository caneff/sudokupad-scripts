# Glossary

- **group** — one palette color plus the digits that get it. A digit is in at
  most one group.
- **settings group** — one of SudokuPad's collapsible sections of its settings dialog. Every
  script's settings entry goes in the Experimental one, which starts collapsed.
- **digit color** — the fill of one digit, in entered digits, corner marks and
  centre marks. It is a `#rrggbb` value, or SudokuPad's own color. Givens never take it. A mark in the
  `conflict` state keeps it and gets a conflict circle; for a digit on SudokuPad's own color the
  mark stays SudokuPad's red and gets the circle too.
- **conflict circle** — the small pale red circle the script draws behind a corner or centre mark
  in the `conflict` state, only while SudokuPad shows conflicts.
- **default colors** — the digit color of each digit on a fresh install, and
  after the dialog's "Restore defaults".
- **preload** — a settings button that overwrites the list of groups with a
  ready-made set. It saves nothing of its own.
- **pen color** — one of the pen tool's nine colors, numbered 1 to 9. It is a
  `#rrggbb` value kept in SudokuPad's `--puzzle-pencolor-N` variable, which
  strokes and the tool's color buttons both read. The eraser has no pen color. With
  nothing saved, the nine are the **derived colors**: the colors of the current
  **cell color page** (one of the color tool's pages of ten **cell colors**): pen
  color N is the page's color at index N, darkened in OKLCH, so each pen sits on the
  same button number as its cell color and index 0 is never used. A transparent or
  unreadable entry keeps SudokuPad's own pen color there. The darkest derived color
  with low chroma becomes black. A saved set wins, and "Restore defaults" clears it.
- **edit mode** — Pen Tool Extras' state after a hold on a pen color button: a color picker sits over
  each of the nine pen buttons. A second hold, or leaving the pen tool, ends it. SudokuPad's color
  tool has the same state for its cell color buttons.
- **edge mark** — a pen mark on a cell edge: SudokuPad's own X, or one of the
  marks Pen Tool Extras adds (a direction arrow or the edge circle). Each one is a single
  character in the pen value of the cell that stores the edge.
- **edge cycle** — the order a left click on an edge steps through its marks: X,
  first direction, second direction, circle, empty, skipping any type unticked in
  the settings dialog. A right click steps the same cycle backwards.
- **grid-corner mark** — a pen mark Pen Tool Extras draws centred on a corner of the grid, inner or outer: an
  X or a circle, the same shapes as the edge marks. The dialog calls the group "Corner marks"; SudokuPad's own
  "corner marks" are the small digits in a cell's corners, which this is not. Stored as one character in the pen
  value of one cell: a corner with a cell up and left of it is the bottom right of that cell, so a shared corner
  is stored once; the rest are stored on the top left of the cell they touch, except the grid's top right and
  bottom left corners.
- **corner zone** — the part of a cell within 0.2 of a cell (by distance) of a grid corner. A click there is a
  grid-corner mark click, decided before SudokuPad's own edge-or-cell test; with both Corner marks boxes unticked
  there is no corner zone.
- **corner cycle** — the order a left click in a corner zone steps through: X, circle, empty, skipping an unticked
  type. A right click steps it backwards.
- **thickness** — the setting, with a slider in the pen tool's panel and one in the settings dialog, setting the stroke width of the pen's free lines, the cell circle and
  cross (pen values 5 and 6) and every edge mark and grid-corner mark, from 1 to 16, saved at once, on every move, under `PenColor_thickness`.
  SudokuPad's own is 5, which is the default; an edge mark (the edge X, an arrow, the edge circle) and a grid-corner mark
  is always half of it, so every width scales by one factor. Above 5 an edge or grid-corner mark also grows in length (the **mark growth**: a CSS scale about its own middle, 1 at 5 and 1.6 at 16, its stroke width divided by the scale so it stays as thick); lines never grow.
- **pen panel sliders** — Thickness and Opacity, drawn in the pen tool's panel in the last row, the row SudokuPad gives its
  line mode pulldown (`.penlinemode`), which the script hides and moves to the settings dialog (**line mode**). The row's
  right end holds the **page button**. They exist only while the pen tool is on, and have no Save or Cancel. The settings
  dialog also holds both sliders (drafts, applied on Save) and two **slider boxes**, Show thickness slider and Show
  opacity slider, saved under `PenColor_sliders`: a hidden slider is left out of the panel but its value still applies;
  its row stays as an empty row of the same height, and with both hidden the block is not drawn. Its Restore defaults
  sets both dialog sliders back to their defaults for Save, like the colors.
- **marks layer** — the group (`#pen-tool-extras-marks`) just above the pen layer that holds every edge mark, grid-corner mark and the cell circle and cross, so a mark is drawn over every pen line whichever cell holds it. SudokuPad adds a cell's strokes to its pen layer in cell order, so without it a line in a later cell covers a mark in an earlier one. It has the same opacity as the pen layer.
- **opacity** — the setting, with a slider in the pen tool's panel and one in the settings dialog, setting how see-through the pen layer is (lines, cell circles and
  crosses, edge marks, grid-corner marks), in percent from 20 to 100 in steps of 5, saved at once, on every move, under
  `PenColor_opacity`. SudokuPad's own is 80, set on each stroke (`.cell-pen { opacity: 0.8 }`); the script sets it on the
  whole pen layer (`#cell-pen`) and the **marks layer** instead, so overlapping strokes do not darken. 80 is the default; 100 is solid.
- **pen page** — one of the lists of nine pens in `PEN_PAGES`. Page 1 is SudokuPad's own pens 1 to 9; page 2 is the same
  nine colors drawn as dotted lines, or dashes of the **dash length**; page 3 is the same nine as **chevron lines**. The pen on color button N has the same color on every page, so recoloring it changes
  it on all of them.
- **dash length** — the dialog's slider, 0 to 8 line widths, saved under `PenColor_dash`, giving how long each dash of a dotted
  page's lines is. 0 is the dots of today; a dash scales with the thickness and changes lines already drawn. A dash too long for a cell's line to hold a gap
  is shortened to leave one, so a page 2 line is never solid; each cell's segment starts and ends with half a gap, so the
  dashes are the same length across a cell boundary.
- **chevron line** — a line drawn with a page 3 pen: a thin line with a run of chevrons along it, pointing the way the line was
  dragged. Only lines are chevron lines; a cell circle, cross, edge mark or corner mark in a page 3 pen is solid. Its size and
  spacing scale with the thickness from the default up (a chevron is never smaller than at 5, while the line under them thins only
  down to a minimum that shows), and it follows the opacity. Each cell's segment fits whole chevrons, half a space in from
  each end, so a run reads as one across a cell boundary.
- **direction character** — a page 3 pen is two color characters, since a pen value has no direction: the one on its button
  (`j`, `l`, `n`, `p`, `r`, `t`, `v`, `x`, `z`) for a line dragged the way SudokuPad draws the value (right, down, up and right for `d`,
  down and left for `f`), and the **reverse character** (`k`, `m`, `o`, `q`, `s`, `u`, `w`, `y`, `0`) for the other way. The pen action
  of a line carries it (`1k` is the line `1` in pen 1's reverse character), so each segment of one drag stores its own way.
  Only the first is ever selected.
- **color character** — the one character a stroke stores for its pen color, and the replay holds as `pc:<character>`: `1`
  to `9` on page 1, `a` to `i` on page 2, `j` to `z` and `0` on page 3 (two to a pen, see **direction character**). The **pen color** number (1 to 9) is the button the character is on, and the
  only part SudokuPad's own `ToolPen_color` ever holds; the selected character is saved under `PenColor_pen`.
- **page button** — the square button at the right end of the pen panel's last row. It shows the line the next page draws,
  with a dot for each page and the current one filled; Tab and the mouse wheel over the panel turn the page too.
- **line mode** — SudokuPad's pen setting for where a dragged line snaps: center and edge, center only, or edge only. It is
  saved by SudokuPad under `ToolPen_linemode`; the script's settings dialog holds the choice.
- **page color** — the color Dark Page paints the page outside the kept rectangle: black until a solver picks
  another in the Dark page dialog, saved under `DarkPage_color`. The page's own text is light or dark, whichever contrasts more
  with the color.
- **kept rectangle** — the box Dark Page leaves as SudokuPad renders it: the tight box around everything
  the puzzle visibly draws, joined with every cell's box grown by a pen mark's reach, padded by 1px,
  rounded outward to whole pixels and limited to the `#svgrenderer` box. The page is the chosen page color (black by default) outside it.
- **swatch** — one square button in the Color by Digit dialog showing one palette color, grouped by cell color page and laid out by index. An index with no visible color is an empty space of the same size.
- **letter tool** — SudokuPad's tool, switched on by its "Enable Letter Tool" setting, that adds a toggle
  button before the delete button and lets the number pad type letters.
- **letter mode** — whether the number pad types letters (`ABCDEFGHIO`) or digits. SudokuPad saves it per
  browser under `ToolLetter_letterMode`. The button and `/` toggle it; No Tab Letters makes Tab do nothing in play instead.
