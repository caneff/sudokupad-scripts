# Does the page leave the rules pane more height than the fit uses? (#602)

Checked 2026-11-08 on a recorded SudokuPad, 1920x1080 window, landscape, with Auto Rules Resizer installed.

**Yes, about 260 px, and the fit cannot take it.**

- The controls column (`#controls`) is centred in the page: its top is at 274 px and its bottom at 1054 px, in a game area that runs 40 px to 1080 px.
  The pane is at most 14rem high (235 px at SudokuPad's 1.048 scale), and the fit's room (the pane's top to its container's bottom) is that height.
- Growing the pane pushes the buttons, number pad and footer down (probe: `max-height` 400, 600, 800 px gave a column bottom of 1238, 1448, 1657 px).
  Moving the column up with `translate` (as the drag corners do) keeps it on the page.
- But SudokuPad's own `App.resize` scales the controls column to fit the window and measures the column as it now is. After one window `resize`
  event the scale went 1.048, 0.791, 0.609, 0.462, 0.441 over the next four resizes, and the number pad shrank with it; the fit then saw a smaller pane and
  gave up the lift. So a pane taller than SudokuPad's layout leaves a state SudokuPad undoes on its next resize.

So the automatic fit keeps today's room. Using the page's spare height would need the fit to take itself off before SudokuPad's resize measures the column,
and `Framework.app.resize()` calls made by SudokuPad's own features would still see the tall pane.

## What SudokuPad measures, and when (#625)

Read from SudokuPad 0.611.0's `script.js`, `App.resize`, and checked live at 1920x1080 and 1600x900.

- `App.resize` sets `#controls` to `transform: none`, reads its box (`bounds(controlsElem)`), and scales it to fit the game area (`scaleToFit`, at most 1.3), then sets `translate(...) scale(...)`. It then calls `resizeBoard` and triggers `resize`.
- It runs on a window `resize` (`handleResize`), on a puzzle load and on every `Framework.app.resize()` call. `resizeBoard` is its only caller of the board layout, so wrapping `resize` covers a layout that wrapping `resizeBoard` would see only after the column was measured.
- So the column is measured at the moment `resize` starts, with whatever height the rules pane has then. The fit takes itself off (style and text class) just before `resize` and puts itself back just after, in the same JS task, so no frame is painted between. Result: scale 1.048 with a 489 px pane, the same as with the script off.
- The spare height is what the column has above it (down to the game area's top, 40 px) and below it (to the window's bottom) as SudokuPad laid it out: about 260 px at 1920x1080. The fit grows the pane by up to that and lifts the column (`translate`) by what would run off the window's bottom.
- A drag adds to the fitted pane's height, not to SudokuPad's own: a drag from SudokuPad's own height would shrink a pane the fit had already grown.
