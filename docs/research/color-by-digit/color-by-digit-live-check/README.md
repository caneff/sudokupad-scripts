# Live check of color-by-digit, 2026-11-02

Scratch scripts run against sudokupad.app 0.611.0 in headless Chromium, using the
global Playwright. Nothing imports or runs them. The script was injected into the
page, not installed through Tampermonkey, so Tampermonkey's real injection time and
`crackingthecryptic.com` are both untested.

## Result

`run.mjs` makes 37 checks, covering the four owed checks of #1 plus the editor,
palette read and selection restore.

| Script | Injected | Result |
|---|---|---|
| `main` at `19959a3` | at `DOMContentLoaded` (3 runs) | 36 of 37; only the blank button fails |
| `main` at `19959a3` | after load, before Start Puzzle | 36 of 37; only the blank button fails |
| `implement-3` at `f6492fe` | at `DOMContentLoaded` | 37 of 37 |
| `implement-3` at `f6492fe` | after load, before Start Puzzle | 37 of 37 |
| `main` at `9918246` (PR #4) | at `DOMContentLoaded` | 37 of 37 |
| `main` at `9918246` (PR #4) | after load, before Start Puzzle | 37 of 37 |

`click.mjs` clicks the button once on a puzzle holding 30 givens:

| Script | Injected | Cells colored |
|---|---|---|
| `main` | before Start Puzzle | 30 |
| `main` | after Start Puzzle | 0 |
| `implement-3` | before Start Puzzle | 30 |
| `implement-3` | after Start Puzzle | 30 |
| `main` at `9918246` (PR #4) | before Start Puzzle | 30 |
| `main` at `9918246` (PR #4) | after Start Puzzle | 30 |

The `main` rows above the PR #4 rows are `19959a3`, before the fix.

## What this shows

- A dead click before PR #4 depended on timing. The button worked when it was added before
  Start Puzzle and did nothing when it was added after. Issue #3 reports the dead
  click without that condition.
- Which case a real Tampermonkey install hits is not measured. `@run-at document-idle`
  points at the working case, but a puzzle that opens with no overlay was not tried.
- The `app.refreshControls()` call from PR #4 fixes the late case.
- `refreshControls` does not double-bind Undo: check 3b takes one undo from a stacked
  cell and it keeps its own color. Restart was not clicked.
- The text label before PR #4 was hidden by `font-size: 0` from
  `.controls-app button, .controls-tool button, .controls-aux button` in `style.css`.

## Running it

`puzzle-url.txt` holds a self-contained `scl` link built with `sudokupad-art`'s
`codec.dump_scl`. The path form works; `/?puzzle=` gives a 404 page. A plain `/` is a
landing page with no `Framework`.

`SCRIPT=<path> INJECT=late node run.mjs`. Both variables are optional.

The red on r1c4 and r1c5 in `run.mjs`'s screenshots is SudokuPad's conflict highlight,
because the test enters a 7 beside a given 7.
