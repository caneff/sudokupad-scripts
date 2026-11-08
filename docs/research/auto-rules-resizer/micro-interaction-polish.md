# Auto Rules Resizer: small polish touches for the fitted rules

Research for `auto-rules-resizer.user.js` v0.3.16, done 2026-11-08. Desktop only. Phones, tablets and SudokuPad's own
dark mode are out of scope.

## Verdict

The fit is sound. The best small win is the text inside the pane: SudokuPad leaves `line-height` at `normal` (about
1.17 for Roboto), below the 1.2 floor every source gives. The second is the measure: one wide pane reached about 100
characters a line.

## What the script does today (read before ranking)

- `fitRulesPane` clears the last fit, measures the pane at SudokuPad's own layout, then `autoPaneFit` picks the
  narrowest width (from SudokuPad's own, up to `rulesWidth`) and the largest whole-pixel font (`largestSize`,
  `autoFontPx`) at which `scrollHeight <= room`. The font never drops below SudokuPad's 1.1rem (17.6px) and never goes
  above `MAX_FONT_PX` (200).
- The fit runs on every `app.resizeBoard` (wrapped), and on `window` resize trailing by `RESIZE_MS` (100ms).
- `overflow-wrap: anywhere` is set for the measuring and stays on the pane after the fit.
- f+ / f- nudge the font a pixel. Two corners drag the pane. The settings cap the automatic width and height.
- Nothing animates.

SudokuPad's own rules UI, read from `https://sudokupad.app/style.css?v=0.611.0` (lines 706-736) and `script.js`
(`P.showMetaInfoUI`, `P.getRules`) and `utilities.js` (`textToHtml`), all v0.611.0:

- `.puzzle-rules`: `max-width: 30rem; max-height: 14rem; overflow-y: scroll; padding: 1rem; font-size: 1.1rem`. No
  `line-height`. Font is `Roboto, Arial, sans-serif` from `html, body`.
- Rules are plain text. `textToHtml` escapes them and turns each newline into `<br />`. There are no `<p>` elements.
- `.rules-copy`, a 24px copy icon, sits at `left: -0.25rem; top: 3.75rem` of `.controls-info`. It is `opacity: 0` until
  hovered, `z-index: 10`.
- Other SudokuPad features write into the pane after it is shown: `feature-gridrules.js` appends per-grid rules (then
  calls `app.resize()`), `feature-sudokupadpro.js` inserts a support link at the pane's start, and `feature-emoji.js`
  swaps emoji for 1em `<img>` tags. The last two do not call `app.resize()`.
- The page has `<html lang="en">`.
- No SudokuPad stylesheet styles scrollbars (searched all seven `.css` files the app page loads).

### What I measured (headless Chromium, 1920x1080, recorded puzzle, script injected)

The probe script is outside the repo, in this session's scratchpad. These are its numbers:

| Case | Before the script | After the fit |
| --- | --- | --- |
| Short rules (139 chars) | 17.6px, 480 css px wide, 3 lines | 18px, 480 wide, 3 lines, about 46 chars a line |
| One line (26 chars) | n/a | 19px, 283 wide |
| Very long rules (5,599 chars) | n/a | 17.6px, 807 css px wide, 56 lines, **about 100 chars a line**, still scrolls (1,152 of 227 px) |

- Line height: the short pane is 95 css px tall with 32 px of padding, so 63 px for 3 lines at 18px is about **1.17**.
- `overflow-wrap` reads `anywhere` after the fit.
- Scroll: scrolled to 555 of 925 px, then `app.resize()` kept 555 of 925. A 20px narrower window kept 555 px, now of
  885: the pixel offset holds, the place in the text moves a little (60% to 63%).
- Cost: `app.resize()` took 0.3ms without the script and 0.8ms with it (short rules, mean of 10), and 6.7ms once with
  the very long rules.
- The font bar overlaps SudokuPad's copy icon: the bar is at x 1066-1136, y 359-379, the icon at x 1061-1092,
  y 370-401. They share a 26 x 9 px patch at the top-left corner of the pane.
- Headless Chromium draws no scrollbar on the pane (`offsetWidth - clientWidth` is 0). It uses overlay scrollbars.
  **I could not check Windows Chrome.** It uses classic scrollbars, and on Windows the pane may show an empty
  scrollbar track.

## Ranked candidates

Ranked by how much the feel improves for the cost. Cost: S is a few lines, M is a header change or a new test seam,
L is a redesign. Any change to what the pane shows also means retaking `docs/research/auto-rules-resizer/auto-rules-resizer.png`
and running `node tag-pictures.js` (AGENTS.md). That work is not counted in the costs below.

