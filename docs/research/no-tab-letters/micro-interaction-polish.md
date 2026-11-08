# No Tab Letters: small touches that would make it feel more polished

Researched 2026-11-08 against `no-tab-letters.user.js` 0.1.4 and SudokuPad 0.611.0 (`script.js?v=0.611.0`, `tool-letter.js`,
`tool-letter.css`, `style.css`, fetched the same day). Nothing below was run on the page.

**Verdict:** the script is nearly complete as it stands. One gap is worth a live check: a held Tab may still move focus. One
tooltip touch is optional. Feedback for a swallowed Tab would make it worse.

## Ranked candidates

| # | Touch | What the user feels | Source | How it maps to the script | Cost |
| --- | --- | --- | --- | --- | --- |
| 1 | A held Tab is swallowed too, not only its first press | Leaning on Tab no longer moves focus onto the menu button, where a later Space or Enter would press it | [NN/g, 10 Usability Heuristics][nng-heuristics] (#5, Error Prevention: "Avoid slips by providing helpful constraints"); SudokuPad `script.js` | SudokuPad's `App.handleKeydown` starts with `if(event.repeat) return;`, before `handleToolKeyHandlers`. So the swapped Tab entry (`withInertTab` / `ignoreKey`) runs only on the first keydown. Auto-repeat keydowns are not prevented, in stock SudokuPad and with the script. `sudokupad-letter-tool.md` says a Tab that is not prevented moves focus to the app menu button. The fix would be a capture `keydown` listener on `document` that calls `preventDefault` when `event.key === 'Tab' && event.repeat`, only while `ToolLetter.tool` is in `Framework.app.tools` and no `.dialog` is open, so dialogs keep normal Tab. It would run under the existing `tab` feature. **Not verified:** that browsers move focus on a repeated Tab keydown here. A live test that holds Tab should come first. | S |
| 2 | The letter button's tooltip names what it does | Hovering the button says "Letters (/)", not a bare "/", so the remaining key is easy to learn | [NN/g, "Modes in User Interfaces"][nng-modes] ("text labels for mode-selector icons, and tooltips that help establish what happens when that mode is active") | `tool-letter.js` creates the button with `title: '/'` in `P.enable`. Once Tab is inert, "/" is the only key, so the tooltip is right but terse. The script could set `title` to `Letters (/)` on `button[data-control="toggleletter"]` after the tool is enabled. `P.enable` reuses the button once made, but `P.disable` removes it, so this needs a hook on enable. This would be the script's first change to SudokuPad's visible UI, a scope step for a script whose description promises only the Tab key. Low value. | S |

## Already done or filed

- The script itself: #55 (closed). Tab's entry in `ToolLetter.tool.keyHandlers` gets a handler that only calls `preventDefault` (`withInertTab`, `ignoreKey`).
- Focus does not move on a Tab in play: kept on purpose ("SudokuPad's toggle handler also stops Tab's default, so focus stays on the puzzle; keep that").
- Shift+Tab is covered. SudokuPad's `App.isKey` matches `event.key`, which is `Tab` with Shift too, so Shift+Tab hits the same inert entry.
- Tab in dialogs is untouched. SudokuPad's key handlers do not act there (live run in `sudokupad-letter-tool.md`).
- Tab when the Letter Tool is off is untouched. The tool leaves `app.tools`, so its key handlers, the swapped one included, never run.
- A bar says so if SudokuPad changes and the Tab feature turns off: the shared guard (#452), feature `tab`.
- Headers match the homepage text: #288 (closed).
- Search run: `gh issue list --repo caneff/sudokupad-scripts --state all --search "Tab" --limit 100`. No issue covers either row. The only open hit is #522 (live-suite skip lines), which is unrelated.

## Considered and dropped

- **A quiet sign that a Tab was swallowed** (a flash on the letter button, a toast): a swallowed Tab changes nothing, and nothing happening is what the user wants. NN/g's first heuristic asks for feedback on "action[s] with consequences", and this one has none ([NN/g, 10 Usability Heuristics][nng-heuristics]). Rauno notes that a frequent keyboard action with no novelty should not animate ("Frequency & Novelty", [Rauno Freiberg][rauno]). A flash on every stray Tab would draw the eye in mid-solve.
- **A stronger letter-mode indicator**: SudokuPad already shows the mode twice. The number pad turns to letters (`showHideLetters`), and the toggle button swaps its glyph from "9 /A" to "9/ A" (`tool-letter.css`, `.input-digit` / `.input-letter`). That meets NN/g's advice of "at least two visual indicators" for a mode ([NN/g, "Modes in User Interfaces"][nng-modes]).
- **Letting Tab move focus again** (dropping the entry, not swapping its handler): focus would land on the app menu button in play (`sudokupad-letter-tool.md`). For mouse-and-keyboard solvers that is a new slip, not a fix.
- **A keyboard-trap fix for WCAG 2.1.2**: the script adds no trap. 2.1.2 is about focus that cannot be moved away from a component ([WCAG 2.2 Understanding 2.1.2][wcag-212]). In play, stock SudokuPad already keeps Tab from moving focus while the Letter Tool is on, and the script keeps exactly that. With the tool off, or in a dialog, Tab moves focus as before. Whether SudokuPad itself meets 2.1.2 is SudokuPad's question.
- **A focus ring on SudokuPad's buttons**: SudokuPad sets `button:focus { outline:none; … }`. That is SudokuPad's styling and not something this script touches. For a dark page it is row 3 of the Dark Page note.
- **Undoing a letter mode saved before the script was installed**: `ToolLetter_letterMode` is saved per browser profile, and the script cannot tell a stray Tab's save from a deliberate one. The letter button or "/" switches it back.

## Coverage

Code and notes opened:

- `no-tab-letters.user.js`, the whole file.
- `docs/research/sudokupad-letter-tool.md`.
- `site/`: `grep -i "no-tab\|tab letter\|stray tab" site/*.html` finds nothing. No site page mentions No Tab Letters, so there is no
  text or picture to read. AGENTS.md says every script has an install link on the homepage, so this is a doc-versus-site gap for the
  owner to rule on.
- SudokuPad served files, 2026-11-08:
  - `tool-letter.js`: `keyHandlers`, `handleToggleKey`, `setLetterMode`, `showHideLetters`, `enable` / `disable`, the toggle button's `title: '/'`.
  - `tool-letter.css`: the toggle glyph per mode.
  - `script.js?v=0.611.0`: `App.isKey`, `App.handleKeydown` with its `event.repeat` early return, `handleToolKeyHandlers`, and the keydown listener on `document` in capture.
  - `style.css`: `button:focus`.

Web pages read:

- [wcag-212]: W3C WAI, "Understanding SC 2.1.2: No Keyboard Trap" (WCAG 2.2).
- [wcag-2413]: W3C WAI, "Understanding SC 2.4.13: Focus Appearance" (WCAG 2.2). Read; nothing here changes focus appearance.
- [nng-modes]: Page Laubheimer, NN/g, "Modes in User Interfaces: When They Help and When They Hurt Users", 2019-04-14.
- [nng-heuristics]: Jakob Nielsen, NN/g, "10 Usability Heuristics for User Interface Design", 1994, last reviewed 2024-01-30.
- [rauno]: Rauno Freiberg, "Invisible Details of Interaction Design", July 2023.

Pages re-read after the first fetch came back weak: none. The pages here read fully the first time. The only weak reads in
this session were for the Dark Page note (Apple HIG, Material).

Looked for and not found, or not checked:

- Whether a held Tab really moves focus on sudokupad.app (row 1). It was read from source only.
- Whether any sudokupad.app element besides the menu button takes focus in play.
- Any NN/g or WCAG page on swallowed keystrokes. None found beyond the general heuristics above.

[wcag-212]: https://www.w3.org/WAI/WCAG22/Understanding/no-keyboard-trap.html
[wcag-2413]: https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html
[nng-modes]: https://www.nngroup.com/articles/modes/
[nng-heuristics]: https://www.nngroup.com/articles/ten-usability-heuristics/
[rauno]: https://rauno.me/craft/interaction-design
