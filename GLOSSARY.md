# Glossary

Each entry is a definition. What a thing does (ranges, saved keys, Undo rules) is on the reference page each section names.

## Shared

Behavior: `docs/shared.md`. The harness words: `live/README.md`.

- **closing test** — the test a spec's last ticket once added to pin the whole spec's rules against the tree, retired in #1029;
  those rules now live in `test/repo-conventions.test.mjs`.
- **color block** — the part of a dialog that `lib/color-picker.js` draws for Pen Tool Extras, Text Anywhere and Color by Digit: a pulldown (the **presets** or the cell color page) above a grid of **swatches**, three to a row.
- **crash signal** — one of the four things the live suites read as a script failing: a **skip line**, an uncaught page error, a
  console error and the **notice bar**.
- **draft** — a setting's value while a settings dialog is open, which Save writes and Cancel drops.
- **edit mode** — the state of a panel after a **hold to edit**, with a color picker over each of its nine color buttons. Pen Tool
  Extras' pen, Text Anywhere and SudokuPad's own color tool have it.
- **error log** — the guard's permanent record of every **feature** it has turned off, one list in the page's `localStorage`
  shared by every script.
- **feature** — a part of a script declared to the **SudokuPad guard**, with a label and the SudokuPad internals it needs, which
  turns off alone when it fails.
- **hold to edit** — a hold of 1000 ms on a color button, the same delay SudokuPad's color tool uses, which starts **edit mode**.
- **mutant** — an edit of a script's text made mechanically on its syntax tree, in memory and never in the `*.user.js`, for
  `npm run fuzz:mutants` to catch.
- **notice bar** — the guard's purple bar at the bottom of the page that names the **features** SudokuPad's changes turned off,
  with a Report link.
- **Paste settings** — a settings dialog's paste button, which saves the pasted keys at once and puts them into the **draft**.
  Copy settings is its twin and copies the saved settings only.
- **plant** — a bug put into a script on purpose, for the fuzz to find (`--plant <id>` of `npm run test:fuzz`). In a suite, to
  plant is also to set something before the page loads, or to break a script on purpose.
- **planted bug** — see **plant**.
- **recording** — the copy of SudokuPad's own code that the live tests and `npm run look` serve in place of sudokupad.app
  (`live/cache.mjs`), kept outside the repo and recorded once per SudokuPad version.
- **refused write** — a save the browser refuses because `localStorage` is full (`QuotaExceededError`). It is the browser's doing,
  not a SudokuPad change, so it turns no feature off.
- **Restore defaults** — a settings dialog's button that sets the **draft** of every setting the dialog holds back to its default
  and saves nothing.
- **settings entry** — the row a script adds to SudokuPad's own settings dialog, in the **settings group** Experimental, that
  opens the script's dialog.
- **skip line** — the console line a script logs when a **feature** turns itself off:
  `<script>: <feature> skipped because SudokuPad has no <internal>`, or `... changed:`.
- **SudokuPad guard** — `lib/sudokupad.js`, which every script starts through: it runs each **feature** so that one SudokuPad has
  broken turns off while the rest keep working.
- **swatch** — a square of color a dialog or panel shows and picks by. In Pen Tool Extras it is also the picture of a line on a
  pen color button.
- **unreadable value** — a saved value its script's reader refuses (`lib/store.js`), as a later version's shape would be after a
  downgrade. It is kept under a copy of its key before any save can write over it.

## SudokuPad

What SudokuPad itself does: `docs/research/`.

- **bottom row** — SudokuPad's `.controls-aux`, the row of buttons under the number pad: undo, redo, check, the Select button
  (`data-control="select"`) and the buttons other scripts add.
- **letter mode** — whether the number pad types letters (`ABCDEFGHIO`) or digits, toggled by the **letter tool**'s button and `/`
  (`docs/research/sudokupad-letter-tool.md`).
- **letter tool** — SudokuPad's tool, switched on by its "Enable Letter Tool" setting, that adds a toggle button before the delete
  button and lets the number pad type letters.
- **line mode** — SudokuPad's pen setting for where a dragged line snaps: center and edge, center only, or edge only, saved under
  `ToolPen_linemode`. The pen panel's **line mode button** steps it.
- **settings group** — one of the collapsible sections of SudokuPad's settings dialog. Every script's **settings entry** goes in
  the Experimental one.

## Auto Rules Resizer

Behavior: `docs/auto-rules-resizer.md` and the README's script notes.

- **Auto Rules Resizer** — the script `auto-rules-resizer.user.js`. In landscape it makes the rules pane use the room the page has
  to spare before it shrinks the text, and lets the solver resize it by hand.
- **font offset** — the px Auto Rules Resizer's f+ and f- add to or take from the automatic font size. Not Text Anywhere's **nudge**.
- **sizing** — a puzzle's own size of the rules pane: its **font offset** and its dragged box, saved per puzzle.
- **sizings** — see **sizing**.

## Color by Digit

Behavior: `docs/color-by-digit.md`.

