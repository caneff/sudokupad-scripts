# Text Anywhere

> [!WARNING]
> **This script can break at any time, and there are no guarantees.** It relies on SudokuPad's internals, which aren't a public API, so any SudokuPad update can break it without notice.

The full reference. For a quick look, see the [details page](https://chinstrap45.github.io/sudokupad-scripts/text-anywhere.html). What
every script shares, the settings dialog and the guard, is in [What every script shares](shared.md).

Text Anywhere adds a tool to SudokuPad's tool buttons, named Text on its button, for typing notes anywhere on the page. `T` makes
it current (not with the Letter tool on, a note open, a dialog open or focus in a field); it takes none of the Z X C V B N M tool
keys.

## Texts

A text is a short string typed onto the notes, in a note color, with its own size and opacity (the Size slider and Opacity slider
set them; a saved note keeps its own), starting at the point clicked: its stored point is the top left of its text.

- **The text box**: a text is typed in place, in the note's own element, open for typing. A click anywhere on the page but
  SudokuPad's controls (what is drawn in the control panel, the top bar, the menu and an open dialog; the panel's empty space
  opens one) or any script's popup menu, such as Color by Digit's profile menu, opens one while nothing is selected, and a
  double-click on a text reopens it. So does a double-click in any other SudokuPad mode: it switches to the Text Anywhere tool for
  the box and goes back to that mode when the box closes (unless a press on another note, or on the open note's edge, closes it
  into a selection or a move, which stays in the tool). The note takes the double click, so SudokuPad's select-matching-digits
  double click does not happen there; a double-click on the rest of the cell is SudokuPad's.
- **Pinned and fixed**: a text put on the board is pinned to its cells (stored in board units under `at`); one put off the board
  is fixed on the screen (stored in screen pixels under `fixed`, which no version before 0.18.0 reads). When the window puts a
  fixed text's box partly past its edge, the text is drawn at the nearest point wholly inside the window, and its saved point
  stays as it was, so it is back in its own place once the window or layout allows; only the solver's own move or resize saves a
  new point.
- **Layering**: both are drawn at the board's scale, in a layer over the page that sits above the digits and below SudokuPad's
  dialogs and menu. Where they overlap a fixed text is drawn, and clicked, above a pinned one; among texts of one kind the one
  made last is on top.
- **A note's box**: a note never resized has one 16 em wide and 8 lines high at its text size, which it fits up to; a resized one
  is exactly the size a resize handle set, stored on the note as `box: [width, height]` in board units, on the board or off it,
  since a note off the board is drawn at the board's scale too. A long line wraps inside it and text past its bottom scrolls: the
  wheel over the note scrolls it, and reaches SudokuPad only once the note can scroll no further that way. A note that scrolls
  always shows a thin scroll bar in its own color (the one open for typing shows it only while the pointer is over it). The scroll
  position is not saved.
- **Resize handles**: four small purple squares on the corners of the note open in the text box, or of the one note selected alone
  (none show with several selected), so a drag anywhere else on a note moves it. Dragging one sets the note's box, the opposite
  corner kept still, down to about 3 em wide and one line high, with diagonal resize cursors; a double-click on one removes the
  stored `box`, so the note goes back to auto size.

## What a note's lines can be

- **Bullets**: a line that starts with `- ` or `* `, after any even number of spaces: each 2 spaces is one more level, drawn one
  indent further right. A finished note shows it with a `•` hanging in the indent and its wrapped lines under the text, with the
  rest of the line read as markdown; the note open for typing shows the raw `- `. A `-` anywhere else in a line is plain text. A
  numbered item starts with digits, `. ` and text (`1. `, `10. `), nests the same way, and shows its number as typed in the same
  hanging indent.
