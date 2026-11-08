# Dark Page: the white flash before the dark page applies on load

Probed 2026-11-08 against `dark-page.user.js` 0.5.7 (before) and 0.6.0 and then 0.7.0 (the fix, after #552 took 0.6.0), SudokuPad 0.611.0, Tampermonkey 5.5.1 in
Playwright's Chromium 156 (new headless, 1280x720). Ticket #544. The probe is `load-flash-probe.mjs` (run from the repo root),
the reader `load-flash-report.py`; they install the script through `live/tampermonkey/` (the `npm run test:tampermonkey`
infrastructure) and load the puzzle in `live/puzzle-url.txt`. The frames the probe writes (`.scratch/load-flash-frames/`) are not kept; the reader needs Pillow.

## What the probe records

- An in-page `requestAnimationFrame` log, started by an init script before anything else: `performance.now()`, `readyState`,
  the body's computed background, whether `#svgrenderer` and `#dark-page-style` exist, `typeof Framework`, and the paint
  entries.
- A CDP screencast (`Page.startScreencast`, PNG, every frame), read back at one pixel in the right margin. Its frame 0 is always
  white at 0 ms: it is the page before navigation commits, not the puzzle. Read the frames after it.
- Each run twice over: the puzzle served from the recording (`live/cache.mjs`, as every live test) and from sudokupad.app on the
  network (`--network`); each with no color saved and with `#336699` saved (`--color`, seeded as
  `localStorage['svencodes_DarkPage_color']`).

## Findings, before (0.5.7, `@run-at document-idle`)

| Run | First paint | Page white until | Stylesheet in at |
| --- | --- | --- | --- |
| Recording, black | 80 ms, white | frame at 218 ms is black | 184 ms, `readyState` `complete` |
| Recording, `#336699` | 80 ms, white | frame at 177 ms | 147 ms |
| Network, black | 188 ms, white | frame at 417 ms | 355 ms |
| Network, `#336699` | 216 ms, white | frame at 433 ms | 344 ms |

- **The flash is real**: the first paint is the page's own white and stays white until the script runs, which Tampermonkey does
  at `document-idle`, after `load` (`readyState` `complete`). About 100 ms from the first paint on the recording, and about
  150 to 220 ms on the network, which is several frames.
- **A saved color makes no difference to the flash**: white, then the saved color. The saved color is correct on the first
  frame the script paints (`dark-page-saved-color.md`); the flash is the white before it.
- **The board gate is not the cause.** `#svgrenderer` is in the puzzle page's own HTML, after the `<body>` and four blocking
  scripts (`fpuzzlesdecoder.js`, `puzzlezipper.js`, `lzipper.js`, `puzpatcher.js`), so `body:has(#svgrenderer)` matches as soon
  as the parser reaches it, and the log shows `board: true` at the first sampled frame. The home page (`/`) has no
  `#svgrenderer`, so the gate still keeps it light.
- **`Framework` is not there early.** `typeof Framework` is `undefined` at the first frames and `function` from about
  `readyState` `interactive`. `Framework.getData` cannot supply the color at `document-start`.
- **The saved color can be read without `Framework`.** `Framework.getData(name)` is `localStorage.getItem('svencodes_' + name)`
  with a `JSON.parse` that falls back to the raw string (`framework.js?v=0.611.0`: `F.LocalDataPrefix = 'svencodes'`,
  `F.makeDataKey`, `F.getData`). A color is stored as the raw `#rrggbb` string.

## The fix (0.7.0), and it is small

- `@run-at document-start`.
- The style goes in at once, with the color from `localStorage` (`earlyColor`) or the default black. When no
  `document.documentElement` exists yet (an injector running before the parser has created it; Playwright's init script does),
  the style is attached the moment the parser creates it, through a `MutationObserver` on the document.
- The rest of the old startup (the `Framework` probe, the read through `Framework`, the settings entry) moved into `start`,
  which runs at `DOMContentLoaded`, or at once when the page is already past `loading`. The read through `Framework` is the
  authority: what it returns replaces the early color, "nothing saved" (back to the default) included, so a stale value in the
  key the early read uses cannot outlive the user's own Save of Black. A read that fails keeps the early color.
- `live/dark-page/dark-page.live.mjs` § `at document-start` runs the script as an init script before any of the page's, with a
  frame sampler, and asserts that every frame in which the board exists has the page color, black and `#336699`, and that
  `Framework.makeDataKey('DarkPage_color')` is the key the early read uses and a `Framework.setData` color is the plain string
  (so a renamed prefix fails the daily watch); that the settings entry still appears (`start` ran); and that what `Framework`
  reads at DOMContentLoaded, a color or nothing, replaces the early one.
- `npm run test:tampermonkey` was run on 0.7.0 (the header changed): 14 of 14 passed, the update over main's copy included.

## Findings, after (the fix, `@run-at document-start`)

| Run | First paint | Colors of the page after frame 0 |
| --- | --- | --- |
| Recording, black | 92 ms | black from the first frame (89 ms) |
| Recording, `#336699` | 88 ms | `#336699` from the first frame (90 ms) |
| Network, black | 200 ms | black from the first frame (183 ms) |
| Network, `#336699` | 192 ms | `#336699` from the first frame (183 ms) |

No white frame is painted. The log's body color is the page color at every sampled frame, from the first.

## What stays

- **A frame with a body and no board can still be white.** Between `<body>` and `#svgrenderer` the parser waits on the blocking
  scripts above. A frame sampled in that gap (1 or 2 of about 40 frames on the recording, never on the network in three runs
  each) reads white, because `BOARD` is not true yet. Chrome did not paint one in the screencast, and the live test samples
  only frames that have a board. Closing it would need a gate known at `document-start` that a board will come: the URL path,
  or `body:not(#page-home)`, both guesses about SudokuPad's routing. Not done.
- **A renamed storage key or a changed value format** would give the default first, then the saved color. The live test
  `the key and the format the early read uses are Framework's own` fails in the daily watch if either changes.
- **Not run**: Chrome Web Store install, a real (non-headless) display, and a slow connection. The screencast records what the
  compositor produces, not what a monitor shows.
