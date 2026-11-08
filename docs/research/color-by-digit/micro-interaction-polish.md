# Color by Digit: small touches that would make it feel more polished (2026-11-08)

Research only, desktop mouse and keyboard. Read against `color-by-digit.user.js` 0.23.0 on `main` 66b4c75, SudokuPad's
stylesheets as served on 2026-11-08, and the sources in Coverage. Nothing here was run in a live page unless it says so.

## Verdict

The biggest gaps are states, not motion. Keyboard focus is nearly invisible in the dialog. Its buttons, keys and swatches
have no hover or press state. The chips and swatches show cell colors at full strength, while SudokuPad shows them at 60%.
Each fix is a few lines of CSS.

## Ranked candidates

Ranked by how much the feel improves for the cost. S is a few CSS lines or one handler. M is a new handler or a change to
shared `lib/` code with a test. L is more.

| # | Touch | What the user feels | Source | How it maps to this script | Cost |
|---|---|---|---|---|---|
| 1 | **Visible keyboard focus in the dialog.** | Tab and Enter already work on the digit keys, swatches, ×, + New profile, Clear all, Save and Cancel, but you cannot see where you are. With the fix, a clear ring shows where the focus is. | WCAG 2.2 SC 2.4.7 Focus Visible; SC 2.4.13 Focus Appearance (2 px perimeter, 3:1 change); Excalidraw `ColorPicker.scss` L120-132 (a 3 px ring 4 px outside the swatch, on `:focus-visible` only); SudokuPad `style.css` L753 | SudokuPad's global `button:focus { outline: none; box-shadow: 0 0 1px 0 rgba(0,0,0,.3) }` (style.css L753) applies to every `<button>` in the dialog, and nothing in `STYLE_CSS`, `colorBlockCss` or `buttonRowCss` puts a ring back. Add `#color-by-digit-editor button:focus-visible, .dialog:has(#color-by-digit-editor) .dialog-options button:focus-visible { outline: 2px solid #6a1b9a; outline-offset: 2px }`. On the pressed swatch, `[aria-pressed="true"] { outline: 3px solid #000 }` (lib/color-picker.js L47) takes the outline, so its focus ring needs a different property: an `::after` ring 4 px outside, as Excalidraw does. **Read from CSS, not seen live.** | S |
| 2 | **Hover and press states on the dialog's controls.** | The pointer gets an answer before the click: the control lightens on hover and darkens slightly on press, so a click feels taken. | Material 3, States: state layers (hover +8%, focus +10%, press +10%, drag +16% of the content color); NN/g, Response Times (0.1 s feels instant); SudokuPad `style.css` L752 (`button:hover { background-color: #f3e5f5 }`); SudokuPad `tool-color.css` L21-23 (a color button's ring takes the hover color) | Save and Cancel (`buttonRowCss`, lib/settings-dialog.js L94), Clear all (`.cbd-button`, STYLE_CSS) and the digit keys (`[data-act="digit"]`) set `background` with higher specificity or `!important`, so SudokuPad's hover never shows. The swatches (`colorBlockCss`) have no hover either. Add `:hover` with `background: #f3e5f5` (SudokuPad's own value) to the plain buttons. Add `:active` as a 10% darker layer (`box-shadow: inset 0 0 0 100vmax rgb(0 0 0 / .10)`) so it works on top of any fill, swatches and painted digit keys included. On swatch hover, ring it with `box-shadow: 0 0 0 2px #6a1b9a`. No transition: these states should change at once. The Save and Cancel rule is in the shared `lib/settings-dialog.js`, so the five scripts gain it together. | S |
| 3 | **Chips, swatches and painted digit keys at SudokuPad's 60% cell opacity.** | The colors in the button, the menu and the dialog look like the board, not brighter. The blue digit on a chip becomes readable. | SudokuPad `tool-color.css` L3 (`--cell-color-opacity: 0.6`), L25 (its own color buttons draw at that opacity), L88 (`#cell-colors` too); Apple HIG, Color ("Avoid using colors that make it hard to perceive content"); WCAG 2.2 SC 1.4.11 Non-text Contrast | `renderChips` (L1080) fills each chip with the raw `--cell-color-<key>` (`readCellColor`, "not the 60% opacity it shows with on the grid"). The swatches in `renderColorBlock` and `renderDigitKey` do the same. SudokuPad's own color pad and board use 0.6. The chip's blue digit (`ENTERED_DIGIT_BLUE`, rgb(29,106,229)) against the default palette, raw versus 60% over white: green 1.02 → 2.01, red 1.31 → 2.11, grey 8 1.19 → 2.29, blue 1.67 → 2.63, pink 2.02 → 2.90. Black is the exception (4.25 → 1.16), but 1.16 is what the board shows. Fix: add `fill-opacity="0.6"` on the chip `rect`, and in the dialog paint a 60% layer over white. The pen colors also use the shared `colorBlockCss`, and SudokuPad draws pens at full strength, so the opacity must be a per-caller option. | S (M with the shared-lib option and its test) |
| 4 | **The mode button shows it is pressed from the moment of the press.** | A slow click on the button gives no sign until the release: the mode only steps on `pointerup`, and a hold opens the menu at 500 ms. A pressed look at once confirms the press and shows the hold has started. | NN/g, Response Times (0.1 s limit for direct manipulation); Material 3 state layers (press +10%) | `listenForButton` (L2118) calls `preventDefault` on `mousedown` and steps the mode on `pointerup` (`HOLD_MS = 500`). Set a class such as `cbd-pressed` on `pointerdown` and clear it on `endHold` and `pointerup`. Style it as a 10% darker layer, matching row 2. A class is used because some engines drop `:active` once `mousedown` is cancelled. **That `:active` behaviour was not checked.** | S |
| 5 | **Bigger hit areas for the small targets.** | Fewer misses on the menu arrow, the menu's Cell and Digit dots, the ×, and the drag handle. | WCAG 2.2 SC 2.5.8 Target Size (Minimum), 24 × 24 CSS px; Rauno Freiberg, "Fitts's Law"; tldraw `ui.css` L852-860 (an `::after` with `inset: -4px 0` widens a 1 px resize handle's hit area) | The arrow box is 14 × 14 px (`ARROW_BOX_HTML`, L896). Right-click and hold do the same job, so SC 2.5.8's Equivalent exception covers it, but it is still a small target. An `::after` at `inset: -5px` makes it 24 px, outward over the button's corner margin. The menu dots are 16 px spans (`menuDot`, L1148), and only the span carries `data-act`. Moving `data-act` and the cursor to the 44 × 26 px dot column gives a target 2.75× wider. The × (`.cbd-text-button`, about 22 × 20 px read from the annotated picture at 2× scale) and the handle (`⋮⋮` at 18 px) need `min-width: 24px; min-height: 24px`. **Sizes were read from the picture, not measured.** | S |
| 6 | **A `grabbing` cursor while a profile is dragged.** | The hand closes when you grab, so you can tell you are holding the row. | Apple HIG, Pointing devices (match the pointer to the context); tldraw `ui.css` L870-877 (a separate look while dragging, `[data-resizing='true']`) | The handle has `cursor: grab` (STYLE_CSS L1235). The drag in `openDialog` (`rows[from].style.opacity = '0.5'`, L2289) never changes it, and the pointer leaves the handle as it moves. Set `document.documentElement.style.cursor = 'grabbing'` on the drag's start and clear it in `end`. | S |
| 7 | **The profile menu fades out after a pick, and the picked row blinks.** | The pick is confirmed, and the menu goes away gently. It still opens at once. | Rauno Freiberg, "Frequency & Novelty" (macOS context menus open with no motion, fade out, and blink the chosen item); NN/g, "Executing UX Animations" (exit shorter than entry; ease-in on exit); Material 3 tokens (`short2` 100 ms, `standard-accelerate` `cubic-bezier(0.3, 0, 1, 1)`) | `switchProfile` calls `closeMenu()` (L2074), which removes the menu at once. On a pick only, flash the row in `ACTIVE_FILL` for one 60 ms step. Then fade the menu with `opacity 100ms cubic-bezier(0.3,0,1,1)` and `pointer-events: none`, and remove it on `transitionend`. The recolor still runs at once. Escape, a click outside and a resize still close it at once. Inside `prefers-reduced-motion: no-preference` only (row 13). | S |
| 8 | **An empty profile still shows its cells.** | After Clear all, a profile with no groups shows three blank dashed cells in the button, the menu and the profile list. It no longer shows nothing, which looks broken. | NN/g, "Designing Empty States in Complex Applications" ("Do not default to totally empty states") | `renderChips` gets `shown = []` for a profile with no groups, so it draws a 0 px wide `svg`. The button then holds only the mode word and the arrow, and the profile row has a blank chip column. When `shown` is empty, draw three white cells with a dashed `#aaa` line, the look `.cbd-unset` already uses for a color on no page. | S |
| 9 | **The arrow keys move between swatches, and between digit keys.** | A keyboard user moves around the 3-column grids as on SudokuPad's own pad, not by Tab through up to 10 stops each. | Excalidraw `keyboardNavHandlers.ts` L18-41 (`arrowHandler`: Left and Right ±1, Up and Down ± a row of `COLORS_PER_ROW`); Apple HIG, Focus and selection | Today only the profile rows take arrows (`rowAfterKey`, `ARROW_STEP`, L203). Add a `keydown` on `.cbd-swatches` and `[data-role="paint"]` that moves the focus by ±1 and ±3 (`PAGE_COLUMNS`), skipping empty slots and stopping at the edges. The pad's 0 key sits under 7, so Down from 7 reaches 0. Enter or Space then does what a click does now, so no new paint path is needed. | M |
| 10 | **A contrast floor for digit shades.** | Pale groups (yellow 5, grey 7) stay readable as small marks, and as digits on their own cell in Both. | WCAG 2.2 SC 1.4.3 Contrast (Minimum): 4.5:1 for small text, 3:1 for large | `darkenColor` keeps a fixed 0.75 of the OKLCH lightness (`LIGHTNESS_FACTOR`, lib/color-math.js L5). Computed with the script's own `parseColor` and `darkenColor` and the WCAG formula, for the default first page. Marks on white: 5 `#908000` 3.98, 7 `#919191` 3.15, both under 4.5. Digits in Both, on their own cell at 60%: 7 2.53, 5 2.74, 3 2.96, all under 3. Lowering the lightness only as far as each color needs to reach 4.5 on white would fix the marks. The `LIGHTNESS_FACTOR` comment records a trade-off: the shades must stay apart and the lightest must still show as thin lines. So this changes a deliberate choice, in a module other scripts use. **Owner's ruling.** | M |
| 11 | **Typing a digit paints it while the focus is in the Digits panel.** | The keyboard does what the pad shows, as SudokuPad's own number keys do. | Excalidraw `keyboardNavHandlers.ts` L64-110 (`hotkeyHandler`: a typed key picks a color while the picker has focus) | The Digits panel paints only by pointer, or by Enter on a focused key (`key-paint` in `reduceDraft`). Add a `keydown` for `0`-`9` while the focus is inside `[data-role="paint"]` or `.cbd-swatches`: send `{ type: 'key-paint', digit }`, redraw, and focus that key. Never when the focus is in the name field or a pulldown. | S |
| 12 | **The profile rows slide aside to show where a dragged row will land.** | You see the gap open, not a purple outline on the row the dragged one will push down. | tldraw `ui.css` L908 (a page-menu item moves with `transition: transform 0.08s ease-out` while reordering); NN/g, "Executing UX Animations" (about 100 ms for simple feedback, ease-out) | Today the drag marks the target with `row.style.outline = 2px solid PURPLE` (L2294 area). Instead, move the rows between `from` and `to` by one row height (30 px plus a 2 px gap), with `transform 80ms ease-out`. The dragged row follows the pointer, and the `draw()` on release puts everything in place. At most six profiles, so the cost is small. | M |
| 13 | **All the motion above is off under reduced motion.** | Nothing moves for someone who asked the system for less motion. | WCAG 2.2 SC 2.3.3 Animation from Interactions; tldraw `TLUserPreferences.ts` L157-173 (`animationSpeed` is 0 when `prefers-reduced-motion: reduce`) and `ui.css` L1674 (toast motion wrapped in `prefers-reduced-motion: no-preference`) | Wrap rows 7 and 12 in `@media (prefers-reduced-motion: no-preference)`. Rows 1-6 and 8-11 have no motion. | S, with 7 and 12 |