- **Checklist items**: a line that starts with an optional `- ` or `* ` (after any even number of spaces, which nest it like a
  bullet), then `[ ]` or `[]` (unchecked) or `[x]` (checked), then a space or the end of the line (so `[] milk`, `* [ ] milk` and
  an empty `- [ ]` all count), in place of a bullet. A finished note draws a box in the indent; a click on the box, while Text
  Anywhere is current, ticks or unticks it and saves the note, and a checked line is struck through and faded. A click on an
  unchecked item keeps the form typed (`[]` becomes `[x]`); unchecking writes `[ ]`. The note open for typing shows the raw text.
- **Headers**: a line that starts with `# `, `## ` or `### ` (the space is required), drawn bold at 1.5x, 1.25x or 1.1x the note's
  text size. Subtext starts with `-# ` and is drawn at 0.8x, faded. Both read the rest of the line as markdown. They follow
  Discord's formatting (`docs/research/text-anywhere/discord-markdown.md`), as does `__underline__`, which combines with bold and
  italic.
- **Symbols**: while a note is open, `->` `<-` `!=` `<=` `>=` become → ← ≠ ≤ ≥ as they are typed, and the word `sum` becomes Σ
  (once a character follows it, or when the note closes).

## Selecting, moving and erasing

- **Selection**: each selected text is drawn with a solid 2 px purple outline, a box of its own in the layer beside the note so a
  faded note does not fade it. A click on a text selects it alone, Shift+click adds or removes it, and a left-drag that starts on
  empty space, on the board or off it, draws a selection rectangle and selects every text whose box it touches (with Shift, adds
  them).
- While there is a selection, the color buttons, the Size slider, the Opacity slider and Background show and change the selected
  texts, and a change made there is also the next text's setting (the value picked; for a color the texts do not share, the color
  picked). Selecting texts changes no next-text setting, and a color the texts do not share shows no button picked.
- A click on empty space, Escape, opening a text and leaving the tool end the selection, except that Escape in the middle of a
  drag, a resize or a right-button erase puts the notes back (or removes none) and leaves the selection. Escape or Ctrl+Enter on
  an open text closes it and selects it, and Enter reopens the one selected text, the caret at its end. The selection is not
  saved.
- **Move**: a left-drag that starts on a text (the topmost) moves the selection, after the text is selected alone if it was not
  selected. Each text's stored place changes once, on release, pinned or fixed by where it is dropped, then shifted by up to half
  a device pixel so its left and top land on whole device pixels. It stops at the last point inside the window; a text may be
  dropped on SudokuPad's controls. A click with no drag selects the text. A left-drag that starts on a resize handle resizes the
  note and never moves it. In the text box a left-drag that starts inside it selects text and never moves it; only one that starts
  in the 4 px band just outside it (which shows the move cursor) moves the note, after closing it.
- **Nudge**: an arrow key pressed with notes selected and no text box open moves them 1 screen pixel, or 10 with Shift (then up to
  half a device pixel more, to put each note on whole device pixels, unless a device pixel is wider than a screen pixel). A key
  held down repeats it after 300 ms, the step growing over 1.5 s to 8 pixels (40 with Shift); no arrow key reaches SudokuPad's
  cell cursor. A nudge that would put a note out of reach moves none, and the move is saved when the key is released.
- **Erase**: a right click or drag. The press and drag collect every text the pointer is near, and the release removes them whole,
  in one save. Escape, a lost pointer or a tool switch cancels it with nothing removed. Pen Tool Extras' pen erase is a different
  feature. No setting turns it off, unlike Pen Tool Extras' Right click erase box: that box hands the right button back to
  SudokuPad's own right click on the pen, and Text Anywhere's tool is the script's own, with no SudokuPad right click to hand back.
- **Clear all** (the trash button) erases every note, after asking, while nothing is selected; while texts are selected it deletes
  only them, without asking, as the Delete and Backspace keys do.