| # | Touch | What the user feels | Source | How it maps to this script | Cost |
| --- | --- | --- | --- | --- | --- |
| 1 | Give the fitted pane a line height of about 1.3 | Lines stop feeling cramped. The eye finds the next line more easily, and three lines or more read as calm text, not a block. | Butterick, [line spacing](https://practicaltypography.com/line-spacing.html): "between 120% and 145% of the point size". Apple HIG, [Typography](https://developer.apple.com/design/human-interface-guidelines/typography): "If you need to display three or more lines of text, avoid tight leading even in areas where height is limited." M3 `bodyLarge` is Roboto 16/24, a 1.5 ratio ([Android Developers, Material Design 3 in Compose](https://developer.android.com/develop/ui/compose/designsystems/material3)). | Measured 1.17 today. Add `line-height: 1.3` to `.puzzle-rules` in the script's `STYLE`, scoped to `body.auto-rules-resizer-shown`. Then `fitRulesPane` measures with it, and the fit gives back about a pixel of font (18 to about 17 at 1920x1080, a guess). Use the stylesheet, not `rules.style`, so a user's own text-spacing override (WCAG 1.4.12, line 1.5) still wins. The fit measures real layout, so it stays correct under that override. | S |
| 2 | Hide the empty scrollbar track when the rules fit | No dead grey bar beside rules that do not scroll. The pane looks finished, not like a box that "might" scroll. | CSS Overflow 3, [`overflow: scroll`](https://drafts.csswg.org/css-overflow-3/#valdef-overflow-scroll): the scroll bar "should be displayed whether or not any of its content is clipped". `auto` shows one only when there is overflow. | SudokuPad sets `overflow-y: scroll` (style.css line 709). Once `fitRulesPane` finds the rules fit, set `overflow-y: auto` (add `overflowY` to `FIT_STYLES` so `clearFit` removes it). The fit then gains the track's width, about 15-17px on Windows. **Not verified**: headless Chromium uses overlay scrollbars. Take a Windows screenshot before building this. | S |
| 3 | `text-wrap: pretty` on the pane | Fewer one-word last lines and a more even right edge. Nobody notices, but the block looks typeset. | MDN, [`text-wrap`](https://developer.mozilla.org/en-US/docs/Web/CSS/text-wrap) (modified 2026-08-27): pretty is "intended for body copy ... when the number of orphans should be kept to a minimum". CSS Text 4, [pretty](https://drafts.csswg.org/css-text-4/#valdef-text-wrap-style-pretty): the UA "may ... attempt to avoid excessively short last lines". | One line in `STYLE`. `largestSize` already measures real layout, so the fit stays correct. The spec warns of a speed cost on large text. The fit lays out the pane about 20 times a run (two binary searches), so time `app.resize()` with the 5,600-character rules before and after (6.7ms today). Each `<br>` ends a line by force. I did not check whether Chromium treats the text between two `<br>` as its own paragraph for `pretty`. | S |
| 4 | Do not widen past a readable measure when widening cannot stop the scroll | Very long rules stay in comfortable lines (about 75-90 characters), not 100-character lines that are hard to track. | Butterick, [line length](https://practicaltypography.com/line-length.html): "an average line length of 45–90 characters". NN/g, [How Chunking Helps Content Processing](https://www.nngroup.com/articles/chunking/) (Kate Moran, 2016-03-20): "Short text lines of text (around 50–75 characters)". | Measured: 5,599 characters went to 807 css px, about 100 chars a line, **and still scroll**. In `autoPaneFit`, `narrowest` returns the full `widthLimit` when no width fits. That widening only shortens the scroll. Two options: cap `rulesWidth` at about `90ch` (Roboto's `ch` is about 0.55em, so about 870 css px at 17.6px; work it out from `ch`, not px); or when even `widthLimit` scrolls, keep SudokuPad's width. The first is the smaller change. This changes ruling 5 of #239 ("widen only as far as it takes to stop the scroll") only where no width stops the scroll, so put it to Chris. | S |
| 5 | Move the f+/f- bar off SudokuPad's copy icon | f+ and the copy icon stop competing for the same corner. A pointer reaching for "copy rules" does not land on f+. | SudokuPad's own `.rules-copy` (style.css lines 722-736, v0.611.0). Overlap measured above. | `placeControls` puts the bar at `r.left`. Start it right of the icon instead (`r.left + 32` visual px at scale 1.3, or the icon's `getBoundingClientRect().right`). The bar's z-index 99999 is over the icon's 10 now, so the icon is the one that loses. | S |
| 6 | Refit when the rules' text changes with no layout pass | No stale fit after SudokuPad adds a support link or emoji images: no surprise scrollbar, no unused room. | fitty, `observeMutations` with `{subtree, childList, characterData}` ([src/fitty.js L210-L226 at 3102952](https://github.com/rikschennink/fitty/blob/310295262598fc88dfc330c169cb55d20f316b6b/src/fitty.js#L210-L226)), and frame batching in `requestRedraw` ([L21-L31](https://github.com/rikschennink/fitty/blob/310295262598fc88dfc330c169cb55d20f316b6b/src/fitty.js#L21-L31)). | Today the fit runs only on `resizeBoard` and window resize. `feature-sudokupadpro.js` (`insertAdjacentHTML('afterbegin', ...)` into `.puzzle-rules`) and `feature-emoji.js` (`twemoji.parse(el)`) change the pane without `app.resize()`. In `start`, add a `MutationObserver` on the pane (childList, subtree, characterData; not attributes, so the fit's own style writes do not loop) that calls `makeTrailing(fitPage, RESIZE_MS)`. **Not seen live**: I did not catch either feature changing a fitted pane. | S |
| 7 | `hyphens: auto` in narrow panes | A smoother right edge when a large font leaves 30-45 characters a line. Long words break at a hyphen, not at a random letter. | Butterick, [hyphenation](https://practicaltypography.com/hyphenation.html): "As line length gets shorter, hyphenation becomes essential." MDN, [`hyphens`](https://developer.mozilla.org/en-US/docs/Web/CSS/hyphens) (modified 2026-07-21): browsers hyphenate only when `lang` is present. | The page has `lang="en"`, so it works for English rules. Rules in another language would be hyphenated by English rules. Today `overflow-wrap: anywhere` stays on after the fit (`fitRulesPane`), so a long word breaks at any letter with no hyphen. `hyphens: auto` breaks it at a syllable first. Short rules measured 46 chars a line, so this matters most when f+ or a tall window grows the font. | S |
| 8 | Cap the automatic font at a reading size | Very short rules ("Normal sudoku rules apply.") never balloon into a poster in a tall window. | Butterick, [point size](https://practicaltypography.com/point-size.html): web body text "15–25 pixels". M3's largest headline is 32/40 (Android Developers page above). | `MAX_FONT_PX` is 200. At 1920x1080 the fit gave 18-19px, so the cap does not bite there today. It matters only where the room is tall and the rules short. Use a lower automatic ceiling in `autoFontPx` (for example 2 x SudokuPad's own, 35px). Leave f+ uncapped. This is a guess at how often it bites. | S |
| 9 | Keep the reader's place, not the pixel offset, across a refit | After a window resize the line you were reading stays at the top. | CSSOM View, [`scrollTop`](https://drafts.csswg.org/cssom-view/#dom-element-scrolltop) only sets a pixel offset and does not track content. | Measured: 555 px held, but the place moved from 60% to 63% after a 20px narrower window. In `fitRulesPane`, save `scrollTop / (scrollHeight - clientHeight)` before `clearFit` and restore it after the font is set. This matters only for rules that still scroll. | S |
| 10 | No flash of SudokuPad's size before the fit | Rules appear at their final size, with no jump on load. | No primary source found for the flash itself. The fitty `requestRedraw` above batches to a frame. | **Not verified** that a flash is visible. The script runs at `document-idle` after `Framework.getApp()`, so SudokuPad may paint its own size first. A fix needs a `@run-at document-start` style that hides `.puzzle-rules` until `body.auto-rules-resizer-shown`. That is a header change, so the Tampermonkey test applies, and a script that fails must still unhide the pane. Record a page load before deciding. | M |

## Already done or filed

- Whole-pixel font steps (`largestSize` over integers). Good for hinting. f+/f- move one pixel.
- Never under SudokuPad's own font (`autoFontPx`). f- may go below it on purpose (#232).
- Trailing 100ms refit on window resize plus a refit after every `resizeBoard` (#232). Measured cheap (0.8ms).
- Measuring with the last fit cleared, so fits do not creep (`fitRulesPane`, #232).
- Empty rules: SudokuPad hides the pane; `fitRulesPane` sees width 0, clears the fit and hides the controls.
- Very long rules: the font stays at SudokuPad's size and the pane scrolls (#239 ruling 5).
- Height first, widening only when needed, with max auto width and height caps (#239).
- Controls on hover through CSS, not pointer listeners (#439).
- Landscape only (`isLandscape`, SudokuPad's own test).
- Reduced motion: the script animates nothing, so there is nothing to switch off. Keep it that way (see the dropped list).
- Crisp text: SudokuPad sets `-webkit-font-smoothing: antialiased` on `html`.
- Filed: none of the ten candidates appears in `gh issue list --search "Rules Resizer"` or `--search "rules"` (all
  states, read 2026-11-08). The resizer's own issues are #232, #239, #240, #439, #452, #484 and #261.

## Considered and dropped

- **`text-wrap: balance`**: Chromium balances six lines or fewer, and it is meant for headings (MDN `text-wrap`).
- **Debounce or `requestAnimationFrame` batching of the fit**: measured 0.8ms per `app.resize()` with short rules and
  6.7ms with 5,600 characters. There is no jank to remove.
- **Animating the font change**: a font-size transition lays the text out again on every frame. WCAG 2.2 SC 2.3.3
  ([Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html),
  AAA) also asks that motion triggered by interaction can be disabled. Instant is better here.
- **`font-size-adjust`**: it evens out fallback fonts (MDN
  [`font-size-adjust`](https://developer.mozilla.org/en-US/docs/Web/CSS/font-size-adjust), modified 2026-09-16).
  SudokuPad loads Roboto, so it changes nothing.
- **Container queries or `cqi` units in place of the JS fit**: the fit depends on the content's height, and size
  containment exists to stop a container's size depending on its contents (MDN,
  [Using container size and style queries](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_containment/Container_size_and_style_queries),
  modified 2026-10-14).
- **Fractional font sizes**: the gain is under a pixel. f+/f- step a pixel. The unit tests assume whole pixels.
- **Paragraph spacing**: SudokuPad gives the rules as text with `<br>`, with no paragraph elements to space. Adding
  them means rewriting SudokuPad's DOM.
- **WCAG 1.4.10 Reflow** ([Understanding Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)): it is about
  320 css px widths and 400% zoom. The pane scrolls in one direction only. Nothing to change.
- **Changing `overflow-wrap: anywhere` to `break-word` after the fit**: both break an overlong word the same way in
  layout. The difference is in min-content sizing, and I did not show it matters here.
- **Phones and tablets, SudokuPad's dark mode**: standing rejections.

## Coverage

Code and pages opened:

- `auto-rules-resizer.user.js` (all non-lib code), `site/index.html` (the card), `docs/research/auto-rules-resizer/`
  (the picture and its screenshot script), `live/auto-rules-resizer/auto-rules-resizer.live.mjs`,
  `docs/research/sudokupad-page-layers.md`, `docs/research/js-to-css-candidates.md`.
- Issues #232, #239, #240, #439 (bodies), and the titles from both searches.
- SudokuPad v0.611.0: `style.css` (and the other six `.css` files, searched for scrollbars), `script.js`,
  `utilities.js`, `feature-gridrules.js`, `feature-emoji.js`, `feature-sudokupadpro.js`, `feature-puzzlefont.js`, the
  app page's `<html lang>`.
- fitty, `src/fitty.js` at 3102952 (raw file through `curl`).
- Butterick: line spacing, line length, point size, hyphenation (no dates on the pages).
- MDN: `text-wrap`, `hyphens`, `font-size-adjust`, container size and style queries.
- CSS Text 4 (`text-wrap-style`), CSS Overflow 3 (`overflow` values), CSSOM View (`scrollTop`).
- WCAG 2.2 Understanding: 1.4.12 Text Spacing, 1.4.10 Reflow, 2.3.3 Animation from Interactions.
- NN/g: How Chunking Helps Content Processing.
- Apple HIG Typography (change log to 2025-12-16).
- Material 3 type scale through Android Developers' "Material Design 3 in Compose".

Re-read after the tool change:

- NN/g `/articles/line-length-readability/`: empty with WebFetch, and empty again with `c4ai md` (NN/g shows only its
  "AI chat sent you here" notice, so the page does not exist). I found the chunking article instead through
  `exa` search and read it with `c4ai md`. That gave the 50-75 characters figure.
- Material `m3.material.io/styles/typography/type-scale-tokens`: empty with WebFetch, and empty again with `c4ai md`
  (both raw and llm modes). The `exa` search snippet showed the page exists and describes a Major Second scale, but not
  the sizes. I used the Android Developers table instead.
- WCAG 1.4.12, 1.4.10, 2.3.3: WebFetch gave summaries, not raw text. `c4ai md` on 1.4.12 was blocked by a Cloudflare
  JS challenge, so those quotes rest on the WebFetch summary and are not checked word for word.
- Apple HIG: WebFetch returned the full page with tables and change log. I did not re-read it.
- Butterick, MDN and the CSS specs came back as raw page markdown. I did not re-read them.
- fitty: read as a raw file, not a GitHub code view. Not affected.

Looked for and did not find:

- A primary NN/g page on line length itself. The URL commonly cited does not exist.
- Proof of a load flash (candidate 10), of the Windows scrollbar track (candidate 2), and of the emoji or support-link
  features changing a fitted pane (candidate 6). None was checked live.
- How Chromium applies `text-wrap: pretty` across `<br>` breaks.
- Material's own page text for the type scale. That page renders client-side and both tools came back empty.