- **brush** — the palette color picked in the dialog, which a click on a **digit key** paints with.
- **Cell strip** — the **chips** the button shows in Cell and Off: one cell per group of the cell profile, each with its **shown
  digit**. Which digits Both shows instead is under the Cell and Digit pulldowns in `docs/color-by-digit.md`.
- **chips** — a profile's colors drawn as a run of joined square board cells, three at most, each with a digit. The button draws
  them in the **mode**'s look; the profile menu and the dialog draw them as Cell does.
- **Color by Digit** — the script `color-by-digit.user.js`. It colors cells, or the digits and marks in them, by digit, with the
  colors of the **groups** of a **profile**, and keeps the colors in step as the puzzle is solved.
- **conflict circle** — the small pale red circle drawn behind a corner or centre mark in SudokuPad's `conflict` state, in Digit
  and Both.
- **digit color** — the darker shade of a digit's group color in the **digit profile**, which fills entered digits, corner marks
  and centre marks in Digit and Both.
- **digit key** — one of the ten buttons in the dialog's pad (1 to 9, then 0 under 7), filled with its digit's group color.
- **digit profile** — the profile whose groups give the **digit colors**: the active profile while the Digit pulldown says Same as
  cell, else a second pick.
- **group** — the digits that share one palette color in a profile. A digit is in at most one group.
- **mode** — Color by Digit's saved setting, Cell, Digit, Both or Off: what it colors, cells, digits, both or nothing.
- **preload** — one of the five ready-made **profiles**: Low/5/High, Odd/Even, Entropic, Modular and Each digit.
- **profile** — a named list of **groups**, one to six of them, of which exactly one is active, the cell profile. A fresh install
  has the five **preloads**.
- **profile menu** — the menu above the Color by Digit button, one row per profile, where a pick makes that profile active.
- **pure cell** — a cell that belongs to exactly one group: its digit is in that group or, with no digit, all its centre marks are.
- **selected profile** — the profile the settings dialog is editing. Selecting one changes no color.
- **settings pulldowns** — the three drafts at the top of the settings dialog: **Mode**, **Cell** (the cell profile) and **Digit**
  (the **digit profile**, Same as cell or None).
- **shown digit** — the one digit that stands for a group on its cell of the **chips**.
- **Use digit colors** — whether Color by Digit colors digits at all, set off by the Digit pulldown's None.

## Dark Page

Behavior: `docs/dark-page.md` and the README's script notes.

- **board box** — the `#svgrenderer` box, which Dark Page leaves SudokuPad's own page background so the board stays white.
- **Dark Page** — the script `dark-page.user.js`. It paints the page outside the **board box** the **page color** and darkens the
  controls around it; a dark page means Dark Page, since SudokuPad's own dark mode is not supported.
- **page color** — the color Dark Page paints the page outside the board box, black until the solver picks another.

## Pen Tool Extras

Behavior: `docs/pen-tool-extras.md`.

- **arrow line** — a line drawn with a page 3 pen: a line with a run of filled triangles along it, pointing the way it was
  dragged. Not a **direction arrow**.
- **arrow spacing** — the dialog's slider for the distance from one arrow of an **arrow line** to the next.
- **cell color page** — see **pen color**.
- **cell cycle** — see **cell mark**.
- **cell mark** — a pen mark in a cell's middle: SudokuPad's own circle or cross, or Pen Tool Extras' dot. The **cell cycle** is
  the order a click there steps through them.
- **color character** — the one character a stroke stores for its pen color: `1` to `9` on page 1, `a` to `i` on page 2, `j` to
  `z` and `0` on page 3.
- **controls row** — the pen panel's row of buttons under the nine color buttons: the **line mode button**, the **page button**
  and the **settings button**. They sit with the **pen panel sliders** on the **tray**, a light purple box.
- **corner cycle** — the order a click in a **corner zone** steps through: X, circle, empty.
- **corner zone** — the part of a cell near a grid corner where a click makes a **grid-corner mark**.
- **dash length** — the dialog's slider for how long each dash of a page 2 line is, in line widths; 0 is dots.
- **derived color** — see **pen color**.
- **direction arrow** — see **edge mark** and **arrow line**.
- **direction character** — one of a page 3 pen's two **color characters**, one for each way a line can be dragged; the second is
  its **reverse character**.
- **edge cycle** — the order a click on an edge steps through its marks: X, circle, first direction, second direction, empty.
- **edge mark** — a pen mark on a cell edge: SudokuPad's own X, or a direction arrow or the edge circle Pen Tool Extras adds.
- **grid-corner mark** — an X or a circle drawn centred on a corner of the grid. Not SudokuPad's "corner marks", the small digits
  in a cell's corners.
- **install save** — see **pen color**.
- **install step** — one of the parts Pen Tool Extras installs at startup, each a **feature** of the **SudokuPad guard**. Not an
  undo step, a cycle step or a page step.
- **line mode button** — the first button of the **controls row**, which steps SudokuPad's **line mode**.
- **line style** — one of the two kinds of line the extra pen pages draw, dashed (page 2) and arrow lines (page 3), each with a
  box in the dialog that takes its page out of the rotation.
- **mark growth** — see **thickness**.
- **marks layer** — the group, last in the pen layer, that holds every edge, grid-corner and cell mark, so a mark is drawn over
  every pen line.