- **Hide all notes**: the eye button at the right end of the sliders block (class `text-anywhere-hide-all`), level with both
  sliders, which take the rest of the width. A click hides every note in the layer, pinned and fixed (`visibility: hidden` on the
  layer, so the notes keep their layout and no pointer reaches one), ends the selection, and shows a closed eye
  (`aria-pressed="true"`, title "Show all notes"); another click shows them. While hidden a note is not hit, hovered, selected by
  a rectangle, erased or snapped to. Placing a note, or the Undo that brings back the notes a Restart cleared, shows them again
  first; loading a puzzle does too. The state is a variable, never saved and never an undo step, so a reload shows the notes.

## The sliders

- **Size**: the first slider, under the controls row, drawn as the wedge (thin to thick) of the shared panel (`lib/panel.js`, as
  Pen Tool Extras' Thickness). It runs over widths 1 to 16 in steps of 0.5 (text size = 2 x width + 8, default width 6, size 20)
  and sets the next text's size, saved under `TextAnywhere_width` as the width and kept as it is, off any fixed list of sizes.
- It never changes a text already made, except the open note and the selected ones: while texts are selected it shows the first
  one's size and a move sets all of theirs. Any move, on the open note or on selected ones too, is also the next text's size, and
  merely selecting or opening a note changes nothing.
- The + (also =) and - keys, and the keypad's, step each selected text one step from its own size (the slider and the next text
  take the first one's new size), or the next text's, while no note is open and no Ctrl, Alt or Meta is held; inside an open note
  they type.
- **Opacity**: the second slider (called Transparency until 0.45.6), under the Size slider, drawn as the fade (faint to solid),
  over the same range and steps as Pen Tool Extras' Opacity (20 to 100 percent in steps of 5, default 100). It sets a text's
  `opacity`, the next text's saved under `TextAnywhere_opacity`, by the same rules as the Size slider. The opacity is the note
  element's own `opacity`, so it fades the letters, the outline, the background box and its frame together; the selection outline
  and handles sit outside the note and stay solid.

## Colors

- Nine note colors, numbered 1 to 9, saved under `TextAnywhere_colors`. With none saved, they copy the pen colors once, when the
  tool is first made current; after that they no longer follow the pen colors. A saved value with no `#rrggbb` color under keys 1
  to 9 counts as none saved, so the first use's copy replaces it; beside a usable color, each entry it cannot read shows
  SudokuPad's own pen color.
- A hold of a second on a color button puts a color picker over each button (edit mode), and a picked color recolors every note
  already made in that number, since a note saves the number. The digit keys 1 to 9 pick one. A color button shows "Aa" in its
  color.
- The settings dialog's color pulldown (a color block) opens on the preset the colors came from, `pen` (Pen colors), `page-1` to
  `page-3` or `sudokupad`, saved as `preset` beside the colors as Pen Tool Extras' pen color preset is, and carried by Copy and
  Paste settings. The first use's copy of the pen colors is Pen colors. An edit, in the dialog or by hold, makes the set Custom
  with no `preset`, and so are colors an older version saved; Custom shows first and cannot be picked, as in Pen Tool Extras.

## The Background button and the settings dialog

- **Background**: the button between Clear all and the gear, on or off, and a setting for the next text: a text made while it is
  on stores `bg: true` and is drawn with a rounded box behind it, in the box color; one made while it is off has none, and a saved
  text with no `bg` has none. The state is remembered under `TextAnywhere_background`. Pressing it never changes a text already
  made, except the one open in the text box and the selected ones, and the state pressed is also the next text's. While texts are
  selected it shows theirs (neither on nor off when they differ: a dashed ring, `aria-pressed="mixed"`) and turns them all on, or
  all off when all have one.
- **Box color** row: the color of the box behind every note that has one. Five sample buttons, each a short "A=B" note in the text
  color on that box: Page (the default, `--body-bg`; a note off the board takes Dark Page's page color, `--dark-page-color`, where
  Dark Page is on), White, Yellow (`#fff4b0`), Tint (15% of each note's own color over the light page color, on the board and off
  it, even where Dark Page paints the margin) or Own (a #rrggbb color from a picker shown under the row while Own is picked). Global: it recolors every boxed note, old and new, since a note stores
  only `bg: true`. Saved under `TextAnywhere_box` as the preset's id or the hex color; a value that is not one reads as Page. The
  halo stays the page color.
- **Box border** row (the frame): two sample buttons, None and Thin gray, each a boxed note. With Thin gray, every boxed note gets
  a 1 screen pixel `#c4c4c4` ring round its box, drawn as a `box-shadow` so it takes no room; a note with no box gets none.
  Global, off by default, saved under `TextAnywhere_frame` (only `true` is on). Copy and Paste settings carry it and the box
  color.
- **Halo round the letters** row (the outline setting): three sample buttons, None, Thin or Thick (the default), each a colored
  cell with one letter in the text color drawn with that reach of halo. It is the reach of every note's halo (0, 0.07 or 0.14 of
  its text size), global like the box color and the frame, applied on Save, saved under `TextAnywhere_outline` (the ids `none`,
  `thin`, `medium`; anything else reads as Thick) and carried by Copy and Paste settings. A note's own `outline` field, saved by
  an earlier version, is ignored and left as saved.
- **The halo** is drawn in the page's color round each letter (the board's own white on the board, and Dark Page's page color for
  a note whose middle is off the board), a ring of 16 zero-blur `text-shadow`s (a stroke joins with miters and grows spikes on A,
  V, W, M and 4), so a note reads over digits, pencil marks and colored cells. A note with a background box has none, since the
  box is that color already.
