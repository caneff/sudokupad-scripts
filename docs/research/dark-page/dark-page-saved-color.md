# Dark Page: reading a saved color before the first paint

Tested 2026-11-03 on sudokupad.app in headless Chromium, with the script injected into the page,
not installed through Tampermonkey.

- `Framework` is a function-bearing global from about 157 ms after navigation, before
  `DOMContentLoaded` (285 ms in that run), and `Framework.getData` already works then. So a script
  at `@run-at document-idle` reads its saved color synchronously and writes it into the first
  stylesheet; the default black is never painted when a color is saved.
- `Framework.setData('x', '#123456')` stores the raw string in `localStorage` under a
  per-profile key (`svencodes_x` here), and `getData` returns it unparsed.
- The page itself is white until the script runs, since Tampermonkey injects no earlier than
  `document-idle`. That white is the same with or without a saved color. A true no-flash would need
  `@run-at document-start`, which this script does not use.
- The script's stylesheet stays disabled until a board is on the page, so the page's color is
  applied to the first paint that has a board. `live/dark-page/dark-page.live.mjs` reads the stylesheet's
  text at injection to prove the saved color is in it.
- Screenshot: `dark-page-color.png`, made by `dark-page-color-screenshot.mjs`.

Update 2026-11-08 (#544): the script now runs at `@run-at document-start` and reads the saved color from `localStorage`
itself, before `Framework` exists; `Framework.getData` corrects it at DOMContentLoaded. The white before the script, noted above,
is gone: `load-flash.md`.
