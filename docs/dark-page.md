# Dark Page

> [!WARNING]
> **This script can break at any time, and there are no guarantees.** It relies on SudokuPad's internals, which aren't a public API, so any SudokuPad update can break it without notice.

The full reference. What a solver sees is in the README's script notes; this page adds how it does it. What every script shares, the settings dialog and the guard, is in [What every script shares](shared.md).

Dark Page paints the page outside the board the page color, black unless the solver picks another, and darkens the control buttons, the two tool panels and the dialog's dimmed background. It starts at document-start. A dark page means Dark Page; SudokuPad's own dark mode is not supported.

## The board box

The board box is the `#svgrenderer` box. Dark Page paints it SudokuPad's own page background (`--body-bg`), so the board stays white, and the page is the page color outside it. The box clips everything the puzzle draws.

## The page color

Black until a solver picks another in the Dark Page dialog, saved under `DarkPage_color`. The page's own text is light or dark, whichever contrasts more with the color.