### Notes on the ranking

- Rows 1 and 2 are the most-felt: every press in the dialog passes through them. Each one is CSS.
- Row 3 is the only one that changes what the colors look like. It also brings the chips in line with the board, which
  the chips exist to preview ("the chips are drawn the way that mode colors the board", site/color-by-digit.html).
- Rows 7 and 12 are the only motion. Apple HIG, Motion says "generally avoid adding motion to UI interactions that occur
  frequently", and Rauno says the same of context menus. That is why the menu still opens with no motion, and why neither
  row adds an entry animation.

## Already done or filed

- Esc closes the profile menu, and the menu closes on a press outside it and on a window resize (`listenForButton`).
- The menu opens with no motion and keeps the keyboard with the puzzle (its rows are not focusable, per the `renderMenu`
  comment). This matches Rauno's point about menus used many times a day.
- The arrow keys and Enter move through the profile rows (`rowAfterKey`). A keyboard press on a swatch or a digit key
  puts the focus back on the redrawn control.
- Hover states exist on profile rows, `.cbd-text-button` and the title-row Copy and Paste icons. The delete × and the
  handle show on hover or on the selected row.
- The name field shows its box only when focused.
- The dialog opens with SudokuPad's own 0.2 s `dialog-slide-down` (`style.css` L259-271;
  `docs/research/sudokupad-dialog-slide-in.md`).
