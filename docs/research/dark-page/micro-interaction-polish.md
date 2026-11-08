# Dark Page: small touches that would make it feel more polished

Researched 2026-11-08 against `dark-page.user.js` 0.5.7 and SudokuPad 0.611.0 (`script.js?v=0.611.0`; `style.css`,
`sudokupad-colors.css`, `tool-letter.css` fetched the same day). Nothing below was run on the page.

**Verdict:** the best small wins are text that always reaches 4.5:1 on any picked color, a visible keyboard focus ring on the
dark buttons, and a live preview in the color dialog; the load flash is the most noticeable gap but needs a probe before anyone
commits to a fix.

## Ranked candidates

| # | Touch | What the user feels | Source | How it maps to the script | Cost |
| --- | --- | --- | --- | --- | --- |
| 1 | Footer and replay-readout text always reach 4.5:1, whatever color is picked | On a mid-grey page the "Created by…" line and the replay readout stop looking faint | [WCAG 2.2 Understanding 1.4.3][wcag-143]; [Apple HIG, Dark Mode][hig-dark] ("no lower than 4.5:1… strive for 7:1, especially in small text") | `buildCss` colors `.controls-footer`, its links and `.controls-input::after` with `textColorFor(pageColor)`, which picks `LIGHT_TEXT` `#dddddd` or `DARK_TEXT` `#222222` (from `lib/color-math`). Neither reaches 4.5:1 on a mid grey: best is 4.03:1 on `#808080`, 3.50:1 on `#767676`, 3.92:1 on `#6b6b6b` (computed with the WCAG formula). Pure `#ffffff` / `#000000` never falls below about 4.58:1 on any background. Give Dark Page its own text pair, or fall back to white/black when the `#ddd`/`#222` pick is under 4.5:1. Keep the dark-buttons switch (`textColor === LIGHT_TEXT`) on its own test so it does not move. The footer is small text, so 4.5:1, not 3:1, applies. | S |
| 2 | No white flash before the dark page | Opening a puzzle no longer blinks white, then black | [MDN, `color-scheme`][mdn-color-scheme] (the meta tag "before any CSS… helping prevent unwanted screen flashes during the page load"); `docs/research/dark-page/dark-page-saved-color.md` | The header is `@run-at document-idle`, and every rule is gated on `body:has(#svgrenderer)` (`BOARD`), so the page is SudokuPad's white until the script runs and a board exists. The saved-color note says "A true no-flash would need `@run-at document-start`". A fix would run at `document-start`, add the page color early, and still leave non-puzzle pages white (the reason for `BOARD`). Open questions, not checked: what SudokuPad paints between first paint and the board, for how long, and how to know at `document-start` that a board will come. The saved color is read through `Framework.getData`, which does not exist yet at `document-start`. A header change also needs `npm run test:tampermonkey`. Probe first. | L |
| 3 | A visible keyboard focus ring on the dark buttons | A keyboard user can see which button has focus | [WCAG 2.2 Understanding 2.4.13][wcag-2413]; [WCAG 2.2 Understanding 2.4.7][wcag-247]; [MDN, `:focus-visible`][mdn-focus-visible] | SudokuPad's `style.css` has `button:focus { outline:none; box-shadow: 0 0 1px 0px rgba(0, 0, 0, 0.3); }`. That black shadow cannot be seen on `BUTTON_BG` `#2a2a2a` or a black page. Add to the `darkButtons` list in `buildCss`: `${group} button:focus-visible { outline: 2px solid #d2a8f0; outline-offset: 2px }` (`BUTTON_ACCENT`). Contrast: 10.6:1 against `#000`, 7.24:1 against `#2a2a2a`, so 2.4.13's 3:1 and 2px perimeter are met. `:focus-visible` keeps it off mouse clicks. Focus reaches these buttons only when Tab is not taken by the letter tool (Letter Tool off) or on a held Tab (see No Tab Letters' note), so it shows rarely. | S |
| 4 | The page color previews live while the picker moves | You see the color on the page before you press Save, and Cancel puts the old one back | [Rauno Freiberg, "Invisible Details of Interaction Design"][rauno] (section "Responsive Gestures": "feeling the scale delta applying immediately"); [NN/g, 10 Usability Heuristics][nng-heuristics] (#1, feedback "ideally, immediately"; #3, a clear Cancel) | In `openDialog`, the `input` listener only sets `picked` ("`input` fires while the picker moves"). Also set `style.textContent = buildCss(picked)` there and in the Black button's handler. Restore `buildCss(pageColor)` on Cancel and on any close without Save. Risk: Escape closes SudokuPad's dialog with no handler of ours ("Escape needs no handler here"), so the restore needs a hook on the dialog's removal, or a preview could stick. Not checked: how much page the dialog leaves visible (`centerOverBoard` places it over the board) and how much `.dialog-overlay` dims it. | M |
| 5 | Dim panel icons stay readable on a dark page | The settings, fullscreen, rules, help and restart icons are a bit easier to find | [WCAG 2.2 Understanding 1.4.11][wcag-1411]; [Apple HIG, Dark Mode][hig-dark] (icons may need changes to read on a dark background) | SudokuPad draws `.controls-small button .icon svg` at `opacity: 40%` and `100%` on hover. On a dark page their color is `BUTTON_ACCENT` (`fill: currentColor`), so 40% over `#2a2a2a` gives about `#6d5c79`. The screenshot `dark-page.png` shows (109, 92, 121) there, a 2.36:1 contrast. 55% gives 3.25:1, 60% gives 3.59:1. Add `.controls-small button:not(:hover) .icon svg { opacity: .55 }` to `darkButtons`. Not verified: stock's own contrast. If the icons are `#6a1b9a` on `#eee`, stock is about 2.12:1, so SudokuPad dims them on purpose and the dark page already matches that. This is a choice to raise them, not a fix. | S |
| 6 | Hover and press states on the dark buttons | A dark button answers the pointer, as a light one does | [Material Design 3, State layers][m3-state] (hover +8%, focus +10%, press +10%, in the content color) | `darkButtons` forces `background-color: #2a2a2a !important`, which beats SudokuPad's `button:hover { background-color: #f3e5f5; }`. Digit and mode buttons keep a `brightness(1.25)` filter on hover, and undo shows no hover with or without the script (`sudokupad-theme-colors.md`). An 8% layer of `#d2a8f0` over `#2a2a2a` is `#37343a` on `:hover`, and 10% is `#3b373e` on `:active`, for the non-selected darkened buttons. Hover need not contrast with the rest state (1.4.11), so this is feel, not compliance. | S |
| 7 | Dark scrollbars on a dark page | A scrollbar, if the page scrolls, is no longer a white stripe on black | [MDN, `color-scheme`][mdn-color-scheme] (canvas, scrollbars, form controls, spellcheck) | Add `:root:has(#svgrenderer) { color-scheme: dark }` when `textColorFor` gives light text. Keep SudokuPad's white surfaces light with `.dialog, .mdc-drawer { color-scheme: light }`, or their form controls turn dark on white. Not checked: whether a SudokuPad puzzle page ever shows a page scrollbar on desktop. If it never does, this row does nothing. | S |

## Already done or filed

- Dark control buttons on a dark page: #52 (closed). `buildCss`'s `darkButtons`, `BUTTON_BG` / `BUTTON_ACCENT` / `BUTTON_BORDER`.
- A settings dialog to pick the page color: #34 (closed). `openDialog`, with a Black reset.
- The replay readout readable on black: #100 (closed). `.controls-input::after` rule.
- The board kept white through SudokuPad's own `--body-bg` by CSS: #444 (closed); the earlier margin issue #96 (closed).
- The saved color written into the first stylesheet, so the default black never shows first: `dark-page-saved-color.md`. This fixes a black-then-color flash. It does not fix the white-then-dark flash in row 2.
- Copy and paste settings between browsers: #246, #340 (closed).
- Light text or dark text chosen by contrast with the page color: `textColorFor` from `lib/color-math` (#336). Row 1 tightens it.
- Selected buttons keep SudokuPad's fill and get an accent border, so the on state still shows: `buildCss`.
- Pages with no board keep their own colors: the `BOARD` gate.
- Search run: `gh issue list --repo caneff/sudokupad-scripts --state all --search "Dark Page" --limit 100`. No open issue covers any row above. The only open hit is #522 (live-suite skip lines), which is unrelated.

## Considered and dropped

- **`<meta name="theme-color">`**: desktop browsers ignore it for a normal tab. MDN's compatibility data says Chrome "uses the color only on installed progressive web apps", Safari 26 only for installed web apps, and Firefox not at all ([MDN, theme-color][mdn-theme-color]; [browser-compat-data][bcd-meta]). SudokuPad's top bar is purple anyway.
- **A transition when the color changes**: a change is rare and happens as the dialog closes. A `background-color` transition on `body` would also animate the white-to-dark switch when the board appears, which stretches the flash in row 2. Rauno argues that frequent, low-novelty interactions should not animate ("Frequency & Novelty").
- **A dark `::selection` color**: MDN says "Don't override selected text styles for purely aesthetic reasons" ([MDN, `::selection`][mdn-selection]), and the dark page holds almost no selectable text (the footer line).
- **`accent-color`**: it styles checkboxes, radios and range inputs ([MDN, `accent-color`][mdn-accent]). The dark page has none, and Dark Page's own dialog has only a color input, on SudokuPad's white dialog.
- **Caret color**: there is no editable text on the dark page. Dialog inputs sit on white.
- **Dark versions of SudokuPad's dialogs and menu drawer**: that would rebuild SudokuPad's dark mode, which is not supported. A white dialog over a dark page also reads as raised, which matches Apple's guidance that elevated surfaces are brighter ([Apple HIG, Dark Mode][hig-dark], iOS base and elevated).
- **Near-black (`#121212`) in place of pure black as the default**: Google's reasons for dark grey are that shadows show and light text strains less ([Material, Dark theme (Android)][m2-android-dark]; [Google codelab, Design a dark theme][codelab-dark]). The dark page has no shadows and very little light text. The script promises "black", and a user can already pick `#121212`. This is the owner's call, not polish.
- **Dimming the white board against halation**: Apple suggests darkening a white content image so it does not "glow" ([Apple HIG, Dark Mode][hig-dark]). But Dark Page keeps puzzle colors exactly as set, and the board's white is the puzzle's.
- **Following the OS with `prefers-color-scheme`**: this is a new feature, not polish, and SudokuPad's own `prefers-color-scheme: dark` rule in `style.css` is commented out ([MDN, `prefers-color-scheme`][mdn-pcs]).
- **Button borders that reach 3:1 against the page**: `#4a4a4a` on black is 2.37:1. But 1.4.11 does not require a boundary when the button's own text or icon shows it is a control ([WCAG 2.2 Understanding 1.4.11][wcag-1411], "Boundaries"). The digits and icons do.
- **The notice bar's purple on black (2.24:1)**: the bar's white text has plenty of contrast, and the bar comes from shared `lib/sudokupad.js`, outside this script.

## Coverage

Code and notes opened:

- `dark-page.user.js`: header, `buildCss`, `openDialog`, `saveColor`, the startup read, and the shared blocks (`lib:color-math`, `lib:settings-dialog`, `lib:settings-transfer`, `lib:sudokupad`).
- `docs/research/dark-page/dark-page-saved-color.md`, `docs/research/sudokupad-theme-colors.md`, `docs/research/sudokupad-dialog-slide-in.md`, and the dialog lines of `docs/research/sudokupad-page-layers.md`.
- `docs/research/dark-page/dark-page.png`. Pixels sampled with PIL: button `#2a2a2a`; dim icon (109, 92, 121); accent glyphs `#d2a8f0`.
- `site/index.html`, the Dark Page row.
- SudokuPad served files, 2026-11-08: `style.css` (focus, hover, `.controls-small` opacity, the commented-out `prefers-color-scheme` rule) and `sudokupad-colors.css`. Neither the landing page nor the app page has a `theme-color` or `color-scheme` meta.

Web pages read:

- [mdn-color-scheme]: MDN, "`color-scheme`", last modified 2026-07-21.
- [mdn-theme-color]: MDN, "`<meta name="theme-color">`", last modified 2026-04-22.
- [bcd-meta]: MDN browser-compat-data, `html/elements/meta.json` (theme-color support notes).
- [mdn-accent]: MDN, "`accent-color`", last modified 2026-09-16.
- [mdn-selection]: MDN, "`::selection`", last modified 2026-04-17.
- [mdn-focus-visible]: MDN, "`:focus-visible`".
- [mdn-pcs]: MDN, "`prefers-color-scheme`".
- [wcag-143], [wcag-1411], [wcag-247], [wcag-2413]: W3C WAI, Understanding WCAG 2.2.
- [wcag-2411]: W3C WAI, Understanding 2.4.11. Read; nothing on the dark page hides focus.
- [hig-dark]: Apple, Human Interface Guidelines, "Dark Mode", undated.
- [m3-state]: Google, Material Design 3, "States: State layers", undated.
- [m2-android-dark]: Google, Material Design, "Dark theme" (Android develop docs), undated.
- [codelab-dark]: Google, "Design a dark theme with Material and Figma", Liam Spradlin, undated.
- [rauno]: Rauno Freiberg, "Invisible Details of Interaction Design", July 2023.
- [nng-heuristics]: Jakob Nielsen, NN/g, "10 Usability Heuristics for User Interface Design", 1994, last reviewed 2024-01-30.
- [nng-dark]: Raluca Budiu, NN/g, "Dark Mode vs. Light Mode: Which Is Better?", 2020-02-02. Read for background. NN/g says it has not run its own dark-mode research, so no row rests on it.

Pages re-read after the first fetch came back weak:

- Apple HIG "Dark Mode": WebFetch was empty. `mcp__c4ai__md` was empty (fit) or gave only the site's navigation (raw). The text came from Apple's own JSON for the page (`developer.apple.com/tutorials/data/design/human-interface-guidelines/dark-mode.json`), and an Exa search returned the same text from `dark-mode.md`. The content did not change between those two reads.
- Material 2 "Dark theme" design page (`m2.material.io/design/color/dark-theme.html`): WebFetch, `mcp__c4ai__md` and Exa all returned only the "Material 2 is no longer maintained" banner, and a Wayback copy was blocked. Not read. Its #121212 and desaturation guidance is cited from Google's Android dark theme docs and Google's codelab instead.
- Material 3 "State layers": WebFetch and `mcp__c4ai__md` were empty. The text, with the hover 8%, focus 10%, press 10% and drag 16% values, came through an Exa search result for the same URL.
- WCAG 1.4.3: `mcp__c4ai__md` was blocked by Cloudflare. It was read through Exa instead.

Looked for and not found, or not checked:

- What the page shows between first paint and the board, and for how long (row 2).
- Whether a puzzle page ever shows a page scrollbar on desktop (row 7).
- The stock color of the dim panel icons (row 5).
- How `.dialog-overlay` dims the page under Dark Page's dialog (row 4).
- How rules text and SudokuPad's menu drawer look on a dark page. No note covers either.

[mdn-color-scheme]: https://developer.mozilla.org/en-US/docs/Web/CSS/color-scheme
[mdn-theme-color]: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/theme-color
[bcd-meta]: https://github.com/mdn/browser-compat-data/blob/main/html/elements/meta.json
[mdn-accent]: https://developer.mozilla.org/en-US/docs/Web/CSS/accent-color
[mdn-selection]: https://developer.mozilla.org/en-US/docs/Web/CSS/::selection
[mdn-focus-visible]: https://developer.mozilla.org/en-US/docs/Web/CSS/:focus-visible
[mdn-pcs]: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme
[wcag-143]: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
[wcag-1411]: https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html
[wcag-247]: https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html
[wcag-2411]: https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html
[wcag-2413]: https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html
[hig-dark]: https://developer.apple.com/design/human-interface-guidelines/dark-mode
[m3-state]: https://m3.material.io/foundations/interaction/states/state-layers
[m2-android-dark]: https://m2.material.io/develop/android/theming/dark
[codelab-dark]: https://codelabs.developers.google.com/codelabs/design-material-darktheme
[rauno]: https://rauno.me/craft/interaction-design
[nng-heuristics]: https://www.nngroup.com/articles/ten-usability-heuristics/
[nng-dark]: https://www.nngroup.com/articles/dark-mode/