- **Font** pulldown: Proportional (the default, the page's own font) or Fixed width (a monospace stack, the one a code span uses).
  It applies to every note, existing and new, is saved as `TextAnywhere_font`, and travels with Copy settings and Paste settings;
  a value that is neither reads as Proportional.
- **Restore defaults** fills the draft with the pen colors (Pen colors), Proportional, the default halo, box color and box border,
  and the default Size and Opacity of the pen panel's sliders, for Save or Cancel to decide. Save makes the size and opacity the next note's, and the sliders show them when no note is
  selected.

## Saved notes

- The notes are saved per puzzle (keyed by the puzzle id, or the page URL for a puzzle with none) for the 50 puzzles noted on
  last, under `TextAnywhere_notes_*` and `TextAnywhere_index`. They are not in the replay, and Restart and Clear all empty them.
- Restart keeps the notes it cleared (`TextAnywhere_restarted_*`), and the Undo that finds SudokuPad's undo stack empty, the one
  that brings back what Restart cleared, brings them back too; any other change to the notes, the next Restart, or loading the
  puzzle again drops them. Undo touches the notes in no other way.
- A stored item of kind `stroke` or `shape`, from before 0.17.0, and a stored note that fails its check (read against the stored
  format, not the slider ranges) are never drawn, and a save, Clear all and Restart leave them as they are; the solver is told
  once a puzzle at load that notes were set aside.

## Its old names

- It was Text Annotation until 0.27.0, and before 0.17.0 it also drew lines and shapes, under its first name (`GLOSSARY.md`).
- Its keys are saved under `TextAnywhere_`, and its notice bar dismissal under `text-anywhere-notice`. Before 0.45.0 they were
  `DrawTool_` (the notes `DrawTool_drawing_*`) and `draw-tool-notice`. Each start copies an old key to its new name where none is
  saved, the notes only while the new index is unsaved and the index only once every listed puzzle's notes are copied, so a copy
  refused for room is tried again at the next start, and keeps the old one for a rolled-back version.
- Its console lines and error log records name it `text-anywhere`.
- Its install address was `draw-tool.user.js` before 0.45.1. That file stays as its handover, frozen at 0.45.1, whose `@updateURL`
  and `@downloadURL` name `text-anywhere.user.js`, so a copy installed from the old address updates to it and then on to the new
  one.
