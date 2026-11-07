# Shared code inventory (2026-11-07)

What is duplicated across the userscripts, read from `main` at f327c64 (before #332 and #333), as candidates for a shared `lib/` copied into each script (Chris ruled on 2026-11-07 for copies kept in sync by a command and checked by a test, over `@require`). C = Color by Digit, P = Pen Tool Extras, D = Draw Tool, K = Dark Page, R = Auto Rules Resizer, N = No Tab Letters. Line numbers drift; names do not.

| Candidate | Scripts | Copies | Pure? | ~Lines each |
| --- | --- | --- | --- | --- |
| Copy/Paste settings: `pastedSettings`, `pasteReport`, `wireCopyPaste`, the buttons | C P D K R | `pasteReport` and `wireCopyPaste` identical in all 5; `pastedSettings` same body, takes the per-script `READERS` by closure (C adds a legacy-auto-mode shim); `copiedSettings` is per script by design. Buttons: text in C D K R, icons in P | `pastedSettings`/`pasteReport` pure; wiring is DOM + clipboard | 55 |
| OKLab darken: `toLinear`, `fromLinear`, `toOklab`, `fromOklabLinear`, `inGamut`, `darkenColor`, `clamp255`, `LIGHTNESS_FACTOR` | C P D | first four identical; `inGamut` differs by constant name (`EDGE` vs `GAMUT_EDGE`); `darkenColor` same result, different flow and hex output | pure | 55 |
| Hold-to-edit color pickers: `installHoldToEdit`, `enter/exit/toggleEditMode`, `HOLD_TO_EDIT_MS = 1000` | P D | same listener skeleton; targets, save calls and picker construction differ (P watches the panel with a MutationObserver) | DOM | 50 |
| Darker page presets: `PAGE_PRESETS`, `presetOptions`, `presetColors`, `derivedPenColors` / `darkerPageColors` | P D | same algorithm (page key → parse → darken → fallback → darkest grey to black); different return shapes, key types and signatures; D adds a "Pen colors" preset | mostly pure | 35 |
| Settings entry and dialog title: `Framework.addSetting` in the `experimental` group, close then `setTimeout(openDialog)`, version beside the heading, Save/Cancel | C P D K R | near-identical; P alone swallows the release so it does not hit the grid; the version is an inline style in K R, a class in C D, a title row in P | Framework | 10 |
| Slider CSS and constants (track, thumb, wedge, fade) | P D | identical constants, rules differ only in selectors | CSS strings | 25 |
| Panel and tray layout constants | P D | identical values | pure | 15 |
| `parseColor` | C P D | three implementations: C takes #rgb, #rrggbb, rgb()/rgba() with space/slash; P #rrggbb and rgb()/rgba(); D #rgb, #rrggbb, rgb()/rgba() | pure | 12 |
| Palette reading: `Framework.app.tools.colour.palette.pages` | C P D | three checks; only P polls for readiness | Framework | 14 |
| `--cell-color-<key>` resolved through a probe element | C P D | three variants (D also reads `--puzzle-pencolor-N`) | DOM | 10 |
| Light-or-dark text for a background | C K | C `inkFor` (luma, threshold 140); K `wcagLuminance`/`textColorFor` (WCAG contrast) | pure | 6 |
| `SUDOKUPAD_PEN_COLORS`, `GREY_CHROMA`, `HEX_COLOR`, `RGB_TEXT` | P D (K has its own `HEX_COLOR`) | identical data; `HEX_COLOR` differs in D and K | pure | 15 |
| `isPlainObject`, `rem` | P D | identical one-liners | pure | 1 |
| Startup guard before `Framework.getApp()` | all six | near-identical | Framework | 5 |

Not duplicated: storage helpers (each script reads its own keys), `Framework.addTool` (Draw only), puzzle-ready waits (different mechanisms), `esc` (C only).

## How a copied block would be tested

Every script is a `'use strict'` IIFE, `@grant none`, whose pure part ends in `if (typeof module !== 'undefined' && module.exports) { module.exports = { ... } }`. Tests `require('./<script>.user.js')` and destructure. A copied module must sit above that block to be exported, and its names join the script's one export list. `package.json` declares `Framework` and `ToolLetter` as lint globals.

## Names a copied block would collide with inside one script

`parseColor` (three bodies), `darkenColor`, `clamp255`, `inGamut`'s constant (`EDGE` / `GAMUT_EDGE`), `HEX_COLOR` (three regexes), `RGB_TEXT`, `LIGHTNESS_FACTOR`, `GREY_CHROMA`, `installHoldToEdit` and the edit-mode functions (P's take `panel`), `saveColors`, `presetOptions`, `presetColors`, `sliderRow` (unrelated meanings in P and D), D's `toHex`/`hexColor`, C's `inkFor`/`isVisibleColor`, P's `isTransparent`. Scripts do not share scope at runtime; collisions matter only inside one file.