- Undo: a digit or centre mark change and its color change are one undo step (`inOneUndoStep`). Digit colors are never
  an undo step.
- Crisp chip lines: `shape-rendering="crispEdges"` and a 1 px `non-scaling-stroke` on every chip line (`renderChips`).
- Conflict circles behind marks keep the shades readable (`CIRCLE_FILL` at 0.4).
- Error states: a feature that breaks turns off alone and names itself in a bar (lib/sudokupad.js). The dialog says
  "No palette colors found" and "Profiles saved earlier could not be read". A failed Save keeps the dialog open with
  "Not saved: …".
- Filed: #499 (a Save that fails half-way says Not saved) is open. #509 (the mode word above the chips) is closed.
  The motion and hover ticket #535 is for Text Anywhere, not this script. No Color by Digit ticket covers focus, hover,
  press, opacity, hit targets or motion (searched "Color by Digit", then focus, hover, transition, animation, contrast
  and keyboard).

## Considered and dropped

- **Fade the board's cell colors in on a mode or profile change.** SudokuPad remakes its color layer's nodes on each change
  (`color-by-digit-redraw-cost.md`: about 80 nodes per entry), so a fade would also catch nodes that did not change. Undo
  bypasses `app.act` and would still snap. Apple HIG advises against motion on frequent interactions.
