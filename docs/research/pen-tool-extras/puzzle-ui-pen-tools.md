# Pen, line and mark features in other puzzle UIs that SudokuPad's pen lacks

Read on 2026-11-03, for choosing new Pen Tool Extras features. Desktop only. Solver use only.
Nothing here was run on a page. "SudokuPad today" comes from `docs/research/sudokupad-pen-tool.md`,
`docs/research/sudokupad-pen-edge-marks.md`, `pen-tool-extras.user.js` and the copy of SudokuPad's
`tool-pen.js` (v0.611.0); where those do not say, the cell says "not checked".

## What was read, and what was not

Read (each source once):
- Penpa+ `swaroopg92/penpa-edit`, master at `34e3fe9` (2026-06-03): `README.md` (the docs), `CHANGELOG.md`,
  `docs/js/style.js` (line styles), `docs/js/main.js` (undo buttons), `docs/index.html` (style pickers),
  `docs/js/settings.js` (setting names). The mode code in `docs/js/modes.js` and `class_*.js` was not opened; the
  per-mode mouse gestures below are from the README's mode list.
- puzz.link `robx/pzprjs`, master at `ba714a2` (2026-11-01): `docs/InputModes.md`, `docs/Config.md`,
  `src/puzzle/MouseInput.js`, `src/variety-common/MouseInput.js` (`inputLine`, `inputpeke`, `inputQsubLine`),
  `src/variety/country.js` (`mouseinput_auto`), `src/puzzle/Operation.js` (trial), `src/puzzle/Graphic.js`
  (`trialcolor`), `src-ui/js/ui/ToolArea.js`, `src-ui/p.html`.
- f-puzzles (`https://www.f-puzzles.com/`, script version 1.11.3): `Main.js`, `Inputs.js`, `Sidebars.js`, `Cell.js`,
  `Button.js`, `Solve.js`, grepped for tool and enter-mode names. Scripts with a space in the name
  (`Use Tools.js`, `Undo Redo.js`, ...) were requested unencoded and returned a 404 page, so they were not read.
- SudokuMaker (`https://sudokumaker.app/`, v2026.10.05-a3aef4c): the page is a single-page app; its bundle
  `assets/main-IgwNn95P.js` (1.28 MB, minified) was grepped for pen, draw, freehand and line-tool strings.
- variantsudoku.com: the page's inline script (786 KB), pen section and key handler.
- sudokUI `AImenes/sudokUI`, main at `4cf9d19`: `README.md`.
- Original Penpa `opt-pan/penpa-edit`, master at `72bb5d7` (2026-02-19): `README.md` only.

Could not reach: Kudamono (`kudamono.com` serves only a Japanese maintenance page); Puzzle Square JP
(`puzsq.jp`: the landing page only, no editor or help); Logic Masters Germany, GMPuzzles, Cracking the Cryptic's
own app (that is SudokuPad), Tectonic and WPC applets were not searched. SudokuMaker's source is minified and a
playtest board is not reachable without running it, so its solver tools are unknown (see below).

## Findings by UI, short

- **Penpa+**: has the most. Line, Edge and Composite modes; styles per line (colors, Thin, Thicker, Dotted, Fat dots,
  Short, Double); free lines; right click and right drag for auxiliary X; arrows and dots on edges. Sudoku mode has its
  own pencil marks but no pen strokes.
- **puzz.link / pzprjs**: left drag draws a line, right drag draws "peke" (X) along edges, auxiliary dot, circle and
  cross marks, `irowake` (a color per line), and a trial mode.
- **f-puzzles**: no pen or line tool in solve mode. `Sidebars.js` registers `EnterCorner`, `EnterCenter` and
  `EnterHighlight` beside Normal; highlight is a cell color (`Cell.js`, `highlightCs`). None found in `Main.js`,
  `Inputs.js`, `Sidebars.js`, `Solve.js` (grepped for line, pen, draw).