- **opacity** — the setting for how see-through the whole pen layer is, from 20 to 100 percent.
- **page button** — the second button of the **controls row**, also called the line type button, which turns the **pen page**.
- **pen color** — one of the pen tool's nine colors, numbered 1 to 9. The **derived colors** of a **cell color page** are its
  colors darkened, the **install save** is the first save of them, and a **pen color preset** fills all nine.
- **pen color preset** — a named set of nine pen colors the dialog's pulldown fills the pickers with: "Darker page 1" to "Darker
  page 3", or "SudokuPad colors". An edit makes the set **Custom**.
- **pen erase** — Pen Tool Extras' right click or drag in the pen tool, which erases a whole line or a mark. Text Anywhere's
  **erase** is a different feature.
- **pen page** — one of the three lists of nine pens: page 1 SudokuPad's own, page 2 dashed and page 3 **arrow lines**, all in the
  same nine colors.
- **pen panel sliders** — Thickness and Opacity, in the pen tool's panel under the **controls row**. Each has a **slider box** in
  the dialog that takes it out of the panel.
- **Pen Tool Extras** — the script `pen-tool-extras.user.js`. It adds customizable **pen colors**, the dashed and arrow **pen
  pages**, and marks at cell centers, on cell edges and at grid corners to SudokuPad's pen tool.
- **reverse character** — see **direction character**.
- **settings button** — the third button of the **controls row**, an outline gear, which opens the settings dialog.
- **slider box** — see **pen panel sliders**.
- **thickness** — the setting for the stroke width of every pen line and mark, from 1 to 16. Above 5 the marks also grow in size,
  the **mark growth**.
- **thickness keys** — the + and - keys, which with the pen tool on move the Thickness slider one step.
- **tray** — see **controls row**.
- **white outline** — the white band the pen layer gets round every line and mark, on by default.

## Text Anywhere

Behavior: `docs/text-anywhere.md`.

- **Background** — the button that gives the next **text**, and any selected or open one, a rounded box behind it.
- **background box color** — the setting for the color of the box behind every note that has one.
- **box** (a note's) — the room a note's text takes: 16 em by 8 lines until a **resize handle** sets it.
- **bullet** (a note's) — a line of a note that starts with `- ` or `* `, drawn with a `•` in a hanging indent. A **numbered
  item** is the same with its number.
- **checklist item** (a note's) — a line of a note that starts with `[ ]` or `[x]`, drawn as a box a click ticks.
- **erase** — Text Anywhere's right click or drag, which removes whole texts.
- **font setting** — the settings dialog's Font pulldown, Proportional or Fixed width, for every note.
- **frame** — the settings dialog's Box border row: a thin gray ring round every note's box, or none.
- **halo** — the outline in the page's color round each letter of a note, so a note reads over what is under it.
- **handover** — see **Text Anywhere**.
- **header** (a note's) — a line of a note that starts with `# `, `## ` or `### `, drawn bold and larger. **Subtext** starts with
  `-# ` and is drawn smaller and faded.
- **Hide all notes** — the eye button that hides every note until it is pressed again.
- **move** — Text Anywhere's left-drag that starts on a text, which moves the **selection**.
- **note color** — one of Text Anywhere's nine colors, numbered 1 to 9.
- **notes** — everything Text Anywhere has put on one puzzle: its texts, oldest first.
- **nudge** — an arrow key pressed with notes **selected**, which moves them a few screen pixels.
- **numbered item** — see **bullet** (a note's).
- **Opacity slider** — Text Anywhere's second slider, for how see-through a text is (called Transparency until 0.45.6).
- **Outline setting** — the settings dialog's Halo round the letters row, for the reach of every note's **halo**: None, Thin or Thick.
- **resize handle** — one of the four small purple squares on the corners of an open or singly selected note, which set its **box**.
- **selected** — see **selection**.
- **selection** — the texts Text Anywhere has selected, each drawn with a purple outline. The color buttons, sliders and
  **Background** show and change them.
- **selection rectangle** — see **selection**.
- **Size slider** — Text Anywhere's first slider, for the text size.
- **subtext** — see **header** (a note's).
- **symbol** (a note's) — a sign typed as ASCII and replaced as it is typed, such as `->` for →.
- **text** (a note) — a short string typed onto the **notes**, in a **note color**, pinned to the board's cells or fixed on the
  screen. The **text box** is the note open for typing.
- **Text Anywhere** — the script `text-anywhere.user.js`, and the tool it adds, named **Text** on its button.
  Called Draw Tool before 0.17.0, when it also drew lines and shapes, and Text Annotation until 0.27.0; its old install address
  `draw-tool.user.js` stays as its **handover**, frozen at 0.45.1.
- **text box** — see **text** (a note).

## UI Tweaks

Behavior: the README's script notes.

- **Digit pad size** — see **UI Tweaks**.
- **options** — see **UI Tweaks**.
- **UI Tweaks** — the script `ui-tweaks.user.js`. Five **options** in one dialog: Tab never switches to letters, Hide the Select
  button, Wrap buttons, Mouse wheel changes mode and the **Digit pad size**.
