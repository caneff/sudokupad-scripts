# Research index

One line per note: title, date, the question and the verdict. A note sits in the folder of what it is about: SudokuPad itself at
the top of `docs/research/`, one script's notes in that script's folder, the repo's own tooling (fuzz, Tampermonkey, shared code,
hosting) in `docs/research/tooling/`, and the site's own mockups in `docs/research/site/`. Paths below are from the repo root;
`test/doc-paths.test.js` fails when one is missing. A note that is `see`-linked to another chains or overlaps with it.

## SudokuPad itself

- `docs/research/sudokupad-color-tool.md` — SudokuPad's color tool, for a script that colors cells (2026-11-02). What a cell
  stores and how the color tool paints it, read from 0.611.0's source. Read only; also see
  `docs/research/sudokupad-color-tool-paging.md`.
- `docs/research/sudokupad-color-tool-paging.md` — How SudokuPad's color tool turns its pages (2026-11-04). Which click, wheel and
  key moves the palette page. Read from tool-color.js.
- `docs/research/sudokupad-custom-tool.md` — A custom tool in SudokuPad (2026-11-06, #269). How `Framework.addTool` registers a
  tool and what a tool receives. Run on the page; Text Anywhere's findings.
- `docs/research/sudokupad-dialog-slide-in.md` — SudokuPad's dialogs slide in (2026-11-07, #441). A dialog is mid-slide for 0.2 s,
  so a point read then is stale. Verdict: wait out the slide before reading.
- `docs/research/sudokupad-killer-calculator.md` — SudokuPad's Killer Calculator (2026-11-03). How a script hooks into it. Read
  from tool-calculator.js, some items run live.
- `docs/research/sudokupad-letter-tool.md` — SudokuPad's letter mode stays on between puzzles (2026-11-03). What `toolletter`
  saves and why the mode survives. Basis of UI Tweaks' No Tab Letters part.
- `docs/research/sudokupad-mark-ink-centre.md` — Where a SudokuPad mark's digit sits (2026-11-03). Measured baseline and ink
  centre of a corner mark.
- `docs/research/sudokupad-page-layers.md` — SudokuPad's page: where presses go and what stacks over what (#406). Read from
  script.js, framework.js and style.css for Text Annotation's notes beside the board.
- `docs/research/sudokupad-pen-edge-marks.md` — SudokuPad pen marks on cell edges (2026-11-03). What a pen value is and which
  values draw what. Has § Pen values past `z`, the answer to "are pen values scarce" (no).
- `docs/research/sudokupad-pen-line-mode.md` — SudokuPad's pen line mode (2026-11-06). What line mode does to a drag: it decides
  where the ends snap and stores a line of one of several kinds.
- `docs/research/sudokupad-pen-tool.md` — SudokuPad pen tool colors (2026-11-03). The nine pen colors, their CSS variables and the
  pen layer's opacity. See `docs/research/pen-tool-extras/pen-tool-extras-opacity.md`.
- `docs/research/sudokupad-replay-files.md` — Replay files under every script (#98). What breaks when a saved replay plays with
  the scripts. Verdict: one script breakage (Dark Page's readout, #100), one SudokuPad limitation (#101). Files in
  `docs/research/replay-files/`. See `docs/research/sudokupad-replay-tool.md`.
- `docs/research/sudokupad-replay-tool.md` — SudokuPad's replay tool (#313). How it is turned on, its button, its key and how it
  plays. Covers the tool, `docs/research/sudokupad-replay-files.md` covers files.
- `docs/research/sudokupad-theme-colors.md` — SudokuPad theme colors (2026-11-03). The CSS variables that hold the theme. Basis of
  Dark Page.
- `docs/research/sudokupad-version-signal.md` — SudokuPad's version signal (2026-11-05, #140). What names the served version with
  one plain request. Verdict: the `?v=` of the assets in the puzzle page's HTML.
- `docs/research/large-puzzle-ui-right-drag.md` — SudokuPad's "Test Large Puzzle UI" takes the right-button drag (2026-11-07). Why
  no feature relies on a right-drag (ruled; `AGENTS.md`).
- `docs/research/pen-reload-color.md` — A quick reload brings pen strokes back in color 1 (#681). Verdict: SudokuPad does it
  alone; no script changes the color.
- `docs/research/sudokubank-to-sudokupad.md` — SudokuBank to SudokuPad: is a translator feasible? (2026-11-03). Dropped by Chris's
  ruling after SudokuBank's terms; reopening starts from those terms.
- `docs/research/other-sudokupad-userscripts.md` — Other SudokuPad userscripts, and SudokuPad's own features (2026-11-06). What
  exists, to keep a new script idea from repeating one. Search results only. See
  `docs/research/pen-tool-extras/puzzle-ui-pen-tools.md`.
- `docs/research/js-to-css-candidates.md` — Script code that CSS could replace (2026-11-07). Which JS in the scripts a stylesheet
  rule could do instead; candidate 1 (the bottom row) was taken (#376). See `docs/research/ui-tweaks/bottom-row-css-wrap.md`.

Loose probe scripts at this level: `docs/research/sudokupad-pen-alphabet-probe.mjs`, `docs/research/sudokupad-replay-files.mjs`
and `docs/research/settings-dialog-version-screenshot.mjs`.

## Per script

The six micro-interaction polish notes (No Tab Letters' under UI Tweaks) are one pass of 2026-11-08 over every script: read them
together.

### Auto Rules Resizer

- `docs/research/auto-rules-resizer/micro-interaction-polish.md` — Small polish touches for the fitted rules (2026-11-08).
  Research only; candidate touches for 0.3.16.
- `docs/research/auto-rules-resizer/page-room-for-the-pane.md` — Does the page leave the rules pane more height than the fit uses?
  (#602, 2026-11-08). Yes, about 260 px, and the fit cannot take it.

### Color by Digit

- `docs/research/color-by-digit/color-by-digit-profiles-notes.md` — What the profiles work found in SudokuPad (2026-11-04). Live
  findings from building #105.
- `docs/research/color-by-digit/color-by-digit-redraw-cost.md` — What a redraw costs per event (#432, 2026-11-07). Measured before
  and after 0.22.3. See `docs/research/pen-tool-extras/pen-tool-extras-redraw-cost.md`.
- `docs/research/color-by-digit/micro-interaction-polish.md` — Small touches that would make it feel more polished (2026-11-08).
  Research only; read against 0.23.0.
- `docs/research/color-by-digit/color-by-digit-109/README.md` — v0.5.0 dialog and button (#109). Screenshots.
- `docs/research/color-by-digit/color-by-digit-112/README.md` — 0.5.1 auto box label (#112). Screenshot of the dialog.
- `docs/research/color-by-digit/color-by-digit-115/README.md` — 0.5.2 the group's red × (#115). Screenshots.
- `docs/research/color-by-digit/color-by-digit-six-profiles/README.md` — Six profiles (#237, 2026-11-06). `MAX_PROFILES` 4 to 6,
  checked at two sizes.
- `docs/research/color-by-digit/color-by-digit-live-check/README.md` — Live check (2026-11-02). Scratch scripts against 0.611.0;
  nothing imports them.

### Dark Page

- `docs/research/dark-page/dark-page-saved-color.md` — Reading a saved color before the first paint (2026-11-03). Tested with the
  script injected.
- `docs/research/dark-page/load-flash.md` — The white flash before the dark page applies on load (#544, 2026-11-08). Probed under
  real Tampermonkey; fixed in 0.6.0 and 0.7.0.
- `docs/research/dark-page/micro-interaction-polish.md` — Small touches that would make it feel more polished (2026-11-08).
  Research only.

### Logic Masters Puzzle Preview

No note. `docs/research/logic-masters-puzzle-preview/juggler-original-1.0.user.js` is juggler's original, kept as the source of
the first version.

### Pen Tool Extras

- `docs/research/pen-tool-extras/puzzle-ui-pen-tools.md` — Pen, line and mark features in other puzzle UIs (2026-11-03). Which
  features SudokuPad's pen lacks, for choosing new ones. See `docs/research/other-sudokupad-userscripts.md`.
- `docs/research/pen-tool-extras/pen-tool-extras-feature-cost.md` — What each feature costs in lines (2026-11-05). Which features
  cost the most, to keep, shrink or drop on cost.
- `docs/research/pen-tool-extras/pen-tool-extras-opacity.md` — Pen mark opacity (2026-11-03). Superseded in part by #71: opacity
  is on the pen layer. See `docs/research/sudokupad-pen-tool.md`.
- `docs/research/pen-tool-extras/pen-line-join-nub.md` — Darker edge pixels where centre-line segments join (2026-11-05). Ruled
  left alone, too small to fix.
- `docs/research/pen-tool-extras/pen-tool-extras-redraw-cost.md` — What a pen drag costs (#432, 2026-11-07). Nothing measured
  slow; no change.
- `docs/research/pen-tool-extras/micro-interaction-polish.md` — Small touches that would make drawing feel polished (2026-11-08).
  Research only.
- `docs/research/pen-tool-extras/line-icon-grid-scaling.md` — Line mode icon grid at 1.25x and 1.5x (#955, 2026-11-17). Not as the
  ticket proposed; 1.5x cannot be crisp without breaking the icon's ink size.
- `docs/research/pen-tool-extras/cycle-erase-not-reproduced-1065.md` — A last-shape click that leaves the mark shown (#1065,
  2026-11-21). Not reproduced.
- `docs/research/pen-tool-extras/delete-key-erases-pen-marks-1063.md` — What the Delete key erases in highlighted cells (#1063, 2026-11-23). With the Pen tool
  active, stock SudokuPad clears the whole pen layer, Pen Tool Extras' marks too; the script changes nothing. No code change.
- `docs/research/pen-tool-extras/pen-tool-extras-dialog/README.md` — 1.13.0 the settings dialog (#107). Screenshots.

### Text Anywhere

The script was Draw Tool, then Text Annotation (`GLOSSARY.md`).

- `docs/research/text-anywhere/penpa-plus-text-anywhere.md` — Text Anywhere on Penpa+ (#1057, 2026-11-23). A userscript or support in
  the penpa-edit fork? Verdict: build it into the fork; first version about 1,300 lines over four or five tickets. One headless
  run, the rest read from source.
- `docs/research/text-anywhere/discord-markdown.md` — Discord's text formatting (2026-11-08). The syntax table the notes'
  formatting follows.
- `docs/research/text-anywhere/gdc-notes-vs-text-anywhere.md` — gdc's Puzzle Notes versus Text Anywhere (2026-11-08). What else
  would replace gdc's notes extension.
- `docs/research/text-anywhere/clear-all-live-timeouts.md` — Clear all's live tests timing out under load (#1087, 2026-11-22). The wait
  that times out follows a missed press at the point `buttonOverBoard` read; with `stable` the file passed 13 of 13 under load, not
  checked at load 50.
- `docs/research/text-anywhere/drag-feedback-other-apps.md` — How other editors show a text box being dragged (2026-11-08). Asked
  after Chris disliked a lift on a dragged note.
- `docs/research/text-anywhere/halo-text-shadow-ring.md` — The halo as a `text-shadow` ring (#423, 2026-11-07). Cause of the odd
  letters and the fix.
- `docs/research/text-anywhere/micro-interaction-polish.md` — Small touches other editors have that Text Anywhere lacks
  (2026-11-08). Mostly keyboard and the ends of a gesture.
- `docs/research/text-anywhere/render-timing.md` — Work per pointer move, before and after #426 (2026-11-07). Measured by a live test.
- `docs/research/text-anywhere/tampermonkey-name-change.md` — Does an `@name` change break Tampermonkey's update of Draw Tool?
  (#404, 2026-11-07). Question on renaming the shown name only.

### UI Tweaks

Includes No Tab Letters, once its own script.

- `docs/research/ui-tweaks/bottom-row-css-wrap.md` — Bottom row: a CSS-only second row (2026-11-07). SudokuPad's own stylesheet
  already wraps the row; the rule carries `!important` since #738. See `docs/research/js-to-css-candidates.md`.
- `docs/research/ui-tweaks/digit-pad-size.md` — Digit pad size: how SudokuPad lays out the controls (#1045, 2026-11-18). Read from
  `Framework.app.resize`.
- `docs/research/ui-tweaks/no-tab-letters-micro-interaction-polish.md` — No Tab Letters: small touches (2026-11-08). Research
  only, against 0.1.4. See `docs/research/sudokupad-letter-tool.md`.

## Tooling

- `docs/research/tooling/tampermonkey-shared-code.md` — Can the userscripts share code? (2026-11-05). What Tampermonkey offers for
  shared code. Led to the `lib/` copies; see `docs/research/tooling/shared-code-inventory.md`.
- `docs/research/tooling/shared-code-inventory.md` — Shared code inventory (2026-11-07). What is duplicated across the scripts, as
  candidates for `lib/`.
- `docs/research/tooling/tampermonkey-in-playwright.md` — Can a test install the scripts into a real Tampermonkey? (2026-11-07).
  Yes; the recipe behind `npm run test:tampermonkey`.
- `docs/research/tooling/ui-fuzz-tools.md` — Tools for randomized UI break-it tests (2026-11-08). Which tool drives the fuzz
  (fast-check). Chains to `docs/research/tooling/fuzz-hit-rate.md`, then `docs/research/tooling/fuzz-planted-bugs.md`.
- `docs/research/tooling/fuzz-hit-rate.md` — Raising the fuzz's hit rate (2026-11-09). Ranked changes by gain per effort.
- `docs/research/tooling/fuzz-planted-bugs.md` — What the fuzz catches: planted bugs (2026-11-09, #678). Run-by-run record; the
  baseline for `npm run fuzz:plants`.
- `docs/research/tooling/fuzz-missed-mutants/reload-settings-935.md` — Reload rules read the saved pen and note settings (#935).
  The rule added after the missed mutants; the folder holds the measure script and runs.
- `docs/research/tooling/netlify-credits.md` — Netlify credits (2026-11-03). What Netlify charges on the Free plan and what this
  repo spends. See `docs/agents/site.md`.

## The site

- `docs/research/site/site-preview-card-screenshot.mjs` — The homepage's link-preview card (2026-11-23, #1151). Takes
  `docs/research/site/site-preview-card.png` (1200×630): the title and the first slides of Pen Tool Extras, Text Anywhere
  and Color by Digit, cropped tight; also a 400 px copy to check it.
- `docs/research/site/chinstrap-theme/README.md` — The ChinStrap theme mockup (2026-11-10). The site restyled in the look of
  Chris's stream, as approved in round 14 of the mockup loop; `theme.css` is the spec the build folded into `site/style.css`.

## Published pictures: do not move

The site and the README link these by raw GitHub address on `main`, and Netlify's copy lags, so a moved picture breaks a page.
Every path:

- `docs/research/auto-rules-resizer/auto-rules-resizer.png`
- `docs/research/color-by-digit/color-by-digit-dialog-annotated.png`
- `docs/research/color-by-digit/color-by-digit-slide-1-start.png`
- `docs/research/color-by-digit/color-by-digit-slide-10-split.png`
- `docs/research/color-by-digit/color-by-digit-slide-2-type.png`
- `docs/research/color-by-digit/color-by-digit-slide-3-marks.png`
- `docs/research/color-by-digit/color-by-digit-slide-4-add.png`
- `docs/research/color-by-digit/color-by-digit-slide-5-digit.png`
- `docs/research/color-by-digit/color-by-digit-slide-6-both.png`
- `docs/research/color-by-digit/color-by-digit-slide-7-off.png`
- `docs/research/color-by-digit/color-by-digit-slide-8-menu.png`
- `docs/research/color-by-digit/color-by-digit-slide-9-modular.png`
- `docs/research/dark-page/dark-page.png`
- `docs/research/logic-masters-puzzle-preview/logic-masters-puzzle-preview.png`
- `docs/research/pen-tool-extras/pen-tool-extras-panel-annotated.png`
- `docs/research/pen-tool-extras/pen-tool-extras-slide-1-color.png`
- `docs/research/pen-tool-extras/pen-tool-extras-slide-1-color.webp`
- `docs/research/pen-tool-extras/pen-tool-extras-slide-10-opacity.png`
- `docs/research/pen-tool-extras/pen-tool-extras-slide-10-opacity.webp`
- `docs/research/pen-tool-extras/pen-tool-extras-slide-11-outline.png`
- `docs/research/pen-tool-extras/pen-tool-extras-slide-11-outline.webp`
- `docs/research/pen-tool-extras/pen-tool-extras-slide-12-erase.png`
- `docs/research/pen-tool-extras/pen-tool-extras-slide-12-erase.webp`
- `docs/research/pen-tool-extras/pen-tool-extras-slide-13-settings.png`
- `docs/research/pen-tool-extras/pen-tool-extras-slide-3-solid.png`
- `docs/research/pen-tool-extras/pen-tool-extras-slide-4-dashed.png`
- `docs/research/pen-tool-extras/pen-tool-extras-slide-5-arrow.png`
- `docs/research/pen-tool-extras/pen-tool-extras-slide-6-edges.png`
- `docs/research/pen-tool-extras/pen-tool-extras-slide-7-corner.png`
- `docs/research/pen-tool-extras/pen-tool-extras-slide-8-center.png`
- `docs/research/pen-tool-extras/pen-tool-extras-slide-9-thickness.png`
- `docs/research/pen-tool-extras/pen-tool-extras-slide-9-thickness.webp`
- `docs/research/site/site-preview-card.png`
- `docs/research/text-anywhere/text-anywhere-formatting-raw.png`
- `docs/research/text-anywhere/text-anywhere-formatting.png`
- `docs/research/text-anywhere/text-anywhere-panel-annotated.png`
- `docs/research/text-anywhere/text-anywhere-slide-1-type.png`
- `docs/research/text-anywhere/text-anywhere-slide-2-format.png`
- `docs/research/text-anywhere/text-anywhere-slide-2-format.webp`
- `docs/research/text-anywhere/text-anywhere-slide-3-style.png`
- `docs/research/text-anywhere/text-anywhere-slide-4-background.png`
- `docs/research/text-anywhere/text-anywhere-slide-5-select.png`
- `docs/research/text-anywhere/text-anywhere-slide-5-select.webp`
- `docs/research/text-anywhere/text-anywhere-slide-6-long.png`
- `docs/research/text-anywhere/text-anywhere-slide-6-long.webp`
- `docs/research/text-anywhere/text-anywhere-slide-7-hide.png`
- `docs/research/text-anywhere/text-anywhere-slide-7-hide.webp`
- `docs/research/text-anywhere/text-anywhere-slide-8-erase.png`
- `docs/research/text-anywhere/text-anywhere-slide-8-erase.webp`
- `docs/research/text-anywhere/text-anywhere-slide-9-settings.png`
- `docs/research/ui-tweaks/ui-tweaks.png`

## Byte-identical before and after pairs

The "before" and "after" shot show the same pixels (nothing visible changed there). Keep both; each is cited by its own ticket.

- `docs/research/pen-tool-extras/228-halfway-before-page-button.png` = `docs/research/pen-tool-extras/228-scale-after-page-button.png`
- `docs/research/pen-tool-extras/228-arrows-after-page-button.png` = `docs/research/pen-tool-extras/228-scale-before-page-button.png`
- `docs/research/pen-tool-extras/228-after-page-button.png` = `docs/research/pen-tool-extras/228-arrows-before-page-button.png`
- `docs/research/pen-tool-extras/pen-tool-extras-feedback-hint-arrow-before.png` =
  `docs/research/pen-tool-extras/pen-tool-extras-feedback-hint-dashed-before.png`
- `docs/research/pen-tool-extras/228-halfway-before-page-3-pen-buttons.png` =
  `docs/research/pen-tool-extras/228-scale-after-page-3-pen-buttons.png`
- `docs/research/pen-tool-extras/228-arrows-after-page-3-pen-buttons.png` =
  `docs/research/pen-tool-extras/228-scale-before-page-3-pen-buttons.png`
- `docs/research/color-by-digit/color-by-digit-style-after-menu-desktop.png` =
  `docs/research/color-by-digit/color-by-digit-style-before-menu-desktop.png`
- `docs/research/color-by-digit/color-by-digit-style-after-dialog-phone.png` =
  `docs/research/color-by-digit/color-by-digit-style-before-dialog-phone.png`
- `docs/research/color-by-digit/color-by-digit-style-after-menu-phone.png` =
  `docs/research/color-by-digit/color-by-digit-style-before-menu-phone.png`
