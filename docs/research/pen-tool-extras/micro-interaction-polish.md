# Pen Tool Extras: small touches that would make drawing feel polished (2026-11-08)

Question: which small touches, the kind users do not consciously notice, would make drawing with Pen Tool Extras feel more
polished? Desktop mouse and keyboard only. Read at `main` 66b4c75 (`pen-tool-extras.user.js` 1.29.3) against SudokuPad 0.611.0.
Nothing was built or run on the page.

**Verdict:** the drawing itself is already careful (dash phase, arrow size, one undo per gesture); what is missing is
feedback around it: nothing shows what a right click will erase, where a click will put a mark, or that a panel button was
pressed.

## What SudokuPad already does, read from its source

From `tool-pen.js`, `tool-pen.css`, `style.css` and `script.js` at 0.611.0 (the live harness's recording,
`~/.cache/sudokupad-scripts/live/sudokupad.har`). These numbers set the baseline the table maps to.

- **The drag hint.** `drawLineHint` draws one `path.penhint.pencolor-<pen>`: `stroke-width: 16`, `opacity: 0.6`, round caps
  and joins. It is the same fat solid stroke for every pen. A page 2 pen's hint has no dashes, and a page 3 pen's hint has
  no arrows. Its width does not follow the thickness slider. An erasing drag draws it in `.pencolor-erase` (red, 0.5).
- **When the hint starts.** `handleDragMove` adds a segment only once the pointer is 0.7 of a cell from the last point (times
  √2 on a diagonal). Whether the line is a centre line or an edge line is decided then, by `getCenterEdgeLine`.
- **Click versus drag.** `App.didInputMove` compares the pointer with the press point against `App.DoubleInputDistance = 6`
  CSS px. Under 6 px, the release is a click (`clickCell`).
- **Hit zones.** `clickCell` takes an edge when the pointer is nearer the side's midpoint than 0.75 of its distance to the
  cell middle, and at most 1.0 cell away. Otherwise it takes the cell middle within 0.5. The script's corner zone is
  `CORNER_RADIUS = 0.2` of a cell, and its right-click line hit is `LINE_HIT_RADIUS = 0.2` of a cell. All are in cell units, so
  in pixels they grow and shrink with the grid.
- **Cursor.** `style.css` gives `.grid` `cursor: pointer` (the hand). There is no pen-tool cursor.
- **Buttons.** `style.css` has `button:hover { background-color: #f3e5f5; }` and `button:focus` with a faint shadow. There is
  no `:active` rule, so a pressed button looks the same as a hovered one.
- **Undo.** `ToolPen.actSend` wraps each drag or click in `groupstart` / `groupend`, so one undo takes back one gesture.
  `App.undo` repeats when held: `repeatundodelay: 700`, `repeatundointerval: 100`.
- **Keys.** Neither `tool-pen.js` nor `script.js` contains the string `Escape`. Nothing found cancels a drag in progress.

## Ranked candidates

Ranked by how much they improve the feel for what they cost. Cost: S is CSS or a few lines; M is a new handler or new
drawing code with its live test; L is bigger. None of them stores a new pen value, and none needs a right-button drag.

