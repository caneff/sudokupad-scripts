# SudokuPad's page: where presses go, and what stacks over what

Read from SudokuPad 0.611.0's `script.js`, `framework.js`, `appmenu.js` and `style.css`, and probed on the recorded
puzzle at 1200x900, for Text Annotation's notes beside the board (#406).

## Presses

- `App._attachInteractionHandlers` adds `handleInputdown`, `handleInputmove` and `handleInputup` on `window`, so a tool's
  `handleInputdown` gets every press that bubbles to the window, anywhere on the page, not only on the board.
- A press on the control panel's buttons, in a dialog (`Framework.handleDialogCancel`) or in the menu drawer
  (`appmenu.js`'s `handleClickOverlay`) is stopped before it reaches the window. A press on the top bar's blank space is
  not: it reaches the tool.
- `App.resize` lays out `.board` and `#controls` from the `.game` box and the `.topbar` height, sets their styles, and then
  triggers the app's `resize` event. A width-only resize can slide the board sideways without changing its size.

## Boxes at 1200x900

| Element | Box (left, top, width, height) | z-index |
| --- | --- | --- |
| `.topbar` | 0, 0, 1200, 40 | 1 (static, so none) |
| `#board` / `svg#svgrenderer` | 18, 135, 671, 671 | auto |
| `#controls` | 724, 276, 292, 530 | auto |
| `#appmenu.mdc-drawer` | closed | 1000 |

The board SVG's box holds a margin round the grid (the grid runs from about 35 to 671). Its `getScreenCTM()` is a plain
scale and offset (1.103 here).

## Stacking

`style.css` sets z-index 1000 on `.dialog-overlay` and `.mdc-drawer`, and 10 on `.game-clock`, `.rules-copy` and the
killer calculator's `.killercalc-onscreen`. A fixed layer at z-index 20 sits over the board and under every dialog and
the menu.

The page does not scroll at desktop sizes, so viewport pixels are page pixels.