- **A toast or flash when the mode changes.** The word above the chips and the chips' look already change on the press.
  A second signal would repeat them, and Apple HIG, Feedback keeps confirmations for important actions.
- **Animate the dialog's close.** SudokuPad's `Framework.closeDialog` removes it. Animating only this script's dialog
  would make it differ from SudokuPad's other dialogs.
- **Progress feedback during the 500 ms hold.** The hold is a shortcut, with the arrow and right-click doing the same job.
  Row 4's pressed state is enough.
- **Pixel-snap the button icon's chips.** SudokuPad sizes the bottom row in rem under a scale transform
  (`BOTTOM_ROW_CSS` comment), so no fixed pixel grid exists to snap to. `crispEdges` already keeps the lines sharp.
- **Reposition the menu on resize or zoom instead of closing it.** Closing on resize is what macOS menus do, and the menu
  reopens with one click.
- **Clearer swatch names (`title` is the palette key, such as `j`).** It helps a screen reader more than mouse and
  keyboard feel, and the color is visible. Low value.
- **Undo after a mode change.** It was a real bug (#537), seen live: Undo left the mode at Cell with the cells uncolored. Fixed: the
  mode follows the board (`live/color-by-digit/color-by-digit-undo.live.mjs`).
- **Anything for phones or tablets, a right-button drag, or SudokuPad's dark mode:** the owner's standing rejections.

## Coverage

**Script and repo, read:** `color-by-digit.user.js` (all; the `lib:` blocks for color-picker, settings-dialog and
color-math); `lib/color-math.js` L5 and L84; `lib/color-picker.js` L37-47; `lib/settings-dialog.js` L90-94;
`site/color-by-digit.html` (text and image list); pictures `color-by-digit-dialog-annotated.png`,
`color-by-digit-mode-labels.png`, `color-by-digit-slide-8-menu.png` and `color-by-digit-button-row.png` (an older picture);
`docs/research/color-by-digit/color-by-digit-redraw-cost.md` and `color-by-digit-profiles-notes.md`;
`docs/research/sudokupad-dialog-slide-in.md`, `sudokupad-color-tool.md` and `sudokupad-theme-colors.md`; the issue list
(`--search "Color by Digit"`, all open issues, a keyword search) and #535's body.

**SudokuPad, fetched 2026-11-08 from sudokupad.app:** `style.css` (L252-271 dialog animation, L237-253 button base, hover
and focus, L752-753), `tool-color.css` (L3, L15-25, L85-88). The version was not read from these files.

**Contrast figures:** computed by a scratch script, not kept, that `require`s `color-by-digit.user.js` and applies the
WCAG relative-luminance formula to the default first page (`#1f8020 #e87cf1 #e49632 #f53a37 #d2be32 #3d99f5 #d6d6d6
#7c7c7c #000000`), raw and at 60% over white.

**External pages, each cited once:**
- Rauno Freiberg, "Invisible Details of Interaction Design", July 2023, https://rauno.me/craft/interaction-design
- Emil Kowalski, "Great Animations", undated, https://emilkowal.ski/ui/great-animations: read. Its points ("usually shorter
  than 300ms", ease-out, never animate keyboard-initiated actions, respect reduced motion) back rows 7, 12 and 13.
- Material Design 3, "Easing and duration" tokens, https://m3.material.io/styles/motion/easing-and-duration/tokens-specs.
  The page notes the expressive update moved components to springs; the tokens are still listed for transitions.
- Material Design 3, "States: state layers", https://m3.material.io/foundations/interaction/states/state-layers
- Page Laubheimer (NN/g), "Executing UX Animations: Duration and Motion Characteristics", 2020-02-09,
  https://www.nngroup.com/articles/animation-duration/
- Jakob Nielsen (NN/g), "Response Times: The 3 Important Limits", 1993 (updated 2014),
  https://www.nngroup.com/articles/response-times-3-important-limits/
- Raluca Budiu (NN/g), "Change Blindness in UX: Definition", 2018-09-23,
  https://www.nngroup.com/articles/change-blindness-definition/ (used for the dropped board fade)
- Kate Kaplan (NN/g), "Designing Empty States in Complex Applications: 3 Guidelines", 2021-09-19,
  https://www.nngroup.com/articles/empty-state-interface-design/ (from the search result's text)
- W3C, Understanding SC 2.5.8 Target Size (Minimum), https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- W3C, Understanding SC 2.4.7 Focus Visible, https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html
- W3C, Understanding SC 2.4.13 Focus Appearance, https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html
- W3C, Understanding SC 1.4.3 Contrast (Minimum), https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
- W3C, Understanding SC 1.4.11 Non-text Contrast, https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html
- W3C, Understanding SC 2.3.3 Animation from Interactions,
  https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html
- Apple HIG, Motion, https://developer.apple.com/design/human-interface-guidelines/motion
- Apple HIG, Feedback, https://developer.apple.com/design/human-interface-guidelines/feedback
- Apple HIG, Focus and selection, https://developer.apple.com/design/human-interface-guidelines/focus-and-selection
- Apple HIG, Pointing devices, https://developer.apple.com/design/human-interface-guidelines/pointing-devices
- Apple HIG, Color, https://developer.apple.com/design/human-interface-guidelines/color
- Apple HIG, Undo and redo, https://developer.apple.com/design/human-interface-guidelines/undo-and-redo (read; nothing in
  it changed a row)