| # | Touch | What the user feels | Source | How it maps to this script | Cost |
|---|---|---|---|---|---|
| 1 | **Show what a right click will erase while the button is down.** Dim the whole connected line, or the mark, that the press hit. | Today the right press does nothing visible. On release, a whole connected line (`connectedLine`) vanishes, which can be more than the solver meant. A dim preview says "this much" before it happens. | tldraw shows shapes being erased at `opacity *= 0.32` until release ([Editor.ts L4741-4745](https://github.com/tldraw/tldraw/blob/69f43954f15a171b3a6edb45134d27b71560de02/packages/editor/src/lib/editor/Editor.ts#L4741-L4745)), and adds what the press hit at once ([Erasing.ts L40-47](https://github.com/tldraw/tldraw/blob/69f43954f15a171b3a6edb45134d27b71560de02/packages/tldraw/src/lib/tools/EraserTool/childStates/Erasing.ts#L40-L47)). Excalidraw draws elements pending erasure at `ELEMENT_READY_TO_ERASE_OPACITY = 20` % ([renderElement.ts L192-198](https://github.com/excalidraw/excalidraw/blob/701b901a0f1ba3d0b390d9cdf63d112e25abac4b/packages/element/src/renderElement.ts#L192-L198), [constants.ts L440](https://github.com/excalidraw/excalidraw/blob/701b901a0f1ba3d0b390d9cdf63d112e25abac4b/packages/common/src/constants.ts#L440)). Rauno Freiberg: a destructive action fires on gesture end, not during it ([Invisible Details](https://rauno.me/craft/interaction-design)). | In `installLineErase`, after the first `crossPoint`, put a class on the strokes in `erase.lines` and the marks in `erase.marks` that sets `opacity: 0.3` (between tldraw's 0.32 and Excalidraw's 0.2). Remove it in `finishErase` and in the `guarded` failure path. The stroke elements are reachable from each cell: `Cell.renderPropPen` keeps them in `childElems` under the stroke's class (`docs/research/sudokupad-pen-tool.md`, third page). Opacity on a child is safe: the layer's opacity is on `#cell-pen` (`buildOpacityCss`). A quick right click lasts about a tenth of a second, so the preview pays most when the solver holds the button. | M |
| 2 | **A press state on the panel's buttons.** Scale to 0.97 while pressed, with a 100-160 ms ease-out transition. | The line mode, page and settings buttons, and the nine pen buttons, give no sign of the press itself. The script's buttons act on `click` or `touchstart`, so nothing moves until release. | Apple HIG, Buttons: "Always include a press state for a custom button. Without a press state, a button can feel unresponsive" ([Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons)). Emil Kowalski: `scale(0.97)` on `:active` ([7 Practical Animation Tips](https://emilkowal.ski/ui/7-practical-animation-tips)); press feedback 100-160 ms ([emilkowalski/skills AUDIT.md](https://github.com/emilkowalski/skills/blob/main/skills/improve-animations/AUDIT.md)). NN/g: simple feedback about 100 ms ([Executing UX Animations](https://www.nngroup.com/articles/animation-duration/)). | One rule in `panelCss` (`lib/panel.js`) on `controlButtons` and `colorButton`: `:active { transform: scale(0.97) }` with `transition: transform 120ms ease-out`. `lib/panel.js` is shared, so Text Anywhere's panel gets it too, after `node sync-lib.js`. The pen buttons also gain a cue during the 1000 ms hold of edit mode (`HOLD_TO_EDIT_MS`), which today shows nothing until the pickers appear. SudokuPad's own buttons elsewhere stay without one, a small mismatch. | S |
| 3 | **A crosshair cursor over the grid while the pen tool is on.** | Today the grid shows the hand (`.grid { cursor: pointer }`), the "this is a link" cursor. A crosshair says "you are drawing" and shows the exact point that a click hit-tests. | tldraw's draw tool sets `{ type: 'cross' }` on entry ([draw Idle.ts L15-17](https://github.com/tldraw/tldraw/blob/69f43954f15a171b3a6edb45134d27b71560de02/packages/tldraw/src/lib/shapes/draw/toolStates/Idle.ts#L15-L17)). Excalidraw sets `CURSOR_TYPE.CROSSHAIR` for every drawing tool ([App.cursor.ts L146-147](https://github.com/excalidraw/excalidraw/blob/701b901a0f1ba3d0b390d9cdf63d112e25abac4b/packages/excalidraw/components/App.cursor.ts#L146-L147)). Apple HIG lists the Cross pointer for "precise rectangular selection" ([Pointing devices](https://developer.apple.com/design/human-interface-guidelines/pointing-devices)). | One CSS rule in the script's style, for example `:root:has(.controls-main.tool-pen) .grid { cursor: crosshair; }` (`.controls-main` carries `tool-pen` while the pen tool is on, per `sudokupad-pen-tool.md`). Not checked: that `#svgrenderer` sits inside `.grid` on every page layout. Every other SudokuPad tool keeps the hand, so the cursor would change with the tool. | S |
| 4 | **A faint preview of the mark a click would place, at the edge, corner or cell middle under the pointer.** | The three hit zones are invisible. The corner zone is 0.2 of a cell, and SudokuPad's edge zone reaches 0.57 along a side. A ghost of the next mark shows whether a click lands on the edge, the corner or the cell, and what the cycle steps to. | tldraw hit-tests the shape under the pointer with a margin and shows a hover indicator, throttled to 32 ms ([updateHoveredShapeId.ts L24-31, L87](https://github.com/tldraw/tldraw/blob/69f43954f15a171b3a6edb45134d27b71560de02/packages/tldraw/src/lib/tools/selection-logic/updateHoveredShapeId.ts#L24-L31)). Apple HIG: the pointer starts to change "as soon as it reaches the element's hit region" ([Pointing devices](https://developer.apple.com/design/human-interface-guidelines/pointing-devices)). Apple WWDC18, "The Life of a Button": feedforward shows what is about to happen ([video](https://developer.apple.com/videos/play/wwdc2018/804/)). | A throttled (32 ms) `pointermove` over `GRID_SELECTOR` while `app.tool === 'pen'` and no button is held. It reuses what the erase already has: `cornerAt`, then `stockClickActsAt` and `clickedMarks`, then the cycle's `plan(...)`, whose `add` is the value to ghost. Draw it with `addedMark` and `shapePath` into the hint layer (`installHintLayer`) at about 0.3 opacity. When `add` is null (the next step empties the spot), dim the present mark instead. Hide it on `pointerleave`, on a press, and when the tool changes. It must ignore SudokuPad's cached `inputPos` and hit-test the event's own point, as `installLineErase` does. | M |
| 5 | **The drag hint shows the pen's style.** Dashes for a page 2 pen, arrows the way of the drag for a page 3 pen. | Today a dashed or arrow pen previews as the same fat solid stroke as a plain pen. The style shows only on release. An arrow pen's preview never shows which way the arrows will point. | tldraw creates the real shape at pointer down and updates it while drawing, so the preview is the result ([Drawing.ts L67-72, L303-310](https://github.com/tldraw/tldraw/blob/69f43954f15a171b3a6edb45134d27b71560de02/packages/tldraw/src/lib/shapes/draw/toolStates/Drawing.ts#L67-L72)). | Dashes: a CSS rule on `.penhint:is(.pencolor-a, ... .pencolor-i)` with a `stroke-dasharray` sized to the 16-wide hint, for example dots spaced 2 × 16 to match `DOT_SPACING_PER_THICKNESS`. The hint is one path, not one per segment, so the pattern cannot snap per segment as `dashPattern` does. Arrows: wrap `drawLineHint` (already wrapped by `installHintLayer`) to add an `arrowRun` per segment of `currentPath`, scaled to the hint's width, in a second path. Both leave the hint's width at SudokuPad's 16. | M |
| 6 | **An erased line fades out over about 120 ms instead of vanishing.** | The whole line disappears in one frame. A short fade lets the eye see what went, and matches the fade Text Anywhere is getting for a deleted note (#535, item 7). | Rauno Freiberg: macOS context menus appear with no motion but "subtly fade out" ([Invisible Details](https://rauno.me/craft/interaction-design)). NN/g: exits can be shorter than entrances; feedback near 100 ms ([Executing UX Animations](https://www.nngroup.com/articles/animation-duration/)). Material 3 short durations: 50 to 200 ms for small transitions ([Easing and duration tokens](https://m3.material.io/styles/motion/easing-and-duration/tokens-specs)). | In `finishErase`, clone the strokes and marks about to go into the hint layer before `sendActs`, then fade the clones from row 1's 0.3 to 0 over 120 ms and remove them. The puzzle state changes at once; only the clones linger, and they take no pointer. Undo is unaffected. A drag-erase that SudokuPad does itself (a drag over an existing line) is not covered. | M |
| 7 | **Escape cancels a right-click erase while the button is still down.** | A solver who sees row 1's preview take too much can back out without erasing and undoing. | tldraw: Escape calls `editor.cancel()` ([useDocumentEvents.ts L173-201](https://github.com/tldraw/tldraw/blob/69f43954f15a171b3a6edb45134d27b71560de02/packages/editor/src/lib/hooks/useDocumentEvents.ts#L173-L201)), and the eraser's `cancel` goes back to the mark taken at the start, erasing nothing ([Erasing.ts L157-167](https://github.com/tldraw/tldraw/blob/69f43954f15a171b3a6edb45134d27b71560de02/packages/tldraw/src/lib/tools/EraserTool/childStates/Erasing.ts#L157-L167)). | A `keydown` listener in `installLineErase` that, while `erase` is set, sets `erase = null` and clears row 1's class, so the `end` handler sends nothing. Only worth it with row 1; alone the user cannot see what to cancel. Cancelling SudokuPad's own drawing drag was not looked at: tldraw keeps a drawn stroke on Escape (`Drawing.onCancel` only returns to idle, [L760-L762](https://github.com/tldraw/tldraw/blob/69f43954f15a171b3a6edb45134d27b71560de02/packages/tldraw/src/lib/shapes/draw/toolStates/Drawing.ts#L760-L762)), so no source supports it. | S |
| 8 | **Edit mode's pickers fade and scale in from 0.95 over about 150 ms.** | After a one-second hold, nine pickers pop over the buttons in one frame. A short entrance ties them to the hold that made them. Edit mode is occasional, so motion does not slow anyone down. | Emil Kowalski: never animate from `scale(0)`, start from 0.9+ ([7 Practical Animation Tips](https://emilkowal.ski/ui/7-practical-animation-tips)); animate occasional things, never frequent or keyboard ones ([You Don't Need Animations](https://emilkowal.ski/ui/you-dont-need-animations)). Material 3 `short3` = 150 ms ([tokens](https://m3.material.io/styles/motion/easing-and-duration/tokens-specs)). | A `@keyframes` or transition on the picker class in `lib/color-picker.js` (the edit-mode CSS at "Edit mode's looks"), shared with Text Anywhere. Exit stays instant. | S |
| 9 | **Respect "reduce motion" for anything above.** | People who set the OS to reduce motion get the state change with no motion. | NN/g: "respect those users who have set their browser or device to 'reduce motion'" ([Executing UX Animations](https://www.nngroup.com/articles/animation-duration/)). | One `@media (prefers-reduced-motion: reduce)` block that turns rows 2, 6 and 8's transitions off. Today the script has no transition, so this rides only on those rows. | S |
| 10 | **A pixel floor for the corner zone and the right-click line hit.** | On a big grid with small cells, 0.2 of a cell is a small target. At Chris's cell sizes (75 to 126 px, `pen-line-join-nub.md`) the corner zone has a radius of 15 to 25 px, which is fine. At a 40 px cell it is 8 px. | Excalidraw's hit threshold is `0.85 * DEFAULT_COLLISION_THRESHOLD / zoom`, a constant size on screen ([App.tsx L6113-6121](https://github.com/excalidraw/excalidraw/blob/701b901a0f1ba3d0b390d9cdf63d112e25abac4b/packages/excalidraw/components/App.tsx#L6113-L6121)). tldraw's `hitTestMargin: 4.5` is divided by the zoom ([Editor.ts L5888-5892](https://github.com/tldraw/tldraw/blob/69f43954f15a171b3a6edb45134d27b71560de02/packages/editor/src/lib/editor/Editor.ts#L5888-L5892), [options.ts L316](https://github.com/tldraw/tldraw/blob/69f43954f15a171b3a6edb45134d27b71560de02/packages/editor/src/lib/options.ts#L316)). NN/g: bigger targets are faster and cause fewer errors ([Fitts's Law](https://www.nngroup.com/articles/fitts-law/)). Apple HIG: a hit region too large makes it hard to pull away ([Pointing devices](https://developer.apple.com/design/human-interface-guidelines/pointing-devices)). | `CORNER_RADIUS` becomes `max(0.2, 10 px / cell px)`, capped at 0.3 so an edge click 0.3 from a corner stays an edge (the comment at `CORNER_RADIUS`). `LINE_HIT_RADIUS` the same, capped at 0.24 so a centre line and the edge line beside it (0.5 apart) never both hit. The cell size in pixels comes from `app.xyToRCExact` of two points. SudokuPad's own edge zone stays in cell units. Only large grids notice. | S |

## Already done or filed

- **One undo per gesture.** A drag is one group (`actSend`); an arrow drag split by way stays one group (`splitLineActs`); a
  mark click is one group (`wrapClickCell`); a right-click erase is one group (`eraseActs`).
- **Dash phase.** Each segment starts half a dash in, so joins, turns and ends are inked (`dashPattern`). tldraw does the same
  with `start: 'outset'` / `end: 'outset'` ([getPerfectDashProps.ts L72-86](https://github.com/tldraw/tldraw/blob/69f43954f15a171b3a6edb45134d27b71560de02/packages/editor/src/lib/editor/shapes/shared/getPerfectDashProps.ts#L72-L86)).
- **Dot spacing.** Dots two line widths apart (`DOT_SPACING_PER_THICKNESS = 2`), the same spacing tldraw's dotted style works
  out to (same file, L59-62 and L88).
- **Arrowhead size against stroke width** (#243). `arrowHeadScaleOf` gives a head 3.2 line widths long at thickness 1, 2.3 at
  5 and 1.8 at 16. tldraw clamps an arrowhead to 1 to 3 stroke widths ([arrowheads.ts L29](https://github.com/tldraw/tldraw/blob/69f43954f15a171b3a6edb45134d27b71560de02/packages/tldraw/src/lib/shapes/arrow/arrowheads.ts#L29)), so only thickness 1 is a little over, by Chris's ruling.
- **Overlaps no longer darken** (#71): opacity on the layer, not each path (`buildOpacityCss`).
- **The drag hint is not faded or outlined** (`installHintLayer`).
- **Marks above lines and growing with thickness** (#78, `keepMarksAbove`, `markGrowthScale`).
- **Keyboard:** digit keys pick the pen (#266), Tab turns the page, the wheel over the page button turns it (#71).
- **Slider drags work and hand the focus back** (`installSliderGuards`, #60, #393).
- **No stray marks from dialog and button presses** (#63, #66, #521).
- **Right click erases a whole line or a mark, with the menu kept shut** (#356).
- **Error state:** a feature whose SudokuPad internals changed turns off alone and a bar says so (#85, #193, #449).
- **The darker pixel at centre-line joins:** measured and ruled "left alone, too small to fix" (`pen-line-join-nub.md`).
- **Redraw cost:** measured, nothing slow (#432).
- **Text Anywhere's polish** (#530 closed, #535 open) is another script. Rows 2, 6 and 8 would make Pen Tool Extras match it.

## Considered and dropped

- **Freehand smoothing, streamline and taper** (perfect-freehand `thinning`, `smoothing`, `streamline`, `taper`,
  [README L164-183](https://github.com/steveruizok/perfect-freehand/blob/176e00f2399f4969e1b0965c5921d96a3e50ce9f/README.md#L164-L183); tldraw's settings in [getPath.ts L16-58](https://github.com/tldraw/tldraw/blob/69f43954f15a171b3a6edb45134d27b71560de02/packages/tldraw/src/lib/shapes/draw/getPath.ts#L16-L58)): SudokuPad snaps every line to cell segments, so there are no raw points to smooth.
- **Pressure-based width:** mouse only; there is no pressure.
- **Shift for a straight line** (FigJam, [Doodle and highlight](https://help.figma.com/hc/en-us/articles/1500004414442-Doodle-and-highlight-in-FigJam-with-drawing-tools)): lines already snap, and a held Shift switches SudokuPad to the corner tool (`sudokupad-pen-tool.md`, modifier table).
- **A dot at the press point before the line starts:** the line type (centre or edge) is not known until the first segment (`getCenterEdgeLine` in `handleDragMove`), so the dot could be in the wrong place.
- **Changing the click-versus-drag slop:** SudokuPad's 6 px sits between tldraw's 4 px ([options.ts L298-299](https://github.com/tldraw/tldraw/blob/69f43954f15a171b3a6edb45134d27b71560de02/packages/editor/src/lib/options.ts#L298-L299)) and Excalidraw's 10 px ([constants.ts L31](https://github.com/excalidraw/excalidraw/blob/701b901a0f1ba3d0b390d9cdf63d112e25abac4b/packages/common/src/constants.ts#L31)), and SudokuPad owns it.
- **Animating the page turn or a pen switch:** done by keyboard and many times a game. Emil Kowalski says never animate those, and Rauno Freiberg removed motion from frequent actions for the same reason.
- **A rubber-band segment from the last point to the pointer:** not found in the code read, and the snap decides centre versus edge, so it could preview the wrong line.
- **A nonzero dot length, as tldraw uses** (0.1, [DrawShapeUtil.tsx L323-331](https://github.com/tldraw/tldraw/blob/69f43954f15a171b3a6edb45134d27b71560de02/packages/tldraw/src/lib/shapes/draw/DrawShapeUtil.tsx#L323-L331)): tldraw needs it below 20 % zoom. `END_DOT_SHRINK` already fixes the missing end dot here. Not checked: whether SudokuPad ever zooms that far.
- **Faster tooltips on the panel buttons:** they are native `title` tooltips; the delay belongs to the browser.
- **A value readout on the sliders:** Chris turned this down for Text Anywhere (#530, "Not wanted").
- **Erase only when half a mark is covered** (Miro's rule for smart objects, [Smart drawing](https://help.miro.com/hc/en-us/articles/360017572014-Smart-drawing)): the opposite of a one-click erase.
- **Overlaps that deepen, as FigJam's highlighter does:** the script made overlaps uniform on purpose (#71).
- **Anything on window resize:** marks, hit zones and the outline are all in cell units and scale with the grid; nothing found to fix.
- **Right-drag erase polish, phone sizes, SudokuPad's own dark mode:** the owner's standing rejections.

## Coverage

**This repo:** `pen-tool-extras.user.js` (its comments, and the code of sections 4 to 9 and `lib/panel.js`'s block);
`site/pen-tool-extras.html`; `docs/research/sudokupad-pen-tool.md`, `sudokupad-pen-line-mode.md`,
`sudokupad-pen-edge-marks.md`, `puzzle-ui-pen-tools.md`, `large-puzzle-ui-right-drag.md`;
`docs/research/pen-tool-extras/pen-line-join-nub.md`, `pen-tool-extras-redraw-cost.md`, `pen-tool-extras-feature-cost.md`,
`pen-tool-extras-opacity.md`; `docs/research/draw-tool/drag-feedback-other-apps.md`. The pictures in `site/` were not
opened; the text of the page was. Issues: the two searches the brief names (titles), plus searches for hover, preview,
cursor, undo, highlight, keyboard, focus, animation and snap; bodies read for #530, #535, #356, #243, #248.

**SudokuPad 0.611.0 source**, from the live harness's recording: `tool-pen.js` (whole), `tool-pen.css` (whole), `style.css`
(button, grid and cursor rules), `script.js` (`didInputMove`, input constants, undo repeat settings, a search for
`Escape`).

**Code, read as raw files at a pinned commit** (whole files, no rendering involved):
- tldraw `69f4395`: `getPerfectDashProps.ts`, `options.ts`, `arrowheads.ts`, draw `Drawing.ts`, draw `Idle.ts`,
  `DrawShapeUtil.tsx`, `getPath.ts`, eraser `Erasing.ts`, `Pointing.ts`, `Idle.ts`, `Editor.ts` (hit margin, erasing opacity,
  drag distance), `useDocumentEvents.ts`, `updateHoveredShapeId.ts`.
- Excalidraw `701b901`: `packages/common/src/constants.ts`, `packages/element/src/collision.ts`,
  `packages/element/src/renderElement.ts`, `packages/excalidraw/components/App.cursor.ts`, `App.tsx` (hit threshold, Escape,
  erasure).
- perfect-freehand `176e00f`: `README.md`.

**Pages:**
- Rauno Freiberg, "Invisible Details of Interaction Design", July 2023, https://rauno.me/craft/interaction-design
- Emil Kowalski, "7 Practical Animation Tips", https://emilkowal.ski/ui/7-practical-animation-tips
- Emil Kowalski, "You Don't Need Animations", https://emilkowal.ski/ui/you-dont-need-animations
- Emil Kowalski, `skills/improve-animations/AUDIT.md`, https://github.com/emilkowalski/skills/blob/main/skills/improve-animations/AUDIT.md (search text only)
- Page Laubheimer, NN/g, "Executing UX Animations: Duration and Motion Characteristics", 2020-02-09, https://www.nngroup.com/articles/animation-duration/
- Jakob Nielsen, NN/g, "Response Times: The 3 Important Limits", https://www.nngroup.com/articles/response-times-3-important-limits/ (read; it backs the 0.1 s feel behind rows 1 and 2, cited nowhere else)
- NN/g, "Fitts's Law and Its Applications in UX", https://www.nngroup.com/articles/fitts-law/
- Material Design 3, "Easing and duration: tokens and specs", https://m3.material.io/styles/motion/easing-and-duration/tokens-specs
- Apple HIG, "Buttons", https://developer.apple.com/design/human-interface-guidelines/buttons
- Apple HIG, "Pointing devices", https://developer.apple.com/design/human-interface-guidelines/pointing-devices
- Apple, WWDC18 "The Life of a Button", https://developer.apple.com/videos/play/wwdc2018/804/ (transcript text from the search result only)
- Figma Learn, "Doodle and highlight in FigJam with drawing tools", https://help.figma.com/hc/en-us/articles/1500004414442-Doodle-and-highlight-in-FigJam-with-drawing-tools
- Miro Help Center, "Pen", https://help.miro.com/hc/en-us/articles/360017730573-Pen, and "Smart drawing", https://help.miro.com/hc/en-us/articles/360017572014-Smart-drawing

**How the pages were read, and re-reads.** No page was fetched with WebFetch. Code came as raw files at a pinned commit,
so nothing needed rendering. Pages were found with Exa search and read with the c4ai Markdown reader. Where c4ai came back
thin, this is what happened:
- Rauno, Emil Kowalski's two posts, NN/g's response-time and Fitts pages, FigJam and Miro Pen: c4ai returned the text.
  It matched the Exa search text where both had it.
- Material 3 tokens page: c4ai returned only the site's navigation (a JavaScript shell). The duration values (`short1`
  50 ms to `short4` 200 ms) come from Exa's rendered text of the same URL.
- Apple HIG "Buttons" and "Pointing devices": c4ai returned only the footer. Both were then read from Apple's own JSON for
  the same pages (`developer.apple.com/tutorials/data/design/human-interface-guidelines/<page>.json`). The quoted lines
  (press state, 44x44 pt, 12 and 24 pt padding, the Cross pointer) are from that JSON.
- NN/g "Executing UX Animations": read from Exa's text of the page; not re-read with c4ai.

**Looked for and not found:**
- An Escape that cancels a drag, anywhere in SudokuPad's pen tool.
- A Figma Design pencil help page: not searched.
- A Material page on press or state layers for sliders.
- Excalidraw code for a live next segment of a line before the click.
- Any source for a live board preview of the settings dialog's sliders.

**Not verified:**
- That `#svgrenderer` is inside `.grid` in every layout (row 3).
- How a stroke's element is reached from its cell (row 1); this relies on the reading in `sudokupad-pen-tool.md`.
- Any of the rows run on a page.
