# gdc's Puzzle Notes versus Text Anywhere

Question (Chris, 2026-11-08): what else would we need to completely replace gdc's notes extension?

## Where gdc's notes tool is

gdc's site is https://sudokucolors.netlify.app/. Its navigation bar lists Home, Color Picker, Extended Checks, Puzzle Notes and SM2ISS
("Puzzle Notes for SuokuPad" page, https://sudokucolors.netlify.app/puzzlenotes/, link `../puzzleNotes`, in the nav of every page of the site).
The notes tool is a Tampermonkey user script, "SudokuPad Notes" v0.6 by gdc, installed from
https://sudokucolors.netlify.app/user-script/sudokupad-notes.user.js (124 lines; its own `@updateURL` points at the dev site,
https://dev-sudokucolors.netlify.app/user-script/sudokupad-notes.user.js, line 11). I found no Chrome Web Store or Firefox listing and no GitHub
repository for it: the only source is that one file. Search results (not opened further) showed no other gdc notes tool.
The home page (Sudoku Line Colors) does not mention it in its text, only in the nav.

## What gdc's tool does

Everything below is from the page "SudokuPad Puzzle Notes" (https://sudokucolors.netlify.app/puzzlenotes/) or the script file
(`sudokupad-notes.user.js`, line numbers below).

- One floating "Puzzle Notes" panel with a single plain `<textarea>` (lines 16-35). Page: "save notes to SudokuPad puzzles ... a textarea that can be used to capture deductions which don't follow normal candidate-notation."
- Opens from a notes button in SudokuPad's aux buttons at the bottom right, `Framework.addAuxButton({name: "notes", title: "Notes", ...})` (lines 117-124); the same click, or an X in the panel header, hides it (lines 49-51).
- Drag by the header, resize by the textarea's native handle. Page: "resized and dragged across the screen" (also lines 27, 73-115). Starts 450 px from the right edge, 50 px from the top (lines 18-19), 425 x 240 px (line 30).
- "+" and "-" buttons change the font size by 2 px (lines 37-47, start 20 px, line 30), and an "A" button toggles monospace (lines 31, 53-56). Page mentions only the size buttons.
- Saved in `localStorage` as `notes_` plus the URL path, on every input event (lines 61-63). Page: "saved in local storage ... restored." Not saved: panel position, size, font size, monospace, open or closed.
- Keyboard: a capture-phase `keydown` listener stops propagation while the textarea has focus so SudokuPad does not eat Backspace (lines 65-71); mousedown on the panel is stopped too (lines 59, 115).
- Matches sudokupad.app and crackingthecryptic.com and their subdomains (lines 7-10), `@grant none`, `@run-at document-idle`. It calls `Framework.getApp()` with no guard (line 117).
- Not there: formatting of any kind, colors, anything drawn on the board, any settings, undo integration, share or export, import.

## Feature comparison

"Flight" means open and not on main (#609 code, #616 Discord formatting, #605 save while typing, #607 Ctrl+Enter, #630 +/- keys, #629 font choice, #603 outer snap ring). I took the issue list from the request; I did not open the issues.

| gdc feature | Text Anywhere (draw-tool.user.js 0.38.2) |
| --- | --- |
| Free text capture, not candidate notation | Has. Notes typed anywhere on the page, bullets, checklists, symbols as you type (GLOSSARY.md **Text Anywhere**, **notes**). |
| Panel you open from a button, text off the board | Partly. Notes can be pinned beside the board, but the entry point is the Text tool button, not a one-click notepad; no single always-there pad. See gap 2. |
| Movable | Has (select, move, nudge, snapping). Outer snap ring in flight (#603). |
| Resizable | Has (resize a note's box). |
| Font size +/- | Has a Size slider (GLOSSARY.md **Size slider**); +/- size keys in flight (#630). |
| Monospace toggle | In flight, font choice proportional/fixed (#629); inline code and code blocks in flight (#609). |
| Saved per puzzle in local storage | Has, keyed by puzzle id or URL, last 50 puzzles (GLOSSARY.md **notes**). Save while typing in flight (#605); gdc saves on every keystroke today. |
| Remembers a hidden panel | Not applicable: notes stay on the page. |
| Keystrokes shielded from SudokuPad shortcuts | Has, by the nature of the typing box (not re-read this session). |
| Reads gdc's saved notes | Lacks. gdc's text sits in `notes_<path>` and nothing of ours reads it (no `notes_` key in `draw-tool.user.js`). |
| Colors, background box, outline, bold, italic, strike, transparency | Ours only; gdc has none. |
| Undo after Restart, settings copy/paste | Ours only. |
| Ctrl+Enter to finish | In flight (#607); gdc has no such need. |
| Discord formatting (underline, headers, subtext, nested and numbered lists) | In flight (#616); gdc has none. |

## Gaps that would matter for someone switching, ranked

1. Importing existing gdc notes. A user who has used gdc's tool for a while has text in `localStorage` under `notes_<path>`. Without a one-time import they lose it, or must copy by hand. A small import on first load (read each `notes_*`, make one note for the puzzle, leave gdc's key alone) closes it. Not verified against a real browser; the key shape comes from line 61 of the script.
2. A one-click notepad. gdc's is a button that shows and hides one panel with the whole text, always at the same size. Ours needs the Text tool picked and a note placed. Closest fix: a button that shows and hides all notes, or opens a "scratch note" pinned beside the board. This is the main behavioral difference; the rest is detail.
3. Save while typing (#605). gdc keeps every keystroke; ours should too before anyone trusts it as a notepad. In flight.
4. Fixed-width text (#629, #609). gdc has a monospace toggle; in flight.
5. Size keys (#630). In flight; the slider already covers size.
6. Plain multi-line text with SudokuPad key shortcuts shielded (Backspace, digits). Probably present; worth one live test that a long multi-line note keeps its keystrokes.

Nothing else in gdc's tool is missing from ours. Features gdc has that are out of scope for us: none found, since the tool has no phone, right-drag or dark-mode code. Its `@match` and `Framework` use equal ours.

## Sources opened

Opened in full: https://sudokucolors.netlify.app/ (page and raw HTML), /user-script/ and /extendedchecks/ pages and raw HTML (and the dev-sudokucolors copies of the three), /puzzlenotes/ raw HTML, and the script file. Not opened: the page image `www/puzzleNotes.png` (downloaded only), the YouTube video, the issues named above. Seen only in search results: thatcomputerguy0101/SudokuPad_Extensions, mj6robinson/SudokuPad-Extra-Tools (neither is a gdc tool). Tried and returned 404 (so no other notes URL): /notes, /notepad, /sp_notes.user.js, /user-script/notes.user.js.