- Excalidraw at 701b901a, `packages/excalidraw/components/ColorPicker/ColorPicker.scss` L72-76 and L120-132,
  https://github.com/excalidraw/excalidraw/blob/701b901a0f1ba3d0b390d9cdf63d112e25abac4b/packages/excalidraw/components/ColorPicker/ColorPicker.scss#L120-L132,
  and `keyboardNavHandlers.ts` L18-41 and L64-110,
  https://github.com/excalidraw/excalidraw/blob/701b901a0f1ba3d0b390d9cdf63d112e25abac4b/packages/excalidraw/components/ColorPicker/keyboardNavHandlers.ts#L18-L41
- tldraw at 69f43954, `packages/tldraw/src/lib/ui.css` L80-90, L847-877, L908, L1674-1695,
  https://github.com/tldraw/tldraw/blob/69f43954f15a171b3a6edb45134d27b71560de02/packages/tldraw/src/lib/ui.css#L908,
  and `packages/editor/src/lib/config/TLUserPreferences.ts` L157-173,
  https://github.com/tldraw/tldraw/blob/69f43954f15a171b3a6edb45134d27b71560de02/packages/editor/src/lib/config/TLUserPreferences.ts#L157-L173

**How the pages were read, and the re-read the controller asked for:**
- The Apple HIG pages are JavaScript shells. Rendered with `mcp__c4ai__md` (bm25 and raw), the Motion page gave only the
  site's navigation. The HIG text above was read in full from Apple's own documentation JSON
  (`developer.apple.com/tutorials/data/design/human-interface-guidelines/<page>.json`) with `curl`. Unchanged: the
  re-render added nothing.
