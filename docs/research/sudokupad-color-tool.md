# SudokuPad's color tool, for a script that colors cells

Read 2026-11-02 from SudokuPad 0.611.0's served source: `tool-color.js`,
`script.js`, `feature-cellpaste.js`, `tool-color.css`, `style.css`. Nothing here
was run in a live page.

## What a cell stores

- A cell's `colours` array holds palette keys, never color values
  (`script.js`, `renderPropColor`). Each key renders as the class `color-<key>`.
- More than one key in a cell draws as wedges. `toggleColour` clears the cell's
  other colors first unless the `multicolour` setting is on.
- The `colour` tool has the action short name `co`, so a color is an ordinary
  action that takes part in undo and replay.
- `feature-cellpaste.js` shows the batching pattern: `app.act({type: 'groupstart'})`,
  select cells, `app.act(...)`, then `app.act({type: 'groupend'})`.
- `Framework.app.tools.colour` is not confirmed as the lookup path. A third-party
  script reads `app.tools.color`, while the tool's own name is `colour`.

## The palette accepts custom colors natively

- `ToolColor_tool.DefaultPalette` has 30 keys on 3 pages of 10: `0-9`, `a-j`, `k-t`.
  Keys `0`, `a` and `k` are transparent, so each page has 9 visible colors.
- `P.setColor(key, color)` sets the CSS variable `--cell-color-<key>` and saves
  the palette. The color picker passes it `rgb(r, g, b)`, converted from hex.
- `P.setPalette(palette)` and `P.savePalette(palette)` replace the whole palette.
  `validatePaletteData` checks only that `colors` is an object and that every
  page entry is a key of `colors`.
- The palette is saved through `Framework.setData('ToolColor_palette', ...)`,
  once per browser profile and not per puzzle.
- Settings has "Import/Export Color Palette", which reads and writes the same JSON.
- `tool-color.css` sets `--cell-color-opacity: 0.6`. A chosen hex may therefore
  show blended with the board. Not checked live.
- A key outside the default 30 was not tested. `style.css` has `.color-<key>`
  rules, so an unknown key may need its own CSS.

## Extension points

