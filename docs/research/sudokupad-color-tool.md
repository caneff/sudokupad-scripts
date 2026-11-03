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
  `rgb(179, 58, 58)`.
- A `style.fill` set on a mark would hide that red. A stylesheet rule on
  `#cell-candidates tspan[data-val="8"]` did not override it, so the red won there.
  The same rule on a corner mark was only run with `:not(.conflict)`.
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