- Material 3 state layers: `mcp__c4ai__md` returned only the site's navigation (raw and bm25). The full text, including
  the 8/10/10/16% values, came from `mcp__exa__web_fetch_exa` earlier. Unchanged.
- NN/g "Executing UX Animations" and Rauno's essay: first read with WebFetch, re-read with `mcp__c4ai__md`. The same text
  came back: 100 ms simple feedback, 200-300 ms for a modal, exits shorter, ease-out; macOS context menus open with no
  motion, fade out, and blink the item. Unchanged.
- The W3C Understanding pages: `mcp__c4ai__md` was blocked by Cloudflare. They were read with `mcp__exa__web_fetch_exa`.
- GitHub code: read as raw files at the pinned commits with `curl`, so the line numbers are exact. No GitHub code view
  was used.

**Looked for and not found, or not used:**
- The help docs of a color-heavy tool (Figma, Procreate and the like): not read. Excalidraw's code stood in for a color
  picker's hover, focus and arrow-key behaviour.
- A SudokuPad press (`:active`) style for its buttons: `style.css` has none, only `:hover` and `:focus`.
- Whether `:active` still applies once `mousedown` is cancelled (row 4): not checked. The class approach avoids depending
  on it.
- Live checks: none. Row 1 (focus invisible), the target sizes in row 5 and the undo note under Dropped are read from
  CSS, code or pictures, and need a live look before a ticket.