- `app.puzzle.addEventListener('act', ...)` fires on each action (seen in the
  third-party SudokuPad Tools script on Greasy Fork, not in SudokuPad's docs).
- `Framework.addSettings([...])` and `Framework.showDialog({...})` are the
  native settings and dialog surfaces. Both are used by `tool-color.js`.

## Existing scripts searched

- mj6robinson/SudokuPad-Extra-Tools: a browser extension whose README offers
  auto-color from a right click on the color menu, with odd/even and high/low
  choices. Only the README was read. It lists no custom groups or hex.
- thatcomputerguy0101/SudokuPad_Extensions: copy-paste, select by digit and
  similar. No auto-color.
- sudokucolors.netlify.app color picker: recolors the puzzle's own art, not
  cells.
- mjaschen's palette cycle gist: only cycles palette pages.
- SudokuPad Tools (Greasy Fork): auto singles and pencil marks. No color by digit.

## Extended Checks: a working script with its own settings

gdc's [SudokuPad Extended Checks](https://sudokucolors.netlify.app/extendedchecks/)
v0.9, read from `user-script/extended-checks.user.js`. Not run here. These are
what a shipped script does, which is stronger evidence than the SudokuPad source
alone, and still not a live check of ours.

- Header: `@grant none`, `@run-at document-idle`, and `@match` on both
  `sudokupad.app` and `crackingthecryptic.com`, each with subdomains.
- Start: `if (typeof Framework !== "undefined" && Framework.getApp)`, then
  `Framework.getApp().then(app => init(app, Framework))`.
- Button: `Framework.addAuxButton({name, title, content, onClick})` adds it to
  `.controls-aux`. `framework.js` routes `addAppButton` through the same
  `addControlButton`, with `.controls-app` as the parent.
- Settings panel: `Framework.addSetting({tag: 'toggle', group, name, content})`,
  read back with `Framework.getSetting(name)`.
- Dialog: `Framework.showDialog({parts, centerOverBoard: true})`. Parts include
  `{tag: 'text', innerHTML}`, which carries a raw `<select>`, plus `{tag: 'hr'}`
  and `{tag: 'options', options: [{tag: 'button', content, action: 'close', handler}]}`.
- It saves only the panel toggle. Its chosen color mode is in memory only, so it
  sets no precedent for saving a list of groups.
- Reads cells through `app.puzzle.cells`, with `x.given || x.value` and
  `cell.colours`.
- Digit groupings it names: `polarity` 1234/5/6789, `parity` 13579/2468,
  `entropy` 123/456/789, `modularity` 147/258/369, `clones` one per digit. Its
  check skips a cell whose `colours.length` is not 1.

The same site's `sp_colors.user.js` draws its own panel and uses `Framework` only
to read `Framework.app.sourcePuzzle`, so it is not a pattern for native settings.

## Read for color-by-digit (2026-11-02, served source, not run live)

Read from `https://sudokupad.app/` `framework.js`, `script.js`, `tool-color.js`
and `feature-cellpaste.js`. Still no live page.

- `Puzzle.ToolToAction.colour` is `'colour'`, so `app.act({type: 'colour', arg: key})`
  colors the selected cells. `app.select(cells)`, `app.deselect()` and
  `app.puzzle.selectedCells` are the selection surface.
- `Cell.toggleColour` clears the cell first when `multicolour` is off and the cell
  holds more than one color or not that key; with it off, toggling a key the cell
  holds alone removes it. This is why a cell already holding its key is skipped.
- `Framework.getData` and `setData` JSON-encode objects into `localStorage` under
  a per-profile key; a missing key reads `null`.
- `Framework.addSetting({tag: 'button', ...})` renders a settings button; `showDialog`
  returns without opening when a dialog is already visible, so a settings button
  must close the Settings dialog first. `parts` go through `createElem`, so a
  `{tag: 'text', innerHTML}` part is the way to put custom markup in a dialog.
- The palette's current colors are the CSS variables `--cell-color-<key>` on
  `document.documentElement` (`tool-color.js` `getCssVar`).

## Coloring the digits themselves

Tested 2026-11-02 on sudokupad.app in headless Chromium, with a prototype injected
into the page, not installed through Tampermonkey.

- `renderPropDefault` sets `elem.textContent` on a `.cell-value` SVG text element,
  and that element carries no digit class.
- Setting `el.style.fill` wins over SudokuPad's own `fill` of `rgb(29, 106, 229)`.
  A `MutationObserver` on `#svgrenderer` (`subtree`, `childList`, `characterData`)
  that repaints every `#cell-values .cell-value` kept the colors right through
  entry, undo and a changed digit, and re-running it after a reload repainted the
  restored digits.
- Not tested: givens, dark mode, `outlinesondigits`, digits on colored cells, and
  moving to another puzzle without a reload.

### How givens and marks render

Tested 2026-11-03 on sudokupad.app in headless Chromium, with a scratch probe and
no script installed.

| What | Group under `#svgrenderer` | Element | Digit is in | Default `fill` |
| --- | --- | --- | --- | --- |
| Given | `#cell-givens` | `text.cell-given` | text | `rgb(0, 0, 0)` |
| Entered digit | `#cell-values` | `text.cell-value` | text | `rgb(29, 106, 229)` |
| Corner mark | `#cell-pencilmarks` | `text.cell-pencilmark.pm-<n>`, one per mark | `data-val` | `rgb(29, 106, 229)` |
| Centre mark | `#cell-candidates` | one `text.cell-candidate` per cell, one `tspan` per mark | `data-val` on the `tspan` | `rgb(29, 106, 229)` |

- Givens sit in their own group, so selecting `#cell-values` already leaves them out.
- A mark that conflicts with a digit in its row, column or box gets class `conflict`
  (on the `text` for a corner mark, on the `tspan` for a centre mark) and a `fill` of
  `rgb(179, 58, 58)`. The rule is `.setting-checkpencilmarks #cell-pencilmarks .conflict,
  .setting-checkpencilmarks #cell-candidates .conflict { fill: var(--puzzle-pencilmarkerror) }`,
  specificity (1,2,0).
- A `style.fill` set on a mark would hide that red. A stylesheet rule on
  `#cell-candidates tspan[data-val="8"]` did not override it, so the red won there.
  The same rule on a corner mark was only run with `:not(.conflict)`. (Explained below, in
  "Conflicting marks keep the digit color": the tspan rule's specificity (1,1,1) lost to that rule.)
- An entered digit that conflicts got no `conflict` class in this test and stayed
  `rgb(29, 106, 229)`.
- A stylesheet rule keyed on `data-val` colored marks added after the rule went in,
  with no observer. `text.cell-value` has no `data-val`, so an entered digit still
  needs its own way to read the digit.

## Adding an app button after load

Found 2026-11-02 running the merged script on sudokupad.app in headless Chromium.

- `Application.attachButtonHandlers` binds handlers to the buttons present when it
  runs. A button added later with `Framework.addAppButton` renders but its `onClick`
  never fires; a real click on `#control-colorbydigit` produced no `app.act` calls.
- `app.refreshControls()` after `Framework.addAppButton` fixes it. With that one line
  on a scratch copy, the live checks of ticket #1 passed.
- `content: 'Color'` showed as a blank grey box in `.controls-app.controls-small`.
  SudokuPad's own app buttons use `<div class="icon">...</div>`, so a button needs an
  icon in that shape.

## Digit color, run live (2026-11-03)

`digit-color.user.js` injected into sudokupad.app 0.611.0 in headless Chromium at the
three injection times, by `live/digit-color.live.mjs`. Not run through Tampermonkey or on
`crackingthecryptic.com`.

- A stylesheet rule colors corner marks and centre marks from `data-val`, with
  `:not(.conflict)` so a conflicting mark keeps `rgb(179, 58, 58)` (superseded by "Conflicting
  marks keep the digit color" below). Entered digits have no
  `data-val`, so a `MutationObserver` on `document.body` (`childList`, `characterData`) stamps
  a `data-digit-color` attribute on each `#cell-values .cell-value`, and the same stylesheet
  colors that. Stamping an attribute does not retrigger the observer.
- The stylesheet rules beat SudokuPad's own `fill` without `!important`. Givens, in
  `#cell-givens`, stay `rgb(0, 0, 0)`.
- Previously untested, now run: `outlinesondigits` on; `prefers-color-scheme: dark`
  emulated; an entered digit on a cell with a color; the board rebuilt in the page without a
  reload. SudokuPad 0.611.0 lists no dark-mode setting (`uitheme` offers only color themes),
  so the dark run is the media-query emulation and nothing more.
- `App.loadPuzzle` takes a puzzle object, not an id, and throws on an id. The page's own
  loader is `parsePuzzleData(await fetchPuzzle(id))` then `app.loadCTCPuzzle(...)`, using the
  top-level `PuzzleLoader`, which is not a `window` property.
- A mark conflicts with a given in its row, column or box, so a test mark needs a cell
  chosen against the givens.

## Two kinds of pencil mark, with duplicates

Tested 2026-11-03 on sudokupad.app in headless Chromium, with a scratch prototype
injected into the page. No script exists yet.

- `pencilmarks` and `candidates` store any string, unvalidated. `Cell.toggleProp`
  toggles and sorts the list, so `"1"` and `"a"` coexist as different marks. A
  multi-character string renders one element per character, so a stand-in must be
  one character.
- Prototype: a wrapper on `Framework.app.act` turned digit `1`-`9` into `a`-`i` while
  a toggle was on, and a `MutationObserver` on `#svgrenderer` rewrote the rendered
  text to the digit and set its `fill`. A real key press went through the wrapper in
  corner and centre mode. The stand-in stays in `data-val`, so the observer can tell
  the two kinds apart after a repaint.
- Those marks worked with SudokuPad's own undo, redo and toggling off, and survived a
  reload. The action log records them as ordinary marks (`pm:a`).
- Without the script, a stored stand-in shows as its letter, so a shared replay or
  saved progress opened elsewhere shows `a`, not a colored `1`.
- SudokuPad's conflict check does not see a stand-in: a second-kind `5` in a row with
  a given `5` got no `conflict` class, while the ordinary `5` beside it did. The
  ordinary mark then turns `rgb(179, 58, 58)`, so a red second kind cannot be told
  from a conflicting first kind.
- A cell holding 18 corner marks showed only about ten positions, packed and
  overlapping. Two plus two marks laid out cleanly.
- Not tested: the on-screen digit buttons, several selected cells, Clear, SudokuPad's
  automatic mark removal on entering a digit, 0, and a puzzle whose digits use letters.

## Conflicting marks keep the digit color (2026-11-03)

Run live on sudokupad.app 0.611.0 in headless Chromium, ticket #10. Not run through
Tampermonkey or on `crackingthecryptic.com`. Screenshot at real size, 1200x900 viewport, with
the puzzle in `live/puzzle-url.txt`: `docs/research/digit-color-conflict-outline.png` (two 5
marks in conflict with a given 5, in the corner at row 1 and the centre at row 2).

- The fill needs no `!important`. The corner rule `#cell-pencilmarks .cell-pencilmark[data-val]`
  ties SudokuPad's red rule at (1,2,0) and wins by coming later; the centre rule
  `#cell-candidates tspan[data-val]` at (1,1,1) lost to it. Prefixing both with `#svgrenderer`
  gives (2,x,x), which beats the red on both without `!important`.
- `stroke` alone shows nothing: the computed `stroke-width` is `0px` on a mark, so the outline
  needs an explicit `stroke-width`. `paint-order: stroke` computes as `stroke` and puts the
  stroke behind the fill, so half the width shows.
- Marks are about 11 px wide on screen. At `stroke-width: 3px` the red crowded the digit
  color; at `2px` both read. The script uses 2px.
- Every mark has a white halo stroke, `rgba(255, 255, 255, 0.7)`, with no script. The conflict
  rule's `stroke` replaces it on a conflicting mark only.
- The red only shows with `.setting-checkpencilmarks` on the page; marks keep the `conflict`
  class with it off. The outline rules carry that class, so the setting off means no outline.
- A conflicting mark of a digit on SudokuPad's own color keeps the red fill and gets the same
  red stroke, so it looks as before, a little bolder.

## Conflicting marks get a circle, not an outline (2026-11-03)

Run live on sudokupad.app 0.611.0 in headless Chromium, ticket #13, which replaces #10's
outline. Not run through Tampermonkey or on `crackingthecryptic.com`. Screenshot at real size,
1200x900 viewport, same puzzle: `docs/research/digit-color-conflict-circle.png` (conflicting
corner 5s, 4 and a centre 1 and 5), to be read beside `digit-color-conflict-outline.png`.

- Chris ruled the 2px outline a muddy fringe at real size. SVG text has no background, so the
  script draws `circle` elements in its own `g#digit-color-circles`, inserted just before
  `#cell-pencilmarks`: behind every mark, above the cell colors.
- Measuring: a `text` has `dominant-baseline: middle` and `text-anchor: middle`, so its `x` and `y`
  are the middle of its digit. A corner mark also has a CSS `transform: translate(-15px, -15px)`
  that `getBBox` and the attributes leave out, so the point goes through `getCTM()`. A centre mark's
  `tspan` is not a graphics element (no `getCTM`, no `getBBox`): `getExtentOfChar(0)` gives its
  x, and its parent `text` gives the y and the transform. An early version centred on a guessed
  baseline offset and drew the circles 4 units off; the check then compared against the box the
  browser reports (`getBoundingClientRect`). Superseded by #19: `y` is the middle of a lowercase
  letter, not of a digit, and the check now reads the ink from screenshot pixels
  (`sudokupad-mark-ink-centre.md`).
- Fill `#ff6b6b` at `fill-opacity: 0.4` over white is a pale pink: digit 1's `#b0125b` and every
  other default color stay readable on it. Radius is 0.8 of the mark's width, about 8 units for a
  corner mark; it covers the digit and a little more.
- Showing and hiding: the group is `display: none` unless `.setting-checkpencilmarks` is on the
  page, so the setting alone toggles it; no observer watches the body's class.
- The observer now also watches `class` attribute changes (`attributeFilter: ['class']`), which is
  how a mark enters or leaves `conflict`, through entry, undo, redo and loading. It ignores changes
  inside the circles' group and `class` changes on anything but a mark, so redrawing the circles
  and stamping `data-digit-color` do not retrigger it. The circles are rebuilt on each board change.
