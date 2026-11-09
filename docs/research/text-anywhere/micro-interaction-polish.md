# Small touches other editors have that Text Anywhere lacks (read 2026-11-08)

**Verdict:** the touches still missing are mostly about the keyboard and the ends of a gesture: what Escape, Enter and a slightly shaky click do. Most of them are S-sized changes to `handleKeydown`, `finishText` and `CLICK_SLOP`.

Asked: what polished canvas and text-box editors do in the small moments, beyond what is already filed (#530, #531, #532, #534, #535) or rejected. Everything below was checked against `draw-tool.user.js` 0.30.1 (main at 8b15618) by reading its code. Nothing was run live unless the row says so.

## Ranked candidates

The ranking weighs how much the feel improves against the cost. "Today" says what the script does now, as read from its code.

| # | Touch | What the user feels | Source | How it maps to Text Anywhere | Cost |
|---|---|---|---|---|---|
| 1 | **Escape closes the note and leaves it selected** | "I typed it, now I nudge it." Arrows, Delete and a drag work straight away, with no extra click. | Excalidraw selects the text after a keyboard submit ([App.text.ts L304-319][e-submit]). tldraw selects the shape it edits and stays on it when editing ends ([EditingShape.ts L50][t-edit-sel], [L244-247][t-edit-cancel]). Keynote: "Exit text editing and select the object", Command-Return ([Keynote shortcuts][keynote]). Notion: "Press `esc` to select the block you're in" ([Notion shortcuts][notion]). | Today `keepBoxKeys` calls `finishText()` on Escape and nothing ends up selected. Change: after Escape, `select([index])` the note just closed, unless it was empty and so removed. A click outside still closes with nothing selected, as Excalidraw does. | S |
| 2 | **Enter reopens the one selected note** | Fix a typo without reaching for the mouse. | tldraw: Enter on one selected shape starts editing it ([Idle.ts L640-667][t-idle-enter]). Figma: "press Enter with a text layer selected to edit its contents" ([Figma text guide][figma-text]). Notion: "Press `enter` to edit any text inside a selected block" ([Notion shortcuts][notion]). | Today `handleKeydown` handles only Escape, the arrows, Delete and Backspace. Add: with `selected.length === 1`, Enter calls `openText(selected[0])`. Put the caret at the end, as a double-click does today. tldraw selects all instead; the end is safer, because a stray key would otherwise replace the whole note. | S |
| 3 | **A slightly dragged click on empty space still starts a note** | A quick, sloppy click never just does nothing. | Excalidraw's comment on `TEXT_AUTOWRAP_THRESHOLD = 36` px: "clicks that end up being drags … happens a lot with fast clicks with the text tool" ([constants.ts L20-31][e-const]). Its sticky notes treat "a gesture under the drag threshold" of 10 px as a click ([App.tsx L9870-9878][e-click]). | Today a press on empty space that moves more than 2 px becomes a selection rectangle. If it touches no note it selects nothing, so the click is lost. Change in `endDrag`: a rectangle under about 8 px on both sides that selects nothing runs `clickNote` (open a note at the press point). | S |
| 4 | **Click slop of 4 px, not 2 px** | Clicking a note to select it never moves it by a hair. | tldraw: `dragDistanceSquared: 16, // 4 squared` for a mouse ([options.ts L298-300][t-drag]). Excalidraw uses 10 px in several click-or-drag checks ([constants.ts L31][e-const]). | `CLICK_SLOP = 2` becomes 4. Below that, a press on a note is a click: it selects and does not move. Above it, the drag starts from the press point, as today, so nothing jumps. | S |
| 5 | **A note of only spaces is removed when it closes** | No invisible notes left behind to catch clicks. | tldraw deletes a text shape whose `trimEnd()` is empty when editing ends ([TextShapeUtil.tsx L266-273][t-text-end]). Excalidraw: `isDeleted = !nextOriginalText.trim()` ([App.text.ts L304-319][e-submit]). | Today `typedText` trims only blank lines, so "␣␣␣" is saved as a note. Checked in Chromium 156: a `pre-wrap` note of three spaces is a 17 × 23 px box with nothing in it. Change: `if (text.trim() === '')`, treat the note as empty. | S |
| 6 | **Trailing spaces are trimmed from each line when the note closes** | The box hugs the letters. A boxed note is not lopsided. | Same two sources as row 5. Both editors trim before deciding the note is empty. Trimming every line is this note's own step on top of that. | Checked in Chromium 156 with the note's own CSS (`white-space: pre-wrap; width: max-content`): "45" is 22 px wide, and "45" plus five spaces is 50 px. The box and the halo padding grow to the right and, while the note is centred, the text shifts left. Change in `typedText`: `.replace(/[ \t]+$/gm, '')`. | S |
| 7 | **Escape during a drag or resize puts the note back** | A mistaken drag can be called off. | tldraw: `Translating.onCancel` calls `bailToMark`, which "restores the shapes to their snapshot positions" ([Translating.ts L160-162, L198][t-trans-cancel]). Keynote: "Stop the reordering of rows or columns: Press Esc while dragging" ([Keynote shortcuts][keynote]). | Today, reading `handleKeydown`: Escape with notes selected runs `select([])` even mid-drag, and the drag carries on. This was not run live. Change: while `drag?.move` or `resizing` is set, Escape restores the items saved at the press (`drag.move[i].item`, `resizing`'s item), ends the gesture without saving, and swallows the release. | S–M |
| 8 | **The Delete key deletes at once, with no fade** | Keyboard deletes feel instant. The #535 fade stays for mouse deletes. | Emil Kowalski: "never animate keyboard initiated actions" ([Great Animations][emil]). Rauno Freiberg: keyboard actions used often feel slow when animated ([Invisible Details][rauno], § Frequency & Novelty). | An amendment to #535 item 7. Keep the 120 ms fade for right-click erase and the trash button, and skip it for Delete and Backspace in `handleKeydown`. | S |
| 9 | **Ctrl+Enter closes the note** | A second "done" key that reads as "commit", not "new line". | tldraw: Ctrl/Cmd+Enter calls `editor.complete()` in a text shape ([TextShapeUtil.tsx L399-402][t-text-ctrlenter]). Excalidraw: the same, and it skips IME composition ([textWysiwyg.tsx L899-905][e-wys-ctrlenter]). Keynote: Command-Return ([Keynote shortcuts][keynote]). | Add to `keepBoxKeys`: `event.key === 'Enter' && (event.ctrlKey \|\| event.metaKey)` → `preventDefault()`, then close it as row 1 does (note left selected). Plain Enter stays a new line. | S |
| 10 | **The filed fades respect reduced motion** | Someone who turned animations off in Windows gets none here. | Josh W. Comeau: put transitions inside `@media (prefers-reduced-motion: no-preference)` ([Accessible Animations][comeau]). Apple HIG: "Make motion optional" ([Motion][hig-motion]). Emil Kowalski, § accessible ([Great Animations][emil]). | An amendment to #535 items 6 and 7. Wrap the 80 ms and 120 ms `transition` rules in that media query. With motion off they are instant. | S |
| 11 | **Snapping holds off while the pointer moves fast** | A quick throw across the board does not stick to every cell line it passes. Snapping catches only when you slow down to place the note. | tldraw snaps only when `getPointerVelocity().len() < 0.5` ([Translating.ts L609-611][t-trans-vel]). | An amendment to #531. Skip the snap when the pointer moved more than about 0.5 px/ms over the last frame or two (`drag.points` with times). For scale, tldraw's pull is `snapThreshold: 8` screen px ([options.ts L346][t-snapthr]); #531 chose 3 px. | S |
| 12 | **Easing on the filed fades** | The fades feel quick to start and soft to end, with no linear "dimmer switch" look. | Emil Kowalski: use `ease-out` and keep animations under 300 ms ([Great Animations][emil]). Material 3 tokens: standard decelerate `cubic-bezier(0, 0, 0, 1)` to enter, standard accelerate `cubic-bezier(0.3, 0, 1, 1)` to exit, short1–short4 = 50–200 ms ([M3 tokens][m3-tokens]). Exits are shorter than enters ([M3 applying][m3-apply]). | An amendment to #535. Hover outline and handles: 80 ms `cubic-bezier(0, 0, 0, 1)`. Delete fade: `cubic-bezier(0.3, 0, 1, 1)`, and no longer than 120 ms, by Material's exit-shorter rule. | S |
| 13 | **Selected text has no halo** | Selected letters read cleanly on the tint #534 adds, with no white fringe. | Paco Coursey: "Remember to set `text-shadow: none` in your `::selection` rules" ([Custom text underlines][paco]). | The open note carries the halo as a `text-shadow` (`styleNote`, `haloShadow`). An amendment to #534 item 4: add `text-shadow: none` to the note's `::selection` rule. | S |
| 14 | **The outline and handles hide while arrow keys nudge** | The note itself is easier to line up by eye. The frame comes back as soon as the mouse moves. | tldraw: "Hide the selection overlay while nudging", then show it again on the next pointer move ([Idle.ts L765-768][t-idle-nudge], [L52-58][t-idle-move]). | In `pressArrow`, add a class to the layer that hides `.draw-tool-selected` and the handles. Remove it on the next `mousemove`. | S |
| 15 | **Undo after Restart selects the notes it brings back** | You can see that the Undo worked, and which notes came back. | Apple HIG: "Show the results of an undo or redo" ([Undo and redo][hig-undo]). | `restoreRestarted` puts the notes back. Then select them (when Text Anywhere is current) so they show their outline. | S |
| 16 | **The open note stays inside the window while you type** | A note started near the right edge never types off-screen. | Excalidraw: `TEXT_VIEWPORT_PADDING = 20` px, "room left at each side of the visible canvas when a text stops growing" ([constants.ts L20-31][e-const], [App.text.ts L120-128][e-viewport]). | Today `showEditing` measures the box and moves nothing. Once #534 makes notes grow to the right, this gets worse. On `input`, if the box passes `innerWidth − 20`, move the note left, or wrap it earlier. Never move it under SudokuPad's controls (reuse `reachable`). | M |
| 17 | **Shift, pressed after a drag starts, locks the move to one axis** | Slide a note straight along a row or column. | tldraw flattens the drag to the larger axis while Shift is held ([Translating.ts L593-603][t-trans-axis]). Google Slides: "Constrain to vertical or horizontal movements: Shift + Move with mouse" ([Slides shortcuts][slides]). Keynote: Shift-drag constrains to 45° ([Keynote shortcuts][keynote]). | Shift at the press still adds a note to the selection, as today. In `dragOffset`, while `holdShift` is set, zero the smaller of dx and dy. | M |
| 18 | **A press on another note while one is open goes to that note** | Edit one note, then grab the next in one click. | tldraw: a click on a different shape while editing goes to `pointing_shape`, which selects it and can drag it ([EditingShape.ts L181-183][t-edit-other]). Figma: while editing, a click on another text layer edits it ([Figma text guide][figma-text]). | Today `finishTextOnPress` closes the note and `pressFinishedText` makes the press do nothing else. Change: when the press is on another note, close the open one and let the same press select that note (and drag it). A press on empty space still only closes. | M |
| 19 | **Ctrl+Z undoes note changes, one gesture at a time** | A stray right-click erase or a wrong drag can be taken back. Today only Restart can be. | tldraw records one history step per drag ([Translating.ts L85][t-trans-mark]) and one per nudge press, not per key repeat ([Idle.ts L765-768][t-idle-nudge]). Excalidraw puts a note's create-and-type in "a single entry" ([App.text.ts L603-612][e-onehistory]). Apple HIG: undo "a batch of discrete but related actions" as one step ([Undo and redo][hig-undo]). | One step each for: a drag, a held-arrow nudge (already saved once on key-up), a resize, a whole typing session (open to close), a delete, a trash clear, a slider drag. Hard part: it must not fight SudokuPad's own Undo stack (`Framework.app.puzzle.undoStack`). It needs a design decision first. | L |
| 20 | **Tab and Shift+Tab move the selection to the next or previous note** | Step through notes from the keyboard. | tldraw `selectAdjacentShape` on Tab ([Idle.ts L680-685][t-idle-tab]). Figma: "Select Next Sibling tab" ([Figma select layers][figma-select]). Google Slides: "Select next shape: Tab" ([Slides shortcuts][slides]). Keynote: Tab ([Keynote shortcuts][keynote]). | With notes selected, take Tab in `handleKeydown` and select the next note in reading order (top to bottom, then left to right). What SudokuPad itself does with Tab was not checked. | M |
| 21 | **A press up to 4 px outside a note still picks it** | Thin one-line notes and notes with no box are easier to grab. | tldraw: `hitTestMargin: 4.5` ([options.ts L316][t-hit]). | `noteOf` tests `noteScreenBox`. Grow that box by 4 px for the hit test only. Risk: a click just beside a note selects it when the user meant to start a new note. The #530 hover outline makes this visible, so do this after #530. | S |
| 22 | **Ctrl+A selects every note** | Select all, then move or delete them together. | Figma ([select layers][figma-select]), Google Slides ([Slides shortcuts][slides]) and Keynote ([Keynote shortcuts][keynote]) all use Ctrl/Cmd+A to select every object. | Take Ctrl+A in `handleKeydown` while Text Anywhere is current and no note is open. Not checked: whether SudokuPad uses Ctrl+A for its cells. If it does, this needs a ruling. | M |
| 23 | **Tab inside an open note stays in the note** | A Tab keypress does not suddenly close the note. | Excalidraw: Tab indents and Shift+Tab outdents inside the text editor ([textWysiwyg.tsx L906-919][e-wys-tab]). Notion and Keynote: Tab indents a list item ([Notion shortcuts][notion], [Keynote shortcuts][keynote]). | Today Tab moves the focus away (the `keepBoxKeys` comment), and the `blur` closes the note. The smallest fix is `preventDefault()` on Tab in `keepBoxKeys`. Indenting a `- ` bullet would also need nested bullets in `parseMarkdown`, which they lack today. | M |
| 24 | **Ctrl+Shift+> and < change the size** | Resize text without the slider. | Figma and Google Slides: Ctrl+Shift+> and < change the font size ([Slides shortcuts][slides]). Excalidraw runs its font-size actions inside the text editor ([textWysiwyg.tsx L883-886][e-wys-size]). | Step the Size slider's value by one notch for the open note, else for the selected notes, the same path as a slider move. | M |

## What #535 found already there (2026-11-08)

- **A steady cursor during a drag or resize (item 5): nothing did it.** `cursor: move` was set on a closed note's own element (#530) and each handle had its own resize cursor, so both reverted as soon as the pointer left the note or handle. Now one class on `<html>` holds the cursor for every element until the release.
- **Whole-pixel positions (item 9): not covered.** `render-crisp-0.21.2.png` and `render-crisp-0.21.3.png` (`render-timing.md`) compare text sharpness at a fractional board scale after #426. They never place a note at a fractional point. Stored points were also kept to a tenth of a board unit, too coarse to hit a device pixel, so they are now kept to a hundredth.
- **Trash button.** Only "Delete the selected notes" fades. With nothing selected the button asks first and clears every note at once with no fade, because it is a bulk clear and not a single deletion.

## Already done or filed

Found in the sources and already in Text Anywhere, or filed:

- **A click outside an open note closes it and does nothing else.** tldraw `EditingShape`, Figma. Done: `finishTextOnPress` and `pressFinishedText`.
- **A click on empty space with notes selected only deselects.** Figma: "Click anywhere on the canvas". Done: `clickNote`.
- **Escape deselects.** Figma. Done: `handleKeydown`.
- **An empty note is removed when it closes.** tldraw, Excalidraw. Done for `''`. A note of only spaces is row 5.
- **Arrow keys nudge 1 px, Shift+arrow 10 px.** Keynote, Google Slides. Done, and Text Anywhere adds a hold-to-speed-up ramp (`NUDGE_*`).
- **Arrow nudges are not animated.** Emil Kowalski, Rauno Freiberg. Done.
- **Shift-click adds a note to the selection or takes it out.** Figma. Done.
- **The focus goes back to the note after a panel button or slider.** Done: `keepNoteFocus` and `returnFocusToNote`.
- **Paste is plain text and there are no spellcheck squiggles.** Done: `contentEditable = 'plaintext-only'` and `spellcheck = false`.
- **The wheel scrolls a long note, and Ctrl+wheel stays the browser's zoom.** Done.
- **A window resize never moves a note for good.** Done (#491).
- **A drag goes on past the window's edge.** Done (`handleInputMove`).
- **Double-click on a handle returns the note to auto size, and the corners show diagonal resize cursors.** Done.
- **Filed:** a hover outline, like Figma's highlight on hover (#530). A move cursor, which NN/g recommends ([Drag–and–Drop][nng-dnd]) (#530). Snapping with guide lines, which PowerPoint ([gridlines][ppt]) and Figma have (#531). A see-through note while dragging, like NN/g's "ghost" (#532). The caret placed at the click point, as Excalidraw does in `textWysiwyg.tsx` (#534). The fades, a steady cursor during a drag and whole-pixel positions (#535).

## Considered and dropped

- **Hold Alt, Ctrl or Cmd to turn snapping off during a drag** (PowerPoint, Google Slides, Miro, Keynote, tldraw). Dropped: #531 says "No modifier key".
- **Alt-drag, Ctrl-drag or Ctrl+D to duplicate** (Keynote, Slides, Notion). Dropped: duplicating notes was rejected.
- **A lift, shadow or tilt on the grabbed object** (NN/g's grab feedback, Trello). Dropped: rejected.
- **A size readout.** Dropped: rejected.
- **A new note snaps to a cell's centre when clicked within 30 px of it** (Excalidraw `TEXT_TO_CENTER_SNAP_THRESHOLD`). Dropped: it conflicts with #534, where the text starts at the click.
- **Typing a letter on a selected note opens it** (tldraw `editOnType`; Miro: "To replace text in a text box, select it and start typing", [Miro Text][miro-text]). Dropped: tldraw keeps this behind a debug flag because of shortcut clashes, and here the digits 1–9 pick colours.
- **Drag a note's left or right border to set its wrap width** (Miro: "To resize a text box, drag its left or right border", [Miro Text][miro-text]). Dropped: the corner handles already set the width, and four more handles would crowd a small note. tldraw's code for this was not checked.
- **Scrolling the view when a drag reaches the window's edge** (tldraw `edgeScroll*`). Dropped: SudokuPad's page has no canvas to scroll, and notes stay in reach by design.
- **Haptics, touch-target sizes and long-press** (NN/g, Rauno). Dropped: phones and tablets are out.
- **Resize from the centre with Alt or Ctrl, and keep the aspect ratio with Shift** (Keynote, Slides). Dropped: a text box's aspect ratio means little, because the text rewraps.
- **Spring physics** (Emil Kowalski, M3 Expressive). Dropped: the only motion here is short fades.
- **"Undo Typing"-style labels** (Apple HIG). Dropped: there is no menu to label.
- **Moving the pointer onto a corner hot zone, as in Fitts's Law corners** (Rauno). Dropped: notes are not window chrome.
- **Anything needing a right-button drag, and SudokuPad's dark mode.** Dropped: ruled out in AGENTS.md.

## Coverage

**Code opened** (raw files at the commits named):

- tldraw at `69f43954f15a171b3a6edb45134d27b71560de02`:
  - `packages/editor/src/lib/options.ts`
  - `packages/tldraw/src/lib/tools/SelectTool/childStates/Translating.ts`
  - `packages/tldraw/src/lib/tools/SelectTool/childStates/Idle.ts`
  - `packages/tldraw/src/lib/tools/SelectTool/childStates/EditingShape.ts`
  - `packages/tldraw/src/lib/shapes/text/TextShapeUtil.tsx`
  - `packages/tldraw/src/lib/shapes/text/TextShapeTool.ts` and `toolStates/Idle.ts`, which had no cursor or threshold of interest
  - Also downloaded but not read for this note: `SnapManager.ts`, `PointingShape.ts`, `Brushing.ts`, `Resizing.ts`
- Excalidraw at `701b901a0f1ba3d0b390d9cdf63d112e25abac4b`:
  - `packages/common/src/constants.ts`
  - `packages/excalidraw/wysiwyg/textWysiwyg.tsx`
  - `packages/excalidraw/components/App.text.ts`
  - `packages/excalidraw/components/App.tsx`
  - `packages/element/src/dragElements.ts`
- Text Anywhere: `draw-tool.user.js` (comments, `openText`, `finishText`, `keepBoxKeys`, `toolHandlers`, `clickNote`, `dragMoves`, `showEditing`). Also issues #530, #531, #532, #534 and #535.

**Pages opened:**

- Rauno Freiberg, "Invisible Details of Interaction Design", July 2023, <https://rauno.me/craft/interaction-design>
- Emil Kowalski, "Great Animations", undated, <https://emilkowal.ski/ui/great-animations>
- Material Design 3, "Easing and duration: tokens and specs", undated (the page says the system is no longer maintained), <https://m3.material.io/styles/motion/easing-and-duration/tokens-specs>
- Material Design 3, "Easing and duration: applying easing and duration", <https://m3.material.io/styles/motion/easing-and-duration/applying-easing-and-duration>
- Apple, Human Interface Guidelines, "Undo and redo", <https://developer.apple.com/design/human-interface-guidelines/undo-and-redo>
- Apple, Human Interface Guidelines, "Motion", <https://developer.apple.com/design/human-interface-guidelines/motion>. Both HIG pages were read from Apple's JSON data behind the pages.
- Apple, Human Interface Guidelines, "Pointing devices". Read; nothing new for a web page.
- Jakob Nielsen (NN/g), "Response Times: The 3 Important Limits", 1993. Read; no row needed it.
- Page Laubheimer (NN/g), "Drag–and–Drop: How to Design for Ease of Use", 2020-02-23, <https://www.nngroup.com/articles/drag-drop/>
- Josh W. Comeau, "Accessible Animations in React with prefers-reduced-motion", last updated 2026-04-29, <https://www.joshwcomeau.com/react/prefers-reduced-motion/>
- Paco Coursey, "Custom text underlines", 2020-02-11, <https://paco.me/writing/custom-text-underlines>. Read from the full text in a search result. Paco's writing index lists no piece on canvas or drag details.
- Figma Help Center, "Guide to text in Figma Design", <https://help.figma.com/hc/en-us/articles/360039956434-Guide-to-text-in-Figma-Design>
- Figma Help Center, "Select layers and objects", <https://help.figma.com/hc/en-us/articles/360040449873-Select-layers-and-objects>
- Apple Support, "Keyboard shortcuts for Keynote on Mac", <https://support.apple.com/guide/keynote/keyboard-shortcuts-tanfde4a3e6d/mac>
- Google, "Keyboard shortcuts for Google Slides", <https://support.google.com/docs/answer/1696717>
- Microsoft Support, "Work with gridlines and use snap-to-grid in PowerPoint", <https://support.microsoft.com/en-us/powerpoint/work-with-gridlines-and-use-snap-to-grid-in-powerpoint>
- Miro Help Center, "Connection lines" (it holds the Ctrl-to-disable-snapping line), <https://help.miro.com/hc/en-us/articles/360017730733>
- Miro Help Center, "Text", updated 2026-05-11, <https://help.miro.com/hc/en-us/articles/360017572094-Text>. Found on a second search after the first URL redirected; read from the search tool's full-text extract.
- Notion Help, "Keyboard shortcuts", <https://www.notion.com/help/keyboard-shortcuts>

**Re-read with a JavaScript-rendering reader (crawl4ai `md`):**

- No change:
  - Rauno Freiberg
  - Emil Kowalski
  - NN/g's drag-and-drop article
  - Figma's "Guide to text in Figma Design"
  - Figma's "Select layers and objects"

  The earlier fetches of these were already full crawl4ai markdown, and the quotes used above are the same.
- Material 3's tokens page and Apple's HIG "Undo and redo" came back empty from crawl4ai. The figures used above come from earlier reads that did return content: Material through the Exa fetcher, the HIG pages through Apple's JSON data. Those stand.
- Keynote, Google Slides and PowerPoint were not re-read. Their first reads were complete tables or text.
- The tldraw and Excalidraw code was read from raw files at pinned commits, not from GitHub's rendered views, so it needed no re-read.
- Re-searching Miro found its real "Text" article. It added two items to "Considered and dropped" and changed no ranked row.

**Checked by hand:** in headless Chromium 156, with the note's own text CSS, "45" is 22.3 px wide, "45" plus five spaces is 50.0 px, and three spaces alone make a 16.7 × 23 px box (rows 5 and 6).

**Searched or tried, and not found or not used:**

- Apple Freeform's help was not searched.
- Miro's own text-editing article: the first URL tried redirected to "Connection lines". A second search found it.
- The first Keynote URL tried was a landing page.
- Material's tokens page returned nothing through a plain fetch, and was read through a second fetcher.
- No Josh Comeau or Paco Coursey piece on canvas editors specifically.
- tldraw's side handles for text width were not looked at in code, so they are not proposed.

**Not verified:**

- What SudokuPad does with Tab and Ctrl+A (rows 20 and 22).
- What Ctrl+Enter does today inside a `plaintext-only` note (row 9).
- Escape during a drag (row 7) was read from the code, not run.

[t-drag]: https://github.com/tldraw/tldraw/blob/69f43954f15a171b3a6edb45134d27b71560de02/packages/editor/src/lib/options.ts#L298-L300
[t-hit]: https://github.com/tldraw/tldraw/blob/69f43954f15a171b3a6edb45134d27b71560de02/packages/editor/src/lib/options.ts#L316
[t-snapthr]: https://github.com/tldraw/tldraw/blob/69f43954f15a171b3a6edb45134d27b71560de02/packages/editor/src/lib/options.ts#L346
[t-trans-cancel]: https://github.com/tldraw/tldraw/blob/69f43954f15a171b3a6edb45134d27b71560de02/packages/tldraw/src/lib/tools/SelectTool/childStates/Translating.ts#L160-L198
[t-trans-mark]: https://github.com/tldraw/tldraw/blob/69f43954f15a171b3a6edb45134d27b71560de02/packages/tldraw/src/lib/tools/SelectTool/childStates/Translating.ts#L85
[t-trans-axis]: https://github.com/tldraw/tldraw/blob/69f43954f15a171b3a6edb45134d27b71560de02/packages/tldraw/src/lib/tools/SelectTool/childStates/Translating.ts#L593-L603
[t-trans-vel]: https://github.com/tldraw/tldraw/blob/69f43954f15a171b3a6edb45134d27b71560de02/packages/tldraw/src/lib/tools/SelectTool/childStates/Translating.ts#L609-L611
[t-idle-enter]: https://github.com/tldraw/tldraw/blob/69f43954f15a171b3a6edb45134d27b71560de02/packages/tldraw/src/lib/tools/SelectTool/childStates/Idle.ts#L640-L667
[t-idle-tab]: https://github.com/tldraw/tldraw/blob/69f43954f15a171b3a6edb45134d27b71560de02/packages/tldraw/src/lib/tools/SelectTool/childStates/Idle.ts#L680-L685
[t-idle-nudge]: https://github.com/tldraw/tldraw/blob/69f43954f15a171b3a6edb45134d27b71560de02/packages/tldraw/src/lib/tools/SelectTool/childStates/Idle.ts#L765-L768
[t-idle-move]: https://github.com/tldraw/tldraw/blob/69f43954f15a171b3a6edb45134d27b71560de02/packages/tldraw/src/lib/tools/SelectTool/childStates/Idle.ts#L52-L58
[t-edit-sel]: https://github.com/tldraw/tldraw/blob/69f43954f15a171b3a6edb45134d27b71560de02/packages/tldraw/src/lib/tools/SelectTool/childStates/EditingShape.ts#L50
[t-edit-other]: https://github.com/tldraw/tldraw/blob/69f43954f15a171b3a6edb45134d27b71560de02/packages/tldraw/src/lib/tools/SelectTool/childStates/EditingShape.ts#L181-L183
[t-edit-cancel]: https://github.com/tldraw/tldraw/blob/69f43954f15a171b3a6edb45134d27b71560de02/packages/tldraw/src/lib/tools/SelectTool/childStates/EditingShape.ts#L244-L247
[t-text-end]: https://github.com/tldraw/tldraw/blob/69f43954f15a171b3a6edb45134d27b71560de02/packages/tldraw/src/lib/shapes/text/TextShapeUtil.tsx#L266-L273
[t-text-ctrlenter]: https://github.com/tldraw/tldraw/blob/69f43954f15a171b3a6edb45134d27b71560de02/packages/tldraw/src/lib/shapes/text/TextShapeUtil.tsx#L399-L402
[e-const]: https://github.com/excalidraw/excalidraw/blob/701b901a0f1ba3d0b390d9cdf63d112e25abac4b/packages/common/src/constants.ts#L20-L31
[e-click]: https://github.com/excalidraw/excalidraw/blob/701b901a0f1ba3d0b390d9cdf63d112e25abac4b/packages/excalidraw/components/App.tsx#L9870-L9878
[e-submit]: https://github.com/excalidraw/excalidraw/blob/701b901a0f1ba3d0b390d9cdf63d112e25abac4b/packages/excalidraw/components/App.text.ts#L304-L319
[e-onehistory]: https://github.com/excalidraw/excalidraw/blob/701b901a0f1ba3d0b390d9cdf63d112e25abac4b/packages/excalidraw/components/App.text.ts#L603-L612
[e-viewport]: https://github.com/excalidraw/excalidraw/blob/701b901a0f1ba3d0b390d9cdf63d112e25abac4b/packages/excalidraw/components/App.text.ts#L120-L128
[e-wys-ctrlenter]: https://github.com/excalidraw/excalidraw/blob/701b901a0f1ba3d0b390d9cdf63d112e25abac4b/packages/excalidraw/wysiwyg/textWysiwyg.tsx#L899-L905
[e-wys-tab]: https://github.com/excalidraw/excalidraw/blob/701b901a0f1ba3d0b390d9cdf63d112e25abac4b/packages/excalidraw/wysiwyg/textWysiwyg.tsx#L906-L919
[e-wys-size]: https://github.com/excalidraw/excalidraw/blob/701b901a0f1ba3d0b390d9cdf63d112e25abac4b/packages/excalidraw/wysiwyg/textWysiwyg.tsx#L883-L886
[rauno]: https://rauno.me/craft/interaction-design
[emil]: https://emilkowal.ski/ui/great-animations
[m3-tokens]: https://m3.material.io/styles/motion/easing-and-duration/tokens-specs
[m3-apply]: https://m3.material.io/styles/motion/easing-and-duration/applying-easing-and-duration
[hig-undo]: https://developer.apple.com/design/human-interface-guidelines/undo-and-redo
[hig-motion]: https://developer.apple.com/design/human-interface-guidelines/motion
[nng-dnd]: https://www.nngroup.com/articles/drag-drop/
[comeau]: https://www.joshwcomeau.com/react/prefers-reduced-motion/
[paco]: https://paco.me/writing/custom-text-underlines
[figma-text]: https://help.figma.com/hc/en-us/articles/360039956434-Guide-to-text-in-Figma-Design
[figma-select]: https://help.figma.com/hc/en-us/articles/360040449873-Select-layers-and-objects
[keynote]: https://support.apple.com/guide/keynote/keyboard-shortcuts-tanfde4a3e6d/mac
[slides]: https://support.google.com/docs/answer/1696717
[ppt]: https://support.microsoft.com/en-us/powerpoint/work-with-gridlines-and-use-snap-to-grid-in-powerpoint
[notion]: https://www.notion.com/help/keyboard-shortcuts
[miro-text]: https://help.miro.com/hc/en-us/articles/360017572094-Text
