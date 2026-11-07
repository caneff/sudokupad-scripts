# What the Color by Digit profiles work found in SudokuPad, 2026-11-04

Checked live on sudokupad.app 0.612.0 in headless Chromium while building #105, with the script
injected, not installed through Tampermonkey. `live/color-by-digit/color-by-digit-profiles.live.mjs` holds the checks.

- **A control's handler runs on the press, not the click.** A mouse press on `#control-colorbydigit` ran
  `app.act` at `mousedown`; the `click` that follows did nothing more. A right press ran it too, before
  `contextmenu`. A touch tap gave `pointerdown`, `touchstart`, `pointerup`, `touchend` and no `click`. So a
  right click or a hold on the button colored the grid before it could open a menu. The script now stops
  `mousedown` and `touchstart` on the button proper at the document's capture phase and colors the grid
  itself on the release of a short press.
- **The icon is 49 px in a 66 px button** at a 1200 px wide window, so the AUTO box and the menu arrow box
  sit partly in the button's own padding.
- **Undo is toggle-based with Multi-color off.** Taking one color off a cell that holds two clears both, and
  a second toggle is needed to put the cell's own group color back (the existing `runColorOps` already
  toggles again). The group's undo replays the toggles in reverse, so after one undo the cell holds the
  color that was toggled, not both it had: a cell with colors 1 and 2, switched to a profile where 1 stays,
  ends at 1; one undo leaves 2. This is SudokuPad's, and the same for auto mode's changes on such a cell.
- **A dialog taller than the window is not scrollable by Playwright's coordinates.** With two profiles and
  the groups editor open, the profile list sat above the top of a 900 px window. A drag or a measured
  `boundingBox` needs `scrollIntoViewIfNeeded` first.