- **SudokuMaker**: None found in the bundle (grepped for pen, freehand, drawing, "line tool", "pen tool"; hits were
  CodeMirror internals and `PencilMarks`). That does not prove it has no pen; the minified solve UI was not read.
- **variantsudoku.com**: a SudokuPad-like pen (centre lines in 8 directions, edge lines, 9 colors, one undo step per
  stroke, a stroke that starts on an existing segment erases). Differences from SudokuPad are in the table.
- **sudokUI**: no user pen or line tool (README: only hint drawings, with dashed weak links and solid strong links).

## Table

| Feature | UIs that have it | SudokuPad today | In a userscript (judgment) |
|---|---|---|---|
| Digit keys 1 to 9 pick the pen color while the pen tool is on | variantsudoku.com (inline script: `if(dm&&mode==='pen'&&!held){... penColor=+dm[1]-1}`); Penpa: number keys fill colors in Surface and Multicolor modes (README, "In Surface Mode", "In Multicolor Mode") | Lacks: `tool-pen.js` has `keyHandlers: [{key: /[0-9]/, ...}]` whose handler only returns whether the pen tool is active and never calls `setSelectedColor`; `sudokupad-pen-tool.md` found a digit key did nothing in the pen tool. Not re-run | Small. No stored value. A key handler could call `setSelectedColor` or press the nth swatch (`.tool-pen button[data-value]`). |
| Drag along edges to put a run of edge X | Penpa: Line "x" and Edge "x" composite: "Right click and drag for multiple crosses in one go" (README, Composite); pzprjs: `inputpeke` is a drag (`variety-common/MouseInput.js`), bound to the right button in `variety/country.js` `mouseinput_auto` | Lacks: an edge X is one click (`clickCell`, `sudokupad-pen-edge-marks.md`); a drag draws or erases a line | Medium. No new stored value: it writes the existing `3`, `4`, `b`, `c`. Needs a drag handler that hit-tests each edge crossed and follows the same X/cycle choice as the click. Right drag is free (right click is click-only in Extras). Would need one undo group per drag. |
| Right button gives a different mark from the left (left draws, right marks) | Penpa: README, Composite: "Right click for cross and Left Click for Line", "Right Click for cross" in Line x, Edge x, Edge IO, Yajilin; pzprjs: `country.js` `mouseinput_auto` (left `inputLine`, right `inputpeke`) | Partly: right click does what left click does (`sudokupad-pen-edge-marks.md`); Extras uses it to cycle backwards | Same cost as the row above; it is the same gesture. Conflicts only if right drag is also given to line drawing. |
| Dotted, fat-dotted and double line styles | Penpa: `docs/index.html` `style_line` radio values `12` Dotted, `13` Fat dots, `30` Double, `40` Short; `style_lineE` the same plus `21` Thicker and `80` Thin; the dash patterns are in `docs/js/style.js` cases 12, 13, 17; `CHANGELOG.md` 3.1.5 "LineDashoffset to SVG export" | Lacks. Only color (9 slots), plus Extras' thickness and opacity sliders | A stored style needs a new value, and `z` is the only one free. The cheaper route stores nothing: a setting that gives a color slot a dash pattern, as a CSS rule (`.cell-pen.pencolor-N { stroke-dasharray }`; `.cell-pen` sets width 5 and loads after a script's style, so the rule needs the `.cell-pen` prefix, per `sudokupad-pen-edge-marks.md`). The cost is that a dash is tied to a color, and old strokes change with the setting. Double line has no sudoku use. |
| A small dot in the cell centre ("stays blank / visited") | pzprjs: `objblank` ("auxiliary dots that means they should remain blank"), `subcircle`, `subcross` (`docs/InputModes.md`); Penpa: "Right click - dot in center" in Yajilin and Akari composites, "green dot on edges or corners" in Star Battle (README, Composite) | Lacks: the cell marks are circle and cross (`5`, `6`); Extras has small rings on edges and corners only | A new picture mark, which Chris said yes to in kind. Needs a stored value: `z` is the last free one, so this would use it up. Another route is a smaller circle drawn from the existing `5`, which stores nothing new but loses the big circle. |
| Line color per separate line, set automatically | pzprjs: config `irowake` ("Set individual color to lines", `docs/Config.md`; `ToolArea.js` button `btnirowake`); Penpa has only a setting where any color counts as the green solution line (`settings.js`), and the README says touching lines of different colors do not merge to one color there, unlike puzz.link | Lacks. A color is chosen by hand and stored per mark | Display only is possible (recolor the SVG paths by connected component, nothing stored). Heavy: lines run through center, edge and diagonal values, and the components must be rebuilt after every undo and replay. Close to the rejected "act on a whole connected line", though automatic and view-only; flag to Chris as borderline. |
| Trial mode: try a line, then accept or reject all of it | pzprjs: `TrialEnterOperation`, `TrialFinalizeOperation`, `enterTrial`, `acceptTrial`, `rejectTrial` (`src/puzzle/Operation.js`); buttons `btntrial`, `btntriala`, `btntrialr`, `btntriale` ("enter further trial") in `src-ui/p.html`; trial marks draw in grey, `trialcolor: "rgb(160, 160, 160)"`, `linetrialcolor` (`Graphic.js`) | Lacks for the pen: not checked for the page as a whole (undo is one history) | High. The only cheap route is to remember the undo depth and call SudokuPad's undo that many times on "reject". That is not pen-only, so it also undoes digits. Grey drawing needs a stored color or a view-only override. Close to the rejected "clear one color". |
| Hold the undo (or redo) button to repeat | Penpa: `docs/js/main.js` `undoDown`: an 80 ms timer, repeating after 10 ticks; pzprjs: `data-press-exec="undo,undostop"` in `p.html`, `undotimer` in `ToolArea.js` | Not checked (not pen-specific) | Small if SudokuPad lacks it. Not a pen feature, so it may not belong in this script. |
| Arrow in a cell by dragging in a direction | Penpa: Composite "Arrows: Left click drag to draw an arrow in one of the eight directions in a square"; Number "Arrow" (README) | Partly: arrows exist on edges (Extras), none inside a cell | Not feasible: 8 directions need 8 stored values and only `z` is free. A drawn line with an arrowhead would need the line's end to be knowable. |
| A line from a cell centre to an edge midpoint ("Middle") | Penpa: Line "Middle: A line connecting the center of the square and the center of the side"; `CHANGELOG.md` 3.2.2 "New middle submode to Edge mode" | Lacks | Not feasible: 4 sides need 4 stored values. |
| Line between two points that are not neighbours ("Free") | Penpa: Line "Free", Edge "Free line" (README, "Night tour") | Lacks, to my reading of the pen's neighbour-only segments (not run) | Poor: a segment has to be stored as a cell mark; there is no value for it. A script-owned overlay would not undo or replay with the puzzle. |
| A key that switches to the pen tool | variantsudoku.com: title "Pen (B)" | Not checked | Small; not part of the stored marks. SudokuPad's own tool keys were not read. |

## Already rejected by Chris (UIs that have them, for the record)

- Clear one color: variantsudoku.com has only "Clear lines" for all pen strokes (`data-penclear`); not one color.
- Hold a key for a temporary mode: Penpa (Shift for temporary corner, Ctrl for temporary centre, README).
- Highlight the whole connected line: pzprjs, hold Z gives `info-line` (`MouseInput.js` `mouseinput`, `isZ`).
- Region fill: Penpa "Edge IO" paints inside and outside yellow and green (README, Composite).
- More edge marks: Penpa's Line x<> (X, `<`, `>`) is the same set Extras already cycles; nothing beyond it was found.

## Not worth keeping

- Setter tools: custom grids, cages, answer checks, Alt-drag rectangle select, copy and paste of lines (Penpa
  3.2.0).
- Penpa line thickness: Extras already has the slider.
- Mobile gestures.
